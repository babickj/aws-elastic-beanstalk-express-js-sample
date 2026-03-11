/**
 * WarClaw — Hardware & Model Management Module
 */

async function loadHardwareView() {
  const hwPanel = document.getElementById('hw-profile');
  const modelsPanel = document.getElementById('hw-models');

  hwPanel.innerHTML = '<div class="text-muted">Detecting hardware...</div>';
  modelsPanel.innerHTML = '<div class="text-muted">Scanning models directory...</div>';

  try {
    const [profile, modelsData] = await Promise.all([
      API.get('/api/hardware/profile'),
      API.get('/api/hardware/models'),
    ]);
    State.hwProfile = profile;

    const tierHtml = `<span class="tier-badge ${profile.recommended_tier}">${profile.recommended_tier.toUpperCase()} TIER</span>`;
    const gpuHtml = profile.gpu_name
      ? `${profile.gpu_name} (${profile.gpu_vram_gb}GB VRAM) <span class="text-green">✓ CUDA</span>`
      : '<span class="text-amber">None detected — CPU only</span>';

    hwPanel.innerHTML = `
      <div class="card-title">SERVER HARDWARE</div>
      <div class="hw-info-row">
        <div class="hw-info-label">CPU</div>
        <div class="hw-info-value" style="font-size:11px;">${profile.cpu_model}</div>
      </div>
      <div class="hw-info-row">
        <div class="hw-info-label">Cores</div>
        <div class="hw-info-value">${profile.cpu_cores}</div>
      </div>
      <div class="hw-info-row">
        <div class="hw-info-label">RAM</div>
        <div class="hw-info-value">${profile.ram_gb} GB</div>
      </div>
      <div class="hw-info-row">
        <div class="hw-info-label">GPU</div>
        <div class="hw-info-value">${gpuHtml}</div>
      </div>
      <div class="hw-info-row">
        <div class="hw-info-label">Rec. Tier</div>
        <div class="hw-info-value">${tierHtml}</div>
      </div>
      <div class="hw-info-row">
        <div class="hw-info-label">Model Hint</div>
        <div class="hw-info-value mono" style="font-size:11px;">${profile.recommended_model}</div>
      </div>
      <div style="margin-top:12px;">
        ${profile.notes.map(n => `<div class="text-muted" style="font-size:11px;margin-bottom:4px;">◈ ${n}</div>`).join('')}
      </div>
    `;

    // Models list
    const currentModel = modelsData.current_model;
    const isReady = modelsData.model_ready;

    let modelsHtml = `<div class="card-title">LOADED MODEL</div>`;
    if (isReady) {
      const name = currentModel.split('/').pop();
      modelsHtml += `
        <div class="model-file-item" style="border-color:var(--accent-green);">
          <span class="text-green">●</span>
          <span class="model-file-name text-green">${name}</span>
          <span class="model-size">ACTIVE</span>
        </div>
      `;
    } else {
      modelsHtml += `<div class="text-amber" style="font-size:11px;margin-bottom:12px;">No model loaded</div>`;
    }

    modelsHtml += `<div class="card-title" style="margin-top:16px;">AVAILABLE MODELS</div>`;

    if (modelsData.models.length === 0) {
      modelsHtml += `
        <div class="text-muted" style="font-size:11px;line-height:1.7;">
          No .gguf files found in:<br>
          <span class="mono" style="color:var(--accent-blue);">${modelsData.models_dir}</span><br><br>
          Place GGUF model files in that directory, then click Refresh.
        </div>
      `;
    } else {
      modelsHtml += modelsData.models.map(m => `
        <div class="model-file-item">
          <span style="color:var(--text-muted);">◈</span>
          <span class="model-file-name" title="${m.path}">${m.name}</span>
          <span class="model-size">${m.size_mb}MB</span>
          <button class="btn btn-primary" style="font-size:10px;padding:3px 10px;flex-shrink:0;"
            onclick="loadModel('${m.path}', ${profile.recommended_gpu_layers})">
            LOAD
          </button>
        </div>
      `).join('');
    }

    // Manual load form
    modelsHtml += `
      <div style="margin-top:16px;">
        <div class="card-title">MANUAL MODEL PATH</div>
        <div class="form-group">
          <input type="text" id="manual-model-path" placeholder="/path/to/model.gguf" />
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <div class="form-group" style="flex:1;margin:0;">
            <label>GPU Layers (0=CPU only)</label>
            <input type="number" id="manual-gpu-layers" value="${profile.recommended_gpu_layers}" min="0" max="200" />
          </div>
        </div>
        <button class="btn btn-primary" style="margin-top:10px;width:100%;"
          onclick="loadManualModel()">
          ⚡ LOAD MODEL
        </button>
      </div>
    `;

    modelsPanel.innerHTML = modelsHtml;

  } catch (e) {
    hwPanel.innerHTML = `<div class="text-red">Hardware detection failed: ${e.message}</div>`;
    modelsPanel.innerHTML = `<div class="text-red">${e.message}</div>`;
  }
}

async function loadModel(path, gpuLayers) {
  toast(`Loading model — this may take 30-60 seconds...`, 'info', 30000);
  try {
    const result = await API.post('/api/hardware/models/load', {
      model_path: path,
      n_gpu_layers: gpuLayers || 0,
    });
    toast(`Model loaded: ${path.split('/').pop()}`, 'success');
    State.modelReady = true;
    await loadHardwareView();
    await pollStatus();
  } catch (e) {
    toast('Model load failed: ' + e.message, 'error');
  }
}

async function loadManualModel() {
  const path = document.getElementById('manual-model-path').value.trim();
  const gpuLayers = parseInt(document.getElementById('manual-gpu-layers').value) || 0;
  if (!path) { toast('Enter a model path', 'error'); return; }
  await loadModel(path, gpuLayers);
}

function initHardware() {
  document.getElementById('hw-refresh-btn').onclick = loadHardwareView;
}

document.addEventListener('DOMContentLoaded', initHardware);
