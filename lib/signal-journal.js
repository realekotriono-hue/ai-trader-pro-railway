import { db } from '../db.js';

const num = v => Number(v);
const fmt = v => Number(v).toFixed(2);
const tfMs = { M1:60000, M3:180000, M5:300000, M15:900000 };

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

function overlaps(c, low, high) {
  return num(c.low) <= high && num(c.high) >= low;
}

export async function trackAiSignals(market) {
  const candles = Array.isArray(market.candles) ? market.candles : [];
  if (candles.length < 3) return;
  const symbol=market.symbol, timeframe=market.timeframe, duration=tfMs[timeframe];
  if (!duration) return;
  const latest=candles[candles.length-1];
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[symbol+':'+timeframe+':signal-lifecycle']);

    const pending=await client.query(
      `SELECT * FROM ai_signal_journal WHERE symbol=$1 AND timeframe=$2 AND status='WAITING_ENTRY' ORDER BY id ASC`,
      [symbol,timeframe]
    );
    for(const signal of pending.rows) {
      const low=num(signal.entry_low), high=num(signal.entry_high), sl=num(signal.sl);
      const after=candles.filter(c=>num(c.time)>num(signal.candle_time));
      let transition=null, transitionTime=null;
      for(const c of after) {
        const invalidated=signal.side==='BUY'?num(c.low)<=sl:num(c.high)>=sl;
        if(invalidated) { transition='CANCELLED'; transitionTime=num(c.time); break; }
        if(overlaps(c,low,high)) { transition='OPEN'; transitionTime=num(c.time); break; }
      }
      if(!transition && num(latest.time)>=num(signal.expires_at)) {
        transition='EXPIRED'; transitionTime=num(latest.time);
      }
      if(transition==='OPEN') {
        await client.query(`UPDATE ai_signal_journal SET status='OPEN',entry_time=$2,opened_at=now() WHERE id=$1 AND status='WAITING_ENTRY'`,[signal.id,new Date(transitionTime)]);
      } else if(transition) {
        await client.query(`UPDATE ai_signal_journal SET status=$2,closed_at=now() WHERE id=$1 AND status='WAITING_ENTRY'`,[signal.id,transition]);
      }
    }

    const open=await client.query(
      `SELECT id,side,entry,sl,tp2,candle_time,entry_time FROM ai_signal_journal WHERE symbol=$1 AND timeframe=$2 AND status='OPEN' ORDER BY id ASC LIMIT 250`,
      [symbol,timeframe]
    );
    for(const signal of open.rows) {
      const from=signal.entry_time ? new Date(signal.entry_time).getTime() : num(signal.candle_time);
      const later=candles.filter(c=>num(c.time)>from);
      let outcome=null, exitPrice=null, resultR=null;
      const entry=num(signal.entry), sl=num(signal.sl), tp=num(signal.tp2), risk=Math.abs(entry-sl);
      for(const c of later) {
        const hitSl=signal.side==='BUY'?num(c.low)<=sl:num(c.high)>=sl;
        const hitTp=signal.side==='BUY'?num(c.high)>=tp:num(c.low)<=tp;
        if(hitSl){outcome='LOSS';exitPrice=sl;resultR=-1;break;}
        if(hitTp){outcome='WIN';exitPrice=tp;resultR=risk>0?Math.abs(tp-entry)/risk:2;break;}
      }
      if(outcome) await client.query(
        `UPDATE ai_signal_journal SET status=$2,exit_price=$3,result_r=$4,closed_at=now() WHERE id=$1 AND status='OPEN'`,
        [signal.id,outcome,exitPrice,resultR]
      );
    }

    // Create one immutable setup only from a strong, aligned signal with a real OB/FVG zone.
    const side=market.signal?.side, confidence=Number(market.signal?.confidence||0);
    const mtf=market.analysis?.mtf||[];
    const aligned=mtf.length>=3 && mtf.every(x=>x.signal===side);
    const zones=market.analysis?.zones||{};
    const zone=zones.ob?.ok?zones.ob:zones.fvg?.ok?zones.fvg:null;
    if(!['BUY','SELL'].includes(side)||confidence<80||!aligned||!zone) {
      await client.query('COMMIT');
      return;
    }
    const low=Math.min(num(zone.low),num(zone.high)), high=Math.max(num(zone.low),num(zone.high));
    const atr=num(market.analysis?.atr);
    if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low||!Number.isFinite(atr)||atr<=0||high-low>atr*0.6) {
      await client.query('COMMIT');
      return;
    }
    const signalCandle=candles[candles.length-2]; // closed candle only; never use the moving candle
    const candleTime=Math.floor(num(signalCandle.time)/duration)*duration;
    const active=await client.query(
      `SELECT id FROM ai_signal_journal WHERE symbol=$1 AND timeframe=$2 AND status IN ('WAITING_ENTRY','OPEN') LIMIT 1`,
      [symbol,timeframe]
    );
    if(active.rowCount) { await client.query('COMMIT'); return; }
    const recent=await client.query(
      `SELECT side,created_at FROM ai_signal_journal WHERE symbol=$1 AND timeframe=$2 AND created_at>=now()-interval '15 minutes' ORDER BY created_at DESC LIMIT 1`,
      [symbol,timeframe]
    );
    if(recent.rowCount && recent.rows[0].side===side) { await client.query('COMMIT'); return; }

    const entry=Number(((low+high)/2).toFixed(8));
    const distance=Math.max(Math.abs(entry-num(market.signal.sl)),atr*0.65);
    const maxDistance=market.symbol==='XAUUSD'?5:entry*0.012;
    const risk=Math.min(distance,maxDistance);
    const sl=side==='BUY'?entry-risk:entry+risk;
    const tp1=side==='BUY'?entry+risk:entry-risk;
    const tp2=side==='BUY'?entry+risk*2:entry-risk*2;
    const inserted=await client.query(
      `INSERT INTO ai_signal_journal(symbol,timeframe,side,entry,entry_low,entry_high,sl,tp1,tp2,confidence,reason,provider,candle_time,expires_at,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'WAITING_ENTRY')
       ON CONFLICT(symbol,timeframe,candle_time) DO NOTHING RETURNING id`,
      [symbol,timeframe,side,entry,low,high,sl,tp1,tp2,confidence,market.signal.reason,market.provider,candleTime,new Date(candleTime+duration*20)]
    );
    await client.query('COMMIT');
    if(inserted.rowCount) {
      const msg=[
        '<b>🤖 AI TRADER PRO · ENTRY ZONE READY</b>',
        `Pair: <b>${symbol}</b> | TF: <b>${timeframe}</b>`,
        `Signal: <b>${side}</b> | Confidence: <b>${confidence}%</b>`,
        `Entry Zone: <code>${fmt(low)} – ${fmt(high)}</code>`,
        `SL: <code>${fmt(sl)}</code>`,
        `TP1: <code>${fmt(tp1)}</code>`,
        `TP2: <code>${fmt(tp2)}</code>`,
        '<b>Status: WAITING ENTRY · Levels are locked</b>',
        'Cancel if SL is touched before entry; expires after 20 candles.'
      ].join('\n');
      try { await telegram(msg); } catch(error) { console.error('Telegram notification failed:',error.message); }
    }
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}

