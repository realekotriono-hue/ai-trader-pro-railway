const $ = id => document.getElementById(id);
const API = '/api';
let snapshot = null;
let activeSection = 'dashboard';
let loadSeq = 0;

const money = n => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : `${Number(n) >= 0 ? '+' : '-'}$${Math.abs(Number(n)).toFixed(2)}`;
const px = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

function linePath(values, w = 900, h = 430, pad = 20) {
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  return values.map((v, i) => `${i ? 'L' : 'M'} ${(i / Math.max(1, values.length - 1)) * w} ${h - pad - ((v - min) / span) * (h - pad * 2)}`).join(' ');
}

function drawChart(s) {
  const vals = s.chart.price, ema9 = s.chart.ema9, ema21 = s.chart.ema21, ema50 = s.chart.ema50, ema200 = s.chart.ema200;
  let svg = `<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1bd4a0" stop-opacity=".18"/><stop offset="100%" stop-color="#1bd4a0" stop-opacity="0"/></linearGradient></defs>`;
  for (let i = 0; i < 6; i++) { const y = 30 + i * 67; svg += `<line x1="0" y1="${y}" x2="900" y2="${y}" stroke="#15304d" stroke-width="1" opacity=".45"/>`; }
  const p = linePath(vals);
  svg += `<path d="${p} L 900 430 L 0 430 Z" fill="url(#area)"/><path d="${p}" fill="none" stroke="#1de4ad" stroke-width="3"/>`;
  [[ema9,'#20d788',2],[ema21,'#f1bd42',2],[ema50,'#538cff',2],[ema200,'#a069f0',2]].forEach(([v,c,sw]) => svg += `<path d="${linePath(v)}" fill="none" stroke="${c}" stroke-width="${sw}" opacity=".8"/>`);
  s.chart.marks.forEach(m => { const x = m.x * 900, y = m.y * 430; svg += `<circle cx="${x}" cy="${y}" r="4" fill="${m.type === 'FVG' ? '#16d998' : '#33a9ff'}"/><text x="${x+7}" y="${y-7}" fill="${m.type === 'FVG' ? '#16d998' : '#33a9ff'}" font-size="17" font-weight="800">${m.type}</text>`; });
  $('priceChart').innerHTML = svg;
  $('rsiChart').innerHTML = `<line x1="0" y1="47" x2="900" y2="47" stroke="#1a3857" stroke-dasharray="4 5"/><path d="${linePath(s.chart.rsi,900,95,12)}" fill="none" stroke="#776ef0" stroke-width="2"/>`;
  $('equityChart').innerHTML = `<path d="${linePath(s.chart.equity,500,150,10)} L 500 150 L 0 150 Z" fill="#184889" opacity=".32"/><path d="${linePath(s.chart.equity,500,150,10)}" fill="none" stroke="#2f8cff" stroke-width="3"/>`;
}

