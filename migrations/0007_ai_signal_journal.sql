CREATE TABLE IF NOT EXISTS ai_signal_journal (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  entry NUMERIC(20,8) NOT NULL,
  sl NUMERIC(20,8) NOT NULL,
  tp1 NUMERIC(20,8),
  tp2 NUMERIC(20,8) NOT NULL,
  confidence INTEGER NOT NULL,
  reason TEXT,
  provider TEXT,
  candle_time BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','WIN','LOSS','EXPIRED')),
  exit_price NUMERIC(20,8),
  result_r NUMERIC(12,4),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol,timeframe,side,candle_time)
);
CREATE INDEX IF NOT EXISTS ai_signal_journal_recent_idx ON ai_signal_journal(symbol, timeframe, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_signal_journal_open_idx ON ai_signal_journal(status, symbol, timeframe) WHERE status='OPEN';
