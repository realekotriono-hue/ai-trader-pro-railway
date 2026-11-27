ALTER TABLE ai_signal_journal
  ADD COLUMN IF NOT EXISTS entry_low NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS entry_high NUMERIC(20,8),
  ADD COLUMN IF NOT EXISTS entry_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE ai_signal_journal SET entry_low=entry WHERE entry_low IS NULL;
UPDATE ai_signal_journal SET entry_high=entry WHERE entry_high IS NULL;
UPDATE ai_signal_journal SET entry_time=opened_at WHERE status='OPEN' AND entry_time IS NULL;

ALTER TABLE ai_signal_journal DROP CONSTRAINT IF EXISTS ai_signal_journal_status_check;
ALTER TABLE ai_signal_journal ADD CONSTRAINT ai_signal_journal_status_check
  CHECK (status IN ('WAITING_ENTRY','OPEN','WIN','LOSS','CANCELLED','EXPIRED'));

CREATE INDEX IF NOT EXISTS ai_signal_journal_active_idx
  ON ai_signal_journal(symbol,timeframe,id DESC)
  WHERE status IN ('WAITING_ENTRY','OPEN');
