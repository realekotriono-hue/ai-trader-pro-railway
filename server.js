import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { db } from './db.js';
import analyze from './api/analyze.js';
import dashboard from './api/dashboard.js';
import { publicMarket } from './lib/market.js';
import { trackAiSignals } from './lib/signal-journal.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_API_KEY;
  if (!configured) return res.status(503).json({ error: 'ADMIN_API_KEY is not configured' });
  const supplied = String(req.get('x-admin-key') || req.get('authorization')?.replace(/^Bearer\s+/i, '') || '');
  if (supplied.length !== configured.length || supplied !== configured) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  next();
}

async function migrate() {
  const dir = path.join(__dirname, 'migrations');
  const files = (await readdir(dir)).filter(x => x.endsWith('.sql')).sort();
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const filename of files) {
    const exists = await db.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (exists.rowCount) continue;
    const sql = await readFile(path.join(dir, filename), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log('Applied migration:', filename);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  }
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'ai-trader-pro' }));
app.post('/api/analyze', analyze);
app.get('/api/dashboard', dashboard);
const mt5Disabled = (_req,res) => res.status(410).json({error:'MT5 bridge and broker execution are disabled. AI Signal / Paper Tracking mode is active.'});
app.post('/api/bridge/push', mt5Disabled);
app.get('/api/bridge/commands', mt5Disabled);
app.post('/api/bridge/result', mt5Disabled);
app.post('/api/bridge/token', mt5Disabled);
app.post('/api/execute', mt5Disabled);

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

let signalMonitorRunning = false;
async function runSignalMonitor() {
  if (signalMonitorRunning || !process.env.DATABASE_URL) return;
  signalMonitorRunning = true;
  try {
    for (const symbol of ['XAUUSD','BTCUSD']) {
      try { await trackAiSignals(await publicMarket(symbol,'M3')); }
      catch (error) { console.error('AI signal monitor failed for',symbol,error.message); }
    }
  } finally { signalMonitorRunning = false; }
}

const port = Number(process.env.PORT || 3000);
try {
  if (process.env.DATABASE_URL) await migrate();
  else console.warn('Skipping database migrations: DATABASE_URL is missing.');
  app.listen(port, '0.0.0.0', () => {
    console.log(`AI Trader Pro listening on ${port}`);
    if (process.env.DATABASE_URL) {
      void runSignalMonitor();
      const monitor = setInterval(runSignalMonitor, 60000);
      monitor.unref?.();
      console.log('AI signal background monitor enabled (M3, XAUUSD + BTCUSD, every 60s).');
    }
  });
} catch (err) {
  console.error('Startup failed:', err);
  process.exit(1);
}
