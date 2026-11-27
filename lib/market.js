const TF_MIN = { M1: 1, M3: 3, M5: 5, M15: 15 };

const last = a => a[a.length - 1];
const round = (n, d = 2) => Number(Number(n).toFixed(d));

export function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  let v = values[0];
  const out = [v];
  for (let i = 1; i < values.length; i++) {
    v = values[i] * k + v * (1 - k);
    out.push(v);
  }
  return out;
}

export function rsi(values, period = 14) {
  if (!values.length) return [];
  const out = Array(values.length).fill(50);
  if (values.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  const calc = () => avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out[period] = calc();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(0, d), l = Math.max(0, -d);
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = calc();
  }
  for (let i = 0; i < period; i++) out[i] = out[period] || 50;
  return out;
}

export function atr(candles, period = 14) {
  if (!candles.length) return [];
  const tr = candles.map((c, i) => {
    if (!i) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
  const out = Array(tr.length).fill(tr[0] || 0);
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    if (i < period) {
      sum += tr[i];
      out[i] = sum / (i + 1);
    } else out[i] = (out[i - 1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

export function aggregate(candles, minutes) {
  if (minutes === 1) return candles.slice();
  const ms = minutes * 60000;
  const buckets = new Map();
  for (const c of candles) {
    const key = Math.floor(c.time / ms) * ms;
    let b = buckets.get(key);
    if (!b) {
      b = { time:key, open:c.open, high:c.high, low:c.low, close:c.close, volume:c.volume || 0 };
      buckets.set(key, b);
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += c.volume || 0;
    }
  }
  return [...buckets.values()].sort((a,b)=>a.time-b.time);
}

function cleanCandles(xs) {
  if (!Array.isArray(xs)) return [];
  return xs.map(c => ({
    time:Number(c.time), open:Number(c.open), high:Number(c.high), low:Number(c.low), close:Number(c.close), volume:Number(c.volume || 0)
  })).filter(c => [c.time,c.open,c.high,c.low,c.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time);
}

async function fetchJson(url) {
  const r = await fetch(url, { timeout_ms:8000, headers:{'User-Agent':'AI-Trader-Pro/2.0','Accept':'application/json'} });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

function coinbaseCandles(raw) {
  return cleanCandles((raw || []).map(x => ({ time:Number(x[0])*1000, low:Number(x[1]), high:Number(x[2]), open:Number(x[3]), close:Number(x[4]), volume:Number(x[5]||0) })));
}

function yahooCandles(yf) {
  const result = yf?.chart?.result?.[0];
  const ts = result?.timestamp || [];
  const q = result?.indicators?.quote?.[0] || {};
  const out = [];
  for (let i=0;i<ts.length;i++) {
    const rawOpen=q.open?.[i], rawHigh=q.high?.[i], rawLow=q.low?.[i], rawClose=q.close?.[i];
    if ([rawOpen,rawHigh,rawLow,rawClose].some(v=>v===null||v===undefined)) continue;
    const open=Number(rawOpen), high=Number(rawHigh), low=Number(rawLow), close=Number(rawClose);
    if (![open,high,low,close].every(Number.isFinite) || open<=0 || high<=0 || low<=0 || close<=0) continue;
    out.push({time:Number(ts[i])*1000,open,high,low,close,volume:Number(q.volume?.[i]||0)});
  }
  return cleanCandles(out);
}

function alignToSpot(candles, spotPrice) {
  if (!candles.length || !Number.isFinite(spotPrice)) return [];
  const base = last(candles).close;
  if (!Number.isFinite(base) || base <= 0) return [];
  const ratio = spotPrice / base;
  const out = candles.map(c=>({...c,open:c.open*ratio,high:c.high*ratio,low:c.low*ratio,close:c.close*ratio}));
  out[out.length-1].close = spotPrice;
  out[out.length-1].high = Math.max(out[out.length-1].high, spotPrice);
  out[out.length-1].low = Math.min(out[out.length-1].low, spotPrice);
  return out;
}

async function fetchBTCPublic() {
  const [spot, raw1, raw5] = await Promise.all([
    fetchJson('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
    fetchJson('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60'),
    fetchJson('https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=300')
  ]);
  const c1 = coinbaseCandles(raw1).slice(-300);
  const c5 = coinbaseCandles(raw5).slice(-300);
  const spotPrice = Number(spot?.data?.amount || last(c1)?.close);
  if (!c1.length || !c5.length || !Number.isFinite(spotPrice)) throw new Error('BTC feed incomplete');
  c1[c1.length-1].close = spotPrice;
  c1[c1.length-1].high = Math.max(c1[c1.length-1].high, spotPrice);
  c1[c1.length-1].low = Math.min(c1[c1.length-1].low, spotPrice);
  return { c1, c5, spot:spotPrice, source:'Coinbase BTC-USD', sourceType:'public-live', updatedAt:new Date().toISOString() };
}

async function fetchXAUPublic() {
  const [spot, yf1, yf5] = await Promise.all([
    fetchJson('https://api.gold-api.com/price/XAU'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=1m&range=1d'),
    fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/GC%3DF?interval=5m&range=5d')
  ]);
  const spotPrice = Number(spot?.price);
  const c1 = alignToSpot(yahooCandles(yf1).slice(-500), spotPrice);
  const c5 = alignToSpot(yahooCandles(yf5).slice(-500), spotPrice);
  if (!c1.length || !c5.length || !Number.isFinite(spotPrice)) throw new Error('Gold feed incomplete');
  return { c1, c5, spot:spotPrice, source:'Gold-API spot + COMEX intraday proxy', sourceType:'public-live-derived', updatedAt:spot?.updatedAt || new Date().toISOString() };
}

function publicTimeframes(feed) {
  return {
    M1: feed.c1.slice(-220),
    M3: aggregate(feed.c1,3).slice(-220),
    M5: aggregate(feed.c1,5).slice(-220),
    M15: aggregate(feed.c5,15).slice(-220)
  };
}

function detectFvg(candles, side) {
  const start = Math.max(2, candles.length - 40);
  for (let i=candles.length-1;i>=start;i--) {
    if (side==='BUY' && candles[i].low > candles[i-2].high) return {ok:true,index:i,low:candles[i-2].high,high:candles[i].low,side:'BUY'};
    if (side==='SELL' && candles[i].high < candles[i-2].low) return {ok:true,index:i,low:candles[i].high,high:candles[i-2].low,side:'SELL'};
  }
  return {ok:false};
}

function detectOrderBlock(candles, side, atrValue) {
  const start = Math.max(2, candles.length - 35);
  for (let i=candles.length-3;i>=start;i--) {
    const c=candles[i], n=candles[i+1], body=Math.abs(n.close-n.open);
    if (side==='BUY' && c.close<c.open && n.close>c.high && body>=atrValue*0.45) return {ok:true,index:i,low:c.low,high:c.high,side:'BUY'};
    if (side==='SELL' && c.close>c.open && n.close<c.low && body>=atrValue*0.45) return {ok:true,index:i,low:c.low,high:c.high,side:'SELL'};
  }
  return {ok:false};
}

function structureFor(candles) {
  const closes=candles.map(c=>c.close), e9=ema(closes,9), e21=ema(closes,21), e50=ema(closes,50);
  const i=candles.length-1, close=closes[i];
  let bias='Neutral';
  if (close>e50[i] && e9[i]>e21[i]) bias='Bullish';
  if (close<e50[i] && e9[i]<e21[i]) bias='Bearish';
  const left=Math.max(0,candles.length-24), right=Math.max(left+1,candles.length-3), prior=candles.slice(left,right);
  const priorHigh=prior.length?Math.max(...prior.map(c=>c.high)):close, priorLow=prior.length?Math.min(...prior.map(c=>c.low)):close;
  let structure='Trend';
  if (close>priorHigh || close<priorLow) structure='BOS';
  else if (candles.length>20) {
    const j=Math.max(0,i-10), oldBull=closes[j]>e21[j], nowBull=close>e21[i];
    if (oldBull!==nowBull) structure='MSS';
  }
  const signal=bias==='Bullish'?'BUY':bias==='Bearish'?'SELL':'WAIT';
  return {bias,structure,signal,ema9:e9,ema21:e21,ema50:e50};
}

function sessionName() {
  const h=new Date().getUTCHours();
  if (h>=0&&h<7) return 'Asia';
  if (h>=7&&h<12) return 'London';
  if (h>=12&&h<16) return 'London / New York';
  if (h>=16&&h<21) return 'New York';
  return 'Off-hours';
}

function riskLevels(symbol, side, candles, entry, atrValue) {
  const recent=candles.slice(-12), swingLow=Math.min(...recent.map(c=>c.low)), swingHigh=Math.max(...recent.map(c=>c.high));
  let sl=side==='BUY'?swingLow-atrValue*0.15:swingHigh+atrValue*0.15;
  let dist=Math.abs(entry-sl);
  const minDist=Math.max(atrValue*0.65,symbol==='XAUUSD'?0.8:entry*0.0015), maxDist=symbol==='XAUUSD'?5:entry*0.012;
  if (!Number.isFinite(dist)||dist<minDist) dist=minDist;
  if (dist>maxDist) dist=maxDist;
  sl=side==='BUY'?entry-dist:entry+dist;
  return {sl,tp1:side==='BUY'?entry+dist:entry-dist,tp2:side==='BUY'?entry+dist*2:entry-dist*2,distance:dist};
}

export function analyzeMarketFromTimeframes({symbol='XAUUSD',timeframe='M3',byTf,provider='Unknown',providerType='unknown',updatedAt=new Date().toISOString(),spread=null}) {
  symbol=String(symbol).toUpperCase(); timeframe=String(timeframe).toUpperCase();
  if (!['XAUUSD','BTCUSD'].includes(symbol)) symbol='XAUUSD';
  if (!TF_MIN[timeframe]) timeframe='M3';
  const needed=['M15','M5','M3',timeframe];
  for (const tf of needed) {
    byTf[tf]=cleanCandles(byTf[tf]||[]).slice(-220);
    if (byTf[tf].length<30) throw new Error(`Not enough ${tf} candles (${byTf[tf].length}/30)`);
  }
  const selected=byTf[timeframe];
  const mtf=['M15','M5','M3'].map(tf=>({tf,...structureFor(byTf[tf])}));
  const buyVotes=mtf.filter(x=>x.signal==='BUY').length, sellVotes=mtf.filter(x=>x.signal==='SELL').length;
  const selectedStruct=structureFor(selected);
  let side=buyVotes>sellVotes?'BUY':sellVotes>buyVotes?'SELL':selectedStruct.signal;
  if (side==='WAIT') side=last(selected).close>=selected[selected.length-2].close?'BUY':'SELL';

  const closes=selected.map(c=>c.close), e9=ema(closes,9), e21=ema(closes,21), e50=ema(closes,50), e200=ema(closes,200);
  const rsiSeries=rsi(closes,14), atrSeries=atr(selected,14), atrValue=last(atrSeries), lastRsi=last(rsiSeries);
  // Detect SMC zones only from fully closed candles; the live candle must never move a zone.
  const closedCandles=selected.slice(0,-1);
  const fvg=detectFvg(closedCandles,side), ob=detectOrderBlock(closedCandles,side,atrValue);
  if(fvg.ok) fvg.candleTime=closedCandles[fvg.index].time;
  if(ob.ok) ob.candleTime=closedCandles[ob.index].time;
  const emaAligned=side==='BUY'?last(e9)>last(e21)&&last(e21)>last(e50):last(e9)<last(e21)&&last(e21)<last(e50);
  const rsiValid=side==='BUY'?lastRsi>=42&&lastRsi<=74:lastRsi>=26&&lastRsi<=58;
  const mtfAligned=side==='BUY'?buyVotes===3:sellVotes===3;
  const session=sessionName(), sessionValid=session!=='Off-hours';
  const spreadNumber=spread===null||spread===undefined?NaN:Number(spread), spreadKnown=Number.isFinite(spreadNumber)&&spreadNumber>=0;
  const spreadLimit=Math.max(atrValue*0.12, symbol==='XAUUSD'?0.12:last(selected).close*0.00008);
  const spreadValid=spreadKnown ? spreadNumber<=spreadLimit : null;
  const checksRaw={mtf:mtfAligned,ob:ob.ok,fvg:fvg.ok,ema:emaAligned,rsi:rsiValid,atr:Number.isFinite(atrValue)&&atrValue>0,session:sessionValid,spread:spreadValid};
  const weights={mtf:22,ob:18,fvg:15,ema:15,rsi:12,atr:10,session:8,spread:5};
  let rawScore=0,maxScore=0;
  for (const [k,w] of Object.entries(weights)) {
    if (k==='spread' && checksRaw.spread===null) continue;
    maxScore+=w; if (checksRaw[k]) rawScore+=w;
  }
  const confidence=maxScore?Math.round(rawScore/maxScore*100):0;
  const current=last(selected), prev=selected[selected.length-2], levels=riskLevels(symbol,side,selected,current.close,atrValue), marks=[];
  if (ob.ok) marks.push({type:'OB',x:ob.index/Math.max(1,selected.length-1),y:side==='BUY'?0.72:0.28});
  if (fvg.ok) marks.push({type:'FVG',x:fvg.index/Math.max(1,selected.length-1),y:side==='BUY'?0.62:0.38});
  mtf.forEach((m,i)=>{if(m.structure==='MSS'||m.structure==='BOS')marks.push({type:m.structure,x:0.62+i*0.1,y:side==='BUY'?0.48-i*0.04:0.52+i*0.04});});
  const decimals=2;
  const checks=[
    {name:'Multi Timeframe',ok:checksRaw.mtf,value:mtfAligned?`${side} aligned`:`${buyVotes} BUY / ${sellVotes} SELL`},
    {name:'Order Block (OB)',ok:checksRaw.ob,value:ob.ok?`${round(ob.low,decimals)} - ${round(ob.high,decimals)}`:'No fresh aligned OB'},
    {name:'Fair Value Gap (FVG)',ok:checksRaw.fvg,value:fvg.ok?`${round(fvg.low,decimals)} - ${round(fvg.high,decimals)}`:'No fresh aligned FVG'},
    {name:'EMA 9/21/50',ok:checksRaw.ema,value:emaAligned?`${side} aligned`:'Mixed'},
    {name:'RSI (14)',ok:checksRaw.rsi,value:round(lastRsi,1).toFixed(1)},
    {name:'ATR (14)',ok:checksRaw.atr,value:round(atrValue,decimals).toFixed(decimals)},
    {name:'Session',ok:checksRaw.session,value:session},
    {name:'Spread',ok:checksRaw.spread===true,value:spreadKnown?`${round(spreadNumber,4)} / max ${round(spreadLimit,4)}`:'Not available from current feed',unknown:!spreadKnown}
  ];
  return {
    symbol,timeframe,provider,providerType,updatedAt,
    market:{open:round(current.open,decimals),high:round(current.high,decimals),low:round(current.low,decimals),close:round(current.close,decimals),change:round(current.close-prev.close,decimals),volume:round(current.volume||0,4)},
    analysis:{rsi:round(lastRsi,1),atr:round(atrValue,decimals),mtf:mtf.map(x=>({tf:x.tf,bias:x.bias,structure:x.structure,signal:x.signal})),checks,zones:{ob,fvg}},
    signal:{side,confidence,entry:round(current.close,decimals),sl:round(levels.sl,decimals),tp1:round(levels.tp1,decimals),tp2:round(levels.tp2,decimals),rr:'1 : 2',executable:false,reason:`${side} from ${provider}; MTF votes ${buyVotes} BUY / ${sellVotes} SELL. OB ${ob.ok?'valid':'not fresh'}, FVG ${fvg.ok?'valid':'not fresh'}, RSI ${round(lastRsi,1)}.`},
    candles:selected.slice(-220).map(c=>({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volume||0})),
    chart:{price:selected.slice(-120).map(c=>round(c.close,decimals)),ema9:e9.slice(-120).map(v=>round(v,decimals)),ema21:e21.slice(-120).map(v=>round(v,decimals)),ema50:e50.slice(-120).map(v=>round(v,decimals)),ema200:e200.slice(-120).map(v=>round(v,decimals)),rsi:rsiSeries.slice(-120).map(v=>round(v,1)),marks}
  };
}

export async function publicMarket(symbol='XAUUSD',timeframe='M3') {
  symbol=String(symbol).toUpperCase(); timeframe=String(timeframe).toUpperCase();
  const feed=symbol==='BTCUSD'?await fetchBTCPublic():await fetchXAUPublic();
  return analyzeMarketFromTimeframes({symbol,timeframe,byTf:publicTimeframes(feed),provider:feed.source,providerType:feed.sourceType,updatedAt:feed.updatedAt,spread:null});
}