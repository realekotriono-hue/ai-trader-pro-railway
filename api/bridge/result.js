import { db } from '../../db.js';
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
async function sha256(s){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))}
async function authToken(req){
  const token=String(req.headers['x-bridge-token']||''); if(!token)return null;
  const hash=await sha256(token),q=await db.query(`SELECT id FROM bridge_tokens WHERE token_hash=$1 AND active=true LIMIT 1`,[hash]);
  return q.rows[0]||null;
}
export default async function(req,res){
  const a=await authToken(req); if(!a)return res.status(401).json({error:'Invalid bridge token'});
  const x=req.body||{}, id=Number(x.id), status=String(x.status||'').toLowerCase();
  if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'Invalid command id'});
  if(!['executed','rejected','failed','expired'].includes(status))return res.status(400).json({error:'Invalid result status'});
  const ticket=x.brokerTicket?String(x.brokerTicket):null, fillPrice=Number.isFinite(Number(x.fillPrice))?Number(x.fillPrice):null, fillLot=Number.isFinite(Number(x.fillLot))?Number(x.fillLot):null, msg=String(x.message||'').slice(0,500);
  const q=await db.query(`UPDATE trade_commands SET status=$2,broker_ticket=COALESCE($3,broker_ticket),fill_price=$4,fill_lot=$5,result_message=$6,executed_at=CASE WHEN $2='executed' THEN now() ELSE executed_at END,updated_at=now() WHERE id=$1 RETURNING symbol,side,entry,sl,tp2`,[id,status,ticket,fillPrice,fillLot,msg]);
  if(!q.rows.length)return res.status(404).json({error:'Command not found'});
  if(status==='executed'&&ticket){const r=q.rows[0];await db.query(`INSERT INTO trade_journal(external_ticket,symbol,side,entry,sl,tp,lot,status,opened_at,source) VALUES($1,$2,$3,$4,$5,$6,$7,'open',now(),'MT5 LIVE') ON CONFLICT(external_ticket) DO UPDATE SET entry=EXCLUDED.entry,sl=EXCLUDED.sl,tp=EXCLUDED.tp,lot=EXCLUDED.lot,status='open'`,[ticket,r.symbol,r.side,fillPrice??Number(r.entry),Number(r.sl),Number(r.tp2),fillLot||0]);}
  res.json({ok:true,id,status});
}