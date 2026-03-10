// ── Config ────────────────────────────────────────────────────────────────────
const VALIDATOR_KEY = 'nHBcLEB4S6moQGrhMjJo1jbp58WL5psHY9EMDWNAtdqykUYiA1rF';
const VHS_URL       = 'https://vhs.testnet.postfiat.org/v1/network/validator/' + VALIDATOR_KEY;
const RPC_URL       = null; // local RPC not exposed publicly; VHS only
const REFRESH_MS    = 60 * 1000;
const NODE_CREATED  = new Date('2026-02-14T11:32:48Z');

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const el = {
  heroStatus: $('heroStatus'),
  wsDot:      $('wsDot'),
  wsLabel:    $('wsLabel'),
  updated:    $('lastUpdated'),
  score1h:    $('statScore1h'),
  score24h:   $('statScore24h'),
  score30d:   $('statScore30d'),
  missed1h:   $('statMissed1h'),
  missed24h:  $('statMissed24h'),
  missed30d:  $('statMissed30d'),
  version:    $('statVersion'),
  peers:      $('statPeers'),
  uptime:     $('statUptime'),
  sync:       $('statSync'),
  ledger:     $('statLedger'),
  ledgerAge:  $('statLedgerAge'),
  network:    $('statNetwork'),
};

// ── Fetch & render ────────────────────────────────────────────────────────────
async function fetchStats() {
  try {
    const res = await fetch(VHS_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (data.result !== 'success') throw new Error('result: ' + data.result);
    render(data);
  } catch (e) {
    setStatus('error');
  }
}

function render(data) {
  setStatus('live');

  // Agreement scores
  const a1h  = data.agreement_1h   || {};
  const a24h = data.agreement_24h  || {};
  const a30d = data.agreement_30day || {};

  const s1h  = parseFloat(a1h.score  || 0);
  const s24h = parseFloat(a24h.score || 0);
  const s30d = parseFloat(a30d.score || 0);

  el.score1h.textContent  = a1h.score  ? (s1h  * 100).toFixed(2) + '%' : '—';
  el.score24h.textContent = a24h.score ? (s24h * 100).toFixed(2) + '%' : '—';
  el.score30d.textContent = a30d.score ? (s30d * 100).toFixed(2) + '%' : '—';

  el.score1h.className  = 'metric-value ' + scoreClass(s1h);
  el.score24h.className = 'metric-value ' + scoreClass(s24h);
  el.score30d.className = 'metric-value ' + scoreClass(s30d);

  // Missed validations
  if (a1h.total)  el.missed1h.textContent  = a1h.missed  + ' missed / ' + fmtNum(a1h.total);
  if (a24h.total) el.missed24h.textContent = a24h.missed + ' missed / ' + fmtNum(a24h.total);
  if (a30d.total) el.missed30d.textContent = a30d.missed + ' missed / ' + fmtNum(a30d.total);

  // Node metrics
  el.version.textContent = data.server_version ? 'v' + data.server_version : '—';
  el.version.className = 'metric-value metric-value--sm metric-value--green';

  // Peers: not available from VHS, show container uptime instead
  var uptimeDays = Math.floor((Date.now() - NODE_CREATED.getTime()) / 86400000);
  el.peers.textContent = uptimeDays + 'd';
  el.peers.className = 'metric-value metric-value--sm' + (uptimeDays > 7 ? ' metric-value--green' : '');

  // Uptime — calculate from node creation
  el.uptime.textContent = fmtDuration(Date.now() - NODE_CREATED.getTime());
  el.uptime.className = 'metric-value metric-value--sm metric-value--green';

  // Sync — infer from agreement score
  var syncState = s1h >= 0.95 ? 'Synced' : s1h >= 0.5 ? 'Catching Up' : 'Offline';
  el.sync.textContent = syncState;
  el.sync.className = 'metric-value metric-value--sm' +
    (syncState === 'Synced' ? ' metric-value--green' : syncState === 'Offline' ? ' metric-value--red' : ' metric-value--amber');

  // Ledger
  el.ledger.textContent = data.current_index ? fmtNum(data.current_index) : '—';
  el.ledgerAge.textContent = data.ledger_hash ? data.ledger_hash.slice(0, 8) + '...' : '—';
  el.network.textContent = (data.chain || 'test').toUpperCase() + ' (ID ' + (data.networks || 'test') + ')';

  // Updated timer
  var fetchedAt = Date.now();
  el.updated.textContent = 'just now';
  clearInterval(window._updateTick);
  window._updateTick = setInterval(function() {
    var m = Math.round((Date.now() - fetchedAt) / 60000);
    el.updated.textContent = m < 1 ? 'just now' : m + 'm ago';
  }, 15000);
}

// ── Status ────────────────────────────────────────────────────────────────────
function setStatus(state) {
  el.wsDot.className  = 'ws-dot';
  el.wsLabel.className = 'ws-label';

  var heroBadge = document.querySelector('.hero-badge');

  if (state === 'live') {
    el.wsDot.classList.add('ws-dot--live');
    el.wsLabel.classList.add('ws-label--live');
    el.wsLabel.textContent = 'LIVE';
    el.heroStatus.textContent = 'VALIDATING';
    heroBadge.classList.remove('hero-badge--error');
  } else {
    el.wsDot.classList.add('ws-dot--error');
    el.wsLabel.classList.add('ws-label--error');
    el.wsLabel.textContent = 'ERROR';
    el.heroStatus.textContent = 'CONNECTING';
    heroBadge.classList.add('hero-badge--error');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n) {
  return Number(n).toLocaleString();
}

function fmtDuration(ms) {
  var d = Math.floor(ms / 86400000);
  var h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return d + 'd ' + h + 'h';
  return h + 'h';
}

function scoreClass(score) {
  if (score >= 0.99)  return 'metric-value--green';
  if (score >= 0.95)  return '';
  if (score >= 0.80)  return 'metric-value--amber';
  return 'metric-value--red';
}

// ── Copy key ──────────────────────────────────────────────────────────────────
function copyKey(btn, key) {
  navigator.clipboard.writeText(key).then(function() {
    var spanEl = btn.querySelector('span');
    btn.classList.add('copied');
    spanEl.textContent = 'Copied!';
    setTimeout(function() {
      btn.classList.remove('copied');
      spanEl.textContent = 'Copy';
    }, 2000);
  });
}

// ── Mouse parallax ────────────────────────────────────────────────────────────
document.addEventListener('mousemove', function(e) {
  var glow = document.querySelector('.bg-glow');
  if (!glow) return;
  var x = (e.clientX / window.innerWidth) * 10 - 5;
  var y = (e.clientY / window.innerHeight) * 10 - 5;
  glow.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
});

// ── Boot ──────────────────────────────────────────────────────────────────────
fetchStats();
setInterval(fetchStats, REFRESH_MS);
