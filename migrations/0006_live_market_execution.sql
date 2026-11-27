ALTER TABLE live_market_state
  ADD COLUMN IF NOT EXISTS bridge_version TEXT,
  ADD COLUMN IF NOT EXISTS execution_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal_trade_allowed BOOLEAN NOT NULL DEFAULT false