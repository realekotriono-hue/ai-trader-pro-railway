import { db } from '../db.js';

const n = v => Number(v);

export async function persistMarketZones(market) {
  const zones=market.analysis?.zones||{};
  const candles=market.candles||[];
  const client=await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[market.symbol+':'+market.timeframe+':smc-zones']);
    for(const type of ['ob','fvg']) {
      const z=zones[type];
      if(!z?.ok || !Number.isFinite(n(z.low)) || !Number.isFinite(n(z.high)) || n(z.high)<=n(z.low)) continue;
      const sourceTime=Number(z.candleTime ?? candles[z.index]?.time);
      if(!Number.isFinite(sourceTime)) continue;
      await client.query(
        `INSERT INTO ai_smc_zones(symbol,timeframe,zone_type,side,zone_low,zone_high,source_candle_time,provider)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT(symbol,timeframe,zone_type,side,source_candle_time) DO NOTHING`,
        [market.symbol,market.timeframe,type.toUpperCase(),z.side,n(z.low),n(z.high),sourceTime,market.provider||null]
      );
    }
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { client.release(); }
}

export async function getLatestStoredZones(symbol,timeframe) {
  const q=await db.query(
    `SELECT DISTINCT ON(zone_type) zone_type,side,zone_low,zone_high,source_candle_time,created_at
     FROM ai_smc_zones WHERE symbol=$1 AND timeframe=$2
     ORDER BY zone_type,source_candle_time DESC,id DESC`,
    [symbol,timeframe]
  );
  const out={ob:null,fvg:null};
  for(const r of q.rows) out[r.zone_type.toLowerCase()]={ok:true,side:r.side,low:n(r.zone_low),high:n(r.zone_high),candleTime:n(r.source_candle_time),createdAt:r.created_at,locked:true};
  return out;
}
