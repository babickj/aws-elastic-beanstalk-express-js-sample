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

    // Update dashboard stats
    document.getElementById('stat-apps').textContent = status.generated_apps;
    document.getElementById('stat-model').textContent =
      status.model_path ? status.model_path.split('/').pop().slice(0, 24) : '—';

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