export async function getActiveAiSignal(symbol,timeframe) {
  const q=await db.query(
    `SELECT * FROM ai_signal_journal WHERE symbol=$1 AND timeframe=$2 AND status IN ('WAITING_ENTRY','OPEN') ORDER BY id DESC LIMIT 1`,
    [symbol,timeframe]
  );
  const r=q.rows[0];
  if(!r) return null;
  return {id:Number(r.id),symbol:r.symbol,timeframe:r.timeframe,side:r.side,entry:num(r.entry),
    entryLow:num(r.entry_low??r.entry),entryHigh:num(r.entry_high??r.entry),sl:num(r.sl),
    tp1:r.tp1===null?null:num(r.tp1),tp2:num(r.tp2),confidence:Number(r.confidence),
    status:r.status,reason:r.reason,openedAt:r.opened_at,entryTime:r.entry_time,expiresAt:r.expires_at};
}

export async function getAiSignalStats(symbol) {
  const q=await db.query(
    `SELECT COUNT(*) FILTER (WHERE status IN ('WIN','LOSS'))::int AS total, COUNT(*)::int AS total_signals,
      COUNT(*) FILTER (WHERE status='WIN')::int AS wins,
      COUNT(*) FILTER (WHERE status='LOSS')::int AS losses,
      COUNT(*) FILTER (WHERE status IN ('OPEN','WAITING_ENTRY'))::int AS open,
      COALESCE(SUM(GREATEST(result_r,0)) FILTER (WHERE status IN ('WIN','LOSS')),0)::float AS gross_profit_r,
      COALESCE(ABS(SUM(LEAST(result_r,0)) FILTER (WHERE status IN ('WIN','LOSS'))),0)::float AS gross_loss_r,
      COALESCE(SUM(result_r) FILTER (WHERE status IN ('WIN','LOSS')),0)::float AS net_r
     FROM ai_signal_journal WHERE symbol=$1`,[symbol]);
  const r=q.rows[0],total=r.total||0,gp=r.gross_profit_r||0,gl=r.gross_loss_r||0;
  return {total,totalSignals:r.total_signals||0,wins:r.wins||0,losses:r.losses||0,open:r.open||0,
    winRate:total?Number((r.wins/total*100).toFixed(1)):null,
    profitFactor:gl>0?Number((gp/gl).toFixed(2)):gp>0?'∞':null,
    grossProfitR:Number(gp.toFixed(2)),grossLossR:Number(gl.toFixed(2)),netR:Number((r.net_r||0).toFixed(2)),
    source:'AI signal outcomes (paper tracking)'};
}

export async function getAiSignalHistory(symbol,limit=100) {
  const q=await db.query(
    `SELECT id,symbol,timeframe,side,entry,entry_low,entry_high,exit_price,sl,tp1,tp2,confidence,status,result_r,provider,opened_at,closed_at
     FROM ai_signal_journal WHERE symbol=$1 ORDER BY created_at DESC LIMIT $2`,[symbol,limit]);
  return q.rows.map(r=>({id:Number(r.id),symbol:r.symbol,timeframe:r.timeframe,side:r.side,entry:num(r.entry),
    entryLow:r.entry_low===null?num(r.entry):num(r.entry_low),entryHigh:r.entry_high===null?num(r.entry):num(r.entry_high),
    exit:r.exit_price===null?null:num(r.exit_price),sl:num(r.sl),tp1:r.tp1===null?null:num(r.tp1),tp2:num(r.tp2),
    confidence:Number(r.confidence),status:r.status,resultR:r.result_r===null?null:num(r.result_r),
    provider:r.provider,openedAt:r.opened_at,closedAt:r.closed_at}));
}
