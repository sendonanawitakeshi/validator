// ── Config ────────────────────────────────────────────────────────────────────
var VALIDATOR_KEY = 'nHBcLEB4S6moQGrhMjJo1jbp58WL5psHY9EMDWNAtdqykUYiA1rF';
var VHS_URL       = 'https://vhs.testnet.postfiat.org/v1/network/validator/' + VALIDATOR_KEY;
var REPORT_URL    = 'operator_report.json';
var REFRESH_MS    = 60 * 1000;
var NODE_CREATED  = new Date('2026-02-14T11:32:48Z');

// ── DOM refs ──────────────────────────────────────────────────────────────────
var $ = function(id) { return document.getElementById(id); };

var el = {
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

// ── Fetch & render (VHS live data) ───────────────────────────────────────────
async function fetchStats() {
  try {
    var res = await fetch(VHS_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error(res.status);
    var data = await res.json();
    if (data.result !== 'success') throw new Error('result: ' + data.result);
    render(data);
  } catch (e) {
    setStatus('error');
  }
}

function render(data) {
  setStatus('live');

  var a1h  = data.agreement_1h   || {};
  var a24h = data.agreement_24h  || {};
  var a30d = data.agreement_30day || {};

  var s1h  = parseFloat(a1h.score  || 0);
  var s24h = parseFloat(a24h.score || 0);
  var s30d = parseFloat(a30d.score || 0);

  el.score1h.textContent  = a1h.score  ? (s1h  * 100).toFixed(2) + '%' : '—';
  el.score24h.textContent = a24h.score ? (s24h * 100).toFixed(2) + '%' : '—';
  el.score30d.textContent = a30d.score ? (s30d * 100).toFixed(2) + '%' : '—';

  el.score1h.className  = 'metric-value ' + scoreClass(s1h);
  el.score24h.className = 'metric-value ' + scoreClass(s24h);
  el.score30d.className = 'metric-value ' + scoreClass(s30d);

  if (a1h.total)  el.missed1h.textContent  = a1h.missed  + ' missed / ' + fmtNum(a1h.total);
  if (a24h.total) el.missed24h.textContent = a24h.missed + ' missed / ' + fmtNum(a24h.total);
  if (a30d.total) el.missed30d.textContent = a30d.missed + ' missed / ' + fmtNum(a30d.total);

  el.version.textContent = data.server_version ? 'v' + data.server_version : '—';
  el.version.className = 'metric-value metric-value--sm metric-value--green';

  // Peers filled from operator report in renderReport(); show placeholder until loaded
  if (!el.peers._fromReport) {
    el.peers.textContent = '—';
    el.peers.className = 'metric-value metric-value--sm';
  }

  el.uptime.textContent = fmtDuration(Date.now() - NODE_CREATED.getTime());
  el.uptime.className = 'metric-value metric-value--sm metric-value--green';

  var syncState = s1h >= 0.95 ? 'Synced' : s1h >= 0.5 ? 'Catching Up' : 'Offline';
  el.sync.textContent = syncState;
  el.sync.className = 'metric-value metric-value--sm' +
    (syncState === 'Synced' ? ' metric-value--green' : syncState === 'Offline' ? ' metric-value--red' : ' metric-value--amber');

  el.ledger.textContent = data.current_index ? fmtNum(data.current_index) : '—';
  el.ledgerAge.textContent = data.ledger_hash ? data.ledger_hash.slice(0, 8) + '...' : '—';
  el.network.textContent = (data.chain || 'test').toUpperCase() + ' (ID ' + (data.networks || 'test') + ')';

  var fetchedAt = Date.now();
  el.updated.textContent = 'just now';
  clearInterval(window._updateTick);
  window._updateTick = setInterval(function() {
    var m = Math.round((Date.now() - fetchedAt) / 60000);
    el.updated.textContent = m < 1 ? 'just now' : m + 'm ago';
  }, 15000);
}

// ── Operator Report (7-day benchmarks) ──────────────────────────────────────
async function fetchReport() {
  try {
    var res = await fetch(REPORT_URL + '?t=' + Date.now());
    if (!res.ok) return;
    var rpt = await res.json();
    renderReport(rpt);
  } catch (e) {
    var notice = $('reportNotice');
    if (notice) notice.style.display = 'block';
  }
}

function renderReport(rpt) {
  var notice = $('reportNotice');

  // Collection notice
  if (rpt.samples < 60) {
    if (notice) {
      notice.style.display = 'block';
      notice.querySelector('span').textContent =
        rpt.samples + ' samples collected. Full report at ~10,080 samples (7 days x 60s intervals).';
    }
  } else {
    if (notice) notice.style.display = 'none';
  }

  // Peers (from report, not VHS)
  if (rpt.peers && rpt.peers.median != null) {
    var median = rpt.peers.median;
    el.peers.textContent = median;
    el.peers.className = 'metric-value metric-value--sm' + (median > 15 ? ' metric-value--green' : median > 10 ? '' : ' metric-value--red');
    el.peers._fromReport = true;
  }

  // Meta line
  var meta = $('reportMeta');
  if (meta && rpt.generated_at) {
    meta.textContent = fmtNum(rpt.samples) + ' samples | ' +
      (rpt.period_hours || 0) + 'h window | updated ' + timeSince(new Date(rpt.generated_at));
  }

  // Verdict badge
  var verdict = $('benchmarkVerdict');
  if (verdict && rpt.benchmarks) {
    var allPass = rpt.all_benchmarks_pass;
    var total = Object.keys(rpt.benchmarks).length;
    var passing = Object.values(rpt.benchmarks).filter(function(b) { return b.pass; }).length;

    if (rpt.samples < 1440) {
      // Less than 24h of data — show pending
      verdict.innerHTML = '<span class="verdict-badge verdict-badge--pending">COLLECTING (' +
        passing + '/' + total + ' passing, ' + rpt.samples + ' samples)</span>';
    } else if (allPass) {
      verdict.innerHTML = '<span class="verdict-badge verdict-badge--pass">ALL BENCHMARKS PASS (' +
        passing + '/' + total + ')</span>';
    } else {
      verdict.innerHTML = '<span class="verdict-badge verdict-badge--fail">BENCHMARK FAILURE (' +
        passing + '/' + total + ' passing)</span>';
    }
  }

  // Benchmark table
  var table = $('benchmarkTable');
  if (table && rpt.benchmarks) {
    var html = '';
    var order = [
      'zero_full_exits', 'zero_restarts', 'p95_lag_le_4',
      'median_peers_gt_15', 'p5_peers_gt_10', 'no_disconnect_burst_lag',
      'zero_collection_gaps'
    ];
    var valueFormat = {
      'zero_full_exits': function(b) { return b.value + ' exits'; },
      'zero_restarts': function(b) { return b.value + ' restarts'; },
      'p95_lag_le_4': function(b) {
        var lag = rpt.ledger_lag || {};
        return 'p95=' + b.value + 's (p50=' + (lag.p50||0) + 's p99=' + (lag.p99||0) + 's max=' + (lag.max||0) + 's)';
      },
      'median_peers_gt_15': function(b) {
        var p = rpt.peers || {};
        return 'median=' + b.value + ' (min=' + (p.min||0) + ' max=' + (p.max||0) + ')';
      },
      'p5_peers_gt_10': function(b) {
        return 'p5=' + b.value;
      },
      'no_disconnect_burst_lag': function(b) {
        return b.value + ' burst events';
      },
      'zero_collection_gaps': function(b) {
        var rate = rpt.collection_rate_pct || 100;
        return b.value + ' gaps (' + rate + '% collection rate)';
      },
    };

    for (var i = 0; i < order.length; i++) {
      var key = order[i];
      var b = rpt.benchmarks[key];
      if (!b) continue;
      var cls = b.pass ? 'pass' : 'fail';
      var icon = b.pass ? '\u2713' : '\u2717';
      var valFn = valueFormat[key];
      var val = valFn ? valFn(b) : String(b.value);
      html += '<div class="bench-row">' +
        '<span class="bench-status bench-status--' + cls + '">' + icon + '</span>' +
        '<span class="bench-rule">' + escapeHtml(b.rule) + '</span>' +
        '<span class="bench-value">' + escapeHtml(val) + '</span>' +
        '</div>';
    }
    table.innerHTML = html;
  }

  // Image pin + CSV attestation
  var pin = $('imagePin');
  if (pin && rpt.image_pinned) {
    var att = rpt.raw_csv_attestation || {};
    var html = '<div class="image-pin-row">' +
      '<span class="image-pin-label">PINNED</span> ' +
      'v' + escapeHtml(rpt.version || '?') + ' @ ' + escapeHtml(rpt.image_digest || '?') +
      '</div>';
    if (att.sha256) {
      html += '<div class="image-pin-row" style="margin-top:4px">' +
        '<span class="image-pin-label" style="color:#8b5cf6">CSV</span> ' +
        'sha256:' + escapeHtml(att.sha256.slice(0, 16)) + '... (' +
        fmtNum(att.size_bytes) + ' bytes, ' + fmtNum(rpt.samples || 0) + ' samples)' +
        '</div>';
    }
    pin.innerHTML = html;
  }

  // Alert log
  var alertsContainer = $('reportAlerts');
  var alertsList = $('reportAlertsList');
  if (alertsContainer && alertsList) {
    alertsContainer.style.display = 'block';
    alertsList.innerHTML = '';
    if (rpt.alerts && rpt.alerts.length > 0) {
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
    } else {
      alertsList.innerHTML = '<div class="report-alerts-empty">No alerts in reporting period</div>';
    }
  }

  // Footer
  var footer = $('reportFooter');
  if (footer) {
    footer.textContent = 'Generated ' + fmtDate(rpt.generated_at) + ' UTC' +
      ' | ' + fmtDate(rpt.period_start) + ' to ' + fmtDate(rpt.period_end) +
      ' | Source: server_info + peers + docker inspect + VHS, 60s intervals';
  }
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
function fmtNum(n) { return Number(n).toLocaleString(); }

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
setInterval(fetchReport, 5 * 60 * 1000);
