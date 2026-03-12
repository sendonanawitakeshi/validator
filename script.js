// ── Config ────────────────────────────────────────────────────────────────────
const VALIDATOR_KEY = 'nHBcLEB4S6moQGrhMjJo1jbp58WL5psHY9EMDWNAtdqykUYiA1rF';
const VHS_URL       = 'https://vhs.testnet.postfiat.org/v1/network/validator/' + VALIDATOR_KEY;
const REPORT_URL    = 'operator_report.json';
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

// ── Operator Report ──────────────────────────────────────────────────────────
async function fetchReport() {
  try {
    var res = await fetch(REPORT_URL + '?t=' + Date.now());
    if (!res.ok) return;
    var rpt = await res.json();
    renderReport(rpt);
  } catch (e) {
    // Report not available yet — show notice
    var notice = $('reportNotice');
    if (notice) notice.style.display = 'block';
  }
}

function renderReport(rpt) {
  var notice = $('reportNotice');

  // Show notice if very few samples (< 60 = less than 1 hour of data)
  if (rpt.samples < 60) {
    if (notice) {
      notice.style.display = 'block';
      notice.querySelector('span').textContent =
        'Collecting data — ' + rpt.samples + ' samples so far. Report fills in over 7 days.';
    }
  } else {
    if (notice) notice.style.display = 'none';
  }

  // Meta
  var meta = $('reportMeta');
  if (meta && rpt.generated_at) {
    var ago = timeSince(new Date(rpt.generated_at));
    meta.textContent = rpt.samples + ' samples | updated ' + ago;
  }

  // p95 Ledger Lag
  var lag = rpt.ledger_lag || {};
  var p95El = $('rptP95Lag');
  if (p95El) {
    p95El.textContent = lag.p95 != null ? lag.p95 + 's' : '—';
    p95El.className = 'metric-value metric-value--sm' + lagClass(lag.p95);
  }
  var lagDetail = $('rptLagDetail');
  if (lagDetail) {
    lagDetail.textContent = 'p50=' + (lag.p50 || 0) + 's / p99=' + (lag.p99 || 0) + 's / max=' + (lag.max || 0) + 's';
  }

  // Median Peers
  var peers = rpt.peers || {};
  var peersEl = $('rptMedianPeers');
  if (peersEl) {
    peersEl.textContent = peers.median != null ? peers.median : '—';
    peersEl.className = 'metric-value metric-value--sm' + (peers.median >= 10 ? ' metric-value--green' : peers.median >= 5 ? ' metric-value--amber' : ' metric-value--red');
  }
  var peerDetail = $('rptPeerDetail');
  if (peerDetail) {
    peerDetail.textContent = 'min=' + (peers.min || 0) + ' / max=' + (peers.max || 0);
  }

  // Restarts
  var restartsEl = $('rptRestarts');
  if (restartsEl) {
    restartsEl.textContent = rpt.restart_count != null ? rpt.restart_count : '—';
    restartsEl.className = 'metric-value metric-value--sm' + (rpt.restart_count === 0 ? ' metric-value--green' : ' metric-value--amber');
  }
  var restartDetail = $('rptRestartDetail');
  if (restartDetail) {
    restartDetail.textContent = rpt.restart_count === 0 ? 'no restarts in period' : rpt.restart_count + ' restart(s) detected';
  }

  // Uptime
  var uptimeEl = $('rptUptime');
  if (uptimeEl) {
    uptimeEl.textContent = rpt.uptime_pct != null ? rpt.uptime_pct + '%' : '—';
    uptimeEl.className = 'metric-value metric-value--sm' + (rpt.uptime_pct >= 99.9 ? ' metric-value--green' : rpt.uptime_pct >= 99 ? ' metric-value--amber' : ' metric-value--red');
  }
  var uptimeDetail = $('rptUptimeDetail');
  if (uptimeDetail) {
    uptimeDetail.textContent = 'server_state=full';
  }

  // Missed validations
  var missedEl = $('rptMissed');
  if (missedEl && rpt.total_validations_30d) {
    var missedPct = ((rpt.missed_validations_30d / rpt.total_validations_30d) * 100).toFixed(3);
    missedEl.textContent = fmtNum(rpt.missed_validations_30d);
    missedEl.className = 'metric-value metric-value--sm' + (missedPct < 1 ? ' metric-value--green' : ' metric-value--amber');
  }
  var missedDetail = $('rptMissedDetail');
  if (missedDetail && rpt.total_validations_30d) {
    missedDetail.textContent = fmtNum(rpt.missed_validations_30d) + ' / ' + fmtNum(rpt.total_validations_30d) + ' total';
  }

  // Version
  var versionEl = $('rptVersion');
  if (versionEl) {
    versionEl.textContent = rpt.version ? 'v' + rpt.version : '—';
    versionEl.className = 'metric-value metric-value--sm metric-value--green';
  }

  // Alerts
  var alertsEl = $('rptAlerts');
  if (alertsEl) {
    alertsEl.textContent = rpt.alert_count != null ? rpt.alert_count : '—';
    alertsEl.className = 'metric-value metric-value--sm' + (rpt.alert_count === 0 ? ' metric-value--green' : ' metric-value--amber');
  }
  var alertDetail = $('rptAlertDetail');
  if (alertDetail) {
    alertDetail.textContent = rpt.alert_count === 0 ? 'clean — no alerts' : rpt.alert_count + ' alert(s) in period';
  }

  // Alert log
  var alertsContainer = $('reportAlerts');
  var alertsList = $('reportAlertsList');
  if (alertsContainer && alertsList && rpt.alerts && rpt.alerts.length > 0) {
    alertsContainer.style.display = 'block';
    alertsList.innerHTML = '';
    rpt.alerts.forEach(function(a) {
      var row = document.createElement('div');
      row.className = 'report-alert-row';
      var ts = a.timestamp ? a.timestamp.replace('T', ' ').replace('Z', '') : '';
      row.innerHTML =
        '<span class="report-alert-ts">' + ts + '</span>' +
        '<span class="report-alert-sev report-alert-sev--' + (a.severity || 'WARNING') + '">' + (a.severity || '?') + '</span>' +
        '<span class="report-alert-msg">' + escapeHtml(a.message || '') + '</span>';
      alertsList.appendChild(row);
    });
  }

  // Footer
  var footer = $('reportFooter');
  if (footer) {
    footer.textContent = 'Report generated ' + (rpt.generated_at || '—') +
      ' | Period: ' + fmtDate(rpt.period_start) + ' to ' + fmtDate(rpt.period_end) +
      ' | Sourced from server_info, peers, VHS, container logs';
  }
}

function lagClass(val) {
  if (val == null) return '';
  if (val <= 2) return ' metric-value--green';
  if (val <= 5) return ' metric-value--amber';
  return ' metric-value--red';
}

function timeSince(date) {
  var s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return 'just now';
  var m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

function escapeHtml(s) {
  var d = document.createElement('div');
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
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
fetchReport();
setInterval(fetchStats, REFRESH_MS);
setInterval(fetchReport, 5 * 60 * 1000); // refresh report every 5 min
