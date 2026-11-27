CREATE TABLE trade_journal (
  id BIGSERIAL PRIMARY KEY,
  external_ticket TEXT UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry NUMERIC NOT NULL,
  exit NUMERIC,
  sl NUMERIC,
  tp NUMERIC,
  lot NUMERIC,
  pnl NUMERIC,
  net_r NUMERIC,
  status TEXT NOT NULL,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'MT5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)