function render(s) {
  snapshot = s;
  const hasAccount = s.account?.balance !== null && s.account?.balance !== undefined && Number.isFinite(Number(s.account.balance));
  $('balance').textContent = hasAccount ? '$' + Number(s.account.balance).toFixed(2) : '—';
  $('equity').textContent = s.account?.equity !== null && s.account?.equity !== undefined && Number.isFinite(Number(s.account.equity)) ? '$' + Number(s.account.equity).toFixed(2) : '—';
  $('floating').textContent = money(s.account?.floating);
  $('floating').className = s.account?.floating !== null && s.account?.floating !== undefined && Number.isFinite(Number(s.account.floating)) ? (Number(s.account.floating) >= 0 ? 'green' : 'red') : '';
  $('winRate').textContent = s.stats.winRate === null ? '—' : s.stats.winRate + '%';
  $('winCount').textContent = s.stats.total ? `${s.stats.wins} / ${s.stats.total}` : 'AI signal outcomes';
  $('profitFactor').textContent = s.stats.profitFactor === null ? '—' : String(s.stats.profitFactor);
  $('totalProfit').textContent = s.stats.total ? (Number(s.stats.totalProfit)>=0?'+':'')+Number(s.stats.totalProfit).toFixed(2)+'R' : '—';
  $('maxDd').textContent = s.stats.maxDrawdown === null ? '—' : Number(s.stats.maxDrawdown).toFixed(2) + '%';
  $('tradeCount').textContent = (s.stats.totalSignals ?? s.stats.total);
  $('winRing').style.background = s.stats.winRate === null ? 'conic-gradient(#18334b 0 100%)' : `conic-gradient(var(--green) 0 ${s.stats.winRate}%,#18334b ${s.stats.winRate}% 100%)`;
  if ($('perfProfit')) $('perfProfit').textContent = s.stats.total ? (Number(s.stats.totalProfit)>=0?'+':'')+Number(s.stats.totalProfit).toFixed(2)+'R' : '—';
  if ($('perfWinRate')) $('perfWinRate').textContent = s.stats.winRate === null ? '—' : s.stats.winRate + '%';
  if ($('perfProfitFactor')) $('perfProfitFactor').textContent = s.stats.profitFactor === null ? '—' : String(s.stats.profitFactor);
  if ($('perfMaxDd')) $('perfMaxDd').textContent = s.stats.maxDrawdown === null ? '—' : Number(s.stats.maxDrawdown).toFixed(2) + '%';
  if ($('perfTf')) $('perfTf').textContent = s.timeframe;
  $('chartTf').textContent = s.timeframe;
  if ($('chartSymbol')) $('chartSymbol').textContent = s.symbol;
  if ($('sourceTag')) $('sourceTag').textContent = s.providerType === 'mt5-live' ? 'MT5 LIVE' : s.providerType === 'public-live-derived' ? 'LIVE · DERIVED' : 'LIVE';
  if ($('instrumentName')) $('instrumentName').textContent = s.symbol === 'BTCUSD' ? 'Bitcoin / US Dollar' : 'Gold / US Dollar';
  if ($('liveNotice')) {
    const tg = s.signalTracking?.telegramConfigured ? 'Telegram notifications are configured.' : 'Telegram bot credentials are still required to enable notifications.';
    $('liveNotice').innerHTML = `<span>API SIGNAL MODE</span> ${esc(s.symbol)} · ${esc(s.timeframe)} · ${esc(s.provider)}. No MT5 connection or broker execution is used. Signals from 70% confidence are tracked against later candles; ${esc(tg)}`;
  }
  $('signalSymbol').textContent = `${s.symbol} · ${s.timeframe}`;
  $('ohlc').innerHTML = `O ${px(s.market.open)} &nbsp; H ${px(s.market.high)} &nbsp; L ${px(s.market.low)} &nbsp; C ${px(s.market.close)} &nbsp; <b class="${s.market.change >= 0 ? 'green' : 'red'}">${s.market.change >= 0 ? '+' : ''}${Number(s.market.change).toFixed(2)}</b>`;
  $('rsiValue').textContent = Number(s.analysis.rsi).toFixed(1);
  $('signalSide').textContent = s.signal.side;
  $('signalSide').style.color = s.signal.side === 'BUY' ? 'var(--green)' : 'var(--red)';
  $('signalArrow').textContent = s.signal.side === 'BUY' ? '↑' : '↓';
  $('signalArrow').style.background = s.signal.side === 'BUY' ? 'linear-gradient(135deg,#19df9d,#0ca377)' : 'linear-gradient(135deg,#ff6b76,#be3949)';
  $('confidence').textContent = s.signal.confidence + '%';
  document.querySelector('.confidence-ring').style.background = `conic-gradient(${s.signal.side === 'BUY' ? 'var(--green)' : 'var(--red)'} 0 ${s.signal.confidence}%,#18334b ${s.signal.confidence}% 100%)`;
  $('confidenceLabel').textContent = s.signal.confidence >= 80 ? 'High Confidence' : s.signal.confidence >= 70 ? 'Valid Setup' : 'Watch';
  $('entry').textContent = px(s.signal.entry); $('sl').textContent = px(s.signal.sl); $('tp1').textContent = px(s.signal.tp1); $('tp2').textContent = px(s.signal.tp2); $('rr').textContent = s.signal.rr;
  $('reasonText').textContent = s.signal.reason;
  $('mtfRows').innerHTML = s.analysis.mtf.map(r => `<tr><td><b>${r.tf}</b></td><td class="${r.bias === 'Bullish' ? 'green' : r.bias === 'Bearish' ? 'red' : ''}">${r.bias} ${r.structure}</td><td class="${r.signal === 'BUY' ? 'green' : r.signal === 'SELL' ? 'red' : ''}">${r.signal === 'BUY' ? '↑' : r.signal === 'SELL' ? '↓' : '•'} ${r.signal}</td></tr>`).join('');
  $('checks').innerHTML = s.analysis.checks.map(c => `<div class="check-row"><span>${esc(c.name)}</span><b class="${c.ok?'green':''}">${c.ok ? '✓ ' : '— '}${esc(c.value)}</b></div>`).join('');
  $('historyRows').innerHTML = s.history.length ? s.history.map(t => `<tr><td>${t.time}</td><td>${t.symbol}</td><td class="${t.side === 'BUY' ? 'side-buy' : 'side-sell'}">${t.side}</td><td>${px(t.entry)}</td><td>${t.exit===null?'—':px(t.exit)}</td><td class="${t.netR===null?'':t.netR >= 0 ? 'green' : 'red'}">${t.status==='OPEN'?'OPEN':t.netR >= 0 ? '+' : ''}${t.netR===null?'':Number(t.netR).toFixed(1)+'R'}</td></tr>`).join('') : '<tr><td colspan="6">No AI signal records yet.</td></tr>';
  $('featureBars').innerHTML = s.features.map(f => `<div class="feature"><span>${esc(f.name)}</span><div class="bar"><i style="width:${f.weight}%"></i></div><b>${f.weight}%</b></div>`).join('');
  $('mt5Status').textContent = 'Public API Active';
  $('mt5Dot').className = 'dot ok';
  $('modeText').textContent = 'Public API · Paper Signals';
  if ($('modelVersionTag')) $('modelVersionTag').textContent = 'v' + (s.model?.version || '2.0-live').replace('-live','') + ' LIVE';
  const posBox = $('positionBox');
  if (posBox) posBox.innerHTML = s.positions?.length ? s.positions.map(p=>`<div class="position-live"><div class="pos-head"><h3>${esc(p.symbol||s.symbol)} <span class="${String(p.side).toUpperCase()==='BUY'?'green':'red'}">${esc(p.side||'')}</span></h3><div class="pnl">${money(p.pnl ?? p.profit)}</div></div></div>`).join('') : `<div class="empty-state">${s.bridge.connected ? 'No simulated position is open.' : 'Paper mode active. No broker positions.'}</div>`;
  $('executeBtn').disabled = true;
  $('executeBtn').textContent = 'PAPER TRACKING ONLY · NO BROKER ORDERS';
  drawChart(s);
  if (activeSection !== 'dashboard') renderModule(activeSection);
}

