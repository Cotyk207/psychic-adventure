'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { deepMerge, getPath, setPath, uid } = require('./util.cjs');
const { get } = require('./paths.cjs');

const PRESETS = require('../../shared/providers.json');
const { REMOVED_PAID_BUILTIN_IDS, filterFreeModels } = require('./models.cjs');

function createDefaultConfig() {
  const dirs = get();
  const home = dirs.home;
  return {
    version: 1,
    createdAt: Date.now(),
    general: {
      language: 'ru',
      startMinimized: false,
      autostart: false,
      tray: true,
      notifications: true,
      confirmOnExit: false,
      saveHistory: true,
      showSplash: true,
      developerMode: false,
    },
    appearance: {
      theme: 'nightcity',
      customTheme: null,
      fx: true,
      particles: true,
      grid: true,
      scanlines: true,
      glow: true,
      animations: true,
      wallpaper: 'nightcity',
      wallpaperOpacity: 0.35,
      density: 'comfortable',
      fontScale: 1,
      radius: 14,
      transparency: true,
      messageBubbles: true,
      soundEffects: false,
      sidebarCollapsed: false,
    },
    chat: {
      defaultProvider: 'pollinations',
      defaultModel: 'openai',
      systemPrompt: '',
      temperature: 0.7,
      maxTokens: 4096,
      contextMessages: 24,
      stream: true,
      showReasoning: true,
      reasoningEffort: 'medium',
      autoTitle: true,
      sendOnEnter: true,
      autoSpeak: false,
      maxSteps: 12,
      showTimestamps: true,
    },
    providers: [],
    models: {
      hidden: [],
      pinned: [],
      aliases: {},
    },
    permissions: {
      mode: 'workspace',
      roots: [dirs.workspace, dirs.desktop, dirs.documents, dirs.downloads],
      deniedPaths: [],
      autoApproveReads: true,
      confirmWrites: true,
      shell: {
        mode: 'confirm',
        allowlist: ['ls', 'dir', 'echo', 'git status', 'git log', 'node -v', 'npm -v', 'python --version'],
        denylist: [
          'rm -rf /',
          'rm -rf /*',
          'mkfs',
          'dd if=',
          'format c:',
          'del /f /s /q c:',
          'shutdown',
          'reg delete',
          'vssadmin delete',
          'cipher /w',
        ],
        timeout: 120000,
      },
      browser: { confirmNavigation: false },
      media: { confirmGenerate: false },
    },
    memory: {
      enabled: true,
      maxItems: 500,
      autoSave: true,
    },
    skills: {
      enabled: [
        'web-research', 'coding', 'cyberpunk-design', 'image-prompt',
        'music-producer', 'terminal', 'planner', 'prompt-engineer',
      ],
      custom: [],
    },
    voice: {
      sttLanguage: 'ru-RU',
      ttsEnabled: false,
      ttsVoice: '',
      rate: 1.05,
      pitch: 1,
      autoSend: false,
      pushToTalk: true,
      hotkey: 'Ctrl+Shift+Space',
    },
    media: {
      imageProvider: 'pollinations',
      imageModel: 'flux',
      musicProvider: 'procedural',
      videoProvider: 'slideshow',
      saveFolder: '',
      defaultWidth: 1024,
      defaultHeight: 1024,
      replicateKey: '',
      stabilityKey: '',
      hfToken: '',
    },
    browser: {
      homePage: 'https://duckduckgo.com',
      adBlock: true,
      userAgent: '',
    },
    terminal: {
      fontSize: 13,
      shell: 'auto',
    },
    search: {
      engine: 'auto',
      maxResults: 8,
      braveKey: '',
      tavilyKey: '',
      searxUrl: '',
    },
    updates: { auto: false },
    onboardingDone: false,
  };
}

