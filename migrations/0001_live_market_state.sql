CREATE TABLE live_market_state (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  source TEXT NOT NULL,
  candles JSONB NOT NULL,
  bid NUMERIC,
  ask NUMERIC,
  spread NUMERIC,
  account JSONB,
  positions JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, timeframe)
)