async function load() {
  const seq = ++loadSeq;
  try {
    const r = await fetch(API + '/dashboard?symbol=' + encodeURIComponent($('symbolSelect').value) + '&tf=' + encodeURIComponent($('tfSelect').value), { cache:'no-store' });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || data.error || 'Dashboard API error');
    if (seq !== loadSeq) return;
    render(data);
  } catch (e) {
    if (seq !== loadSeq) return;
    if ($('liveNotice')) $('liveNotice').innerHTML = `<span>FEED ERROR</span> ${esc(e.message || 'Dashboard API unavailable')}. Previous snapshot is kept on screen.`;
    toast('Live feed temporarily unavailable');
  }
}

async function executeLiveTrade() {
  if (!snapshot) return;
  if (!snapshot.execution?.enabled) {
    toast(snapshot.bridge?.executionCapable ? 'Current signal does not pass live execution policy.' : 'MT5 Bridge V5 live execution is not armed.');
    return;
  }
  const riskPct = Math.max(0.1, Math.min(3, Number($('riskPct')?.value || localStorage.getItem('riskPct') || 1)));
  const beEnabled = localStorage.getItem('liveBE') !== 'false';
  const trailingEnabled = localStorage.getItem('liveTrail') === 'true';
  const ok = confirm(`LIVE ORDER\n\n${snapshot.symbol} ${snapshot.signal.side}\nTF ${snapshot.timeframe}\nEntry ~ ${px(snapshot.signal.entry)}\nSL ${px(snapshot.signal.sl)}\nTP ${px(snapshot.signal.tp2)}\nRisk ${riskPct}%\n\nSend this order to MT5?`);
  if (!ok) return;
  const btn = $('executeBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'QUEUEING LIVE ORDER...'; }
  try {
    const r = await fetch(API + '/execute', { method:'POST', headers:{'Content-Type':'application/json','x-admin-key':(sessionStorage.getItem('aiTraderAdminKey') || (sessionStorage.setItem('aiTraderAdminKey', prompt('Masukkan ADMIN_API_KEY Railway untuk mengirim perintah live:') || ''), sessionStorage.getItem('aiTraderAdminKey')))}, body:JSON.stringify({ confirmLive:true, symbol:snapshot.symbol, timeframe:snapshot.timeframe, riskPct, bePips:beEnabled?30:0, trailingEnabled }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Live execution rejected');
    toast(`LIVE command #${d.commandId} queued to MT5`);
    await load();
  } catch (e) {
    toast(e.message || 'Live execution failed');
    await load();
  }
}

function positionHtml(p) {
  return `<div class="position-live"><div class="pos-head"><h3>${esc(p.symbol)} <span class="${p.side === 'BUY' ? 'green' : 'red'}">${p.side}</span></h3><div class="pnl">PAPER</div></div><div class="pos-grid"><div><small>Entry</small><b>${px(p.entry)}</b></div><div><small>SL</small><b>${px(p.sl)}</b></div><div><small>TP</small><b>${px(p.tp2)}</b></div><div><small>Risk</small><b>${p.riskPct}%</b></div><div><small>Confidence</small><b>${p.confidence}%</b></div><div><small>Status</small><b>${esc(p.status)}</b></div></div></div>`;
}

function sectionHeader(title, subtitle) {
  return `<div class="module-head"><div><span class="eyebrow">AI TRADER PRO</span><h1>${title}</h1><p>${subtitle}</p></div><div class="module-badge">${snapshot ? esc(snapshot.symbol + ' · ' + snapshot.timeframe) : 'Loading...'}</div></div>`;
}

function renderModule(section) {
  if (!snapshot) return;
  const s = snapshot;
  const page = $('modulePage');
  let html = '';

  if (section === 'analysis') {
    html = `${sectionHeader('Market Analysis','Multi-timeframe structure, Smart Money Concepts and indicator confirmation.')}
      <div class="module-grid three">
        <article class="card module-card"><h3>Live Market Snapshot</h3><div class="metric-list"><div><span>Last Price</span><b>${px(s.market.close)}</b></div><div><span>Change</span><b class="${s.market.change>=0?'green':'red'}">${s.market.change>=0?'+':''}${s.market.change.toFixed(2)}</b></div><div><span>RSI (14)</span><b>${s.analysis.rsi.toFixed(1)}</b></div><div><span>Timeframe</span><b>${s.timeframe}</b></div></div><button class="secondary module-btn" id="refreshAnalysis">Refresh Analysis</button></article>
        <article class="card module-card span2"><h3>Multi Timeframe Structure</h3><table class="module-table"><thead><tr><th>TF</th><th>Bias</th><th>Structure</th><th>Signal</th></tr></thead><tbody>${s.analysis.mtf.map(r=>`<tr><td>${r.tf}</td><td class="${r.bias==='Bullish'?'green':'red'}">${r.bias}</td><td>${r.structure}</td><td class="${r.signal==='BUY'?'green':'red'}">${r.signal}</td></tr>`).join('')}</tbody></table></article>
        <article class="card module-card span3"><h3>SMC / Filter Validation</h3><div class="check-grid">${s.analysis.checks.map(c=>`<div class="check-tile ${c.ok?'pass':'fail'}"><span>${esc(c.name)}</span><b>${c.ok?'✓ PASS':'— WAIT'}</b><small>${esc(c.value)}</small></div>`).join('')}</div></article>
      </div>`;
  }

  if (section === 'signals') {
    html = `${sectionHeader('AI Signals','Review the current setup and re-run the weighted signal scoring engine.')}
      <div class="module-grid two">
        <article class="card module-card signal-focus"><div class="signal-big ${s.signal.side==='BUY'?'buy':'sell'}">${s.signal.side==='BUY'?'↑':'↓'} ${s.signal.side}</div><div class="confidence-big">${s.signal.confidence}%<small>Current confidence</small></div><div class="metric-list"><div><span>Entry</span><b>${px(s.signal.entry)}</b></div><div><span>SL</span><b>${px(s.signal.sl)}</b></div><div><span>TP 1</span><b>${px(s.signal.tp1)}</b></div><div><span>TP 2</span><b>${px(s.signal.tp2)}</b></div><div><span>RR</span><b>${esc(s.signal.rr)}</b></div></div><button class="primary module-btn" id="runScoring">Run Agent Scoring</button></article>
        <article class="card module-card"><h3>Why this signal?</h3><p class="module-copy">${esc(s.signal.reason)}</p><div class="score-result" id="scoreResult"><span>Scoring engine ready.</span></div><h3>Required filters</h3><div class="check-list">${s.analysis.checks.map(c=>`<div><span>${esc(c.name)}</span><b class="${c.ok?'green':'red'}">${c.ok?'VALID':'NOT VALID'}</b></div>`).join('')}</div></article>
      </div>`;
  }

  if (section === 'auto') {
    html = `${sectionHeader('AI Signal Tracking','API-only paper tracking. No MT5, EA or broker orders are used.')}
      <div class="module-grid two">
        <article class="card module-card"><h3>Signal Tracking Status</h3>
          <div class="status-line"><span class="dot ok"></span><div><b>Public Market API</b><small>Connected through the existing market-data provider</small></div></div>
          <div class="auto-master enabled"><span>PAPER / SIGNAL MODE</span><small>Signals with confidence ≥70% are recorded once per candle. Results are evaluated against future candles; SL is prioritized if both SL and TP2 are touched in one candle.</small></div>
          <div class="metric-list"><div><span>Signals recorded</span><b>${s.stats.totalSignals||0}</b></div><div><span>Open signals</span><b>${s.stats.open||0}</b></div><div><span>Telegram</span><b>${s.signalTracking?.telegramConfigured?'Configured':'Needs bot token + chat ID'}</b></div></div>
        </article>
        <article class="card module-card"><h3>AI Signal Performance</h3><div class="metric-list">
          <div><span>Closed</span><b>${s.stats.total}</b></div><div><span>Wins / Losses</span><b>${s.stats.wins} / ${s.stats.losses}</b></div>
          <div><span>Win Rate</span><b>${s.stats.winRate===null?'—':s.stats.winRate+'%'}</b></div>
          <div><span>Profit Factor</span><b>${s.stats.profitFactor===null?'—':s.stats.profitFactor}</b></div>
          <div><span>Net Result</span><b>${Number(s.stats.netR||0)>=0?'+':''}${Number(s.stats.netR||0).toFixed(2)}R</b></div>
        </div></article>
        <article class="card module-card span2"><h3>Tracking Rules</h3><div class="policy-box">
          <div><span>Entry</span><b>AI signal candle close</b></div><div><span>Stop Loss</span><b>SL level from analysis</b></div>
          <div><span>Take Profit</span><b>TP2 (2R target)</b></div><div><span>Confidence filter</span><b>70% minimum</b></div>
          <div><span>Ambiguous candle</span><b>SL first (conservative)</b></div>
        </div><p class="module-copy">The dashboard must continue polling for new market candles so open signals can be resolved. Statistics represent simulated signal outcomes, not verified broker fills or realized account P/L.</p></article>
      </div>`;
  }

  if (section === 'history') {
    html = `${sectionHeader('Trade History','AI signal journal with simulated outcomes from the public market API.')}
      <article class="card module-card"><div class="history-summary"><div><small>Total Trades</small><b>${s.stats.total}</b></div><div><small>Wins</small><b class="green">${s.stats.wins}</b></div><div><small>Win Rate</small><b>${s.stats.winRate===null?'—':s.stats.winRate+'%'}</b></div><div><small>Profit Factor</small><b>${s.stats.profitFactor===null?'—':String(s.stats.profitFactor)}</b></div></div><div class="table-scroll tall"><table class="module-table"><thead><tr><th>Time</th><th>Pair</th><th>Side</th><th>Entry</th><th>Exit</th><th>Result</th></tr></thead><tbody>${s.history.length?s.history.map(t=>`<tr><td>${t.time}</td><td>${t.symbol}</td><td class="${t.side==='BUY'?'green':'red'}">${t.side}</td><td>${px(t.entry)}</td><td>${t.exit===null?'—':px(t.exit)}</td><td class="${t.netR===null?'':t.netR>=0?'green':'red'}">${t.status==='OPEN'?'OPEN':(t.netR>=0?'+':'')+Number(t.netR).toFixed(1)+'R'}</td></tr>`).join(''):'<tr><td colspan="6">No AI signal records yet.</td></tr>'}</tbody></table></div></article>`;
  }

  if (section === 'backtest') {
    html = `${sectionHeader('Backtest','Inspect equity behavior and run a quick expectancy calculation from the current performance assumptions.')}
      <div class="module-grid two"><article class="card module-card"><h3>AI Signal Equity Curve</h3><svg id="moduleEquity" class="module-equity" viewBox="0 0 800 250" preserveAspectRatio="none"></svg><div class="history-summary"><div><small>Win Rate</small><b>${s.stats.winRate===null?'—':s.stats.winRate+'%'}</b></div><div><small>Profit Factor</small><b>${s.stats.profitFactor===null?'—':Number(s.stats.profitFactor).toFixed(2)}</b></div><div><small>Max DD</small><b class="red">${s.stats.maxDrawdown===null?'—':Number(s.stats.maxDrawdown).toFixed(2)+'%'}</b></div></div></article><article class="card module-card"><h3>Expectancy Calculator</h3><label class="module-field">Assumed Win Rate (%)<input id="calcWr" type="number" min="1" max="99" value="${s.stats.winRate===null?50:s.stats.winRate}"></label><label class="module-field">Reward : Risk<input id="calcRR" type="number" min="0.5" max="10" step="0.1" value="2"></label><label class="module-field">Trades<input id="calcTrades" type="number" min="1" max="10000" value="100"></label><button class="primary module-btn" id="calcExpectancy">Calculate</button><div class="calc-result" id="calcResult">Paper performance updates as subsequent market candles reach SL or TP2.</div></article></div>`;
  }

  if (section === 'model') {
    html = `${sectionHeader('AI Model V2','Signal-only analysis using public market data. No broker execution is enabled. Version '+esc(s.model?.version||'2.0-live')+'.')}
      <div class="module-grid two"><article class="card module-card"><h3>Feature Importance</h3><div class="feature-bars large-bars">${s.features.map(f=>`<div class="feature"><span>${esc(f.name)}</span><div class="bar"><i style="width:${Math.min(100,f.weight*4)}%"></i></div><b>${f.weight}%</b></div>`).join('')}</div></article><article class="card module-card"><h3>AI Signal Policy</h3><div class="policy-box"><div><span>Version</span><b>${esc(s.model?.version||'2.0-live')}</b></div><div><span>Type</span><b>${esc(s.model?.type||'Deterministic SMC/MTF execution policy')}</b></div><div><span>Signal threshold</span><b>≥ 70% confidence</b></div><div><span>Execution</span><b>Disabled · Paper tracking only</b></div><div><span>Market Data</span><b>${esc(s.provider)}</b></div><div><span>Broker Access</span><b>Disabled</b></div><div><span>Current Signal</span><b>${s.signal.side} · ${s.signal.confidence}%</b></div></div><p class="module-copy">The model calculates SMC and multi-timeframe conditions from the configured public market API. Signal outcomes are simulated against subsequent candles; confidence is not a guarantee of profit.</p></article></div>`;
  }

  if (section === 'settings') {
    html = `${sectionHeader('Settings','Preferences and live market connections.')}
      <div class="module-grid two"><article class="card module-card"><h3>Trading Preferences</h3><label class="module-field">Default Timeframe<select id="defaultTf"><option ${s.timeframe==='M1'?'selected':''}>M1</option><option ${s.timeframe==='M3'?'selected':''}>M3</option><option ${s.timeframe==='M5'?'selected':''}>M5</option><option ${s.timeframe==='M15'?'selected':''}>M15</option></select></label><label class="module-field">Live Risk (%)<input id="settingsRisk" type="number" min="0.1" max="3" step="0.1" value="${localStorage.getItem('riskPct')||1}"></label><label class="module-field">Minimum Confidence<input id="settingsConfidence" type="number" min="80" max="100" value="${localStorage.getItem('minConfidence')||80}"></label><button class="primary module-btn" id="saveSettings">Save Settings</button></article><article class="card module-card"><h3>Connections</h3><div class="connection-row"><span><i class="dot ok"></i>Railway API</span><b class="green">Connected</b></div><div class="connection-row"><span><i class="dot ${s.bridge.connected?'ok':''}"></i>MT5 Bridge</span><b class="${s.bridge.connected?'green':''}">${s.bridge.executionCapable?'Connected · LIVE EXEC':s.bridge.marketReady?'Connected · Monitor':s.bridge.connected?'Connected · Incomplete':'Not Connected'}</b></div><div class="connection-row"><span>Bridge Version</span><b>${esc(s.bridge.version||'—')}</b></div><div class="connection-row"><span>Active Market Source</span><b>${esc(s.provider)}</b></div><div class="connection-row"><span>Broker Execution</span><b class="${s.bridge.executionCapable?'green':''}">${s.bridge.executionCapable?'Armed in MT5':'Not armed'}</b></div><div class="connection-row"><span>AI Model</span><b>${esc(s.model?.version||'2.0-live')}</b></div><div class="notice compact">Live orders are available only when Bridge V5 reports terminal trading permission and the server has fresh MT5 M3, M5 and M15 candles. Public fallback data can never trigger broker execution.</div></article></div>`;
  }

  page.innerHTML = html;
  bindModuleActions(section);

  if (section === 'backtest') {
    const p = linePath(s.chart.equity,800,250,15);
    $('moduleEquity').innerHTML = `<path d="${p} L 800 250 L 0 250 Z" fill="#184889" opacity=".35"/><path d="${p}" fill="none" stroke="#2f8cff" stroke-width="4"/>`;
  }
}

function bindModuleActions(section) {
  if (section === 'analysis') $('refreshAnalysis')?.addEventListener('click', async () => { await load(); toast('Market analysis refreshed'); });
  if (section === 'signals') $('runScoring')?.addEventListener('click', runScoring);
  if (section === 'auto') {
    $('refreshAuto')?.addEventListener('click', async () => { await load(); toast('Live signal refreshed'); });
    $('liveNow')?.addEventListener('click', executeLiveTrade);
    $('beSwitchModule')?.addEventListener('click', e => { e.currentTarget.classList.toggle('on'); localStorage.setItem('liveBE', String(e.currentTarget.classList.contains('on'))); });
    $('trailSwitchModule')?.addEventListener('click', e => { e.currentTarget.classList.toggle('on'); localStorage.setItem('liveTrail', String(e.currentTarget.classList.contains('on'))); });
    $('saveAutoRules')?.addEventListener('click', () => { const r=Math.max(.1,Math.min(3,Number($('moduleRiskPct').value)||1)); localStorage.setItem('minConfidence', Math.max(80,Number($('minConfidence').value)||80)); localStorage.setItem('riskPct', r); if($('riskPct'))$('riskPct').value=r; toast('Live trading rules saved'); });
  }
  if (section === 'backtest') $('calcExpectancy')?.addEventListener('click', () => {
    const wr = Number($('calcWr').value) / 100, rr = Number($('calcRR').value), n = Number($('calcTrades').value);
    const expectancy = wr * rr - (1 - wr);
    const expectedR = expectancy * n;
    $('calcResult').innerHTML = `<b class="${expectancy>=0?'green':'red'}">${expectancy>=0?'+':''}${expectancy.toFixed(3)}R / trade</b><span>Expected over ${n} trades: ${expectedR>=0?'+':''}${expectedR.toFixed(1)}R</span>`;
  });
  if (section === 'settings') $('saveSettings')?.addEventListener('click', () => {
    localStorage.setItem('riskPct', $('settingsRisk').value);
    localStorage.setItem('minConfidence', $('settingsConfidence').value);
    localStorage.setItem('defaultTf', $('defaultTf').value);
    $('tfSelect').value = $('defaultTf').value;
    load();
    toast('Settings saved');
  });
}

async function runScoring() {
  if (!snapshot) return;
  const checks = snapshot.analysis.checks;
  const spreadCheck = checks.find(c => c.name.includes('Spread'));
  const body = {
    mtfAligned: snapshot.analysis.mtf.every(r => r.signal === snapshot.signal.side),
    obValid: !!checks.find(c => c.name.includes('Order Block'))?.ok,
    fvgValid: !!checks.find(c => c.name.includes('Fair Value Gap'))?.ok,
    emaAligned: !!checks.find(c => c.name.includes('EMA'))?.ok,
    rsiValid: !!checks.find(c => c.name.includes('RSI'))?.ok,
    atrValid: !!checks.find(c => c.name.includes('ATR'))?.ok,
    sessionValid: !!checks.find(c => c.name.includes('Session'))?.ok,
    spreadKnown: spreadCheck?.unknown !== true,
    spreadValid: spreadCheck?.unknown === true ? null : !!spreadCheck?.ok
  };
  const box = $('scoreResult');
  box.innerHTML = '<span>Running scoring agent…</span>';
  try {
    const r = await fetch(API + '/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const d = await r.json();
    box.innerHTML = `<b class="${d.liveQualified?'green':'red'}">${d.confidence}% · ${esc(d.classification.replaceAll('_',' '))} · ${esc(d.modelVersion||'2.0-live')}</b><span>${d.liveQualified ? 'Signal passes the V2 live policy. It can execute only when MT5 Bridge V5 is armed.' : 'Signal is not qualified for live execution.'}</span>`;
  } catch (e) { box.innerHTML = '<b class="red">Scoring API unavailable</b>'; }
}

function navigate(section, updateHash = true) {
  const allowed = ['dashboard','analysis','signals','auto','history','backtest','model','settings'];
  if (!allowed.includes(section)) section = 'dashboard';
  activeSection = section;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  $('dashboardPage').classList.toggle('hidden', section !== 'dashboard');
  $('modulePage').classList.toggle('hidden', section === 'dashboard');
  if (section !== 'dashboard') renderModule(section);
  if (updateHash) history.replaceState(null, '', '#' + section);
}

$('tfSelect').addEventListener('change', load);
$('symbolSelect').addEventListener('change', load);
$('executeBtn').addEventListener('click', executeLiveTrade);
$('saveRisk').addEventListener('click', () => {
  const risk=Math.max(.1,Math.min(3,Number($('riskPct').value)||1));
  $('riskPct').value=risk;
  localStorage.setItem('riskPct', risk);
  localStorage.setItem('dailyLoss', $('dailyLoss').value);
  localStorage.setItem('riskDd', $('riskDd').value);
  localStorage.setItem('maxTrades', $('maxTrades').value);
  toast('Live risk rules saved');
});
$('beSwitchMain')?.addEventListener('click', e => { e.currentTarget.classList.toggle('on'); localStorage.setItem('liveBE', String(e.currentTarget.classList.contains('on'))); });
$('trailSwitchMain')?.addEventListener('click', e => { e.currentTarget.classList.toggle('on'); localStorage.setItem('liveTrail', String(e.currentTarget.classList.contains('on'))); });
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => navigate(b.dataset.section)));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'dashboard', false));

const savedTf = localStorage.getItem('defaultTf');
if (savedTf && [...$('tfSelect').options].some(o => o.value === savedTf)) $('tfSelect').value = savedTf;
if (localStorage.getItem('riskPct')) $('riskPct').value = localStorage.getItem('riskPct');
if (localStorage.getItem('dailyLoss')) $('dailyLoss').value = localStorage.getItem('dailyLoss');
if (localStorage.getItem('riskDd')) $('riskDd').value = localStorage.getItem('riskDd');
if (localStorage.getItem('maxTrades')) $('maxTrades').value = localStorage.getItem('maxTrades');
if ($('beSwitchMain')) $('beSwitchMain').classList.toggle('on', localStorage.getItem('liveBE') !== 'false');
if ($('trailSwitchMain')) $('trailSwitchMain').classList.toggle('on', localStorage.getItem('liveTrail') === 'true');

setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('en-GB', { timeZone:'Asia/Jakarta' }) + ' WIB'; }, 1000);
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
navigate(location.hash.slice(1) || 'dashboard', false);
load();