function syncPresets(config) {
  const existing = Array.isArray(config.providers) ? config.providers : [];
  const byId = new Map(existing.map((p) => [p.id, p]));
  const result = [];
  for (const preset of PRESETS.providers) {
    const cur = byId.get(preset.id);
    const defaultEnabled = preset.noKey === true || preset.local === true;
    if (!cur) {
      result.push({
        ...preset,
        apiKey: '',
        enabled: preset.custom ? false : defaultEnabled,
        presetVersion: PRESETS.version,
      });
      continue;
    }
    const upgrading = (cur.presetVersion || 0) < PRESETS.version;
    const baseModels = Array.from(new Set([...(preset.models || []), ...(cur.models || [])]));
    const merged = {
      ...preset,
      ...cur,
      models: filterFreeModels(preset.id, baseModels),
      tagline: upgrading ? preset.tagline : (cur.tagline ?? preset.tagline),
      docsUrl: preset.docsUrl ?? cur.docsUrl,
      keyUrl: preset.keyUrl ?? cur.keyUrl,
      keyHint: preset.keyHint ?? cur.keyHint,
      badge: preset.badge,
      color: cur.color ?? preset.color,
      free: true,
      noKey: preset.noKey,
      accessType: preset.accessType,
      type: cur.type ?? preset.type,
      modelFetch: cur.modelFetch ?? preset.modelFetch,
      builtin: preset.builtin,
      presetVersion: PRESETS.version,
    };
    if (upgrading && preset.id === 'opencode') merged.enabled = true;
    result.push(merged);
  }
  // keep user-created custom providers, drop removed paid builtin presets
  for (const p of existing) {
    if (!PRESETS.providers.some((x) => x.id === p.id) && !REMOVED_PAID_BUILTIN_IDS.has(p.id)) {
      result.push(p);
    }
  }
  config.providers = result;
  if (config.chat && !result.some((p) => p.id === config.chat.defaultProvider)) {
    config.chat.defaultProvider = 'opencode';
    config.chat.defaultModel = 'tidepool-alpha-free';
  }
  if (config.chat?.defaultProvider === 'pollinations' && /^(deepseek|llama|openai-reasoning)/i.test(String(config.chat?.defaultModel || ''))) {
    config.chat.defaultModel = 'openai';
  }
  if (config.permissions && Array.isArray(config.permissions.roots)) {
    const dirs = get();
    const extraRoots = [dirs.workspace, dirs.desktop, dirs.documents, dirs.downloads].filter(Boolean);
    config.permissions.roots = Array.from(new Set([...config.permissions.roots, ...extraRoots]));
  }
  return config;
}

class Store {
  constructor() {
    this.data = null;
    this.file = null;
    this.listeners = new Set();
  }

  init() {
    const dirs = get();
    this.file = path.join(dirs.config, 'config.json');
    let raw = {};
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      raw = {};
    }
    this.data = deepMerge(createDefaultConfig(), raw);
    this.data = syncPresets(this.data);
    this.save();
    return this.data;
  }

  get(dotPath) {
    if (!this.data) this.init();
    return dotPath ? getPath(this.data, dotPath) : this.data;
  }

  set(dotPath, value, { strict = false } = {}) {
    if (!this.data) this.init();
    const previous = strict ? this.get(dotPath) : undefined;
    setPath(this.data, dotPath, value);
    try { this.save(strict); }
    catch (err) { if (strict) setPath(this.data, dotPath, previous); throw err; }
    this.emit(dotPath, value);
    return value;
  }

  patch(partial) {
    if (!this.data) this.init();
    this.data = deepMerge(this.data, partial);
    this.save();
    this.emit('*', partial);
    return this.data;
  }

  reset() {
    this.data = createDefaultConfig();
    this.data = syncPresets(this.data);
    this.save();
    this.emit('*', this.data);
    return this.data;
  }

  save(strict = false) {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      if (strict) throw err;
      console.error('Failed to save config', err);
    }
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(key, value) {
    for (const fn of this.listeners) {
      try {
        fn(key, value);
      } catch (err) {
        console.error(err);
      }
    }
  }

  exportTo(filePath) {
    const data = { ...this.data };
    if (Array.isArray(data.providers)) {
      data.providers = data.providers.map((p) => ({ ...p, apiKey: p.apiKey ? '<encrypted>' : '' }));
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return filePath;
  }

  importFrom(filePath) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const merged = deepMerge(createDefaultConfig(), raw);
    // keep existing keys when imported file has placeholders
    const oldProviders = this.data?.providers || [];
    for (const p of merged.providers || []) {
      if (p.apiKey === '<encrypted>') {
        const old = oldProviders.find((x) => x.id === p.id);
        if (old?.apiKey) p.apiKey = old.apiKey;
      }
    }
    this.data = syncPresets(merged);
    this.save();
    this.emit('*', this.data);
    return this.data;
  }

  newProviderId() {
    return `custom-${uid(6)}`;
  }
}

module.exports = new Store();
module.exports.createDefaultConfig = createDefaultConfig;
module.exports.syncPresets = syncPresets;
