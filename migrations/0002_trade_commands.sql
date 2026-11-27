CREATE TABLE trade_commands (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'MARKET',
  entry NUMERIC,
  sl NUMERIC NOT NULL,
  tp1 NUMERIC,
  tp2 NUMERIC NOT NULL,
  risk_pct NUMERIC NOT NULL,
  confidence INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  broker_ticket TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
)