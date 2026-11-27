CREATE TABLE IF NOT EXISTS ai_smc_zones (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK(zone_type IN ('OB','FVG')),
  side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
  zone_low NUMERIC(20,8) NOT NULL,
  zone_high NUMERIC(20,8) NOT NULL,
  source_candle_time BIGINT NOT NULL,
  provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol,timeframe,zone_type,side,source_candle_time),
  CHECK(zone_high > zone_low)
);
CREATE INDEX IF NOT EXISTS ai_smc_zones_latest_idx
  ON ai_smc_zones(symbol,timeframe,zone_type,source_candle_time DESC);
