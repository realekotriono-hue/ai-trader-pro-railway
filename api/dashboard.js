import { publicMarket } from '../lib/market.js';
import { trackAiSignals, getAiSignalStats, getAiSignalHistory } from '../lib/signal-journal.js';

export default async function(req,res) {
  const symbol=['XAUUSD','BTCUSD'].includes(String(req.query?.symbol||'XAUUSD').toUpperCase())
    ? String(req.query?.symbol||'XAUUSD').toUpperCase() : 'XAUUSD';
  const tf=['M1','M3','M5','M15'].includes(String(req.query?.tf||'M3').toUpperCase())
    ? String(req.query?.tf||'M3').toUpperCase() : 'M3';
  try {
    const market=await publicMarket(symbol,tf);
    await trackAiSignals(market);
    const [stats,history]=await Promise.all([getAiSignalStats(symbol),getAiSignalHistory(symbol,100)]);
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
    res.json({...market,model:{name:'AI Signal Analysis',version:'3.0-signal-journal',type:'SMC/MTF weighted analysis + paper outcome tracking'},
      bridge:noBridge,account:{balance:null,equity:null,floating:null},positions:[],stats:{...stats,totalProfit:stats.netR,maxDrawdown:null},
      history:formattedHistory,execution:{enabled:false,capable:false,qualified:false,mode:'PAPER_TRACKING_ONLY',riskCapPct:0,recent:[]},
      features:[{name:'MTF Structure',weight:22},{name:'Order Block',weight:18},{name:'FVG',weight:15},{name:'EMA',weight:15},{name:'RSI',weight:12},{name:'ATR',weight:10},{name:'Session',weight:8},{name:'Spread',weight:5}],
      chart:{...market.chart,equity},signalTracking:{enabled:true,minimumConfidence:70,target:'TP2',resolution:'SL is prioritized if SL and TP are touched in the same candle'},
      checks});
  } catch(e) {
    console.error('public market / AI signal tracking failed',String(e));
    res.status(502).json({error:'Public market feed or AI signal journal unavailable',detail:String(e).slice(0,180)});
  }
}
