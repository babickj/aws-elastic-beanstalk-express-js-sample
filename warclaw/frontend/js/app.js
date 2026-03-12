/**
 * WarClaw — Main App Controller
 * Handles routing, status polling, and global state.
 */

const API = {
  base: window.location.origin,

  async get(path) {
    const r = await fetch(this.base + path);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },

  async post(path, body) {
    const r = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || r.statusText);
    }
    return r.json();
  },

  async del(path) {
    const r = await fetch(this.base + path, { method: 'DELETE' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },

  ws(path) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(`${proto}//${location.host}${path}`);
  },
};

// ── Global state ─────────────────────────────────────────────────
const State = {
  modelReady: false,
  currentView: 'dashboard',
  lanScanResult: null,
  generatedApps: [],
  hwProfile: null,
};

// ── Toast notifications ──────────────────────────────────────────
function toast(message, type = 'info', duration = 4000) {
  const icons = { success: '✓', error: '✗', info: '◈' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || '●'}</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── View routing ─────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');

  const nav = document.querySelector(`[data-view="${name}"]`);
  if (nav) nav.classList.add('active');

  State.currentView = name;
}

// ── System time ──────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('system-time');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ── Format uptime seconds → human readable ───────────────────────
function fmtUptime(s) {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Status polling ───────────────────────────────────────────────
async function pollStatus() {
  try {
    const status = await API.get('/api/status');
    State.modelReady = status.model_ready;

    const dot = document.getElementById('ai-status-dot');
    const label = document.getElementById('ai-status-label');
    if (dot && label) {
      if (status.model_ready) {
        dot.className = 'status-dot online';
        label.textContent = 'AI READY';
      } else {
        dot.className = 'status-dot offline';
        label.textContent = 'NO MODEL';
      }
    }

    // Dashboard stats
    const appsEl = document.getElementById('stat-apps');
    if (appsEl) appsEl.textContent = status.generated_apps;
    const modelEl = document.getElementById('stat-model');
    if (modelEl) modelEl.textContent =
      status.model_path ? status.model_path.split('/').pop().slice(0, 28) : '— no model loaded';

    // Uptime + version
    const uptimeEl = document.getElementById('dash-uptime');
    if (uptimeEl && status.uptime_s != null) uptimeEl.textContent = fmtUptime(status.uptime_s);
    const verEl = document.getElementById('dash-version');
    if (verEl && status.version) verEl.textContent = `WarClaw v${status.version}`;

    // CPU / RAM
    const cpuEl = document.getElementById('dash-cpu');
    if (cpuEl && status.cpu_percent != null) cpuEl.textContent = `${status.cpu_percent.toFixed(1)}%`;
    const ramEl = document.getElementById('dash-ram');
    if (ramEl && status.ram_used_gb != null)
      ramEl.textContent = `${status.ram_used_gb} / ${status.ram_total_gb} GB (${status.ram_percent}%)`;

    // LAN status pill
    const lanDot = document.getElementById('lan-status-dot');
    const lanLabel = document.getElementById('lan-status-label');
    if (lanDot && lanLabel) {
      if (State.lanScanResult) {
        lanDot.className = 'status-dot online';
        const n = State.lanScanResult.hosts_up;
        lanLabel.textContent = `LAN ${n} HOST${n !== 1 ? 'S' : ''}`;
      } else {
        lanDot.className = 'status-dot';
        lanLabel.textContent = 'LAN —';
      }
    }

  } catch (e) {
    const dot = document.getElementById('ai-status-dot');
    if (dot) dot.className = 'status-dot error';
  }
}

// ── Nav click handlers ───────────────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    showView(view);
    if (view === 'hardware') loadHardwareView();
    if (view === 'apps') loadAppList();
  });
});

// ── Init ─────────────────────────────────────────────────────────
(async function init() {
  updateClock();
  setInterval(updateClock, 1000);
  await pollStatus();
  setInterval(pollStatus, 8000);
  showView('dashboard');
})();
