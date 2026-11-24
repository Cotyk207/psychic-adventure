'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { deepMerge, getPath, setPath, uid } = require('./util');
const { get } = require('./paths');

const PRESETS = require('../../shared/providers.json');

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
    if (!cur) {
      result.push({
        ...preset,
        apiKey: '',
        enabled: preset.id === 'pollinations' || preset.local === true,
        presetVersion: PRESETS.version,
      });
      continue;
    }
    // Refresh preset metadata (models, docs, colors) but keep user's key & flags.
    const merged = { ...preset, ...cur, presetVersion: PRESETS.version };
    if (Array.isArray(preset.models)) {
      merged.models = Array.from(new Set([...(cur.models || []), ...preset.models]));
    }
    merged.tagline = cur.tagline ?? preset.tagline;
    merged.docsUrl = cur.docsUrl ?? preset.docsUrl;
    merged.keyUrl = cur.keyUrl ?? preset.keyUrl;
    merged.keyHint = cur.keyHint ?? preset.keyHint;
    merged.badge = cur.badge ?? preset.badge;
    merged.color = cur.color ?? preset.color;
    merged.free = cur.free ?? preset.free;
    merged.type = cur.type ?? preset.type;
    merged.modelFetch = cur.modelFetch ?? preset.modelFetch;
    merged.builtin = preset.builtin;
    result.push(merged);
  }
  // keep user-created providers
  for (const p of existing) {
    if (!PRESETS.providers.some((x) => x.id === p.id)) result.push(p);
  }
  config.providers = result;
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

  set(dotPath, value) {
    if (!this.data) this.init();
    setPath(this.data, dotPath, value);
    this.save();
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

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
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
