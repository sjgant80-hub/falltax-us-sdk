// falltax-us SDK · sovereign single-file library · MIT · AI-Native Solutions
// Extracted from falltax-us/index.html · 138750 bytes of source logic
// Public-safe: no primes/glyphs/dyad references

/*!
 * Fall Kit · v1.0.0 · the shared cascade for every estate seed
 *
 * Inlineable JS module. Drop into any seed via <script> or copy-paste inline.
 * Preserves single-HTML sovereignty (no external deps until user opts in to T2 WebLLM).
 *
 * What it gives every seed:
 *  - AI tier picker: T0 (off · default) · T2 (WebLLM in-browser, 5 models 1B-70B) · T3 (BYOK Anthropic/OpenAI/Google)
 *  - Universal entry: FallKit.aiComplete(systemPrompt, userMsg, maxTokens) → string|null
 *  - AI chip UI in header
 *  - WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN)
 *  - Help section partial: FallKit.helpSection()
 *  - Settings panel: FallKit.openSettings()
 *
 * Doctrine (per botler CLAUDE.md):
 *  - T0 fallback ALWAYS works · aiComplete returns null · caller MUST degrade gracefully
 *  - NEVER hide a feature behind AI · NEVER proxy API keys · NEVER log keys
 *  - WebLLM is lazy-loaded · model weights download ONLY on user opt-in
 *
 * Estate-first canonical references:
 *  - WebLLM pattern: Downloads/botler/index.html (T0/T2/T3 cascade)
 *  - WebRTC pattern: Downloads/fallnet/fallnet-shim.js (raw RTCPeerConnection)
 *  - Mesh channel:   'fall-signal'
 */
