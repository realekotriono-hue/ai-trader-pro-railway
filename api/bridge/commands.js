import { db } from '../db.js';
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
async function authToken(req){
  const token=String(req.headers['x-bridge-token']||'');
  if(!token)return null;
  const hash=await sha256(token);
  const q=await db.query(`SELECT id FROM bridge_tokens WHERE token_hash=$1 AND active=true LIMIT 1`,[hash]);
  if(!q.rows.length)return null;
  await db.query(`UPDATE bridge_tokens SET last_used_at=now() WHERE id=$1`,[q.rows[0].id]);
  return q.rows[0];
}
export default async function(req,res){
  const a=await authToken(req); if(!a)return res.status(401).json({error:'Invalid bridge token'});
  const symbol=String(req.query?.symbol||'').toUpperCase();
  if(symbol && !['XAUUSD','BTCUSD'].includes(symbol))return res.status(400).json({error:'Unsupported symbol'});
  const params=[]; let filter=`status='queued' AND (expires_at IS NULL OR expires_at>now())`;
  if(symbol){params.push(symbol);filter+=` AND symbol=$${params.length}`;}
  const q=await db.query(`UPDATE trade_commands SET status='dispatched',dispatched_at=COALESCE(dispatched_at,now()),updated_at=now() WHERE id=(SELECT id FROM trade_commands WHERE ${filter} ORDER BY created_at ASC LIMIT 1) RETURNING id,symbol,side,timeframe,order_type,entry,sl,tp1,tp2,risk_pct,confidence,be_pips,trailing_enabled,expires_at`,params);
  if(!q.rows.length)return res.json({ok:true,command:null});
  const r=q.rows[0];
  res.json({ok:true,command:{id:Number(r.id),symbol:r.symbol,side:r.side,timeframe:r.timeframe,orderType:r.order_type,entry:r.entry===null?null:Number(r.entry),sl:Number(r.sl),tp1:r.tp1===null?null:Number(r.tp1),tp2:Number(r.tp2),riskPct:Number(r.risk_pct),confidence:Number(r.confidence),bePips:Number(r.be_pips||30),trailingEnabled:!!r.trailing_enabled,expiresAt:r.expires_at}});
}