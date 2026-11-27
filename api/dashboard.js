import { publicMarket } from '../lib/market.js';
import { getActiveAiSignal, getAiSignalStats, getAiSignalHistory } from '../lib/signal-journal.js';
import { getLatestStoredZones } from '../lib/zone-journal.js';

export default async function(req,res) {
  const symbol=['XAUUSD','BTCUSD'].includes(String(req.query?.symbol||'XAUUSD').toUpperCase())
    ? String(req.query?.symbol||'XAUUSD').toUpperCase() : 'XAUUSD';
  const tf=['M1','M3','M5','M15'].includes(String(req.query?.tf||'M3').toUpperCase())
    ? String(req.query?.tf||'M3').toUpperCase() : 'M3';
  try {
    const market=await publicMarket(symbol,tf);
    const [stats,history,activeSignal,storedZones]=await Promise.all([getAiSignalStats(symbol),getAiSignalHistory(symbol,100),getActiveAiSignal(symbol,tf),getLatestStoredZones(symbol,tf)]);
    // Show the last persisted OB/FVG snapshots, never the rolling live detector output.
    market.analysis.zones={ob:storedZones.ob||{ok:false},fvg:storedZones.fvg||{ok:false}};
    market.analysis.checks=market.analysis.checks.map(c=>{
      if(c.name==='Order Block (OB)'){const z=storedZones.ob;return {...c,ok:!!z,value:z?`${Number(z.low).toFixed(2)} - ${Number(z.high).toFixed(2)}`:'No stored OB zone'};}
      if(c.name==='Fair Value Gap (FVG)'){const z=storedZones.fvg;return {...c,ok:!!z,value:z?`${Number(z.low).toFixed(2)} - ${Number(z.high).toFixed(2)}`:'No stored FVG zone'};}
      return c;
    });
    market.chart.marks=market.chart.marks.filter(m=>m.type!=='OB'&&m.type!=='FVG');
    const formattedHistory=history.map(r=>({
      ...r,
      time:new Date(r.openedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'short'}),
      netR:r.resultR
    }));
    let eq=0; const equity=[0];
    for(const r of [...formattedHistory].reverse()) if(r.resultR!==null){eq+=r.resultR;equity.push(Number(eq.toFixed(2)));}
    while(equity.length<3)equity.push(eq);
    const noBridge={connected:false,marketReady:false,executionCapable:false,version:null,mode:'PUBLIC API · SIGNAL TRACKING',
      source:market.provider,ageMs:0,missingTimeframes:[]};
    const checks=Object.fromEntries(market.analysis.checks.map(c=>[c.name,c]));
    market.signal.executable=false;
    if(activeSignal) market.signal={...market.signal,...activeSignal,entry:activeSignal.entry,sl:activeSignal.sl,tp1:activeSignal.tp1,tp2:activeSignal.tp2,rr:'1 : 2',locked:true,entryZone:{low:activeSignal.entryLow,high:activeSignal.entryHigh},reason:activeSignal.reason||'Locked AI setup; levels will not move until entry, SL/TP, cancellation or expiry.'};
    else market.signal={...market.signal,side:'WAIT',confidence:0,status:'NO_SETUP',entryZone:null,locked:false,reason:'Belum ada zona entry dengan konfluensi kuat. Menunggu OB/FVG dan MTF searah; tidak ada entry yang direkomendasikan saat ini.'};
    res.json({...market,model:{name:'AI Signal Analysis',version:'3.0-signal-journal',type:'SMC/MTF weighted analysis + paper outcome tracking'},
      bridge:noBridge,account:{balance:null,equity:null,floating:null},positions:[],stats:{...stats,totalProfit:stats.netR,maxDrawdown:null},
      history:formattedHistory,execution:{enabled:false,capable:false,qualified:false,mode:'PAPER_TRACKING_ONLY',riskCapPct:0,recent:[]},
      features:[{name:'MTF Structure',weight:22},{name:'Order Block',weight:18},{name:'FVG',weight:15},{name:'EMA',weight:15},{name:'RSI',weight:12},{name:'ATR',weight:10},{name:'Session',weight:8},{name:'Spread',weight:5}],
      chart:{...market.chart,equity},signalTracking:{enabled:true,activeSignal:!!activeSignal,telegramConfigured:!!(process.env.TELEGRAM_BOT_TOKEN&&process.env.TELEGRAM_CHAT_ID),minimumConfidence:70,target:'TP2',resolution:'SL is prioritized if SL and TP are touched in the same candle'},
      checks});
  } catch(e) {
    console.error('public market / AI signal tracking failed',String(e));
    res.status(502).json({error:'Public market feed or AI signal journal unavailable',detail:String(e).slice(0,180)});
  }
}