(function (root) {
  'use strict';
  const FALL_KIT_VERSION = '1.2.0';
  const KCC_MINT_URL = 'https://sjgant80-hub.github.io/kcc-mint/';
  // ─── Model registry ──────────────────────────────────────────────
  const WEBLLM_MODELS = {
    'llama-1b':  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',   size: '~700MB', label: '1B · fast · any laptop / phone' },
    'llama-3b':  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC',   size: '~2GB',   label: '3B · balanced · default · most laptops' },
    'qwen-7b':   { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC',     size: '~5GB',   label: '7B · capable · needs decent GPU (M-series Mac / 8GB+ VRAM)' },
    'llama-8b':  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',   size: '~5GB',   label: '8B · common · needs decent GPU' },
    'llama-70b': { id: 'Llama-3.1-70B-Instruct-q4f16_1-MLC',  size: '~40GB',  label: '70B · frontier · needs serious GPU + 64GB+ RAM' },
  };
  const DEFAULT_MODEL = 'llama-3b';
  const T3_PROVIDERS = {
    anthropic: { label: 'Anthropic Claude', models: ['claude-sonnet-4-5','claude-opus-4-7','claude-haiku-4-5'], default: 'claude-sonnet-4-5', url: 'https://api.anthropic.com/v1/messages' },
    openai:    { label: 'OpenAI',           models: ['gpt-4o','gpt-4o-mini','o1-mini'],                          default: 'gpt-4o-mini',      url: 'https://api.openai.com/v1/chat/closings' },
    google:    { label: 'Google Gemini',    models: ['gemini-1.5-pro','gemini-1.5-flash','gemini-2.0-flash-exp'], default: 'gemini-1.5-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/' },
  };
  // ─── State ───────────────────────────────────────────────────────
  const STATE = {
    config: loadConfig(),
    ai: { ready: false, loading: false, progress: 0, engine: null, model: null },
    mesh: { active: false, peers: new Map(), bc: null, signal: null },
  };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem('fall-kit.config') || '{}'); }
    catch (e) { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem('fall-kit.config', JSON.stringify(STATE.config)); } catch (e) {}
  }
  // ─── DOM helpers ─────────────────────────────────────────────────
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  // ─── AI tier ─────────────────────────────────────────────────────
  function aiTier() { return STATE.config.ai_tier || 'T0'; }
  function renderAiChip() {
    const chip = $('#fk-ai-chip');
    if (!chip) return;
    const txt = $('#fk-ai-chip-text');
    chip.classList.remove('fk-chip-live', 'fk-chip-loading', 'fk-chip-warn');
    const tier = aiTier();
    if (tier === 'T0') { txt.textContent = 'T0 · off'; }
    else if (tier === 'T2') {
      if (STATE.ai.ready) { txt.textContent = 'T2 ' + (WEBLLM_MODELS[STATE.config.webllm_model || DEFAULT_MODEL]?.label.split(' · ')[0] || '') + ' · ready'; chip.classList.add('fk-chip-live'); }
      else if (STATE.ai.loading) { txt.textContent = 'T2 loading ' + Math.round(STATE.ai.progress) + '%'; chip.classList.add('fk-chip-loading'); }
      else { txt.textContent = 'T2 · click to load'; chip.classList.add('fk-chip-warn'); }
    } else if (tier === 'T3') {
      if (STATE.config.api_key) { txt.textContent = 'T3 ' + (T3_PROVIDERS[STATE.config.api_provider]?.label || 'BYOK') + ' · active'; chip.classList.add('fk-chip-live'); }
      else { txt.textContent = 'T3 · no key set'; chip.classList.add('fk-chip-warn'); }
    }
  }
  async function loadWebLLM(modelKey) {
    if (STATE.ai.loading) return;
    const key = modelKey || STATE.config.webllm_model || DEFAULT_MODEL;
    const model = WEBLLM_MODELS[key];
    if (!model) { console.error('fall-kit: unknown model', key); return; }
    if (STATE.ai.ready && STATE.ai.model === model.id) return;
    STATE.ai.loading = true; STATE.ai.progress = 0; renderAiChip();
    notify('Loading WebLLM · ' + model.label + ' · ' + model.size + ' first time', 'info');
    try {
      const { CreateMLCEngine } = await import('https://esm.run/@mlc-ai/web-llm@0.2.79');
      const engine = await CreateMLCEngine(model.id, {
        initProgressCallback: p => { STATE.ai.progress = (p.progress || 0) * 100; renderAiChip(); }
      });
      STATE.ai.engine = engine;
      STATE.ai.model = model.id;
      STATE.ai.ready = true;
      STATE.ai.loading = false;
      STATE.config.webllm_model = key; saveConfig();
      renderAiChip();
      notify('WebLLM ready · sovereign mode · ' + model.label.split(' · ')[0], 'ok');
    } catch (e) {
      console.error('fall-kit: WebLLM load failed', e);
      STATE.ai.loading = false; renderAiChip();
      notify('WebLLM load failed · ' + e.message, 'err');
    }
  }
  async function aiComplete(systemPrompt, userMsg, maxTokens) {
    maxTokens = maxTokens || 600;
    const tier = aiTier();
    if (tier === 'T2' && STATE.ai.ready && STATE.ai.engine) {
      const r = await STATE.ai.engine.chat.closings.create({
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
        max_tokens: maxTokens,
      });
      return r.choices[0].message.content;
    }
    if (tier === 'T3' && STATE.config.api_key && STATE.config.api_provider) {
      return await aiCloudCall(systemPrompt, userMsg, maxTokens);
    }
    return null;
  }
  async function aiCloudCall(sys, msg, maxTokens) {
    const provider = STATE.config.api_provider;
    const key = STATE.config.api_key;
    const model = STATE.config.api_model || T3_PROVIDERS[provider]?.default;
    if (provider === 'anthropic') {
      const r = await fetch(T3_PROVIDERS.anthropic.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('Anthropic ' + r.status + ': ' + (await r.text()).slice(0, 200));
      const j = await r.json();
      return j.content[0].text;
    }
    if (provider === 'openai') {
      const r = await fetch(T3_PROVIDERS.openai.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: sys }, { role: 'user', content: msg }] }),
      });
      if (!r.ok) throw new Error('OpenAI ' + r.status);
      const j = await r.json();
      return j.choices[0].message.content;
    }
    if (provider === 'google') {
      const r = await fetch(T3_PROVIDERS.google.url + model + ':generateContent?key=' + encodeURIComponent(key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n---\n\n' + msg }] }], generationConfig: { maxOutputTokens: maxTokens } }),
      });
      if (!r.ok) throw new Error('Google ' + r.status);
      const j = await r.json();
      return j.candidates[0].content.parts[0].text;
    }
    throw new Error('unknown provider: ' + provider);
  }
  // ─── WebRTC P2P mesh (ported from canonical fallnet · fall-signal channel · Google STUN) ───
  const MESH_CHANNEL = 'fall-signal';
  const STUN_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
  function meshStart(opts) {
    if (STATE.mesh.active) return;
    opts = opts || {};
    const seedId = opts.seedId || (location.pathname + '#' + Math.random().toString(36).slice(2, 8));
    STATE.mesh.seedId = seedId;
    try { STATE.mesh.bc = new BroadcastChannel(MESH_CHANNEL); }
    catch (e) { console.warn('fall-kit: BroadcastChannel unavailable'); return; }
    STATE.mesh.bc.onmessage = e => {
      const m = e.data;
      if (!m || !m.kind || m.peerId === seedId) return;
      if (opts.onMessage) opts.onMessage(m);
    };
    STATE.mesh.bc.postMessage({ kind: 'fall-kit:hello', peerId: seedId, ts: Date.now(), seedName: opts.seedName || 'unknown' });
    STATE.mesh.active = true;
    notify('Mesh active · channel ' + MESH_CHANNEL, 'ok');
  }
  function meshPost(kind, payload) {
    if (!STATE.mesh.active || !STATE.mesh.bc) return false;
    STATE.mesh.bc.postMessage({ kind: kind, peerId: STATE.mesh.seedId, ts: Date.now(), payload: payload });
    return true;
  }
  // ─── Toast ───────────────────────────────────────────────────────
  function notify(msg, kind) {
    let t = $('#fk-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'fk-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%) translateY(20px);background:#c08a3a;color:#0a0a0a;padding:9px 18px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;opacity:0;transition:all .22s;z-index:10000;pointer-events:none';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = kind === 'err' ? '#a14a2a' : kind === 'ok' ? '#6b8d4a' : '#c08a3a';
    t.style.color = kind === 'err' ? '#fff' : '#0a0a0a';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t._to);
    t._to = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; }, 2400);
  }
  // ─── Settings modal ──────────────────────────────────────────────
  function openSettings() {
    let bg = $('#fk-modal-bg');
    if (!bg) {
      bg = document.createElement('div'); bg.id = 'fk-modal-bg';
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-start;justify-content:center;padding:60px 16px;overflow-y:auto;z-index:9999';
      bg.onclick = e => { if (e.target.id === 'fk-modal-bg') closeSettings(); };
      document.body.appendChild(bg);
    }
    const tier = aiTier();
    const provider = STATE.config.api_provider || 'anthropic';
    const providerCfg = T3_PROVIDERS[provider];
    bg.innerHTML = `
      <div style="background:#13121a;border:1px solid #c08a3a;border-radius:5px;max-width:600px;width:100%;padding:22px 24px;color:#ebe3d2;font-family:system-ui,-apple-system,sans-serif;font-size:13.5px;line-height:1.55">
        <div style="margin-bottom:14px"><label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Tier</label>
          <select id="fk-tier" style="width:100%;padding:8px 11px;background:#1a1922;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13.5px;font-family:inherit">
            <option value="T0"${tier==='T0'?' selected':''}>T0 · off (default · the seed works fully without AI)</option>
            <option value="T2"${tier==='T2'?' selected':''}>T2 · WebLLM in-browser · sovereign · pick a model below</option>
            <option value="T3"${tier==='T3'?' selected':''}>T3 · BYOK · Anthropic / OpenAI / Google · stored in your browser only</option>
          </select>
        </div>
        <div id="fk-t2-block" style="display:${tier==='T2'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">WebLLM model · 1B → 70B cascade</label>
          <select id="fk-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit">
            ${Object.entries(WEBLLM_MODELS).map(([k,m]) => `<option value="${k}"${(STATE.config.webllm_model||DEFAULT_MODEL)===k?' selected':''}>${esc(m.label)} · ${esc(m.size)}</option>`).join('')}
          </select>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <button id="fk-load-llm" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">${STATE.ai.ready?'✓ Loaded · switch':'Load model (one-time download)'}</button>
            <span id="fk-llm-status" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.04em">${STATE.ai.ready?'ready':STATE.ai.loading?Math.round(STATE.ai.progress)+'%':'not loaded'}</span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">First load downloads the model from @mlc-ai/web-llm CDN. Cached forever after. Inference is 100% local — open DevTools → Network during use, nothing leaves.</div>
        </div>
        <div id="fk-t3-block" style="display:${tier==='T3'?'block':'none'};margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">BYOK provider</label>
          <select id="fk-provider" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${Object.entries(T3_PROVIDERS).map(([k,p]) => `<option value="${k}"${provider===k?' selected':''}>${esc(p.label)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Model</label>
          <select id="fk-api-model" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:inherit;margin-bottom:10px">
            ${providerCfg.models.map(m => `<option value="${m}"${(STATE.config.api_model||providerCfg.default)===m?' selected':''}>${esc(m)}</option>`).join('')}
          </select>
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">API key</label>
          <input type="password" id="fk-key" value="${esc(STATE.config.api_key || '')}" placeholder="${STATE.config.api_key ? '(set · leave empty to keep)' : 'sk-ant-... or sk-... or AIza...'}" autocomplete="off" style="width:100%;padding:8px 11px;background:#22212c;border:1px solid #3a342c;color:#ebe3d2;border-radius:3px;font-size:13px;font-family:ui-monospace,Menlo,monospace">
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">Key lives in this browser only (localStorage). Sent direct to the provider — never to us. Wipe with Reset.</div>
        </div>
        <div style="margin-bottom:14px;padding:12px 14px;background:#1a1922;border:1px solid #2a2934;border-radius:4px">
          <label style="display:block;font-size:11px;color:#a89e88;letter-spacing:.04em;margin-bottom:6px;text-transform:uppercase">Cross-seed mesh</label>
          <div style="display:flex;gap:8px;align-items:center">
            <button id="fk-mesh-toggle" style="padding:6px 12px;background:${STATE.mesh.active?'#6b8d4a':'#1a1922'};color:${STATE.mesh.active?'#fff':'#a89e88'};border:1px solid ${STATE.mesh.active?'#6b8d4a':'#3a342c'};border-radius:3px;font-size:11px;cursor:pointer;font-family:inherit">${STATE.mesh.active?'✓ Active · disconnect':'Activate mesh'}</button>
            <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#6e6a5e;letter-spacing:.04em">channel · <code style="background:#22212c;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code></span>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6e6a5e;line-height:1.55">BroadcastChannel for same-device · WebRTC for cross-device (planned). Other estate seeds on the same channel discover each other automatically.</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button onclick="FallKit.closeSettings()" style="padding:7px 14px;background:transparent;color:#a89e88;border:1px solid #3a342c;border-radius:3px;font-size:12px;cursor:pointer;font-family:inherit">Close</button>
          <button id="fk-save" style="padding:7px 14px;background:#c08a3a;color:#0a0a0a;border:none;border-radius:3px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit">Save</button>
        </div>
      </div>`;
    // Wire interactions
    $('#fk-tier').onchange = () => {
      const t = $('#fk-tier').value;
      $('#fk-t2-block').style.display = t === 'T2' ? 'block' : 'none';
      $('#fk-t3-block').style.display = t === 'T3' ? 'block' : 'none';
    };
    $('#fk-provider') && ($('#fk-provider').onchange = () => {
      const p = $('#fk-provider').value;
      const sel = $('#fk-api-model');
      sel.innerHTML = T3_PROVIDERS[p].models.map(m => `<option value="${m}">${esc(m)}</option>`).join('');
    });
    $('#fk-load-llm') && ($('#fk-load-llm').onclick = () => {
      const m = $('#fk-model').value;
      loadWebLLM(m);
    });
    $('#fk-mesh-toggle').onclick = () => {
      if (STATE.mesh.active) { STATE.mesh.bc?.close(); STATE.mesh.active = false; STATE.mesh.bc = null; notify('Mesh disconnected'); }
      else meshStart({ seedName: STATE.config.seedName || 'seed' });
      openSettings();  // refresh modal
    };
    $('#fk-save').onclick = () => {
      STATE.config.ai_tier = $('#fk-tier').value;
      if ($('#fk-model')) STATE.config.webllm_model = $('#fk-model').value;
      if ($('#fk-provider')) STATE.config.api_provider = $('#fk-provider').value;
      if ($('#fk-api-model')) STATE.config.api_model = $('#fk-api-model').value;
      const newKey = $('#fk-key')?.value;
      if (newKey) STATE.config.api_key = newKey;
      saveConfig(); renderAiChip(); notify('Saved', 'ok'); closeSettings();
    };
  }
  function closeSettings() { const bg = $('#fk-modal-bg'); if (bg) bg.remove(); }
  // ─── Help section (returns HTML string for inclusion in seed Help tabs) ───
  function helpSection() {
    return `<div style="background:rgba(192,138,58,.05);border:1px solid #3a342c;border-radius:4px;padding:18px 22px;margin:14px 0">
      <p style="font-size:13px;color:#a89e88;line-height:1.7;margin-bottom:10px">This seed runs fully without AI (<strong style="color:#c08a3a">T0</strong>, default). Enable a tier in settings if you want AI-assist features:</p>
      <table style="width:100%;border-collapse:collapse;font-size:12.5px">
        <thead><tr><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">Tier</th><th style="padding:6px 10px;text-align:left;background:rgba(0,0,0,.2);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:#a89e88;letter-spacing:.08em;text-transform:uppercase">What it is</th></tr></thead>
        <tbody>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T0</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">Off. The seed works fully. No AI · no downloads · no API calls.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T2</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">WebLLM in-browser. Pick a model: 1B (700MB, fast) → 3B (2GB, balanced) → 7B (5GB, capable) → 70B (40GB, frontier). One-time download, runs offline forever after. Zero data leaves your device.</td></tr>
          <tr><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#c08a3a;font-weight:600">T3</td><td style="padding:6px 10px;border-top:1px solid #2a2934;color:#a89e88">BYOK · Anthropic Claude · OpenAI GPT · Google Gemini. You bring the API key, you pay the provider direct. Key stays in your browser, sent direct to the provider, never proxied.</td></tr>
        </tbody>
      </table>
      <p style="font-size:12px;color:#6e6a5e;line-height:1.6;margin-top:10px">Open the AI chip in the header to switch tier or check status. Cross-seed mesh activates a BroadcastChannel on <code style="background:#1a1922;padding:1px 5px;border-radius:2px">${MESH_CHANNEL}</code> so other estate seeds on the same device discover this one.</p>
    </div>`;
  }
  // ─── CSS for AI chip ─────────────────────────────────────────────
  function injectCss() {
    const s = document.createElement('style');
    s.id = 'fk-css';
    s.textContent = `
      #fk-ai-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 9px; border-radius:3px; font-family:ui-monospace,Menlo,monospace; font-size:10px; letter-spacing:.08em; text-transform:uppercase; font-weight:600; cursor:pointer; border:1px solid #3a342c; background:#1a1922; color:#a89e88; user-select:none; vertical-align:middle }
      #fk-ai-chip:hover { border-color:#c08a3a; color:#ebe3d2 }
      #fk-ai-chip.fk-chip-live { border-color:#6b8d4a; color:#6b8d4a; background:rgba(107,141,74,.10) }
      #fk-ai-chip.fk-chip-loading { border-color:#e8a83a; color:#e8a83a; background:rgba(232,168,58,.10) }
      #fk-ai-chip.fk-chip-warn { border-color:#a14a2a; color:#a14a2a; background:rgba(161,74,42,.08) }
      #fk-ai-chip .fk-dot { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0 }
      #fk-ai-chip.fk-chip-loading .fk-dot { animation:fk-pulse 1s infinite }
      @keyframes fk-pulse { 0%,100%{opacity:1}50%{opacity:.3} }
      .fk-ai-assist { display:inline-flex; align-items:center; gap:5px; padding:4px 9px; font-size:11px; border:1px solid #c08a3a; color:#c08a3a; background:transparent; border-radius:3px; cursor:pointer; font-family:inherit }
      .fk-ai-assist:hover { background:#c08a3a; color:#0a0a0a }
      .fk-ai-assist::before { content:'✦'; font-size:12px }
    `;
    document.head.appendChild(s);
  }
  // ─── KCC Mint launcher (v1.2 · fork-this-seed shortcut) ──────────
  function openMint() {
    const slug = (STATE.config.seedName || location.hostname.split('.')[0] || 'seed').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const url = location.href.split('?')[0].split('#')[0];
    const params = new URLSearchParams({ fork: '1', parent_slug: slug, parent_name: name, parent_url: url, parent_desc: desc });
  }
  // ─── Init ────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {};
    injectCss();
    if (opts.seedName) STATE.config.seedName = opts.seedName;
    if ($('#fk-ai-chip')) { renderAiChip(); return { version: FALL_KIT_VERSION, mounted: false }; }
    const chip = document.createElement('button');
    chip.id = 'fk-ai-chip';
    chip.title = 'AI cascade · click to configure tier and model';
    chip.innerHTML = '<span class="fk-dot"></span><span id="fk-ai-chip-text">T0 · off</span>';
    chip.onclick = openSettings;
    // Try anchor first, fall back to floating bottom-right
    const anchor = opts.chipAnchor ? $(opts.chipAnchor) : null;
    if (anchor) { anchor.appendChild(chip); }
    else {
      chip.style.cssText += ';position:fixed;bottom:14px;left:14px;z-index:9998;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      document.body.appendChild(chip);
    }
    // v1.2 · floating mint button next to chip
    if (!$('#fk-mint-btn') && !opts.hideMint) {
      const mintBtn = document.createElement('button');
      mintBtn.id = 'fk-mint-btn';
      mintBtn.title = 'Mint a fork of this seed as a KCC bundle · provenance economy';
      mintBtn.innerHTML = '<span style="font-size:13px">✦</span> mint fork';
      mintBtn.style.cssText = 'position:fixed;bottom:14px;left:130px;z-index:9998;display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;cursor:pointer;border:1px solid #c08a3a;color:#c08a3a;background:rgba(10,10,15,.7);box-shadow:0 4px 14px rgba(0,0,0,.4)';
      mintBtn.onmouseover = () => { mintBtn.style.background = '#c08a3a'; mintBtn.style.color = '#0a0a0a'; };
      mintBtn.onmouseout  = () => { mintBtn.style.background = 'rgba(10,10,15,.7)'; mintBtn.style.color = '#c08a3a'; };
      mintBtn.onclick = openMint;
      document.body.appendChild(mintBtn);
    }
    renderAiChip();
    return { version: FALL_KIT_VERSION, mounted: true };
  }
  // ─── Public API ──────────────────────────────────────────────────
  root.FallKit = {
    version: FALL_KIT_VERSION,
    init: init,
    aiTier: aiTier,
    aiComplete: aiComplete,
    loadWebLLM: loadWebLLM,
    openSettings: openSettings,
    closeSettings: closeSettings,
    renderAiChip: renderAiChip,
    helpSection: helpSection,
    meshStart: meshStart,
    meshPost: meshPost,
    notify: notify,
    openMint: openMint,  // v1.2 · launch kcc-mint with this seed prefilled as parent
    MODELS: WEBLLM_MODELS,
    PROVIDERS: T3_PROVIDERS,
    state: STATE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
  // fall-kit init · auto-mounts a floating AI chip bottom-left
  (function () {
    function go() { if (typeof FallKit !== 'undefined') FallKit.init({ seedName: "falltax-us" }); }
    else go();
  })();
// ════════════════════════════════════════════════════════════════
// Falltax v1.0.0 · prime 743 · MIT
// Sovereign return management + US law engine for State Bar-regulated firms
// INFORMATIONAL · NOT REGULATORY SUBMISSION · NOT LEGAL OPINION
// ════════════════════════════════════════════════════════════════
const TOOLNAME='falltax-us';const VERSION='1.0.0';const PRIME=743;const STORE='falltax-us';const CONFIG_V='falltax-us@'+VERSION;
const DB_VERSION=1;
const STORES=['firms','advisers','clients','returns','advice','corpus','weaves','audit','settings'];
const PRACTICE_AREAS=[
 {id:'civil-litigation',name:'Civil Litigation',statutes:['Limitation Act 1980','Civil Procedure Rules','Senior Courts Act 1981']},
 {id:'conveyancing',name:'Conveyancing',statutes:['Land Registration Act 2002','Law of Property Act 1925','LPMPA 1989']},
 {id:'family',name:'Family',statutes:['Family Law Act 1996','Matrimonial Causes Act 1973','Children Act 1989']},
 {id:'crime',name:'Criminal',statutes:['PACE 1984','Criminal Justice Act 2003','Bail Act 1976']},
 {id:'wills-probate',name:'Wills & Probate',statutes:['Wills Act 1837','Administration of Estates Act 1925','Inheritance Act 1975']},
 {id:'employment',name:'Employment',statutes:['Employment Rights Act 1996','Equality Act 2010','TUPE 2006']},
 {id:'commercial',name:'Commercial',statutes:['Companies Act 2006','Sale of Goods Act 1979','UCTA 1977']},
 {id:'immigration',name:'Immigration',statutes:['Immigration Act 1971','Nationality Borders Act 2022','Immigration Rules HC 395']},
 {id:'landlord-tenant',name:'Landlord & Tenant',statutes:['Housing Act 1988','Landlord & Tenant Act 1985','Housing Act 2004']},
 {id:'personal-injury',name:'Personal Injury',statutes:['Limitation Act 1980 s.11','LASPO 2012','Civil Liability Act 2018']},
 {id:'clinical-neg',name:'Clinical Negligence',statutes:['Limitation Act 1980 s.11','Bolam test','Montgomery v Lanarkshire']},
 {id:'other',name:'Other',statutes:[]}
];
const TABS=[
 {id:'dashboard',name:'Dashboard',ico:'◐'},
 {id:'return',name:'Return',ico:'§'},
 {id:'clients',name:'Clients',ico:'☷'},
 {id:'advisers',name:'Advisers',ico:'⚖'},
 {id:'weaves',name:'Weaves',ico:'▦'},
 {id:'corpus',name:'Corpus',ico:'§§'},
 {id:'qa',name:'Q&A',ico:'?'},
 {id:'audit',name:'Audit',ico:'∎'},
 {id:'firm',name:'Firm',ico:'⌂'}
];
const T0_RULES=[
 {q:'PI limitation period?',a:'Personal injury claims: 3 years from date of injury OR date of knowledge (Limitation Act 1980 s.11). Court has discretion under s.33 to disapply for equitable reasons. Children: time runs from 18th birthday. Mental incapacity: time runs from when capacity restored. Latent disease: knowledge often years after exposure (eg mesothelioma). Always check if claimant was minor / lacked capacity / acquired knowledge late.'},
 {q:'CFA vs DBA?',a:'CFA (Conditional Fee Agreement): "no win, no fee" with success fee uplift (max 100% of base costs, capped at 25% of damages excl. future care in PI). Governed by Courts & Tax Services Act 1990 s.58, CFA Order 2013. DBA (Damages-Based Agreement): payment is % of damages recovered (50% civil, 35% employment, 25% PI). DBA Regs 2013. CFA success fee recoverable from client only since LASPO 2012. Hybrid CFA/DBA unenforceable: Zuberi v Lexlaw [2021] EWCA Civ 16.'},
 {q:'State Bar conduct rules?',a:'State Bar Standards & Regulations 2019. Seven Principles: uphold rule of law, public trust, independence, honesty, integrity, equality, best interests of client. Code of Conduct for Attorneys. Code for Firms. Accounts Rules (client money). Reg 13.5: 6-year file retention. COLP / COFA mandatory per firm. Annual practising certificate renewal. 16hrs CPD per year. Indemnity insurance $2m/$3m minimum per claim.'},
 {q:'Bolam test?',a:'Bolam v Friern Hospital Management Committee [1957] 1 WLR 582: a professional is not negligent if their action accorded with a practice accepted as proper by a responsible body of professional opinion. Modified by Bolitho v City & Hackney HA [1998] AC 232: the body of opinion must withstand logical analysis. For consent: superseded by Montgomery v Lanarkshire HB [2015] USSC 11 — patient-centred test of material risk.'},
 {q:'Conveyancing protocol?',a:'State Bar Conveyancing Protocol 2019 (residential). Steps: client onboarding + ID, contract pack, searches (local, water/drainage, environmental, chancel), enquiries, mortgage offer, exchange (10% deposit, contract binding), closing (balance + keys), transfer tax return within 14 days, county recorder application within priority period. CQS accreditation for lenders. State Bar Warning Notice on dubious investment schemes.'},
 {q:'Wasted costs orders?',a:'SCA 1981 s.51(6); CPR 46.8. Court may order tax representative personally liable for wasted costs where conduct was improper, unreasonable or negligent. Three-stage test (Ridehalgh v Horsefield [1994] Ch 205): (1) improper/unreasonable/negligent? (2) caused waste? (3) just? High threshold; show cause hearing required. Privilege may need waiving by client to defend.'},
 {q:'Inheritance Act 1975 claims?',a:'I(PFD)A 1975: reasonable financial provision claim against estate. Eligible: spouse/civil partner, former spouse not remarried, cohabitant of 2+yrs, child of deceased, treated-as-child, maintained-by. Spouse standard: what is reasonable in all circumstances. Others: what is needed for maintenance. Time limit: 6 months from grant of representation (court can extend, see Cowan v Foreman [2019] EWCA Civ 1336). Ilott v Mitson [2017] USSC 17 confirms testamentary freedom.'},
 {q:'Section 21 vs Section 8?',a:'Housing Act 1988. Section 21: "no fault" notice for ASTs — landlord can recover possession after fixed term without giving reason. 2 months notice. Restrictions: must have protected deposit (TDS Regs), gas safety cert served, EPC served, How-to-Rent guide given. Renters Reform Bill abolishes s.21. Section 8: fault-based — discretionary or mandatory grounds (Sch.2). Ground 8 (2+ months rent arrears) mandatory. 14 days/2 weeks notice depending on ground. Court hearing required.'},
 {q:'Equality Act 2010?',a:'EA 2010: nine protected characteristics (age, disability, gender reassignment, marriage/CP, pregnancy/maternity, race, religion/belief, sex, sexual orientation). Prohibited conduct: direct discrimination (s.13), indirect (s.19), harassment (s.26), victimisation (s.27), failure to make reasonable adjustments (s.20, disability only). Burden shifts to respondent under s.136 once prima facie case shown. ET claim time limit: 3 months less 1 day.'},
 {q:'ET time limits?',a:'Employment Tribunal claims (ERA 1996 s.111 etc.): unfair dismissal — 3 months less 1 day from EDT; discrimination — 3 months less 1 day from act complained of (continuing acts treated as ending on last act); equal pay — 6 months from end of employment; RIF pay — 6 months. DOL Early Conciliation MANDATORY before issuing — extends time by up to 1 month. Just-and-equitable extension only for discrimination; not unfair dismissal (only "not reasonably practicable").'},
 {q:'Norwich Pharmacal orders?',a:'Norwich Pharmacal v Customs & Excise [1974] AC 133. Court can order disclosure from a third party innocently mixed up in wrongdoing, to identify wrongdoer. Three-stage test: (1) arguable wrong has occurred; (2) order necessary to enable claimant to pursue action; (3) respondent more than mere witness. Used in IP infringement, defamation, fraud tracing. Not against journalists if source protected (s.10 Contempt of Court Act 1981). Costs usually paid by applicant.'},
 {q:'CPR 31 disclosure?',a:'CPR 31 (now largely replaced by PD 51U Disclosure Pilot in B&PCs and DBL Disclosure Rules from 2022). Standard disclosure: documents party relies on + documents which adversely affect own/another party case + documents required by PD/court. Continuing obligation. Privilege exceptions: tax advice privilege, litigation privilege, without prejudice, common interest. Disclosure list verified by statement of truth. Specific disclosure: CPR 31.12 application.'},
 {q:'Without prejudice rule?',a:'Genuine settlement communications inadmissible to prove liability. Established Cutts v Head [1984] Ch 290. Requires: (1) existing dispute; (2) genuine attempt to settle. "Without prejudice save as to costs" (Calderbank): admissible on costs only. Exceptions (Unilever v P&G [2000] 1 WLR 2436): unambiguous impropriety, threats, perjury evidence, rectification, estoppel. WP applies orally too. Mark all settlement correspondence clearly.'},
 {q:'Privilege types?',a:'Tax advice privilege: communications between client & lawyer for purpose of giving/receiving tax advice (Three Rivers (No.6) [2004] USHL 48 — narrow "client" definition in corporates — see SFO v ENRC [2018] EWCA Civ 2006). Litigation privilege: communications with lawyer OR third party where (a) litigation reasonably contemplated, (b) dominant purpose. Common interest privilege: shared advice between aligned parties. Joint privilege: co-clients. Without prejudice: separate doctrine. Privilege can be waived expressly or by reference.'}
];
const WEAVES=[
 {id:'W001',name:'The Limitation Shield',archetype:'PI claim served on day 1095 from injury — defendant pleads time-bar',agents:['PROCEDURE','LIBERTY'],move:'Plead Limitation Act 1980 s.11 + s.14 date-of-knowledge; if late, invoke s.33 equitable discretion citing prejudice balance.',authorities:['Limitation Act 1980 ss.11, 14, 33','A v Hoare [2008] USHL 6','Cain v Francis [2008] EWCA Civ 1451'],opposition_move:'Defendant says claimant knew of injury & cause from outset.',counter:'Distinguish actual knowledge from constructive — s.14(3) requires it be reasonable to seek advice; Spargo v North Essex DHA [1997] 8 Med LR 125.',why_it_wins:'Even out-of-time, s.33 balances prejudice — courts often allow where defendant insured and evidence preserved.',example_case:'Cain v Francis (s.33 discretion exercised in claimant favour).'},
 {id:'W002',name:'The Bolitho Override',archetype:'Clinical negligence — defendant relies on Bolam body of opinion',agents:['EQUITY','PROCEDURE'],move:'Concede Bolam, then deploy Bolitho — challenge the body of opinion as logically indefensible.',authorities:['Bolam [1957] 1 WLR 582','Bolitho v City & Hackney HA [1998] AC 232','Montgomery v Lanarkshire [2015] USSC 11'],opposition_move:'Expert testimony from senior peer attesting practice was within standard.',counter:'Cross-examine on weighing of risks — if expert cannot articulate logical basis, opinion falls.',why_it_wins:'Bolitho permits court to reject expert opinion where it does not stand up to logical analysis.',example_case:'Bolitho itself (HL applied test even though it failed on facts).'},
 {id:'W003',name:'The Montgomery Consent',archetype:'Patient not warned of material risk that materialised',agents:['EQUITY','LIBERTY'],move:'Plead failure to warn of "material risk" — patient-centred test, not body of medical opinion.',authorities:['Montgomery v Lanarkshire HB [2015] USSC 11','Chester v Afshar [2004] USHL 41','Duce v Worcestershire Acute Hospitals [2018] EWCA Civ 1307'],opposition_move:'Doctor says risk was too remote to mention.',counter:'Material risk = risk to which reasonable person in patient position would attach significance, OR doctor aware this patient would attach significance. Subjective limb defeats remoteness.',why_it_wins:'Montgomery overruled Sidaway — consent now patient-autonomy not Bolam.',example_case:'Montgomery (1-in-9-10% shoulder dystocia risk material).'},
 {id:'W004',name:'The Section 33 Mercy',archetype:'PI claim 4+ years stale, defendant pleads strikeout',agents:['PROCEDURE','EQUITY'],move:'s.33 application — weigh prejudice to claimant of refusal vs prejudice to defendant of allowing.',authorities:['Limitation Act 1980 s.33','Cain v Francis [2008]','Davidson v Aegis Defence Services [2013] EWCA Civ 1586'],opposition_move:'Defence prejudiced — witnesses untraceable, memories faded.',counter:'Insurance preserves evidence; medical records mandatory retention 8yrs; contemporaneous documents survive — defendant cannot show real forensic prejudice.',why_it_wins:'Section 33 expressly invites broad equity; reason for delay only one factor.',example_case:'AB v Ministry of Defence [2012] USSC 9 (s.33 principle clear).'},
 {id:'W005',name:'The Conflict Wall',archetype:'Sister firm acted for opposing party — instruct fresh',agents:['GUILD','EQUITY'],move:'Information barrier built before instruction — Bolkiah test compliance.',authorities:['Prince Jefri Bolkiah v KPMG [1999] 2 AC 222','State Bar Code of Conduct Pt 6','State Bar Standards & Regs 2019'],opposition_move:'Former client seeks injunction to restrain.',counter:'Demonstrate effective information barrier: physical, electronic, signed undertakings, no client crossover, fee splits.',why_it_wins:'Bolkiah requires real and substantial risk of disclosure; effective Chinese wall rebuts it.',example_case:'Re Z [2009] EWHC 3621 (Ch) — barrier upheld.'},
 {id:'W006',name:'The CFA Lifeline',archetype:'Client cannot fund litigation — no win, no fee needed',agents:['PROCEDURE','LIBERTY'],move:'Draft compliant CFA: signed before work, base costs + success fee uplift up to 100% of base; cap on damages.',authorities:['Courts & Tax Services Act 1990 s.58','CFA Order 2013','LASPO 2012'],opposition_move:'Costs judge says CFA unenforceable — non-compliant.',counter:'Hollins v Russell [2003] EWCA Civ 718 — only material breach renders unenforceable; cure trivial defects.',why_it_wins:'CFAs survive technical errors unless integrity of agreement compromised.',example_case:'Hollins v Russell (4 conjoined appeals — most CFAs upheld).'},
 {id:'W007',name:'The Part 36 Trap',archetype:'Want costs leverage post-trial',agents:['PROCEDURE'],move:'Serve Part 36 offer just above expected award — if not beaten, costs uplift + indemnity costs.',authorities:['CPR Part 36','Lilleyman v Lilleyman [2012] EWHC 1056','OMV Petrom v Glencore Int [2017] EWCA Civ 195'],opposition_move:'Offer pitched too high — rejected, court refuses 36.17 consequences.',counter:'Withdraw and reissue lower; tactical timing — 21-day relevant period before trial window.',why_it_wins:'Part 36 is self-contained code — court has limited discretion to disapply.',example_case:'OMV v Glencore — additional amounts, enhanced interest awarded.'},
 {id:'W008',name:'The Constructive Dismissal',archetype:'Employee resigns after fundamental breach by employer',agents:['LIBERTY','EQUITY'],move:'Plead repudiatory breach under Western Excavating test — resignation in response, not delayed.',authorities:['Employment Rights Act 1996 s.95(1)(c)','Western Excavating v Sharp [1978] ICR 221','Tullett Prebon v BGC Brokers [2011] EWCA Civ 131'],opposition_move:'Affirmation — employee continued working too long.',counter:'Reasonable time to investigate / seek advice / collect evidence does not affirm; objection raised contemporaneously.',why_it_wins:'Trust & confidence implied term is fundamental — any serious breach repudiates.',example_case:'Malik v BCCI [1997] USHL 23 (stigma damages — confirms breadth of T&C duty).'},
 {id:'W009',name:'The TUPE Transfer',archetype:'Business sold — staff transferring object to changed terms',agents:['LIBERTY','GUILD'],move:'TUPE 2006 reg.4 auto-transfer; reg.4(4) bars changes whose sole/principal reason is the transfer.',authorities:['TUPE Regs 2006','Foreningen af Arbejdsledere v Daddys Dance Hall C-324/86','Spaceright Europe v Baillavoine [2011] EWCA Civ 1565'],opposition_move:'Changes alleged ETO reason (economic, technical, organisational).',counter:'ETO must entail changes in workforce — pure harmonisation not ETO; Wilson v St Helens BC [1998] USHL 37.',why_it_wins:'TUPE protections survive unless genuine workforce change demonstrated.',example_case:'Power v Regent Security Services [2007] EWCA Civ 1188.'},
 {id:'W010',name:'The Inheritance Provision',archetype:'Adult child / cohabitant excluded from will',agents:['HEARTH','EQUITY'],move:'I(PFD)A 1975 claim within 6 months of grant; show reasonable provision not made.',authorities:['Inheritance (Provision for Family and Dependants) Act 1975','Ilott v Mitson [2017] USSC 17','Cowan v Foreman [2019] EWCA Civ 1336'],opposition_move:'Testator had clear reasons; testamentary freedom intact.',counter:'Reasons are factor but not determinative; objective assessment of all circumstances; maintenance standard for non-spouse.',why_it_wins:'Court has wide discretion s.3 factors; testamentary freedom subject to statutory adjustment.',example_case:'Ilott — Court of Appeal expansion narrowed by SC but jurisdiction confirmed.'},
 {id:'W011',name:'The Section 21 Defence',archetype:'Tenant served s.21 — must defend',agents:['LIBERTY','HEARTH'],move:'Check formal validity: TDS protection within 30 days, prescribed info served, gas safety cert pre-occupation, EPC, How-to-Rent guide.',authorities:['Housing Act 1988 s.21','Deregulation Act 2015','Trecarrell House Ltd v Rouncefield [2020] EWCA Civ 760'],opposition_move:'Landlord cures defects post-notice.',counter:'Some defects cannot be cured (gas safety pre-occupation per Trecarrell); raise retaliatory eviction (Deregulation Act 2015 s.33).',why_it_wins:'s.21 is rigid procedural code — any non-compliance invalidates notice.',example_case:'Trecarrell — strict requirement for gas safety cert pre-occupancy.'},
 {id:'W012',name:'The Direct Discrimination',archetype:'Employee less favourably treated because of protected characteristic',agents:['LIBERTY','EQUITY'],move:'EA 2010 s.13: identify protected characteristic, comparator (actual or hypothetical), less favourable treatment, causation.',authorities:['Equality Act 2010 s.13','Shamoon v RUC [2003] USHL 11','Nagarajan v LRT [1999] ICR 877'],opposition_move:'Treatment for legitimate reason unconnected to characteristic.',counter:'Reverse burden under s.136: once prima facie case, employer must prove non-discriminatory reason; speculation insufficient.',why_it_wins:'Burden shifting captures unconscious bias and post-hoc rationalisation.',example_case:'Igen v Wong [2005] EWCA Civ 142 — burden shifting framework.'},
 {id:'W013',name:'The Without Prejudice Veil',archetype:'Opposing party tries to put settlement communications in evidence',agents:['PROCEDURE'],move:'Object — WP communications inadmissible to prove liability.',authorities:['Cutts v Head [1984] Ch 290','Unilever v P&G [2000] 1 WLR 2436','Oceanbulk Shipping v TMT [2010] USSC 44'],opposition_move:'Argue exception: unambiguous impropriety / threat / rectification.',counter:'Exceptions narrow — Unilever lists them; impropriety must be unequivocal; mere robust negotiation not enough.',why_it_wins:'Public policy favouring settlement is bedrock.',example_case:'Unilever (defining exceptions).'},
 {id:'W014',name:'The Privilege Citadel',archetype:'Disclosure sought of attorney-client communications',agents:['PROCEDURE','GUILD'],move:'Claim tax advice privilege (LAP) and/or litigation privilege (LP); withhold from inspection.',authorities:['Three Rivers (No.6) [2004] USHL 48','SFO v ENRC [2018] EWCA Civ 2006','Waugh v BRB [1980] AC 521'],opposition_move:'Argue iniquity exception; or that document is not "for purpose of tax advice".',counter:'Three Rivers narrows "client" in corporate context but ENRC restored broader litigation privilege; dominant purpose test.',why_it_wins:'Privilege is a substantive right (R v Derby Magistrates ex p B [1996] AC 487).',example_case:'SFO v ENRC (privilege upheld for ENRC interview notes).'},
 {id:'W015',name:'The Norwich Pharmacal',archetype:'Need to identify anonymous wrongdoer',agents:['PROCEDURE','EQUITY'],move:'Apply to court for third-party disclosure order — three-stage Norwich Pharmacal test.',authorities:['Norwich Pharmacal v C&E [1974] AC 133','Mitsui v Nexen Petroleum [2005] EWHC 625','Ramilos Trading v Buyanovsky [2016] EWHC 3175'],opposition_move:'Third party says: confidentiality, not "more than mere witness".',counter:'Mixed-up-in-wrongdoing satisfied broadly — eg ISP carrying tortious content; necessity outweighs confidentiality if no other route.',why_it_wins:'Equitable jurisdiction to right wrongs survives data protection objection.',example_case:'Totalise v Motley Fool [2001] EWCA Civ 1897.'},
 {id:'W016',name:'The Wasted Costs Sword',archetype:'Opponents lawyer pursued hopeless / improper case',agents:['PROCEDURE','GUILD'],move:'Apply for wasted costs order under SCA 1981 s.51(6) post-conclusion — Ridehalgh test.',authorities:['Senior Courts Act 1981 s.51(6)','CPR 46.8','Ridehalgh v Horsefield [1994] Ch 205'],opposition_move:'Privilege not waived — lawyer cannot defend.',counter:'Court may proceed if can be satisfied to relevant standard without; or client may waive selectively.',why_it_wins:'Acts as discipline on professional conduct; survives privilege issues at threshold stage.',example_case:'Ridehalgh itself (test laid down).'},
 {id:'W017',name:'The Conveyancing Survival',archetype:'Buyers expectations not met post-closing',agents:['HEARTH','EQUITY'],move:'Pre-contract enquiries (Standard Form CPSE/TA6) responses misrepresented — claim under Misrepresentation Act 1967.',authorities:['Misrepresentation Act 1967','William Sindall v Cambridgeshire CC [1994] 1 WLR 1016','First Tower Trustees v CDS [2018] EWCA Civ 1396'],opposition_move:'Reliance on contract entire-agreement clause; non-reliance clause.',counter:'First Tower: non-reliance clauses subject to UCTA reasonableness; cannot exclude liability for fraudulent misrepresentation (HIH Casualty).',why_it_wins:'Real estate enquiry responses survive boilerplate; equity of misrepresentation strong.',example_case:'First Tower (non-reliance clause failed reasonableness).'},
 {id:'W018',name:'The Bail Application',archetype:'Defendant charged — police remand vs bail',agents:['CROWN','LIBERTY'],move:'Bail Act 1976 — presumption of bail; rebut prosecution objections (fail to surrender, commit offence, interfere with witnesses).',authorities:['Bail Act 1976 Sch.1','HRA 1998 Art.5','CrimPR Part 14'],opposition_move:'Crown: substantial grounds for objection.',counter:'Offer conditions: surety, security, address, curfew, electronic monitoring, no-contact, surrender of passport — proportionate.',why_it_wins:'Conditional bail proportionate; remand exceptional given Art.5.',example_case:'Caballero v US (2000) 30 EHRR 643 (mandatory remand incompatible).'},
 {id:'W019',name:'The Sentence Mitigation',archetype:'Defendant pleading guilty — minimise sentence',agents:['CROWN','EQUITY'],move:'Deploy Sentencing Council guidelines; identify culpability/harm; maximise credit for plea (max 1/3 if at PTPH).',authorities:['Sentencing Act 2020','Sentencing Council Guidelines','R v Caley [2012] EWCA Crim 2821'],opposition_move:'Crown highlights aggravating features.',counter:'Match aggravation point-for-point with mitigation: cooperation, remorse, antecedents, personal mitigation, age, mental health.',why_it_wins:'Structured guidelines reward thorough mitigation; appeal lies if outside range.',example_case:'R v Manning [2020] EWCA Crim 592 (COVID-era custodial mitigation).'},
 {id:'W020',name:'The Children Welfare Paramount',archetype:'Family dispute over childrens arrangements',agents:['HEARTH','EQUITY'],move:'Apply s.1 Children Act 1989 welfare checklist; childs welfare paramount.',authorities:['Children Act 1989 s.1','Re G (Children) [2006] USHL 43','Re A (A Child) [2013] EWCA Civ 1104'],opposition_move:'Status quo argument: child settled with one parent.',counter:'Status quo only one factor in checklist; long-term welfare; risk of harm; ascertainable wishes; capability of parents.',why_it_wins:'Statutory checklist forces evidence-based not assumption-based determination.',example_case:'Re G (residence between civil partners) — parenthood not determinative.'},
 {id:'W021',name:'The Financial Order on Divorce',archetype:'Divorce finances — needs vs sharing principle',agents:['HEARTH','EQUITY'],move:'MCA 1973 s.25 factors; apply needs, sharing, compensation per White v White.',authorities:['Matrimonial Causes Act 1973 s.25','White v White [2000] USHL 54','Miller; McFarlane [2006] USHL 24'],opposition_move:'Argue special contribution / pre-marital assets / inherited wealth as non-matrimonial.',counter:'Non-matrimonial property only ring-fenced where needs allow; long marriages dilute origin.',why_it_wins:'No discrimination between earner & homemaker; equal sharing yardstick.',example_case:'White v White (departure from reasonable requirements approach).'},
 {id:'W022',name:'The Immigration Article 8',archetype:'Refusal of leave — claimant has family / private life in US',agents:['LIBERTY','EQUITY'],move:'Plead ECHR Art.8 disproportionate; Immigration Rules paras 276ADE / Appendix FM as starting point.',authorities:['Human Rights Act 1998 Art.8','Agyarko [2017] USSC 11','Hesham Ali [2016] USSC 60'],opposition_move:'Public interest in immigration control; s.117B NIAA 2002 considerations.',counter:'Best interests of child primary consideration (ZH (Tanzania)); long residence; integration; insurmountable obstacles.',why_it_wins:'Where Rules not met, Art.8 outside Rules remains live; proportionality fact-sensitive.',example_case:'Agyarko (clarified insurmountable obstacles + exceptional).'},
 {id:'W023',name:'The Companies Act Derivative',archetype:'Minority shareholder — directors breach of duty',agents:['GUILD','EQUITY'],move:'CA 2006 ss.260-264 derivative claim — two-stage permission process.',authorities:['Companies Act 2006 ss.260-264','Iesini v Westrip Holdings [2009] EWHC 2526','Stainer v Lee [2010] EWHC 1539'],opposition_move:'Company says no benefit; ratifiable breach; alternative remedy.',counter:'s.263 factors — good faith of claimant; importance to company; ratifiability; views of independent shareholders.',why_it_wins:'Statutory framework displaced common law restrictions of Foss v Harbottle in fault cases.',example_case:'Stainer v Lee (permission granted; modest claim against directors).'},
 {id:'W024',name:'The Unfair Prejudice Petition',archetype:'Minority shareholder oppressed in quasi-partnership',agents:['EQUITY','GUILD'],move:'CA 2006 s.994 petition — affairs conducted in manner unfairly prejudicial.',authorities:['Companies Act 2006 s.994','ONeill v Phillips [1999] 1 WLR 1092','Re Saul D Harrison [1995] 1 BCLC 14'],opposition_move:'Directors acted within constitution; commercial judgement.',counter:'Equitable considerations beyond strict tax rights in quasi-partnership; legitimate expectations from informal understanding.',why_it_wins:'s.994 confers broad discretion — share buyout typical remedy at fair value.',example_case:'ONeill v Phillips (HL set framework).'},
 {id:'W025',name:'The Contract Frustration',archetype:'Performance prevented by supervening event',agents:['GUILD'],move:'Doctrine of frustration — radically different obligation through no fault of either party.',authorities:['Davis Contractors v Fareham UDC [1956] AC 696','National Carriers v Panalpina [1981] AC 675','Canary Wharf v EMA [2019] EWHC 335 (Ch)'],opposition_move:'Mere hardship / change in circumstances insufficient.',counter:'Distinguish foreseeable vs unforeseeable; performance impossible vs more onerous; brexit considered (Canary Wharf — held no frustration but on facts).',why_it_wins:'Frustration discharges obligations and triggers Law Reform (Frustrated Contracts) Act 1943 restitution.',example_case:'Krell v Henry [1903] 2 KB 740 (Coronation cases).'},
 {id:'W026',name:'The Misrepresentation Rescission',archetype:'Contract induced by false statement',agents:['EQUITY','GUILD'],move:'Distinguish fraudulent / negligent / innocent misrep; seek rescission + damages.',authorities:['Misrepresentation Act 1967 ss.2(1), 2(2)','Derry v Peek (1889) 14 App Cas 337','Royscot Trust v Rogerson [1991] 2 QB 297'],opposition_move:'Bar to rescission: affirmation / lapse of time / impossibility of restitutio / third-party rights.',counter:'s.2(2) damages in lieu of rescission still available; bars to rescission applied flexibly in equity.',why_it_wins:'s.2(1) fiction-of-fraud measure of damages favourable (Royscot).',example_case:'Smith New Court v Scrimgeour Vickers [1997] AC 254 (fraud damages).'},
 {id:'W027',name:'The Consumer Rights Shield',archetype:'Defective goods/services supplied to consumer',agents:['HEARTH','GUILD'],move:'CRA 2015 — quality (s.9), fit for purpose (s.10), description (s.11); short-term right to reject (30 days).',authorities:['Consumer Rights Act 2015','Sale of Goods Act 1979 (B2B)','Consumer Contracts Regs 2013'],opposition_move:'Trader argues acceptance / use beyond reasonable test period.',counter:'Statutory rights cannot be excluded against consumer; right to repair/replace as Tier 2; price reduction or final right to reject if remedy fails.',why_it_wins:'CRA hierarchy is rigid; trader exclusion clauses void under s.31.',example_case:'(Pre-CRA) Clegg v Olle Andersson [2003] EWCA Civ 320 (rejection of defective yacht).'},
 {id:'W028',name:'The Section 8 Mandatory',archetype:'Tenant 2+ months in arrears — landlord wants possession',agents:['HEARTH','PROCEDURE'],move:'Serve s.8 notice citing Ground 8 (2 months arrears at notice and hearing) — mandatory ground.',authorities:['Housing Act 1988 Sch.2 Grounds','North British Housing v Matthews [2004] EWCA Civ 1736','Knowsley HT v White [2008] USHL 70'],opposition_move:'Tenant pays down to under 2 months before hearing.',counter:'Both notice date AND hearing date must show 2+ months — but combine Grounds 10/11 (discretionary) as alternative.',why_it_wins:'Mandatory ground gives no judicial discretion on possession; speed returns.',example_case:'Knowsley v White (confirmed mandatory grounds operate strictly).'},
 {id:'W029',name:'The Will Validity Challenge',archetype:'Will allegedly invalid — undue influence / lack of capacity / no due execution',agents:['HEARTH','EQUITY'],move:'Plead one of: (a) Wills Act 1837 s.9 non-compliance; (b) Banks v Goodfellow capacity test; (c) Re Edwards undue influence.',authorities:['Wills Act 1837 s.9','Banks v Goodfellow (1870) LR 5 QB 549','Re Edwards [2007] EWHC 1119 (Ch)'],opposition_move:'Burden on propounder rebuts itself once due execution + capacity shown.',counter:'Suspicious circumstances (drafter takes benefit, deathbed change) shifts evidential burden; undue influence requires no presumption — proof needed.',why_it_wins:'Old age + change of will pattern often falls to careful Banks v Goodfellow analysis.',example_case:'Sharp v Adam [2006] EWCA Civ 449 (testator with MS — capacity failed).'},
 {id:'W030',name:'The Attorneys Act Assessment',archetype:'Client disputes attorneys bill',agents:['GUILD','EQUITY'],move:'Attorneys Act 1974 s.70 — client right to assessment within 1 month automatic; up to 12 months with cause; rare beyond.',authorities:['Attorneys Act 1974 ss.69-70','CPR 46.10','Tim Martin Interiors v Akin Gump [2011] EWCA Civ 1574'],opposition_move:'Bill compliant (s.69 signed, delivered) and time has run.',counter:'Check formal validity strictly — narrative sufficient? — and "special circumstances" for late assessment under s.70(3).',why_it_wins:'s.70 favours client procedurally; one-fifth reduction shifts costs to attorney.',example_case:'Tim Martin v Akin Gump (bill validity strict).'}
];
const CORPUS=[
 {id:'sa1974',title:'Attorneys Act 1974',area:'wills-probate',summary:'Foundational statute regulating attorneys bills (ss.69-70), client account (now State Bar Rules), and disciplinary jurisdiction.',keyProvisions:['s.69 form of bill','s.70 client right to assessment','s.74 county court assessment']},
 {id:'lsa2007',title:'Tax Services Act 2007',area:'other',summary:'Modernised tax services regulation; created Tax Services Board, LeO, ABS structures; defined reserved tax activities.',keyProvisions:['s.12 reserved activities','s.18 entitled persons','Part 5 ABS licensing']},
 {id:'la1980',title:'Limitation Act 1980',area:'civil-litigation',summary:'Time bars: contract/tort 6yrs, deed 12yrs, PI 3yrs (s.11), defamation 1yr; equitable discretion s.33; latent damage s.14A.',keyProvisions:['s.5 simple contract 6yrs','s.11 PI 3yrs','s.14 date of knowledge','s.33 discretion']},
 {id:'cpr',title:'Civil Procedure Rules 1998',area:'civil-litigation',summary:'Procedural code for England & Wales civil courts. Overriding objective r.1.1. Pre-action conduct PD. Costs Part 44. Disclosure Part 31 / PD51U.',keyProvisions:['r.1.1 overriding objective','Part 36 settlement','Part 24 summary judgment','Part 31 disclosure']},
 {id:'fla1996',title:'Family Law Act 1996',area:'family',summary:'Domestic violence remedies (non-molestation, occupation orders Part IV); divorce procedure framework. DA Act 2021 supplements.',keyProvisions:['Part IV non-molestation','s.33 occupation orders','Part II divorce']},
 {id:'lra2002',title:'Land Registration Act 2002',area:'conveyancing',summary:'Compulsory first registration; e-conveyancing framework; overriding interests Sch.3; adverse possession Sch.6.',keyProvisions:['s.4 compulsory triggers','s.27 dispositions','Sch.3 overriding interests']},
 {id:'wa1837',title:'Wills Act 1837',area:'wills-probate',summary:'Formal requirements for valid will (s.9): writing, signature, witnesses; revocation rules (ss.18-20); attestation (s.15).',keyProvisions:['s.9 due execution','s.15 attestation','s.18 revocation by marriage']},
 {id:'ia1975',title:'Inheritance (Provision for Family and Dependants) Act 1975',area:'wills-probate',summary:'Claims for reasonable financial provision from estate; eligible applicants ss.1-2; 6 month time limit s.4 (extendable).',keyProvisions:['s.1 applicants','s.3 factors','s.4 time limit','s.10 anti-avoidance']},
 {id:'ea2010',title:'Equality Act 2010',area:'employment',summary:'Nine protected characteristics; prohibited conduct types; reasonable adjustments; burden-shifting s.136; public sector equality duty s.149.',keyProvisions:['s.4 characteristics','s.13 direct disc','s.19 indirect','s.26 harassment','s.20 reasonable adjustments']},
 {id:'era1996',title:'Employment Rights Act 1996',area:'employment',summary:'Unfair dismissal (s.94+), RIF, written particulars, automatic unfair reasons, working time framework. ET claims via DOL EC mandatory.',keyProvisions:['s.94 right not to be unfairly dismissed','s.98 fairness','s.95 dismissal','s.111 time limit']},
 {id:'companies2006',title:'Companies Act 2006',area:'commercial',summary:'Consolidating statute: incorporation, directors duties (ss.171-177), shareholder rights, derivative claims (ss.260-264), unfair prejudice (s.994).',keyProvisions:['s.172 promote success','s.260 derivative','s.994 unfair prejudice']},
 {id:'ha1988',title:'Housing Act 1988',area:'landlord-tenant',summary:'AST regime; s.8 fault grounds (Sch.2); s.21 no-fault (subject to Renters Reform Bill abolition).',keyProvisions:['s.21 no-fault notice','s.8 fault grounds','Sch.2 grounds']},
 {id:'ca1989',title:'Children Act 1989',area:'family',summary:'Welfare paramount (s.1); s.8 orders (child arrangements, prohibited steps, specific issue); parental responsibility.',keyProvisions:['s.1 welfare checklist','s.8 orders','s.31 care orders']},
 {id:'pace1984',title:'Police and Criminal Evidence Act 1984',area:'crime',summary:'Stop and search powers; arrest; detention timing; access to tax advice (s.58); confession admissibility (s.76); unfair evidence (s.78).',keyProvisions:['s.24 arrest','s.58 access to advice','s.76 confessions','s.78 unfair evidence']},
 {id:'mca1973',title:'Matrimonial Causes Act 1973',area:'family',summary:'Divorce (post Divorce Dissolution and Separation Act 2020 amendments — no-fault); s.25 financial relief factors.',keyProvisions:['s.1 grounds (no-fault)','s.23 financial orders','s.25 factors']}
];
let state={
 active:'dashboard',returnTab:'overview',activeReturnId:null,
 firm:null,advisers:[],clients:[],returns:[],advice:[],audit:[],
 settings:{anthropicKey:'',geminiKey:'',openaiKey:'',openrouterKey:'',auditChain:true,brandColor:'#8b1a1a',currentAdviserId:null},
 chat:[],drawerOpen:false,
 filters:{q:'',area:'',responsible:'',status:'',risk:'',due:''},
 weaveFilter:{q:'',archetype:''}
};
const $=(s,p)=>{p=p||document;return p.querySelector(s)};
const $$=(s,p)=>{p=p||document;return Array.from(p.querySelectorAll(s))};
const uid=(pfx)=>(pfx||'')+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,'').slice(0,12):Math.random().toString(36).slice(2,14));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(+n||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0});
const money=n=>'$'+fmt(n);
const dateStr=ts=>ts?new Date(ts).toISOString().slice(0,10):'—';
const dateIn=ts=>ts?new Date(ts).toISOString().slice(0,10):'';
function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(t._to);t._to=setTimeout(()=>t.classList.remove('show'),1900)}
async function sha256(s){const buf=new TextEncoder().encode(s);const h=await crypto.subtle.digest('SHA-256',buf);return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function daysUntil(iso){if(!iso)return null;const d=new Date(iso);const n=new Date();n.setHours(0,0,0,0);d.setHours(0,0,0,0);return Math.round((d-n)/86400000)}
function dueClass(d){if(d==null)return '';if(d<=0)return 'due-now';if(d<=7)return 'due-7';if(d<=14)return 'due-14';if(d<=28)return 'due-28';return ''}
function dueLabel(d){if(d==null)return '';if(d<0)return Math.abs(d)+'d overdue';if(d===0)return 'today';return d+'d';}
// ════════════════════════════════════════════════════════════════
// IDB · multi-store
// ════════════════════════════════════════════════════════════════
let db;
function openDB(){return new Promise((res)=>{
 try{
 const r=indexedDB.open(STORE,DB_VERSION);
 r.onupgradeneeded=e=>{const d=e.target.result;for(const s of STORES){if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:s==='settings'?undefined:'id'})}};
 r.onsuccess=e=>{db=e.target.result;res(db)};
 r.onerror=()=>{db=null;res(null)};
 }catch(e){db=null;res(null)}
})}
function idbPut(store,rec,key){return new Promise((res)=>{
 if(!db){lsPut(store,rec,key);return res()}
 try{const tx=db.transaction(store,'readwrite');const s=tx.objectStore(store);key?s.put(rec,key):s.put(rec);
 tx.oncomplete=()=>res();tx.onerror=()=>{lsPut(store,rec,key);res()};
 }catch(e){lsPut(store,rec,key);res()}
})}
function idbGet(store,key){return new Promise((res)=>{
 if(!db){return res(lsGet(store,key))}
 try{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).get(key);
 req.onsuccess=()=>res(req.result);req.onerror=()=>res(lsGet(store,key));
 }catch(e){res(lsGet(store,key))}
})}
function idbAll(store){return new Promise((res)=>{
 if(!db){return res(lsAll(store))}
 try{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();
 req.onsuccess=()=>res(req.result||[]);req.onerror=()=>res(lsAll(store));
 }catch(e){res(lsAll(store))}
})}
function idbDel(store,key){return new Promise((res)=>{
 if(!db){lsDel(store,key);return res()}
 try{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(key);
 tx.oncomplete=()=>res();tx.onerror=()=>{lsDel(store,key);res()};
 }catch(e){lsDel(store,key);res()}
})}
const LSKEY=k=>STORE+'::'+k;
function lsPut(s,r,k){try{const all=JSON.parse(localStorage.getItem(LSKEY(s))||'{}');all[k||r.id]=r;localStorage.setItem(LSKEY(s),JSON.stringify(all))}catch(e){}}
function lsGet(s,k){try{const all=JSON.parse(localStorage.getItem(LSKEY(s))||'{}');return all[k]}catch(e){return null}}
function lsAll(s){try{return Object.values(JSON.parse(localStorage.getItem(LSKEY(s))||'{}'))}catch(e){return[]}}
function lsDel(s,k){try{const all=JSON.parse(localStorage.getItem(LSKEY(s))||'{}');delete all[k];localStorage.setItem(LSKEY(s),JSON.stringify(all))}catch(e){}}
async function loadAllStores(){
 state.firm=(await idbAll('firms'))[0]||null;
 state.advisers=(await idbAll('advisers'))||[];
 state.clients=(await idbAll('clients'))||[];
 state.returns=(await idbAll('returns'))||[];
 state.advice=(await idbAll('advice'))||[];
 state.audit=(await idbAll('audit'))||[];
 state.audit.sort((a,b)=>(a.i||0)-(b.i||0));
 const s=await idbGet('settings','app');
 if(s)state.settings=Object.assign({},state.settings,s);
 const meta=await idbGet('settings','meta');
 if(meta){state.activeReturnId=meta.activeReturnId||null;state.active=meta.active||'dashboard';state.chat=meta.chat||[];state.filters=meta.filters||state.filters;state.returnTab=meta.returnTab||'overview'}
}
async function saveMeta(){
 await idbPut('settings',{activeReturnId:state.activeReturnId,active:state.active,chat:state.chat.slice(-100),filters:state.filters,returnTab:state.returnTab},'meta');
}
async function saveSettingsRec(){await idbPut('settings',state.settings,'app');await saveMeta()}
async function audit(action,reasoning,payload){
 if(!state.settings.auditChain)return;
 const prevHash=state.audit.length?state.audit[state.audit.length-1].docHash:'';
 const i=state.audit.length;
 const ts=Date.now();
 const adviserId=state.settings.currentAdviserId||'';
 const returnId=(payload&&payload.returnId)||state.activeReturnId||'';
 const clientId=(payload&&payload.clientId)||'';
 const payloadStr=JSON.stringify(payload||{});
 const docHash=await sha256(prevHash+ts+action+adviserId+clientId+returnId+payloadStr);
 const entry={id:'au_'+i+'_'+ts,i,ts,tool:TOOLNAME,adviserId,clientId,returnId,action,reasoning:reasoning||'',configVersion:CONFIG_V,prevHash,docHash,payload:payload||{}};
 state.audit.push(entry);
 if(state.audit.length>100000)state.audit=state.audit.slice(-100000);
 await idbPut('audit',entry);
}
async function saveFirm(noBc){if(!state.firm)return;state.firm.updatedAt=Date.now();await idbPut('firms',state.firm);await audit('firm.updated','Firm updated',{id:state.firm.id,name:state.firm.name});if(!noBc)broadcast('firm.updated',state.firm)}
async function saveAdviser(a,reason,noBc){a.updatedAt=Date.now();await idbPut('advisers',a);if(!state.advisers.find(x=>x.id===a.id))state.advisers.push(a);else state.advisers=state.advisers.map(x=>x.id===a.id?a:x);await audit('adviser.updated',reason||'Adviser updated',{id:a.id,name:a.name});if(!noBc)broadcastDeb('adviser.updated',a)}
async function saveClient(c,reason,noBc){c.updatedAt=Date.now();await idbPut('clients',c);if(!state.clients.find(x=>x.id===c.id))state.clients.push(c);else state.clients=state.clients.map(x=>x.id===c.id?c:x);await audit('client.updated',reason||'Client updated',{id:c.id,clientId:c.id,name:[c.firstName,c.lastName].filter(Boolean).join(' ')});if(!noBc)broadcastDeb('client.updated',c)}
async function saveReturn(m,reason,noBc){m.updatedAt=Date.now();await idbPut('returns',m);if(!state.returns.find(x=>x.id===m.id))state.returns.push(m);else state.returns=state.returns.map(x=>x.id===m.id?m:x);await audit('return.updated',reason||'Return updated',{id:m.id,returnId:m.id,clientId:m.clientId,ref:m.ref,title:m.title});if(!noBc)broadcastDeb('return.updated',m)}
async function saveAdvice(a){a.updatedAt=Date.now();await idbPut('advice',a);if(!state.advice.find(x=>x.id===a.id))state.advice.push(a);else state.advice=state.advice.map(x=>x.id===a.id?a:x);await audit('advice.issued','Tax opinion signed and retained per State Bar 13.5',{id:a.id,returnId:a.returnId,clientId:a.clientId,adviserId:a.adviserId})}
// ════════════════════════════════════════════════════════════════
// BROADCAST · fall-law + fall-signal
// ════════════════════════════════════════════════════════════════
let chLaw,chSignal;
const bcTimers={};
function broadcast(type,payload){try{chLaw&&chLaw.postMessage({v:1,type,ts:Date.now(),source:TOOLNAME,payload})}catch(e){}}
function broadcastDeb(type,payload){const k=type+':'+((payload&&payload.id)||'');clearTimeout(bcTimers[k]);bcTimers[k]=setTimeout(()=>broadcast(type,payload),300)}
async function handleMesh(m){
 if(!m||m.source===TOOLNAME)return;
 try{
 if(m.type==='sync.request'){
 broadcast('sync.snapshot',{clients:state.clients,advisers:state.advisers,firm:state.firm,returns:state.returns});
 }else if(m.type==='sync.snapshot'){
 const p=m.payload||{};
 if(p.firm&&(!state.firm||(p.firm.updatedAt||0)>(state.firm.updatedAt||0))){state.firm=p.firm;await idbPut('firms',p.firm)}
 for(const a of(p.advisers||[])){const local=state.advisers.find(x=>x.id===a.id);if(!local||(a.updatedAt||0)>(local.updatedAt||0)){await saveAdviser(a,'sync from '+m.source,true)}}
 for(const c of(p.clients||[])){const local=state.clients.find(x=>x.id===c.id);if(!local||(c.updatedAt||0)>(local.updatedAt||0)){await saveClient(c,'sync from '+m.source,true)}}
 for(const mt of(p.returns||[])){const local=state.returns.find(x=>x.id===mt.id);if(!local||(mt.updatedAt||0)>(local.updatedAt||0)){await saveReturn(mt,'sync from '+m.source,true)}}
 render();
 }else if(m.type==='client.created'||m.type==='client.updated'){
 const c=m.payload;if(!c||!c.id)return;
 const local=state.clients.find(x=>x.id===c.id);
 if(!local||(c.updatedAt||0)>(local.updatedAt||0)){await saveClient(c,'mesh '+m.type+' from '+m.source,true);render()}
 }else if(m.type==='return.created'||m.type==='return.updated'){
 const mt=m.payload;if(!mt||!mt.id)return;
 const local=state.returns.find(x=>x.id===mt.id);
 if(!local||(mt.updatedAt||0)>(local.updatedAt||0)){await saveReturn(mt,'mesh '+m.type+' from '+m.source,true);render()}
 }else if(m.type==='adviser.created'||m.type==='adviser.updated'){
 const a=m.payload;if(!a||!a.id)return;
 const local=state.advisers.find(x=>x.id===a.id);
 if(!local||(a.updatedAt||0)>(local.updatedAt||0)){await saveAdviser(a,'mesh '+m.type+' from '+m.source,true);render()}
 }else if(m.type==='firm.updated'){
 const f=m.payload;if(!f)return;
 if(!state.firm||(f.updatedAt||0)>(state.firm.updatedAt||0)){state.firm=f;await idbPut('firms',f);render()}
 }else if(m.type==='conflict.check.request'){
 const hits=scanConflicts(m.payload||{});
 broadcast('conflict.check.response',{requestId:m.payload&&m.payload.requestId,hits,source:TOOLNAME});
 }
 }catch(e){console.warn('mesh handler',e)}
}
function initMesh(){
 try{chLaw=new BroadcastChannel('fall-law');chLaw.addEventListener('message',e=>handleMesh(e.data));setTimeout(()=>broadcast('sync.request',{}),350)}catch(e){}
 try{chSignal=new BroadcastChannel('fall-signal');chSignal.postMessage({source:TOOLNAME,type:'hello',prime:PRIME,version:VERSION,ts:Date.now()});chSignal.addEventListener('message',async e=>{const m=e.data;if(!m)return;if(m.type==='ping')chSignal.postMessage({source:TOOLNAME,type:'pong',prime:PRIME})})}catch(e){}
}
function scanConflicts(q){
 const hits=[];
 const name=(q.clientName||'').toLowerCase().trim();
 const email=(q.clientEmail||'').toLowerCase().trim();
 const opp=(q.partyOpposing||'').toLowerCase().trim();
 for(const c of state.clients){
 const cn=([c.firstName,c.lastName].filter(Boolean).join(' ')||'').toLowerCase();
 if(name&&cn&&cn.includes(name))hits.push({type:'existing-client-name-match',clientId:c.id,name:cn});
 if(email&&c.email&&c.email.toLowerCase()===email)hits.push({type:'existing-client-email-match',clientId:c.id,email:c.email});
 if(opp&&cn&&cn.includes(opp))hits.push({type:'we-acted-for-opposing-party',clientId:c.id,name:cn});
 }
 for(const m of state.returns){
 if(opp&&m.partyOpposing&&m.partyOpposing.toLowerCase().includes(opp))hits.push({type:'opposing-party-match',returnId:m.id,party:m.partyOpposing});
 }
 return hits;
}
// ════════════════════════════════════════════════════════════════
// FACTORIES
// ════════════════════════════════════════════════════════════════
function newFirmRec(){return{id:'fm_'+uid(),createdAt:Date.now(),updatedAt:Date.now(),name:'',tradingName:'',sraNumber:'',companiesHouseNo:'',vatNumber:'',registeredAddress:{line1:'',line2:'',city:'',postcode:'',country:'GB'},piInsurer:'',piPolicyNo:'',piExpiresAt:null,professionalBody:'State Bar',brandColor:'#8b1a1a',brandLogoDataUri:'',setupCompletedAt:null,nextReturnRefSeq:1}}
function newAdviserRec(){return{id:'ad_'+uid(),firmId:state.firm&&state.firm.id,createdAt:Date.now(),updatedAt:Date.now(),archivedAt:null,name:'',email:'',phone:'',smcrRole:'attorney',practicingCertNo:'',practicingCertExpiry:'',cpdHoursThisYear:0,cpdActivities:[],colp:false,cofa:false,status:'active',startedAt:Date.now(),leftAt:null}}
function newClientRec(){return{
 id:'cl_'+uid(),firmId:state.firm&&state.firm.id,createdAt:Date.now(),updatedAt:Date.now(),archivedAt:null,
 title:'',firstName:'',middleName:'',lastName:'',preferredName:'',dob:'',gender:'',nationality:'GB',countryOfResidence:'GB',nino:'',utr:'',taxResidency:['GB'],
 email:'',phone:'',address:{line1:'',line2:'',city:'',region:'England',postcode:'',country:'GB',since:''},addressHistory:[],relationships:[],
 clientType:'individual',entityNumber:'',
 kyc:{status:'pending',riskGrade:'low',pepFlag:false,pepDetails:'',sanctionsStatus:'not-checked',sanctionsCheckedAt:null,sanctionsCheckedBy:'',sourceOfFunds:'',sourceOfFundsNotes:'',sourceOfWealth:'',sourceOfWealthNotes:'',vulnerableCustomerFlag:false,vulnerabilityCategory:'',vulnerabilityNotes:'',documentsHeld:[],lastReviewAt:null,nextReviewDue:null,
 cdd:{identityVerifiedMethod:'',addressVerifiedMethod:'',identityVerifiedAt:null,identityVerifiedBy:'',beneficialOwners:[],psc:[],sourceOfFundsForReturn:''}},
 adviserId:state.settings.currentAdviserId||'',
 engagement:{startedAt:Date.now(),type:'transactional',feeBasis:'hourly',feeAgreementHash:'',feeAgreementSignedAt:null,initialFee:0,ongoingFee:0,nextReviewDue:null},
 notes:[],links:{}
}}
function newReturnRec(clientId){
 const seq=(state.firm&&state.firm.nextReturnRefSeq)||(state.returns.length+1);
 if(state.firm)state.firm.nextReturnRefSeq=seq+1;
 const yr=new Date().getFullYear();
 return{
 id:'mt_'+uid(),firmId:state.firm&&state.firm.id,clientId:clientId||'',ts:Date.now(),updatedAt:Date.now(),closedAt:null,
 ref:'M-'+yr+'-'+String(seq).padStart(3,'0'),
 title:'New return',practiceArea:'civil-litigation',
 responsibleAttorneyId:state.settings.currentAdviserId||'',supervisingPartnerId:'',
 feeArrangement:'hourly',hourlyRate:285,fixedFee:0,cfaSuccessFeePct:0,estimatedFees:5000,
 retainerScope:'',retainerLimits:'',
 conflictCheckedAt:null,conflictCheckedBy:'',conflictStatus:'pending',conflictNotes:'',
 clientCareSentAt:null,
 status:'pending',riskRating:'standard',
 outcomes:[],fileRefs:[],feeRecords:[],
 partyOpposing:'',courtRef:'',limitationDate:null,nextHearingDate:null,nextStepDue:null,
 appliedWeaves:[],
 demo:false
 }
}
function adviserName(id){const a=state.advisers.find(x=>x.id===id);return a?a.name:'—'}
function clientLabel(c){if(!c)return '—';if(c.clientType&&c.clientType!=='individual'&&c.clientType!=='sole-trader')return c.firstName||c.lastName||'Entity';return [c.title,c.firstName,c.lastName].filter(Boolean).join(' ')||'unnamed'}
function activeReturn(){return state.returns.find(m=>m.id===state.activeReturnId)}
function returnClient(m){return m?state.clients.find(c=>c.id===m.clientId):null}
async function seedDemo(){
 const adviserId=(state.advisers[0]&&state.advisers[0].id)||state.settings.currentAdviserId||'';
 const cl=newClientRec();
 cl.title='Mr';cl.firstName='Demo';cl.lastName='Patel';cl.email='demo@example.com';cl.phone='+44 7000 000000';cl.dob='1985-06-12';
 cl.adviserId=adviserId;cl._demo=true;
 await saveClient(cl,'demo seed',true);
 const mt=newReturnRec(cl.id);
 mt.title='DEMO · Patel v Singh · RTA quantum · overwrite me';
 mt.practiceArea='personal-injury';mt.responsibleAttorneyId=adviserId;mt.status='active';mt.feeArrangement='conditional';mt.cfaSuccessFeePct=25;mt.estimatedFees=12500;
 mt.partyOpposing='Singh, R.';mt.courtRef='QB-2026-001234';
 mt.retainerScope='Acting on RTA quantum claim only';mt.retainerLimits='Does not include appeal to Court of Appeal';
 const t=Date.now();mt.limitationDate=new Date(t+1000*60*60*24*45).toISOString().slice(0,10);
 mt.nextHearingDate=new Date(t+1000*60*60*24*120).toISOString().slice(0,10);
 mt.nextStepDue=new Date(t+1000*60*60*24*7).toISOString().slice(0,10);
 mt.conflictStatus='clear';mt.conflictCheckedAt=t;mt.conflictCheckedBy=adviserId;mt.clientCareSentAt=t;
 mt.demo=true;
 await saveReturn(mt,'demo seed',true);
 state.activeReturnId=mt.id;
}
// ════════════════════════════════════════════════════════════════
// VIEW
// ════════════════════════════════════════════════════════════════
function setTab(id){state.active=id;saveMeta();render()}
function setReturnTab(id){state.returnTab=id;saveMeta();render()}
function selectReturn(id){state.activeReturnId=id;state.active='return';state.returnTab='overview';saveMeta();render();const sb=$('#sidebar');if(sb)sb.classList.remove('open')}
function renderHeader(){
 const tabs=$('#tabs');
 tabs.innerHTML=TABS.map(t=>`<button class="${state.active===t.id?'active':''}" onclick="setTab('${t.id}')"><span>${t.ico}</span> ${t.name}</button>`).join('');
 const am=activeReturn();
 if(am){$('#mpWho').textContent=am.title;$('#mpMeta').textContent=am.ref+' · '+am.practiceArea}
 else{$('#mpWho').textContent='no return selected';$('#mpMeta').textContent='choose from sidebar'}
 $('#seal').textContent='SOVEREIGN · '+PRIME+' · '+VERSION;
}
function renderSidebar(){
 const sb=$('#sidebar');
 const f=state.filters;
 const returns=state.returns.filter(m=>{
 if(f.q){const s=(m.title+' '+m.ref+' '+m.partyOpposing+' '+(returnClient(m)?clientLabel(returnClient(m)):'')).toLowerCase();if(!s.includes(f.q.toLowerCase()))return false}
 if(f.area&&m.practiceArea!==f.area)return false;
 if(f.responsible&&m.responsibleAttorneyId!==f.responsible)return false;
 if(f.status&&m.status!==f.status)return false;
 if(f.risk&&m.riskRating!==f.risk)return false;
 if(f.due){const dList=[daysUntil(m.nextStepDue),daysUntil(m.limitationDate),daysUntil(m.nextHearingDate)].filter(x=>x!=null);const d=dList.length?Math.min.apply(null,dList):null;
 if(f.due==='7'&&!(d!=null&&d<=7))return false;if(f.due==='14'&&!(d!=null&&d<=14))return false;if(f.due==='28'&&!(d!=null&&d<=28))return false;if(f.due==='overdue'&&!(d!=null&&d<0))return false}
 return true;
 }).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 sb.innerHTML=`
 <h4>Returns · ${state.returns.length}</h4>
 <div class="sidebar-search">
 <input id="fq" placeholder="search title / ref / party / client" value="${esc(f.q)}" oninput="state.filters.q=this.value;renderSidebar()">
 <select onchange="state.filters.area=this.value;renderSidebar()">
 <option value="">all practice areas</option>
 ${PRACTICE_AREAS.map(p=>`<option value="${p.id}" ${f.area===p.id?'selected':''}>${p.name}</option>`).join('')}
 </select>
 <select onchange="state.filters.responsible=this.value;renderSidebar()">
 <option value="">all responsible</option>
 ${state.advisers.map(a=>`<option value="${a.id}" ${f.responsible===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}
 </select>
 <select onchange="state.filters.status=this.value;renderSidebar()">
 <option value="">all status</option>
 ${['pending','active','dormant','closed','archived'].map(s=>`<option value="${s}" ${f.status===s?'selected':''}>${s}</option>`).join('')}
 </select>
 <select onchange="state.filters.risk=this.value;renderSidebar()">
 <option value="">all risk</option>
 ${['standard','enhanced','high'].map(s=>`<option value="${s}" ${f.risk===s?'selected':''}>${s}</option>`).join('')}
 </select>
 <select onchange="state.filters.due=this.value;renderSidebar()">
 <option value="">no date filter</option>
 <option value="overdue" ${f.due==='overdue'?'selected':''}>overdue</option>
 <option value="7" ${f.due==='7'?'selected':''}>due ≤ 7d</option>
 <option value="14" ${f.due==='14'?'selected':''}>due ≤ 14d</option>
 <option value="28" ${f.due==='28'?'selected':''}>due ≤ 28d</option>
 </select>
 <button class="btn primary sm" onclick="newReturn()">+ new return</button>
 </div>
 <div class="return-list">${returns.length?returns.map(m=>{
 const cl=returnClient(m);
 const dStep=daysUntil(m.nextStepDue);
 const dLim=daysUntil(m.limitationDate);
 const critDay=dLim!=null&&dLim<=28?dLim:(dStep!=null&&dStep<=28?dStep:null);
 const critLabel=dLim!=null&&dLim<=28?'lim '+dueLabel(dLim):(dStep!=null&&dStep<=28?'step '+dueLabel(dStep):'');
 const pa=PRACTICE_AREAS.find(p=>p.id===m.practiceArea);
 return `<div class="return-card ${state.activeReturnId===m.id?'active':''}" onclick="selectReturn('${m.id}')">
 <div class="ref">${esc(m.ref)} · ${esc(m.status)}</div>
 <div class="nm">${esc(m.title)}</div>
 <div class="sub">
 <span class="tag area">${esc(pa?pa.name:m.practiceArea)}</span>
 ${cl?`<span class="tag">${esc(clientLabel(cl))}</span>`:''}
 ${m.riskRating!=='standard'?`<span class="tag risk-${m.riskRating==='high'?'h':'e'}">${esc(m.riskRating)}</span>`:''}
 ${critLabel?`<span class="tag ${dueClass(critDay)}">${critLabel}</span>`:''}
 </div>
 </div>`}).join(''):'<div class="empty-state">no returns yet · click + new return</div>'}</div>`;
}
function render(){
 if(!state.firm||!state.firm.setupCompletedAt||!state.advisers.length){return renderOnboard()}
 renderHeader();renderSidebar();
 const v=$('#view');
 const a=state.active;
 if(a==='dashboard')v.innerHTML=viewDashboard();
 else if(a==='returns')v.innerHTML=viewReturns();
 else if(a==='return')v.innerHTML=viewReturn();
 else if(a==='clients')v.innerHTML=viewClients();
 else if(a==='advisers')v.innerHTML=viewAdvisers();
 else if(a==='weaves')v.innerHTML=viewWeaves();
 else if(a==='corpus')v.innerHTML=viewCorpus();
 else if(a==='qa')v.innerHTML=viewQA();
 else if(a==='audit')v.innerHTML=viewAudit();
 else if(a==='firm')v.innerHTML=viewFirm();
}
function disclaimer(){return `<div class="disclaimer"><strong>Falltax</strong> is a tool for State Bar-regulated US attorneys. It assists with return management, CDD, document generation, and State Bar Accounts Rules tracking. It is <strong>not regulatory submission or tax opinion software</strong>. The firm COLP/COFA remain responsible. Sovereign — client data never leaves the device unless exported.</div>`}
// ════════════════════════════════════════════════════════════════
// ONBOARD
// ════════════════════════════════════════════════════════════════
function renderOnboard(){
 const step=!state.firm?1:(!state.firm.setupCompletedAt||!state.advisers.length?2:3);
 $('#view').innerHTML='<div class="onboard">'+(step===1?onbStep1():onbStep2())+'</div>';
 $('#sidebar').innerHTML='';
 renderHeader();
}
function onbStep1(){
 return `<div class="step">Step 1 / 2 · firm</div>
 <h1>Welcome to Falltax</h1>
 <p class="lead">Sovereign return management + US law research for 1-10 person State Bar-regulated firms. First, your firm details.</p>
 <div class="row"><div class="field"><label>Firm name *</label><input id="f_name" placeholder="Acme Attorneys LLP"></div><div class="field"><label>Trading name</label><input id="f_trading"></div></div>
 <div class="row"><div class="field"><label>State Bar number *</label><input id="f_sra" placeholder="123456"></div><div class="field"><label>Delaware SoS</label><input id="f_ch"></div></div>
 <div class="row"><div class="field"><label>Address line 1</label><input id="f_l1"></div><div class="field"><label>City</label><input id="f_city"></div></div>
 <div class="row"><div class="field"><label>Postcode</label><input id="f_pc"></div><div class="field"><label>PI insurer</label><input id="f_pi"></div></div>
 <div style="margin-top:18px"><button class="btn primary" onclick="submitFirm()">Continue →</button></div>`;
}
async function submitFirm(){
 const f=newFirmRec();
 f.name=$('#f_name').value.trim();f.tradingName=$('#f_trading').value.trim();f.sraNumber=$('#f_sra').value.trim();f.companiesHouseNo=$('#f_ch').value.trim();
 f.registeredAddress.line1=$('#f_l1').value;f.registeredAddress.city=$('#f_city').value;f.registeredAddress.postcode=$('#f_pc').value;f.piInsurer=$('#f_pi').value;
 if(!f.name){toast('firm name required');return}
 state.firm=f;await saveFirm(true);await audit('firm.created','Firm onboarded',{id:f.id,name:f.name});render();
}
function onbStep2(){
 return `<div class="step">Step 2 / 2 · first adviser</div>
 <h1>First adviser</h1>
 <p class="lead">Add yourself — State Bar roll number and which compliance roles you hold (COLP/COFA mandatory for the firm).</p>
 <div class="row"><div class="field"><label>Full name *</label><input id="a_name" placeholder="J Smith"></div><div class="field"><label>Email</label><input id="a_email"></div></div>
 <div class="row"><div class="field"><label>State Bar roll number *</label><input id="a_sra"></div><div class="field"><label>Practising cert expiry</label><input type="date" id="a_exp"></div></div>
 <div class="row r3"><div class="field"><label>Role</label><select id="a_role"><option>attorney</option><option>partner</option><option>paratax</option><option>consultant</option></select></div><div class="field"><label><input type="checkbox" id="a_colp"> COLP</label></div><div class="field"><label><input type="checkbox" id="a_cofa"> COFA</label></div></div>
 <div style="margin-top:18px"><button class="btn primary" onclick="submitAdviser()">Finish setup →</button></div>`;
}
async function submitAdviser(){
 const a=newAdviserRec();
 a.name=$('#a_name').value.trim();a.email=$('#a_email').value.trim();a.practicingCertNo=$('#a_sra').value.trim();a.practicingCertExpiry=$('#a_exp').value;
 a.smcrRole=$('#a_role').value;a.colp=$('#a_colp').checked;a.cofa=$('#a_cofa').checked;
 if(!a.name){toast('name required');return}
 await saveAdviser(a,'First adviser onboarded');
 state.settings.currentAdviserId=a.id;await saveSettingsRec();
 state.firm.setupCompletedAt=Date.now();await saveFirm();
 await seedDemo();
 render();
}
// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════
function viewDashboard(){
 const mActive=state.returns.filter(m=>m.status==='active'||m.status==='pending').length;
 const mClosed=state.returns.filter(m=>m.status==='closed').length;
 const critical=state.returns.filter(m=>{
 if(m.status==='closed'||m.status==='archived')return false;
 const ds=[daysUntil(m.limitationDate),daysUntil(m.nextHearingDate),daysUntil(m.nextStepDue)].filter(x=>x!=null);
 if(!ds.length)return false;
 return Math.min.apply(null,ds)<=28;
 }).slice(0,10);
 const advCount=state.advice.length;
 const areaBreakdown={};for(const m of state.returns){areaBreakdown[m.practiceArea]=(areaBreakdown[m.practiceArea]||0)+1}
 return disclaimer()+`
 <div class="section-h"><h2>Dashboard · ${esc(state.firm.name)}</h2><div class="sub">State Bar ${esc(state.firm.sraNumber||'—')}</div></div>
 <div class="grid">
 <div class="card"><h3>Returns</h3>
 <div class="kpi"><span class="l">Active / pending</span><span class="v brass">${mActive}</span></div>
 <div class="kpi"><span class="l">Closed</span><span class="v">${mClosed}</span></div>
 <div class="kpi"><span class="l">Total</span><span class="v">${state.returns.length}</span></div>
 <div class="kpi"><span class="l">Clients</span><span class="v">${state.clients.length}</span></div>
 <div class="kpi"><span class="l">Advisers</span><span class="v">${state.advisers.length}</span></div>
 </div>
 <div class="card"><h3>Practice area mix</h3>
 ${Object.entries(areaBreakdown).map(([k,v])=>{const pa=PRACTICE_AREAS.find(p=>p.id===k);return `<div class="kpi"><span class="l">${esc(pa?pa.name:k)}</span><span class="v">${v}</span></div>`}).join('')||'<div class="empty-state">no returns</div>'}
 </div>
 <div class="card"><h3>Compliance</h3>
 <div class="kpi"><span class="l">COLP</span><span class="v ${state.advisers.some(a=>a.colp)?'green':'red'}">${state.advisers.some(a=>a.colp)?'assigned':'MISSING'}</span></div>
 <div class="kpi"><span class="l">COFA</span><span class="v ${state.advisers.some(a=>a.cofa)?'green':'red'}">${state.advisers.some(a=>a.cofa)?'assigned':'MISSING'}</span></div>
 <div class="kpi"><span class="l">Advice opinions issued</span><span class="v">${advCount}</span></div>
 <div class="kpi"><span class="l">Audit entries</span><span class="v">${state.audit.length}</span></div>
 <div class="kpi"><span class="l">Retention</span><span class="v brass">State Bar · 6 years</span></div>
 </div>
 </div>
 <div class="section-h" style="margin-top:24px"><h2>Critical dates · next 28 days</h2></div>
 ${critical.length?critical.map(m=>{
 const dL=daysUntil(m.limitationDate),dH=daysUntil(m.nextHearingDate),dS=daysUntil(m.nextStepDue);
 const bits=[];if(dL!=null&&dL<=28)bits.push({k:'limitation',d:dL,date:m.limitationDate});if(dH!=null&&dH<=28)bits.push({k:'hearing',d:dH,date:m.nextHearingDate});if(dS!=null&&dS<=28)bits.push({k:'next step',d:dS,date:m.nextStepDue});
 bits.sort((a,b)=>a.d-b.d);
 const worst=bits[0];
 return `<div class="crit-banner ${worst&&worst.d<=7?'red':''}">⚠ <strong>${esc(m.ref)}</strong> · ${esc(m.title)} · ${bits.map(b=>`${b.k} ${dueLabel(b.d)} (${b.date})`).join(' · ')} <button class="btn sm" style="margin-left:12px" onclick="selectReturn('${m.id}')">open →</button></div>`
 }).join(''):'<div class="empty-state">no critical dates within 28 days</div>'}
 `;
}
// ════════════════════════════════════════════════════════════════
// MATTERS LIST
// ════════════════════════════════════════════════════════════════
function viewReturns(){
 const mm=state.returns.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 return disclaimer()+`
 <div class="section-h"><h2>Returns · ${mm.length}</h2><div class="actions"><button class="btn primary" onclick="newReturn()">+ new return</button></div></div>
 <table class="tbl"><thead><tr><th>Ref</th><th>Title</th><th>Client</th><th>Area</th><th>Status</th><th>Limitation</th><th>Next step</th><th>Resp</th></tr></thead><tbody>
 ${mm.length?mm.map(m=>{const cl=returnClient(m);const dL=daysUntil(m.limitationDate);const dS=daysUntil(m.nextStepDue);const pa=PRACTICE_AREAS.find(p=>p.id===m.practiceArea);return `<tr onclick="selectReturn('${m.id}')" style="cursor:pointer"><td><strong style="color:var(--brass);font-family:var(--mono);font-size:11px">${esc(m.ref)}</strong></td><td>${esc(m.title)}</td><td>${esc(cl?clientLabel(cl):'—')}</td><td><span class="tag-area">${esc(pa?pa.name:m.practiceArea)}</span></td><td>${esc(m.status)}</td><td style="color:${dL!=null&&dL<=7?'var(--red)':dL!=null&&dL<=28?'var(--amber)':'var(--cream-dim)'}">${m.limitationDate||'—'}${dL!=null?' ('+dueLabel(dL)+')':''}</td><td style="color:${dS!=null&&dS<=7?'var(--red)':'var(--cream-dim)'}">${m.nextStepDue||'—'}${dS!=null?' ('+dueLabel(dS)+')':''}</td><td>${esc(adviserName(m.responsibleAttorneyId))}</td></tr>`}).join(''):'<tr><td colspan="8"><div class="empty-state">no returns · click + new return</div></td></tr>'}
 </tbody></table>`;
}
// ════════════════════════════════════════════════════════════════
// MATTER · tabs
// ════════════════════════════════════════════════════════════════
function viewReturn(){
 const m=activeReturn();
 if(!m)return disclaimer()+'<div class="no-active"><h3>No return selected</h3><p>Choose one from the sidebar, or <a onclick="newReturn()">create new</a>.</p></div>';
 const cl=returnClient(m);
 const tabs=[['overview','Overview'],['retainer','Retainer & Fees'],['conflict','Conflict & CDD'],['timeline','Timeline & Dates'],['advice','Advice'],['documents','Documents'],['fees','Time / Fees']];
 return disclaimer()+`
 <div class="section-h">
 <h2>${esc(m.title)} <span style="font-family:var(--mono);font-size:13px;color:var(--brass);margin-left:8px">${esc(m.ref)}</span></h2>
 <div class="actions">
 <button class="btn sm ghost" onclick="closeReturn('${m.id}')">${m.status==='closed'?'reopen':'close return'}</button>
 <button class="btn sm ox" onclick="deleteReturn('${m.id}')">delete</button>
 </div>
 </div>
 <div class="return-tabs">${tabs.map(t=>`<button class="${state.returnTab===t[0]?'active':''}" onclick="setReturnTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
 ${state.returnTab==='overview'?tabOverview(m,cl):''}
 ${state.returnTab==='retainer'?tabRetainer(m):''}
 ${state.returnTab==='conflict'?tabConflict(m,cl):''}
 ${state.returnTab==='timeline'?tabTimeline(m):''}
 ${state.returnTab==='advice'?tabAdvice(m):''}
 ${state.returnTab==='documents'?tabDocs(m):''}
 ${state.returnTab==='fees'?tabFees(m):''}
 `;
}
function tabOverview(m,cl){
 const pa=PRACTICE_AREAS.find(p=>p.id===m.practiceArea)||{name:m.practiceArea,statutes:[]};
 const areaWord=pa.name.toLowerCase().split(' ')[0];
 const relevantWeaves=WEAVES.filter(w=>{const text=(w.archetype+' '+w.move+' '+w.authorities.join(' ')).toLowerCase();return text.includes(m.practiceArea.replace('-',' '))||text.includes(areaWord)}).slice(0,6);
 return `
 <div class="grid g2">
 <div class="card"><h3>Return detail</h3>
 <div class="row"><div class="field"><label>Title</label><input value="${esc(m.title)}" oninput="updReturn('title',this.value)"></div><div class="field"><label>Status</label><select onchange="updReturn('status',this.value)">${['pending','active','dormant','closed','archived'].map(s=>`<option value="${s}" ${m.status===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
 <div class="row"><div class="field"><label>Practice area</label><select onchange="updReturn('practiceArea',this.value)">${PRACTICE_AREAS.map(p=>`<option value="${p.id}" ${m.practiceArea===p.id?'selected':''}>${p.name}</option>`).join('')}</select></div><div class="field"><label>Risk rating</label><select onchange="updReturn('riskRating',this.value)">${['standard','enhanced','high'].map(s=>`<option value="${s}" ${m.riskRating===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
 <div class="row"><div class="field"><label>Responsible attorney</label><select onchange="updReturn('responsibleAttorneyId',this.value)"><option value="">—</option>${state.advisers.map(a=>`<option value="${a.id}" ${m.responsibleAttorneyId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div><div class="field"><label>Supervising partner</label><select onchange="updReturn('supervisingPartnerId',this.value)"><option value="">—</option>${state.advisers.map(a=>`<option value="${a.id}" ${m.supervisingPartnerId===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div></div>
 <div class="row"><div class="field"><label>Client</label><select onchange="updReturn('clientId',this.value)"><option value="">—</option>${state.clients.map(c=>`<option value="${c.id}" ${m.clientId===c.id?'selected':''}>${esc(clientLabel(c))}</option>`).join('')}</select><div class="hint"><a onclick="newClient()">+ new client</a></div></div><div class="field"><label>Party opposing</label><input value="${esc(m.partyOpposing)}" oninput="updReturn('partyOpposing',this.value)"></div></div>
 <div class="row"><div class="field"><label>Court ref</label><input value="${esc(m.courtRef)}" oninput="updReturn('courtRef',this.value)"></div></div>
 </div>
 <div class="card"><h3>At a glance</h3>
 ${cl?`<div class="kpi"><span class="l">Client</span><span class="v brass">${esc(clientLabel(cl))}</span></div><div class="kpi"><span class="l">Client type</span><span class="v">${esc(cl.clientType)}</span></div>`:''}
 <div class="kpi"><span class="l">Conflict</span><span class="v ${m.conflictStatus==='clear'?'green':m.conflictStatus==='conflict-identified'?'red':'amber'}">${esc(m.conflictStatus)}</span></div>
 <div class="kpi"><span class="l">Client care sent</span><span class="v ${m.clientCareSentAt?'green':'amber'}">${m.clientCareSentAt?dateStr(m.clientCareSentAt):'pending'}</span></div>
 <div class="kpi"><span class="l">Fee arrangement</span><span class="v">${esc(m.feeArrangement)}</span></div>
 <div class="kpi"><span class="l">Estimated fees</span><span class="v">${money(m.estimatedFees)}</span></div>
 <div class="kpi"><span class="l">Created</span><span class="v">${dateStr(m.ts)}</span></div>
 <div class="kpi"><span class="l">Last updated</span><span class="v">${dateStr(m.updatedAt)}</span></div>
 </div>
 </div>
 <div class="card" style="margin-top:14px"><h3>Practice area — ${esc(pa.name)} <span class="meta">key statutes</span></h3>
 <div style="font-size:12px;color:var(--cream-dim);margin-bottom:8px">${pa.statutes.map(s=>`<span class="tag-area" style="margin-right:6px;margin-bottom:4px;display:inline-block">${esc(s)}</span>`).join('')}</div>
 <h3 style="margin-top:14px">Relevant weaves <span class="meta">tap to apply</span></h3>
 ${relevantWeaves.length?relevantWeaves.map(w=>`<div style="padding:8px 10px;border:1px solid var(--line);border-radius:3px;margin-bottom:6px;cursor:pointer" onclick="showWeave('${w.id}')"><strong style="color:var(--brass);font-family:var(--serif)">${esc(w.name)}</strong> <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${esc(w.id)}</span><br><span style="font-size:11px;color:var(--cream-dim);font-style:italic">${esc(w.archetype)}</span> <button class="btn sm" style="float:right" onclick="event.stopPropagation();applyWeave('${m.id}','${w.id}')">apply</button></div>`).join(''):'<div class="empty-state">no weaves directly tagged — browse Weaves tab</div>'}
 ${m.appliedWeaves&&m.appliedWeaves.length?`<h3 style="margin-top:14px">Applied weaves · strategic position</h3>${m.appliedWeaves.map(wid=>{const w=WEAVES.find(x=>x.id===wid);return w?`<div style="padding:6px 10px;background:var(--ink);border-left:3px solid var(--brass);border-radius:3px;margin-bottom:4px"><strong>${esc(w.name)}</strong> · <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted)">${esc(w.id)}</span> <button class="btn sm ox" style="float:right" onclick="unapplyWeave('${m.id}','${wid}')">remove</button></div>`:''}).join('')}`:''}
 </div>`;
}
function tabRetainer(m){
 return `<div class="card"><h3>Retainer / engagement</h3>
 <div class="field"><label>Retainer scope</label><textarea oninput="updReturn('retainerScope',this.value)">${esc(m.retainerScope)}</textarea></div>
 <div class="field" style="margin-top:8px"><label>Retainer limits / exclusions</label><textarea oninput="updReturn('retainerLimits',this.value)">${esc(m.retainerLimits)}</textarea></div>
 <div class="row r3" style="margin-top:8px"><div class="field"><label>Fee arrangement</label><select onchange="updReturn('feeArrangement',this.value)">${['hourly','fixed','conditional','damages-based','tax-aid'].map(s=>`<option value="${s}" ${m.feeArrangement===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Hourly rate $</label><input type="number" value="${m.hourlyRate}" oninput="updReturn('hourlyRate',+this.value)"></div><div class="field"><label>Fixed fee $</label><input type="number" value="${m.fixedFee}" oninput="updReturn('fixedFee',+this.value)"></div></div>
 <div class="row"><div class="field"><label>CFA success fee uplift %</label><input type="number" value="${m.cfaSuccessFeePct}" oninput="updReturn('cfaSuccessFeePct',+this.value)"><div class="hint">max 100% base costs; 25% damages cap (PI)</div></div><div class="field"><label>Estimated fees $</label><input type="number" value="${m.estimatedFees}" oninput="updReturn('estimatedFees',+this.value)"></div></div>
 <div style="margin-top:12px"><button class="btn primary" onclick="sendClientCare('${m.id}')">${m.clientCareSentAt?'re-mark client care sent':'mark client care letter sent'}</button> ${m.clientCareSentAt?`<span style="font-size:11px;color:var(--cream-muted);margin-left:10px">${dateStr(m.clientCareSentAt)}</span>`:''}</div>
 </div>`;
}
function tabConflict(m,cl){
 return `<div class="card"><h3>Conflict of interest</h3>
 <div class="row r3"><div class="field"><label>Status</label><select onchange="updReturn('conflictStatus',this.value)">${['pending','clear','conflict-identified','conflict-waived'].map(s=>`<option value="${s}" ${m.conflictStatus===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Checked by</label><select onchange="updReturn('conflictCheckedBy',this.value)"><option value="">—</option>${state.advisers.map(a=>`<option value="${a.id}" ${m.conflictCheckedBy===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></div><div class="field"><label>Checked at</label><input type="date" value="${dateIn(m.conflictCheckedAt)}" onchange="updReturn('conflictCheckedAt',this.value?new Date(this.value).getTime():null)"></div></div>
 <div class="field" style="margin-top:8px"><label>Notes</label><textarea oninput="updReturn('conflictNotes',this.value)">${esc(m.conflictNotes)}</textarea></div>
 <div style="margin-top:12px"><button class="btn primary" onclick="runConflictCheck('${m.id}')">Run conflict scan now</button> <span style="font-size:11px;color:var(--cream-muted);margin-left:10px">scans local returns + emits conflict.check.request on fall-law</span></div>
 <div id="conflictResult"></div>
 </div>
 <div class="card" style="margin-top:14px"><h3>CDD · client due diligence</h3>
 ${cl?`<div class="kpi"><span class="l">Client</span><span class="v brass">${esc(clientLabel(cl))} · ${esc(cl.clientType)}</span></div>
 <div class="kpi"><span class="l">KYC status</span><span class="v ${cl.kyc.status==='verified'?'green':cl.kyc.status==='failed'?'red':'amber'}">${esc(cl.kyc.status)}</span></div>
 <div class="kpi"><span class="l">Risk grade</span><span class="v">${esc(cl.kyc.riskGrade)}</span></div>
 <div class="kpi"><span class="l">Identity method</span><span class="v">${esc((cl.kyc.cdd&&cl.kyc.cdd.identityVerifiedMethod)||'—')}</span></div>
 <div class="kpi"><span class="l">Address method</span><span class="v">${esc((cl.kyc.cdd&&cl.kyc.cdd.addressVerifiedMethod)||'—')}</span></div>
 <div class="kpi"><span class="l">PEP</span><span class="v ${cl.kyc.pepFlag?'red':'green'}">${cl.kyc.pepFlag?'YES':'No'}</span></div>
 <div class="kpi"><span class="l">Sanctions</span><span class="v ${cl.kyc.sanctionsStatus==='clear'?'green':cl.kyc.sanctionsStatus==='match'?'red':'amber'}">${esc(cl.kyc.sanctionsStatus)}</span></div>
 <div class="kpi"><span class="l">Source of funds (return)</span><span class="v">${esc((cl.kyc.cdd&&cl.kyc.cdd.sourceOfFundsForReturn)||cl.kyc.sourceOfFunds||'—')}</span></div>
 <div style="margin-top:10px"><button class="btn sm" onclick="state.active='clients';saveMeta();render()">→ open client record</button></div>
 `:'<div class="empty-state">no client linked to this return</div>'}
 </div>`;
}
function tabTimeline(m){
 const outcomes=(m.outcomes||[]).slice().sort((a,b)=>(b.ts||0)-(a.ts||0));
 return `<div class="card"><h3>Critical dates</h3>
 <div class="row r3">
 <div class="field"><label>Limitation</label><input type="date" value="${m.limitationDate||''}" onchange="updReturn('limitationDate',this.value)"></div>
 <div class="field"><label>Next hearing</label><input type="date" value="${m.nextHearingDate||''}" onchange="updReturn('nextHearingDate',this.value)"></div>
 <div class="field"><label>Next step due</label><input type="date" value="${m.nextStepDue||''}" onchange="updReturn('nextStepDue',this.value)"></div>
 </div>
 ${(function(){const d=daysUntil(m.limitationDate);if(d==null)return '';if(d<0)return '<div class="crit-banner red">⚠ limitation expired '+Math.abs(d)+' days ago</div>';if(d<=7)return '<div class="crit-banner red">⚠ limitation in '+d+' days</div>';if(d<=14)return '<div class="crit-banner">⚠ limitation in '+d+' days</div>';if(d<=28)return '<div class="crit-banner">limitation in '+d+' days</div>';return ''})()}
 </div>
 <div class="card" style="margin-top:14px"><h3>Timeline of outcomes / events</h3>
 <div class="row"><div class="field"><label>Add event</label><input id="tlText" placeholder="e.g., Particulars of claim served"></div><div class="field"><label>&nbsp;</label><button class="btn primary" onclick="addOutcome('${m.id}')">+ add event</button></div></div>
 <div class="timeline" style="margin-top:12px">${outcomes.length?outcomes.map(o=>`<div class="tline"><div class="ts">${dateStr(o.ts)} · ${esc(adviserName(o.adviserId))}</div><div class="act">${esc(o.text)}</div></div>`).join(''):'<div class="empty-state">no events yet</div>'}</div>
 </div>`;
}
function tabAdvice(m){
 const advs=state.advice.filter(a=>a.returnId===m.id).sort((a,b)=>(b.ts||0)-(a.ts||0));
 return `<div class="card"><h3>Issue tax opinion <span class="meta">State Bar 13.5 retention · 6yrs</span></h3>
 <div class="field"><label>Opinion text</label><textarea id="advText" style="min-height:160px" placeholder="Set out the issue, the law, the application, the conclusion (IRAC)."></textarea></div>
 <div style="margin-top:10px"><button class="btn primary" onclick="issueAdvice('${m.id}')">Sign and issue (sha256 + ${esc(adviserName(state.settings.currentAdviserId))} + now)</button></div>
 </div>
 <div class="section-h" style="margin-top:18px"><h2>Issued opinions · ${advs.length}</h2></div>
 ${advs.length?advs.map(a=>`<div class="adv-issue"><div class="hd"><div>${esc(adviserName(a.adviserId))}</div><div>${dateStr(a.ts)}</div></div><div class="body">${esc(a.text)}</div><div class="sig">SIG · ${esc(a.signature.slice(0,32))}…</div></div>`).join(''):'<div class="empty-state">no opinions issued yet</div>'}`;
}
function tabDocs(m){
 return `<div class="card"><h3>Document references</h3>
 <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Document storage lives in <strong>falltax-uspaper</strong> (sister tool on this device). This tab shows attached file refs.</p>
 <div class="row"><div class="field"><label>Add file ref (id or filename)</label><input id="frefIn" placeholder="contract-v3.pdf"></div><div class="field"><label>&nbsp;</label><button class="btn primary" onclick="addFileRef('${m.id}')">+ attach ref</button></div></div>
 <table class="tbl" style="margin-top:12px"><thead><tr><th>Ref</th><th>Attached</th><th></th></tr></thead><tbody>
 ${(m.fileRefs||[]).length?(m.fileRefs||[]).map((r,i)=>`<tr><td>${esc(r.name||r)}</td><td>${r.ts?dateStr(r.ts):'—'}</td><td class="r"><button class="btn sm ox" onclick="rmFileRef('${m.id}',${i})">remove</button></td></tr>`).join(''):'<tr><td colspan="3"><div class="empty-state">no file refs</div></td></tr>'}
 </tbody></table>
 </div>`;
}
function tabFees(m){
 return `<div class="card"><h3>Time / fee references</h3>
 <p style="font-size:12px;color:var(--cream-dim);margin-bottom:10px">Time recording and billing lives in <strong>falltax-uspractice</strong>. This view shows ledger ref IDs.</p>
 <table class="tbl"><thead><tr><th>Ref</th><th>Date</th><th class="r">Amount</th></tr></thead><tbody>
 ${(m.feeRecords||[]).length?(m.feeRecords||[]).map(r=>`<tr><td>${esc(r.id||r)}</td><td>${r.ts?dateStr(r.ts):'—'}</td><td class="r">${money(r.amount||0)}</td></tr>`).join(''):'<tr><td colspan="3"><div class="empty-state">no fee records yet</div></td></tr>'}
 </tbody></table>
 </div>`;
}
// ════════════════════════════════════════════════════════════════
// CLIENTS / ADVISERS / FIRM / WEAVES / CORPUS / QA / AUDIT
// ════════════════════════════════════════════════════════════════
function viewClients(){
 const cs=state.clients.slice().sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
 return disclaimer()+`<div class="section-h"><h2>Clients · ${cs.length}</h2><div class="actions"><button class="btn primary" onclick="newClient()">+ new client</button></div></div>
 <table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>Email</th><th>KYC</th><th>Risk</th><th>Returns</th><th></th></tr></thead><tbody>
 ${cs.length?cs.map(c=>{const mc=state.returns.filter(m=>m.clientId===c.id).length;return `<tr><td><strong>${esc(clientLabel(c))}</strong></td><td>${esc(c.clientType)}</td><td>${esc(c.email)}</td><td style="color:${c.kyc.status==='verified'?'var(--green)':'var(--amber)'}">${esc(c.kyc.status)}</td><td>${esc(c.kyc.riskGrade)}</td><td>${mc}</td><td class="r"><button class="btn sm" onclick="editClient('${c.id}')">edit</button> <button class="btn sm ox" onclick="archiveClientCmd('${c.id}')">archive</button></td></tr>`}).join(''):'<tr><td colspan="7"><div class="empty-state">no clients yet</div></td></tr>'}
 </tbody></table>`;
}
function viewAdvisers(){
 return disclaimer()+`<div class="section-h"><h2>Advisers · ${state.advisers.length}</h2><div class="actions"><button class="btn primary" onclick="newAdviser()">+ new adviser</button></div></div>
 <table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>State Bar roll</th><th>PC expiry</th><th>COLP</th><th>COFA</th><th>CPD</th><th></th></tr></thead><tbody>
 ${state.advisers.map(a=>`<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.smcrRole)}</td><td>${esc(a.practicingCertNo)}</td><td>${esc(a.practicingCertExpiry||'—')}</td><td style="color:${a.colp?'var(--green)':'var(--cream-muted)'}">${a.colp?'YES':'—'}</td><td style="color:${a.cofa?'var(--green)':'var(--cream-muted)'}">${a.cofa?'YES':'—'}</td><td>${a.cpdHoursThisYear}/16</td><td class="r"><button class="btn sm" onclick="editAdviser('${a.id}')">edit</button> ${state.settings.currentAdviserId===a.id?'<span style="color:var(--brass);font-size:10px">· active</span>':`<button class="btn sm" onclick="setActiveAdviser('${a.id}')">set active</button>`}</td></tr>`).join('')}
 </tbody></table>`;
}
function viewFirm(){
 const f=state.firm;
 return disclaimer()+`<div class="section-h"><h2>Firm · ${esc(f.name)}</h2></div>
 <div class="card"><h3>Firm details</h3>
 <div class="row"><div class="field"><label>Name</label><input value="${esc(f.name)}" oninput="state.firm.name=this.value;saveFirm()"></div><div class="field"><label>Trading name</label><input value="${esc(f.tradingName)}" oninput="state.firm.tradingName=this.value;saveFirm()"></div></div>
 <div class="row"><div class="field"><label>State Bar number</label><input value="${esc(f.sraNumber)}" oninput="state.firm.sraNumber=this.value;saveFirm()"></div><div class="field"><label>Delaware SoS</label><input value="${esc(f.companiesHouseNo)}" oninput="state.firm.companiesHouseNo=this.value;saveFirm()"></div></div>
 <div class="row"><div class="field"><label>VAT</label><input value="${esc(f.vatNumber)}" oninput="state.firm.vatNumber=this.value;saveFirm()"></div><div class="field"><label>PI insurer</label><input value="${esc(f.piInsurer)}" oninput="state.firm.piInsurer=this.value;saveFirm()"></div></div>
 <div class="row"><div class="field"><label>PI policy no</label><input value="${esc(f.piPolicyNo)}" oninput="state.firm.piPolicyNo=this.value;saveFirm()"></div><div class="field"><label>PI expiry</label><input type="date" value="${dateIn(f.piExpiresAt)}" onchange="state.firm.piExpiresAt=this.value?new Date(this.value).getTime():null;saveFirm()"></div></div>
 </div>
 <div class="card" style="margin-top:14px"><h3>Settings · BYOK keys (T3 cascade)</h3>
 <p style="font-size:11px;color:var(--cream-muted);margin-bottom:10px">Keys stored locally only. Order: Anthropic → OpenAI → Gemini → OpenRouter.</p>
 <div class="row"><div class="field"><label>Anthropic key</label><input type="password" value="${esc(state.settings.anthropicKey)}" oninput="state.settings.anthropicKey=this.value;saveSettingsRec()"></div><div class="field"><label>OpenAI key</label><input type="password" value="${esc(state.settings.openaiKey)}" oninput="state.settings.openaiKey=this.value;saveSettingsRec()"></div></div>
 <div class="row"><div class="field"><label>Gemini key</label><input type="password" value="${esc(state.settings.geminiKey)}" oninput="state.settings.geminiKey=this.value;saveSettingsRec()"></div><div class="field"><label>OpenRouter key</label><input type="password" value="${esc(state.settings.openrouterKey)}" oninput="state.settings.openrouterKey=this.value;saveSettingsRec()"></div></div>
 <div style="margin-top:10px"><label><input type="checkbox" ${state.settings.auditChain?'checked':''} onchange="state.settings.auditChain=this.checked;saveSettingsRec()"> Audit chain enabled</label></div>
 </div>
 <div class="card" style="margin-top:14px"><h3>Export / import</h3>
 <button class="btn" onclick="exportAll()">Export all (JSON)</button>
 <button class="btn ox" onclick="purgeDemo()">Purge demo data</button>
 <button class="btn ox" onclick="if(confirm('Wipe everything?'))wipeAll()">Wipe all data</button>
 </div>`;
}
function viewWeaves(){
 const wf=state.weaveFilter;
 const ws=WEAVES.filter(w=>{
 if(wf.q){const t=(w.name+' '+w.archetype+' '+w.move+' '+w.authorities.join(' ')+' '+w.agents.join(' ')).toLowerCase();if(!t.includes(wf.q.toLowerCase()))return false}
 return true;
 });
 return disclaimer()+`<div class="section-h"><h2>Weaves · ${WEAVES.length}</h2><div class="sub">strategic tax patterns</div></div>
 <div class="row"><div class="field"><label>Search by archetype / move / authority / agent</label><input value="${esc(wf.q)}" oninput="state.weaveFilter.q=this.value;render()"></div></div>
 <div style="margin-top:14px">${ws.map(w=>`<div class="weave"><h4>${esc(w.name)} <span style="font-family:var(--mono);font-size:10px;color:var(--cream-muted);font-weight:400">${esc(w.id)}</span></h4><div class="arch">${esc(w.archetype)}</div><div class="seg"><b>Move</b>${esc(w.move)}</div><div class="seg"><b>Authorities</b><div class="auth">${w.authorities.map(a=>esc(a)).join(' · ')}</div></div><div class="seg"><b>Opposition move</b>${esc(w.opposition_move)}</div><div class="seg"><b>Counter</b>${esc(w.counter)}</div><div class="seg"><b>Why it wins</b>${esc(w.why_it_wins)}</div><div class="seg"><b>Example</b>${esc(w.example_case)}</div><div class="agents">${w.agents.map(a=>`<span>${esc(a)}</span>`).join('')}</div>${state.activeReturnId?`<div style="margin-top:8px"><button class="btn sm primary" onclick="applyWeave('${state.activeReturnId}','${w.id}')">apply to active return</button></div>`:''}</div>`).join('')}</div>`;
}
function viewCorpus(){
 return disclaimer()+`<div class="section-h"><h2>US Law Corpus · ${CORPUS.length}</h2><div class="sub">core statutes &amp; codes</div></div>
 <div class="grid">${CORPUS.map(c=>{const pa=PRACTICE_AREAS.find(p=>p.id===c.area);return `<div class="card"><h3>${esc(c.title)} <span class="meta">${esc(pa?pa.name:c.area)}</span></h3><p style="font-size:12px;color:var(--cream-dim);margin-bottom:8px">${esc(c.summary)}</p><div style="font-family:var(--mono);font-size:10px;color:var(--brass);letter-spacing:0.06em">KEY PROVISIONS</div>${c.keyProvisions.map(p=>`<div style="font-size:11px;color:var(--cream);margin:2px 0;padding-left:8px;border-left:2px solid var(--line)">${esc(p)}</div>`).join('')}</div>`}).join('')}</div>`;
}
function viewQA(){
 return disclaimer()+`<div class="section-h"><h2>Q &amp; A · US law research</h2><div class="sub">T0 offline · T3 BYOK cascade</div></div>
 <div class="card"><h3>Quick questions · T0 offline</h3><div style="margin-bottom:14px">${T0_RULES.map(r=>`<span class="t0chip" onclick="askChip(this)" data-q="${esc(r.q)}">${esc(r.q)}</span>`).join('')}</div></div>
 <div class="card" style="margin-top:14px"><h3>Ask anything</h3><div class="row"><div class="field"><textarea id="qInput" placeholder="Type a question — limitation, CFA structure, conflict, conveyancing, ET, anything..."></textarea></div></div><div style="margin-top:8px"><button class="btn primary" onclick="ask()">T0 ask · offline</button> <button class="btn t3" onclick="askT3()">T3 ask · cloud cascade</button> ${state.activeReturnId?`<span style="margin-left:12px;font-size:11px;color:var(--brass)">context: ${esc(activeReturn().title)}</span>`:''}</div></div>
 <div class="card" style="margin-top:14px"><h3>Conversation</h3>${state.chat.length?state.chat.slice(-20).map(m=>`<div class="chat-msg ${m.role}"><div class="role">${m.role} · ${dateStr(m.ts)}</div>${esc(m.text).replace(/\n/g,'<br>')}</div>`).join(''):'<div class="empty-state">no questions yet</div>'}</div>`;
}
function viewAudit(){
 const recent=state.audit.slice(-200).reverse();
 return disclaimer()+`<div class="section-h"><h2>Audit · P3</h2><div class="sub">${state.audit.length} entries · 6yr retention · State Bar 13.5</div><div class="actions"><button class="btn" onclick="exportAudit()">export JSON</button></div></div>
 <p style="font-size:12px;color:var(--cream-dim);margin-bottom:12px">Hash chain: prevHash + docHash + reasoning. Each entry timestamped, ties to adviser / client / return.</p>
 <table class="tbl"><thead><tr><th>#</th><th>When</th><th>Action</th><th>Adviser</th><th>Return</th><th>Reason</th><th>Hash</th></tr></thead><tbody>
 ${recent.map(a=>{const mt=state.returns.find(x=>x.id===a.returnId);return `<tr><td>${a.i}</td><td>${dateStr(a.ts)}</td><td><strong>${esc(a.action)}</strong></td><td>${esc(adviserName(a.adviserId))}</td><td>${esc(mt?mt.ref:'—')}</td><td>${esc(a.reasoning)}</td><td style="font-family:var(--mono);font-size:9px">${esc((a.docHash||'').slice(0,16))}…</td></tr>`}).join('')}
 </tbody></table>`;
}
// ════════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════════
function updReturn(field,val){const m=activeReturn();if(!m)return;m[field]=val;saveReturn(m,'field '+field+' updated')}
async function newReturn(){
 const m=newReturnRec();state.activeReturnId=m.id;
 await saveReturn(m,'new return');await audit('return.created','New return created',{id:m.id,returnId:m.id,ref:m.ref});broadcast('return.created',m);
 state.active='return';state.returnTab='overview';saveMeta();render();
}
async function closeReturn(id){const m=state.returns.find(x=>x.id===id);if(!m)return;m.status=m.status==='closed'?'active':'closed';m.closedAt=m.status==='closed'?Date.now():null;await saveReturn(m,'return '+m.status);if(m.status==='closed')broadcast('return.closed',m);else broadcast('return.reopened',m);render()}
async function deleteReturn(id){if(!confirm('Delete this return? (audit log preserved)'))return;await idbDel('returns',id);state.returns=state.returns.filter(m=>m.id!==id);if(state.activeReturnId===id)state.activeReturnId=null;await audit('return.deleted','Return deleted',{id});render()}
async function sendClientCare(id){const m=state.returns.find(x=>x.id===id);if(!m)return;m.clientCareSentAt=Date.now();await saveReturn(m,'client care letter marked sent');toast('client care marked sent');render()}
async function addOutcome(id){const m=state.returns.find(x=>x.id===id);if(!m)return;const t=$('#tlText').value.trim();if(!t)return;m.outcomes=m.outcomes||[];m.outcomes.push({ts:Date.now(),adviserId:state.settings.currentAdviserId,text:t});await saveReturn(m,'event added');render()}
async function addFileRef(id){const m=state.returns.find(x=>x.id===id);if(!m)return;const n=$('#frefIn').value.trim();if(!n)return;m.fileRefs=m.fileRefs||[];m.fileRefs.push({name:n,ts:Date.now()});await saveReturn(m,'file ref attached');render()}
async function rmFileRef(id,i){const m=state.returns.find(x=>x.id===id);if(!m)return;m.fileRefs.splice(i,1);await saveReturn(m,'file ref removed');render()}
async function issueAdvice(returnId){
 const m=state.returns.find(x=>x.id===returnId);if(!m)return;
 const txt=$('#advText').value.trim();if(!txt){toast('write an opinion first');return}
 const adviserId=state.settings.currentAdviserId||'';const ts=Date.now();
 const sig=await sha256(returnId+adviserId+ts+txt);
 const a={id:'adv_'+uid(),returnId,clientId:m.clientId,adviserId,ts,text:txt,signature:sig};
 await saveAdvice(a);broadcast('advice.issued',a);toast('opinion signed and retained');$('#advText').value='';render();
}
async function applyWeave(returnId,wid){const m=state.returns.find(x=>x.id===returnId);if(!m)return;m.appliedWeaves=m.appliedWeaves||[];if(!m.appliedWeaves.includes(wid))m.appliedWeaves.push(wid);await saveReturn(m,'weave '+wid+' applied');toast('weave applied');render()}
async function unapplyWeave(returnId,wid){const m=state.returns.find(x=>x.id===returnId);if(!m)return;m.appliedWeaves=(m.appliedWeaves||[]).filter(x=>x!==wid);await saveReturn(m,'weave '+wid+' removed');render()}
function showWeave(wid){const w=WEAVES.find(x=>x.id===wid);if(!w)return;modal(`<h3>${esc(w.name)}</h3><p style="font-style:italic;color:var(--cream-dim);margin-bottom:10px">${esc(w.archetype)}</p><div class="seg"><b style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Move</b><br>${esc(w.move)}</div><div class="seg" style="margin-top:8px"><b style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Authorities</b><br><span class="auth">${w.authorities.map(a=>esc(a)).join(' · ')}</span></div><div class="seg" style="margin-top:8px"><b style="color:var(--brass);font-family:var(--mono);font-size:10px;letter-spacing:0.08em;text-transform:uppercase">Counter</b><br>${esc(w.counter)}</div><div style="margin-top:14px">${state.activeReturnId?`<button class="btn primary" onclick="applyWeave('${state.activeReturnId}','${w.id}');closeModal()">apply to active return</button> `:''}<button class="btn ghost" onclick="closeModal()">close</button></div>`)}
async function runConflictCheck(returnId){
 const m=state.returns.find(x=>x.id===returnId);if(!m)return;
 const cl=returnClient(m);
 const hits=scanConflicts({clientName:cl?[cl.firstName,cl.lastName].filter(Boolean).join(' '):'',clientEmail:cl?cl.email:'',partyOpposing:m.partyOpposing});
 const reqId='req_'+uid();
 broadcast('conflict.check.request',{requestId:reqId,clientName:cl?[cl.firstName,cl.lastName].filter(Boolean).join(' '):'',clientEmail:cl?cl.email:'',partyOpposing:m.partyOpposing});
 m.conflictCheckedAt=Date.now();m.conflictCheckedBy=state.settings.currentAdviserId;
 m.conflictStatus=hits.length?'conflict-identified':'clear';
 m.conflictNotes=(m.conflictNotes||'')+'\n['+dateStr(Date.now())+'] Local scan: '+hits.length+' hits.';
 await saveReturn(m,'conflict scan run');
 const el=$('#conflictResult');if(el)el.innerHTML='<div style="margin-top:12px;padding:10px;background:var(--ink);border-radius:3px"><strong style="color:var(--brass)">Local scan result:</strong> '+hits.length+' hits<br>'+(hits.length?'<pre style="font-size:11px;color:var(--cream-dim);margin-top:6px">'+esc(JSON.stringify(hits,null,2))+'</pre>':'<span style="color:var(--green)">no conflicts found in local IDB</span>')+'</div>';
 toast('scan complete: '+hits.length+' hits');
}
function setActiveAdviser(id){state.settings.currentAdviserId=id;saveSettingsRec();toast('active adviser set');render()}
async function newClient(){const c=newClientRec();c.firstName='New';c.lastName='Client';await saveClient(c,'new client created');broadcast('client.created',c);editClient(c.id)}
function editClient(id){const c=state.clients.find(x=>x.id===id);if(!c)return;modal(`<h3>Edit client</h3>
 <div class="row"><div class="field"><label>Title</label><select id="ec_t"><option value="">—</option>${['Mr','Mrs','Ms','Miss','Mx','Dr'].map(t=>`<option ${c.title===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label>Type</label><select id="ec_type">${['individual','sole-trader','partnership','limited-company','charity','trust','public-body','other'].map(t=>`<option value="${t}" ${c.clientType===t?'selected':''}>${t}</option>`).join('')}</select></div></div>
 <div class="row"><div class="field"><label>First / company name</label><input id="ec_fn" value="${esc(c.firstName)}"></div><div class="field"><label>Last</label><input id="ec_ln" value="${esc(c.lastName)}"></div></div>
 <div class="row"><div class="field"><label>Email</label><input id="ec_em" value="${esc(c.email)}"></div><div class="field"><label>Phone</label><input id="ec_ph" value="${esc(c.phone)}"></div></div>
 <div class="row"><div class="field"><label>DOB</label><input type="date" id="ec_dob" value="${esc(c.dob)}"></div><div class="field"><label>Delaware SoS no</label><input id="ec_ch" value="${esc(c.entityNumber)}"></div></div>
 <div class="row r3"><div class="field"><label>KYC status</label><select id="ec_kyc">${['pending','verified','review','failed'].map(s=>`<option value="${s}" ${c.kyc.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Risk</label><select id="ec_risk">${['low','medium','high'].map(s=>`<option value="${s}" ${c.kyc.riskGrade===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Sanctions</label><select id="ec_san">${['not-checked','clear','match','review'].map(s=>`<option value="${s}" ${c.kyc.sanctionsStatus===s?'selected':''}>${s}</option>`).join('')}</select></div></div>
 <div class="row r3"><div class="field"><label>ID method</label><select id="ec_idm"><option value="">—</option>${['passport','drivinglicence','biometric-platform','electronic-verification'].map(s=>`<option value="${s}" ${(c.kyc.cdd&&c.kyc.cdd.identityVerifiedMethod)===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>Addr method</label><select id="ec_adm"><option value="">—</option>${['utility','bank-statement','electronic'].map(s=>`<option value="${s}" ${(c.kyc.cdd&&c.kyc.cdd.addressVerifiedMethod)===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field"><label>PEP</label><select id="ec_pep"><option value="0" ${!c.kyc.pepFlag?'selected':''}>No</option><option value="1" ${c.kyc.pepFlag?'selected':''}>Yes</option></select></div></div>
 <div class="field"><label>Source of funds</label><input id="ec_sof" value="${esc(c.kyc.sourceOfFunds)}"></div>
 <div style="margin-top:14px"><button class="btn primary" onclick="saveClientFromModal('${c.id}')">save</button> <button class="btn ghost" onclick="closeModal()">cancel</button></div>`)}
async function saveClientFromModal(id){const c=state.clients.find(x=>x.id===id);if(!c)return;
 c.title=$('#ec_t').value;c.clientType=$('#ec_type').value;c.firstName=$('#ec_fn').value;c.lastName=$('#ec_ln').value;c.email=$('#ec_em').value;c.phone=$('#ec_ph').value;c.dob=$('#ec_dob').value;c.entityNumber=$('#ec_ch').value;
 c.kyc.status=$('#ec_kyc').value;c.kyc.riskGrade=$('#ec_risk').value;c.kyc.sanctionsStatus=$('#ec_san').value;c.kyc.pepFlag=$('#ec_pep').value==='1';c.kyc.sourceOfFunds=$('#ec_sof').value;
 if(!c.kyc.cdd)c.kyc.cdd={};c.kyc.cdd.identityVerifiedMethod=$('#ec_idm').value;c.kyc.cdd.addressVerifiedMethod=$('#ec_adm').value;
 await saveClient(c,'client edited');closeModal();render();toast('client saved');
}
async function archiveClientCmd(id){const c=state.clients.find(x=>x.id===id);if(!c)return;if(!confirm('Archive client?'))return;c.archivedAt=Date.now();await saveClient(c,'client archived');broadcast('client.archived',c);render()}
async function newAdviser(){const a=newAdviserRec();await saveAdviser(a,'new adviser');editAdviser(a.id)}
function editAdviser(id){const a=state.advisers.find(x=>x.id===id);if(!a)return;modal(`<h3>Edit adviser</h3>
 <div class="row"><div class="field"><label>Name</label><input id="ea_name" value="${esc(a.name)}"></div><div class="field"><label>Email</label><input id="ea_em" value="${esc(a.email)}"></div></div>
 <div class="row"><div class="field"><label>State Bar roll</label><input id="ea_sra" value="${esc(a.practicingCertNo)}"></div><div class="field"><label>PC expiry</label><input type="date" id="ea_exp" value="${esc(a.practicingCertExpiry)}"></div></div>
 <div class="row r3"><div class="field"><label>Role</label><select id="ea_role">${['partner','attorney','paratax','consultant'].map(r=>`<option value="${r}" ${a.smcrRole===r?'selected':''}>${r}</option>`).join('')}</select></div><div class="field"><label>COLP</label><select id="ea_colp"><option value="0" ${!a.colp?'selected':''}>No</option><option value="1" ${a.colp?'selected':''}>Yes</option></select></div><div class="field"><label>COFA</label><select id="ea_cofa"><option value="0" ${!a.cofa?'selected':''}>No</option><option value="1" ${a.cofa?'selected':''}>Yes</option></select></div></div>
 <div class="field"><label>CPD hours this year</label><input type="number" id="ea_cpd" value="${a.cpdHoursThisYear}"></div>
 <div style="margin-top:14px"><button class="btn primary" onclick="saveAdviserFromModal('${a.id}')">save</button> <button class="btn ghost" onclick="closeModal()">cancel</button></div>`)}
async function saveAdviserFromModal(id){const a=state.advisers.find(x=>x.id===id);if(!a)return;a.name=$('#ea_name').value;a.email=$('#ea_em').value;a.practicingCertNo=$('#ea_sra').value;a.practicingCertExpiry=$('#ea_exp').value;a.smcrRole=$('#ea_role').value;a.colp=$('#ea_colp').value==='1';a.cofa=$('#ea_cofa').value==='1';a.cpdHoursThisYear=+$('#ea_cpd').value;await saveAdviser(a,'adviser edited');closeModal();render()}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').classList.add('show')}
function closeModal(){$('#modal').classList.remove('show')}
// ════════════════════════════════════════════════════════════════
// T0 / T3 Q&A
// ════════════════════════════════════════════════════════════════
function askChip(el){const q=el.getAttribute('data-q');ask(q)}
function ask(q){
 const txt=q||$('#qInput').value.trim();if(!txt)return;
 state.chat.push({role:'user',text:txt,ts:Date.now()});
 const ans=answerT0(txt);
 state.chat.push({role:'bot',text:ans,ts:Date.now()});
 saveMeta();render();const ip=$('#qInput');if(ip&&!q)ip.value='';
}
function answerT0(q){
 const ql=q.toLowerCase();
 const direct=T0_RULES.find(r=>{const k=r.q.toLowerCase().replace(/[?]/g,'').split(/\s+/).filter(w=>w.length>3);return k.some(w=>ql.includes(w))});
 let ans=direct?direct.a:'';
 const matched=WEAVES.filter(w=>{const t=(w.name+' '+w.archetype+' '+w.move+' '+w.authorities.join(' ')).toLowerCase();return ql.split(/\s+/).filter(x=>x.length>3).some(x=>t.includes(x))}).slice(0,3);
 if(!ans&&!matched.length)ans='[T0 offline] No direct rule matched. Try one of the 14 quick chips, or use T3 cloud cascade for nuanced research. Always verify against primary sources (legislation.gov.uk, BAILII).';
 if(matched.length)ans+=(ans?'\n\n':'')+'Relevant weaves:\n'+matched.map(w=>'• '+w.name+' ('+w.id+') — '+w.archetype).join('\n');
 ans+='\n\n— Falltax T0 · informational, verify against primary sources.';
 return ans;
}
async function askT3(){
 const txt=$('#qInput').value.trim();if(!txt){toast('type a question first');return}
 const m=activeReturn();const cl=m?returnClient(m):null;
 const ctx=m?`\nActive return: ${m.ref} — ${m.title} (${m.practiceArea}). Client: ${cl?clientLabel(cl):'—'}.`:'';
 state.chat.push({role:'user',text:txt,ts:Date.now()});saveMeta();render();
 const sys='You are a US tax research assistant for State Bar-regulated attorneys. Cite statutes (s.) and cases [neutral citation]. State sources. Never provide regulated tax advice — research only. Always say "verify against primary sources".';
 const userMsg=txt+ctx;
 let answer='';
 try{
 if(state.settings.anthropicKey)answer=await callAnthropic(sys,userMsg);
 else if(state.settings.openaiKey)answer=await callOpenAI(sys,userMsg);
 else if(state.settings.geminiKey)answer=await callGemini(sys,userMsg);
 else if(state.settings.openrouterKey)answer=await callOpenRouter(sys,userMsg);
 else answer='[T3] No BYOK API key configured. Add one in Firm → Settings.'
 }catch(e){answer='[T3 error] '+e.message}
 state.chat.push({role:'bot',text:answer+'\n\n— Falltax T3 · BYOK · verify against primary sources.',ts:Date.now()});saveMeta();render();$('#qInput').value='';
}
async function callAnthropic(sys,user){
 const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':state.settings.anthropicKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-3-5-sonnet-20241022',max_tokens:1500,system:sys,messages:[{role:'user',content:user}]})});
 const j=await r.json();if(j.error)throw new Error(j.error.message);return j.content[0].text;
}
async function callOpenAI(sys,user){
 const r=await fetch('https://api.openai.com/v1/chat/closings',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+state.settings.openaiKey},body:JSON.stringify({model:'gpt-4o-mini',messages:[{role:'system',content:sys},{role:'user',content:user}],max_tokens:1500})});
 const j=await r.json();if(j.error)throw new Error(j.error.message);return j.choices[0].message.content;
}
async function callGemini(sys,user){
 const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key='+state.settings.geminiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:sys+'\n\n'+user}]}]})});
 const j=await r.json();if(j.error)throw new Error(j.error.message);return j.candidates[0].content.parts[0].text;
}
async function callOpenRouter(sys,user){
 const r=await fetch('https://openrouter.ai/api/v1/chat/closings',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+state.settings.openrouterKey},body:JSON.stringify({model:'anthropic/claude-3.5-sonnet',messages:[{role:'system',content:sys},{role:'user',content:user}],max_tokens:1500})});
 const j=await r.json();if(j.error)throw new Error(j.error.message);return j.choices[0].message.content;
}
// ════════════════════════════════════════════════════════════════
// EXPORT / WIPE / DEMO
// ════════════════════════════════════════════════════════════════
function downloadJSON(name,data){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function exportAll(){downloadJSON('falltax-us-export-'+new Date().toISOString().slice(0,10)+'.json',{firm:state.firm,advisers:state.advisers,clients:state.clients,returns:state.returns,advice:state.advice,audit:state.audit,exportedAt:Date.now(),tool:TOOLNAME,version:VERSION});toast('exported')}
function exportAudit(){downloadJSON('falltax-us-audit-'+new Date().toISOString().slice(0,10)+'.json',state.audit);toast('audit exported')}
async function purgeDemo(){
 const dM=state.returns.filter(m=>m.demo);const dC=state.clients.filter(c=>c._demo);
 for(const m of dM){await idbDel('returns',m.id)}for(const c of dC){await idbDel('clients',c.id)}
 state.returns=state.returns.filter(m=>!m.demo);state.clients=state.clients.filter(c=>!c._demo);
 if(state.activeReturnId&&!state.returns.find(m=>m.id===state.activeReturnId))state.activeReturnId=null;
 await audit('demo.purged','Demo data removed',{returns:dM.length,clients:dC.length});toast('demo purged');render();
}
async function wipeAll(){indexedDB.deleteDatabase(STORE);localStorage.clear();location.reload()}
// ════════════════════════════════════════════════════════════════
// KONOMI sovereign tier
// ════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════
// BOOT
// ════════════════════════════════════════════════════════════════
(async function boot(){
 await openDB();
 await loadAllStores();
 initMesh();
 $('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
 render();
 await audit('app.boot','Falltax booted',{version:VERSION,prime:PRIME});
})();

// Named exports for the primary API surface
export { loadConfig };
export { saveConfig };
export { $ };
export { esc };
export { aiTier };
export { renderAiChip };
export { loadWebLLM };
export { aiComplete };
export { aiCloudCall };
export { meshStart };

export { FALL_KIT_VERSION };
export { KCC_MINT_URL };
export { WEBLLM_MODELS };
export { DEFAULT_MODEL };
export { T3_PROVIDERS };
export { STATE };
export { MESH_CHANNEL };
export { STUN_SERVERS };
export { TOOLNAME };
export { DB_VERSION };
