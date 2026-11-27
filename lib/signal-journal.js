import { db } from '../db.js';

const num = v => Number(v);
const fmt = v => Number(v).toFixed(2);

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent:false, reason:'telegram_not_configured' };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true})
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram HTTP ${response.status}`);
  return { sent:true };
}

export async function trackAiSignals(market) {
  const candles = Array.isArray(market.candles) ? market.candles : [];
  if (candles.length < 2) return;
  const latest = candles[candles.length-1];
  const symbol = market.symbol, timeframe = market.timeframe;

  // Evaluate only candles that opened after the signal candle; if one candle touches both levels, count SL first.
  const open = await db.query(
    `SELECT id,side,entry,sl,tp2,candle_time FROM ai_signal_journal WHERE symbol=$1 AND timeframe=$2 AND status='OPEN' ORDER BY id ASC LIMIT 250`,
    [symbol,timeframe]
  );
  for (const signal of open.rows) {
    const later = candles.filter(c => Number(c.time) > Number(signal.candle_time));
    let outcome = null, exitPrice = null, resultR = null;
    const entry=num(signal.entry), sl=num(signal.sl), tp=num(signal.tp2), risk=Math.abs(entry-num(signal.sl));
    for (const c of later) {
      const hitSl = signal.side==='BUY' ? num(c.low)<=num(signal.sl) : num(c.high)>=num(signal.sl);
      const hitTp = signal.side==='BUY' ? num(c.high)>=tp : num(c.low)<=tp;
      if (hitSl) { outcome='LOSS'; exitPrice=num(signal.sl); resultR=-1; break; }
      if (hitTp) { outcome='WIN'; exitPrice=tp; resultR=risk>0?Math.abs(tp-entry)/risk:2; break; }
    }
    if (outcome) {
      await db.query(`UPDATE ai_signal_journal SET status=$2,exit_price=$3,result_r=$4,closed_at=now() WHERE id=$1 AND status='OPEN'`,
        [signal.id,outcome,exitPrice,resultR]);
    }
  }

  const side = market.signal?.side;
  const confidence = Number(market.signal?.confidence || 0);
  if (!['BUY','SELL'].includes(side) || confidence < 70) return;
  const candleTime = Number(latest.time);
  if (!Number.isFinite(candleTime)) return;
  const inserted = await db.query(
    `INSERT INTO ai_signal_journal(symbol,timeframe,side,entry,sl,tp1,tp2,confidence,reason,provider,candle_time)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(symbol,timeframe,side,candle_time) DO NOTHING RETURNING id`,
    [symbol,timeframe,side,market.signal.entry,market.signal.sl,market.signal.tp1,market.signal.tp2,confidence,market.signal.reason,market.provider,candleTime]
  );
  if (!inserted.rowCount) return;
  const msg = [
    `<b>🤖 AI TRADER PRO · ENTRY SIGNAL</b>`,
    `Pair: <b>${symbol}</b> | TF: <b>${timeframe}</b>`,
    `Signal: <b>${side}</b> | Confidence: <b>${confidence}%</b>`,
    `Entry: <code>${fmt(market.signal.entry)}</code>`,
    `Stop Loss: <code>${fmt(market.signal.sl)}</code>`,
    `Take Profit 1: <code>${fmt(market.signal.tp1)}</code>`,
    `Take Profit 2: <code>${fmt(market.signal.tp2)}</code>`,
    `Source: ${String(market.provider||'Market API').replace(/[<>&]/g,'')}`,
    `Mode: <b>PAPER / SIGNAL TRACKING</b>`
  ].join('\n');
  try { await telegram(msg); }
  catch (error) { console.error('Telegram notification failed:',error.message); }
}

export async function getAiSignalStats(symbol) {
  const q = await db.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('WIN','LOSS'))::int AS total, COUNT(*)::int AS total_signals,
      COUNT(*) FILTER (WHERE status='WIN')::int AS wins,
      COUNT(*) FILTER (WHERE status='LOSS')::int AS losses,
      COUNT(*) FILTER (WHERE status='OPEN')::int AS open,
      COALESCE(SUM(GREATEST(result_r,0)) FILTER (WHERE status IN ('WIN','LOSS')),0)::float AS gross_profit_r,
      COALESCE(ABS(SUM(LEAST(result_r,0)) FILTER (WHERE status IN ('WIN','LOSS'))),0)::float AS gross_loss_r,
      COALESCE(SUM(result_r) FILTER (WHERE status IN ('WIN','LOSS')),0)::float AS net_r
     FROM ai_signal_journal WHERE symbol=$1`,[symbol]
  );
  const r=q.rows[0], total=r.total||0, gp=r.gross_profit_r||0, gl=r.gross_loss_r||0;
  return { total,totalSignals:r.total_signals||0,wins:r.wins||0,losses:r.losses||0,open:r.open||0,
    winRate:total?Number((r.wins/total*100).toFixed(1)):null,
    profitFactor:gl>0?Number((gp/gl).toFixed(2)):gp>0?'∞':null,
    grossProfitR:Number(gp.toFixed(2)),grossLossR:Number(gl.toFixed(2)),netR:Number((r.net_r||0).toFixed(2)),
    source:'AI signal outcomes (paper tracking)' };
}

export async function getAiSignalHistory(symbol, limit=100) {
  const q=await db.query(
    `SELECT id,symbol,timeframe,side,entry,exit_price,sl,tp1,tp2,confidence,status,result_r,provider,opened_at,closed_at
     FROM ai_signal_journal WHERE symbol=$1 ORDER BY created_at DESC LIMIT $2`,[symbol,limit]
  );
  return q.rows.map(r=>({id:Number(r.id),symbol:r.symbol,timeframe:r.timeframe,side:r.side,
    entry:num(r.entry),exit:r.exit_price===null?null:num(r.exit_price),sl:num(r.sl),tp1:r.tp1===null?null:num(r.tp1),tp2:num(r.tp2),
    confidence:Number(r.confidence),status:r.status,resultR:r.result_r===null?null:num(r.result_r),
    provider:r.provider,openedAt:r.opened_at,closedAt:r.closed_at}));
}
