import PRESETS from '@shared/providers.json';
import MODELS_DATA from '@shared/models.json';
import { APP_VERSION, BUILTIN_SKILLS } from 'virtual:psychic-bundled';
import { getModelMeta, resolveEffortForModel } from './models';
import { generateProceduralImageDataUrl } from './proceduralImage';

const STORAGE_KEYS = {
  config: 'psychic:mobile:v4:config',
  chats: 'psychic:mobile:v4:chats',
  memory: 'psychic:mobile:v4:memory',
  tasks: 'psychic:mobile:v4:tasks',
  skills: 'psychic:mobile:v4:skills',
  vfs: 'psychic:mobile:v4:vfs',
};

const REMOVED_PAID_BUILTIN_IDS = new Set(['openai', 'anthropic', 'deepseek', 'xai', 'moonshot']);

const uid = (len = 10) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const deepClone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function deepMerge(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source === undefined ? target : source;
  const out = { ...(target && typeof target === 'object' && !Array.isArray(target) ? target : {}) };
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const sv = source[key];
    const tv = out[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      out[key] = deepMerge(tv, sv);
    } else if (sv !== undefined) {
      out[key] = sv;
    }
  }
  return out;
}

function getByPath(obj, dotPath) {
  if (!dotPath) return obj;
  return String(dotPath).split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function setByPath(obj, dotPath, value) {
  const parts = String(dotPath).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function filterFreeModels(providerOrId, models) {
  const providerId = typeof providerOrId === 'object' && providerOrId ? providerOrId.id : providerOrId;
  const list = Array.isArray(models) ? models : [];
  // Mixed-price catalogs must never expose paid models as free. BlockRun and
  // OVHcloud use a curated list; Kilo marks free models explicitly.
  if (providerId === 'kilo') {
    return list.filter((m) => String(m) === 'kilo-auto/free' || /:free$/i.test(String(m)));
  }
  if (providerId === 'blockrun' || providerId === 'ovhcloud' || providerId === 'vireonix') {
    const allowed = new Set(PRESETS.providers.find((p) => p.id === providerId)?.models || []);
    return list.filter((m) => allowed.has(String(m)));
  }
  if (providerId === 'openrouter') {
    return list.filter((m) => /:free$/i.test(String(m)) || String(m) === 'openrouter/free');
  }
  if (providerId === 'together') {
    return list.filter((m) => /-free$/i.test(String(m)) || /exaone/i.test(String(m)));
  }
  if (providerId === 'zhipu') {
    return list.filter((m) => /flash/i.test(String(m)));
  }
  if (providerId === 'opencode') {
    return list.filter((m) => {
      const s = String(m);
      if (/embed|bge-|jev-|decision|live|imagine|image/i.test(s)) return false;
      return /-free$/i.test(s) || s === 'big-pickle';
    });
  }
  if (providerId === 'pollinations') {
    const deprecatedClassic = new Set(['deepseek', 'deepseek-reasoning', 'llama', 'openai-reasoning']);
    return list.filter((m) => !deprecatedClassic.has(String(m).toLowerCase()));
  }
  return list;
}

function createDefaultConfig() {
  return {
    version: 1,
    presetVersion: PRESETS.version,
    general: {
      language: 'ru',
      userName: '',
      workspace: '',
      autoLaunch: false,
      minimizeToTray: false,
      notifications: true,
      soundEffects: true,
      confirmDangerous: true,
      telemetry: false,
    },
    appearance: {
      theme: 'nightcity',
      customTheme: null,
      wallpaper: 'theme',
      wallpaperOpacity: 0.36,
      blur: 18,
      fx: true,
      particles: true,
      scanlines: true,
      grid: true,
      glow: true,
      animations: true,
      showSplash: true,
      fontScale: 1,
      density: 'comfortable',
      radius: 14,
      sidebarCollapsed: false,
    },
    chat: {
      defaultProvider: 'opencode',
      defaultModel: 'tidepool-alpha-free',
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      autoTitle: true,
      showReasoning: true,
      reasoningEffort: 'medium',
      markdownRender: true,
      codeTheme: 'cyber',
      sendOnEnter: true,
      maxSteps: 12,
      systemSupplement: '',
      pinnedModels: ['opencode::tidepool-alpha-free', 'opencode::deepseek-v4.1-flash-free'],
      prompts: [],
    },
    providers: PRESETS.providers.map((p) => ({
      ...p,
      apiKey: '',
      enabled: p.noKey === true || p.local === true,
      presetVersion: PRESETS.version,
    })),
    skills: {
      enabled: ['coding', 'web-research', 'file-manager', 'planner'],
    },
    memory: {
      enabled: true,
      autoSave: true,
      maxInjected: 8,
    },
    permissions: {
      mode: 'workspace',
      shellMode: 'auto',
      autoApproveReads: true,
      confirmGenerate: false,
      confirmNavigation: false,
      allowedPaths: [],
      deniedPaths: [],
      shellAllowlist: ['ls', 'pwd', 'cat', 'echo', 'date', 'whoami'],
      shellDenylist: ['rm -rf /'],
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
      shell: 'android-sh',
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
    const baseModels = Array.from(new Set([...(preset.models || []), ...(cur.models || [])]));
    result.push({
      ...preset,
      ...cur,
      models: filterFreeModels(preset.id, baseModels),
      free: true,
      noKey: preset.noKey,
      accessType: preset.accessType,
      badge: preset.badge,
      presetVersion: PRESETS.version,
    });
  }
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
  return config;
}

// ── Нативный HTTP / SSE клиент (Android Java bridge или fetch fallback) ───
const pendingNativeHttp = new Map();

if (typeof window !== 'undefined' && !window.__psychicNativeEvent) {
  window.__psychicNativeEvent = (msg) => {
    if (!msg || !msg.reqId) return;
    const entry = pendingNativeHttp.get(msg.reqId);
    if (entry) entry.onEvent(msg);
  };
}

async function* streamHttpRequest({ url, method = 'GET', headers = {}, body = null, signal }) {
  const native = typeof window !== 'undefined' ? window.PsychicAndroid : null;
  if (native && typeof native.streamHttp === 'function') {
    const reqId = `req-${Date.now()}-${uid(6)}`;
    const queue = [];
    let notify = null;
    let finished = false;
    let errorObj = null;

    const wake = () => {
      if (notify) {
        const fn = notify;
        notify = null;
        fn();
      }
    };

    pendingNativeHttp.set(reqId, {
      onEvent(ev) {
        if (ev.event === 'chunk') {
          queue.push({ type: 'chunk', status: ev.status, data: ev.data || '' });
          wake();
        } else if (ev.event === 'binary') {
          queue.push({ type: 'binary', status: ev.status, mime: ev.mime || 'application/octet-stream', data: ev.data || '' });
          finished = true;
          wake();
        } else if (ev.event === 'end') {
          finished = true;
          wake();
        } else if (ev.event === 'error') {
          const err = new Error(ev.data || `HTTP ${ev.status}`);
          err.status = ev.status || 0;
          errorObj = err;
          finished = true;
          wake();
        }
      },
    });

    const onAbort = () => {
      try { native.abortHttp(reqId); } catch {}
      const err = new Error('Запрос остановлен');
      err.code = 'ABORTED';
      errorObj = err;
      finished = true;
      wake();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    try {
      native.streamHttp(reqId, url, method, JSON.stringify(headers || {}), body ? String(body) : '');
      while (true) {
        while (queue.length > 0) {
          yield queue.shift();
        }
        if (errorObj) throw errorObj;
        if (finished) break;
        await new Promise((r) => { notify = r; });
      }
    } finally {
      pendingNativeHttp.delete(reqId);
      if (signal) signal.removeEventListener?.('abort', onAbort);
    }
    return;
  }

  // Fallback для браузера / jsdom E2E-тестов
  const cleanHeaders = { ...headers };
  const res = await fetch(url, {
    method,
    headers: cleanHeaders,
    body: body && method !== 'GET' && method !== 'HEAD' ? body : undefined,
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(errText || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.startsWith('image/') || ct.startsWith('audio/') || ct.startsWith('application/octet-stream')) {
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    yield { type: 'binary', status: res.status, mime: ct.split(';')[0] || 'image/png', data: btoa(bin) };
    return;
  }
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    yield { type: 'chunk', status: res.status, data: text };
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) yield { type: 'chunk', status: res.status, data: chunk };
  }
  const tail = decoder.decode();
  if (tail) yield { type: 'chunk', status: res.status, data: tail };
}

async function fetchText(url, opts = {}) {
  let out = '';
  for await (const part of streamHttpRequest({ url, ...opts })) {
    if (part.type === 'chunk') out += part.data;
  }
  return out;
}

async function fetchBinaryDataUrl(url, opts = {}) {
  for await (const part of streamHttpRequest({ url, ...opts })) {
    if (part.type === 'binary') {
      return `data:${part.mime};base64,${part.data}`;
    }
  }
  throw new Error('Не удалось получить бинарные данные');
}

// ── Парсер потоковых <think>…</think> ─────────────────────────────────────
function createThinkParser() {
  const OPEN = '<think>';
  const CLOSE = '</think>';
  let inThink = false;
  let buffer = '';

  return {
    feed(chunk) {
      if (!chunk) return [];
      buffer += chunk;
      const out = [];
      while (buffer.length > 0) {
        if (!inThink) {
          const idx = buffer.indexOf(OPEN);
          if (idx >= 0) {
            if (idx > 0) out.push({ type: 'text', text: buffer.slice(0, idx) });
            buffer = buffer.slice(idx + OPEN.length);
            inThink = true;
            continue;
          }
          let keep = 0;
          for (let len = Math.min(OPEN.length - 1, buffer.length); len > 0; len--) {
            if (OPEN.startsWith(buffer.slice(-len))) { keep = len; break; }
          }
          const emitLen = buffer.length - keep;
          if (emitLen > 0) {
            out.push({ type: 'text', text: buffer.slice(0, emitLen) });
            buffer = buffer.slice(emitLen);
          }
          break;
        } else {
          const idx = buffer.indexOf(CLOSE);
          if (idx >= 0) {
            if (idx > 0) out.push({ type: 'reasoning', text: buffer.slice(0, idx) });
            buffer = buffer.slice(idx + CLOSE.length).replace(/^\r?\n/, '');
            inThink = false;
            continue;
          }
          let keep = 0;
          for (let len = Math.min(CLOSE.length - 1, buffer.length); len > 0; len--) {
            if (CLOSE.startsWith(buffer.slice(-len))) { keep = len; break; }
          }
          const emitLen = buffer.length - keep;
          if (emitLen > 0) {
            out.push({ type: 'reasoning', text: buffer.slice(0, emitLen) });
            buffer = buffer.slice(emitLen);
          }
          break;
        }
      }
      return out;
    },
    flush() {
      if (!buffer) return [];
      const item = { type: inThink ? 'reasoning' : 'text', text: buffer };
      buffer = '';
      return [item];
    },
  };
}

function joinUrl(base, endpoint) {
  const b = String(base || '').replace(/\/+$/, '');
  const e = String(endpoint || '').replace(/^\/+/, '');
  return `${b}/${e}`;
}

function formatProviderHttpError(err, providerName = 'API') {
  const status = Number(err?.status) || 0;
  const raw = String(err?.message || err || '').trim();
  let detail = raw;
  let errorType = '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const errObj = parsed.error && typeof parsed.error === 'object' ? parsed.error : null;
      errorType = String(errObj?.type || errObj?.code || parsed.type || '');
      detail = String(
        errObj?.message
        || (typeof parsed.error === 'string' ? parsed.error : '')
        || parsed.message
        || raw
      ).trim();
    }
  } catch {}
  const combined = `${errorType} ${detail}`.toLowerCase();
  const lowerName = String(providerName).toLowerCase();
  let hint = '';
  if (/freeusagelimiterror/i.test(combined)) {
    hint = 'Исчерпан бесплатный лимит публичного пула OpenCode. Переключись на Pollinations.AI или укажи бесплатный ключ (Groq / Gemini / OpenRouter).';
  } else if (status === 402 && lowerName.includes('hugging')) {
    hint = 'Исчерпаны бесплатные месячные кредиты Hugging Face Inference. Переключись на Pollinations.AI, Groq или Google Gemini.';
  } else if (status === 404 && /classic api/i.test(combined)) {
    hint = 'Эта модель отключена в бесплатном Classic API Pollinations — используй openai, openai-fast, qwen-coder, mistral или gemini.';
  } else if (status === 429) {
    hint = 'Превышен лимит запросов (rate limit). Подожди немного или смени бесплатный провайдер.';
  }
  const formatted = new Error(
    status
      ? `${providerName} ${status}${hint ? ` — ${hint}` : (detail ? `: ${detail.slice(0, 260)}` : '')}`
      : (detail || 'Ошибка запроса к провайдеру')
  );
  formatted.status = status;
  if (err?.code) formatted.code = err.code;
  return formatted;
}
function buildProviderHeaders(provider) {
  const h = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (provider.id === 'opencode') {
    h.Authorization = `Bearer ${provider.apiKey || 'public'}`;
    h['User-Agent'] = 'opencode/stable/1.0.0/opencode';
  } else if (provider.apiKey && provider.id !== 'ovhcloud' && provider.id !== 'vireonix') {
    h.Authorization = `Bearer ${provider.apiKey}`;
  }
  if (provider.id === 'openrouter') {
    h['HTTP-Referer'] = 'https://github.com/Cotyk207/psychic-adventure';
    h['X-Title'] = 'PSYCHIC Android';
  }
  return h;
}

const MOBILE_TOOLS = [
  {
    name: 'write_file',
    description: 'Записать текстовый файл в рабочую папку на устройстве.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Путь к файлу (например notes.md)' },
        content: { type: 'string', description: 'Содержимое файла' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Прочитать текстовый файл из рабочей папки устройства.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'list_directory',
    description: 'Показать список файлов и папок в директории.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Путь (по умолчанию рабочая папка)' } },
    },
  },
  {
    name: 'web_search',
    description: 'Поиск актуальной информации в интернете через DuckDuckGo.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Загрузить веб-страницу по ссылке и извлечь читаемый текст.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'generate_image',
    description: 'Бесплатно сгенерировать изображение по текстовому описанию.',
    parameters: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'memory_save',
    description: 'Сохранить важный факт о пользователе или задаче в долгосрочную память.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
  },
];

export function createMobileBridge() {
  const listeners = new Map();
  const emit = (channel, data) => {
    for (const fn of listeners.get(channel) || []) {
      try { fn(deepClone(data)); } catch {}
    }
  };

  const native = typeof window !== 'undefined' ? window.PsychicAndroid : null;
  const hasNativeFs = Boolean(native && typeof native.fsPaths === 'function');

  // Загружаем состояния из localStorage
  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const writeJson = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  };

  let config = syncPresets(deepMerge(createDefaultConfig(), readJson(STORAGE_KEYS.config, {})));
  writeJson(STORAGE_KEYS.config, config);

  let chats = readJson(STORAGE_KEYS.chats, []);
  let memories = readJson(STORAGE_KEYS.memory, []);
  let tasks = readJson(STORAGE_KEYS.tasks, []);
  let customSkills = readJson(STORAGE_KEYS.skills, []);

  // Виртуальная ФС (используется как кэш бинарных dataUrl и как fallback вне Android APK)
  const defaultPaths = (() => {
    if (hasNativeFs) {
      try {
        const parsed = JSON.parse(native.fsPaths());
        if (parsed.workspace) return parsed;
      } catch {}
    }
    const base = '/storage/emulated/0/Android/data/ai.psychic.neural/files';
    return {
      home: base,
      userData: base,
      config: base,
      workspace: `${base}/PSYCHIC Workspace`,
      media: `${base}/media`,
      images: `${base}/media/images`,
      music: `${base}/media/music`,
      musicLibrary: `${base}/media/music`,
      videos: `${base}/media/videos`,
      skills: `${base}/skills`,
      documents: `${base}/Documents`,
      downloads: `${base}/Downloads`,
      desktop: `${base}/PSYCHIC Workspace`,
    };
  })();

  let vfs = readJson(STORAGE_KEYS.vfs, null);
  if (!vfs || typeof vfs !== 'object') {
    vfs = {
      [`${defaultPaths.workspace}/README.md`]: {
        type: 'file',
        content: '# PSYCHIC Android Workspace\n\nЛокальная рабочая папка ИИ-ассистента на твоём смартфоне.\n',
        modified: Date.now(),
      },
    };
    writeJson(STORAGE_KEYS.vfs, vfs);
  }
  if (hasNativeFs) {
    try {
      const existing = native.fsReadText(`${defaultPaths.workspace}/README.md`);
      if (!existing) {
        native.fsWriteText(
          `${defaultPaths.workspace}/README.md`,
          '# PSYCHIC Android Workspace\n\nЛокальная рабочая папка ИИ-ассистента на твоём смартфоне.\n'
        );
      }
    } catch {}
  }

  const normalizePath = (p) => {
    const raw = String(p || '').trim();
    if (!raw || raw === '.') return defaultPaths.workspace;
    if (raw.startsWith('/')) return raw.replace(/\/+$/, '') || '/';
    return `${defaultPaths.workspace}/${raw}`.replace(/\/+/g, '/');
  };

  const mimeFromExt = (name = '') => {
    const ext = String(name).split('.').pop()?.toLowerCase();
    if (ext === 'png') return 'image/png';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'webm') return 'video/webm';
    if (ext === 'mp4') return 'video/mp4';
    return 'application/octet-stream';
  };

  const fsWrite = (targetPath, content) => {
    const full = normalizePath(targetPath);
    if (hasNativeFs) {
      native.fsWriteText(full, String(content ?? ''));
    }
    vfs[full] = { type: 'file', content: String(content ?? ''), modified: Date.now() };
    writeJson(STORAGE_KEYS.vfs, vfs);
    return full;
  };

  const fsWriteDataUrl = (targetPath, dataUrl) => {
    const full = normalizePath(targetPath);
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
    if (hasNativeFs && match) {
      native.fsWriteBase64(full, match[2]);
    }
    vfs[full] = { type: 'file', dataUrl: String(dataUrl), size: match ? Math.floor(match[2].length * 0.75) : 0, modified: Date.now() };
    writeJson(STORAGE_KEYS.vfs, vfs);
    return full;
  };

  const fsReadText = (targetPath) => {
    const full = normalizePath(targetPath);
    if (hasNativeFs) {
      const txt = native.fsReadText(full);
      if (txt) return txt;
    }
    return vfs[full]?.content ?? '';
  };

  const fsReadDataUrl = (targetPath) => {
    const full = normalizePath(targetPath);
    if (vfs[full]?.dataUrl) return vfs[full].dataUrl;
    if (hasNativeFs) {
      const b64 = native.fsReadBase64(full);
      if (b64) return `data:${mimeFromExt(full)};base64,${b64}`;
    }
    if (vfs[full]?.content != null) {
      return `data:text/plain;base64,${btoa(unescape(encodeURIComponent(vfs[full].content)))}`;
    }
    return null;
  };

  const fsListDir = (dirPath, showHidden = false) => {
    const dir = normalizePath(dirPath);
    if (hasNativeFs) {
      try {
        const parsed = JSON.parse(native.fsList(dir, Boolean(showHidden)));
        if (Array.isArray(parsed.entries)) {
          return { path: parsed.path || dir, entries: parsed.entries };
        }
      } catch {}
    }
    const prefix = dir === '/' ? '/' : `${dir}/`;
    const map = new Map();
    for (const baseDir of [
      defaultPaths.workspace,
      defaultPaths.media,
      defaultPaths.images,
      defaultPaths.music,
      defaultPaths.videos,
      defaultPaths.documents,
      defaultPaths.downloads,
    ]) {
      if (baseDir.startsWith(prefix)) {
        const rest = baseDir.slice(prefix.length).split('/')[0];
        if (rest && !map.has(rest)) {
          map.set(rest, { name: rest, path: `${dir}/${rest}`, type: 'directory', size: 0, modified: Date.now() });
        }
      }
    }
    for (const [k, item] of Object.entries(vfs)) {
      if (!k.startsWith(prefix)) continue;
      const rel = k.slice(prefix.length);
      if (!rel) continue;
      const seg = rel.split('/')[0];
      if (!showHidden && seg.startsWith('.')) continue;
      if (rel.includes('/')) {
        if (!map.has(seg)) {
          map.set(seg, { name: seg, path: `${dir}/${seg}`, type: 'directory', size: 0, modified: item.modified || Date.now() });
        }
      } else {
        map.set(seg, {
          name: seg,
          path: k,
          type: item.type || 'file',
          size: item.size ?? (item.content ? item.content.length : 0),
          modified: item.modified || Date.now(),
        });
      }
    }
    return {
      path: dir,
      entries: Array.from(map.values()).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)),
    };
  };

  const fsDelete = (targetPath) => {
    const full = normalizePath(targetPath);
    if (hasNativeFs) native.fsDelete(full);
    for (const k of Object.keys(vfs)) {
      if (k === full || k.startsWith(`${full}/`)) delete vfs[k];
    }
    writeJson(STORAGE_KEYS.vfs, vfs);
    return true;
  };

  // Ожидание рендера процедурной музыки/видео из MediaRenderer.jsx и интеракций
  const pendingRenderTasks = new Map();
  const pendingInteractions = new Map();
  let clipboardFallback = '';

  const requestRendererMedia = (kind, params) =>
    new Promise((resolve, reject) => {
      const id = `render-${Date.now()}-${uid(5)}`;
      const timer = setTimeout(() => {
        pendingRenderTasks.delete(id);
        reject(new Error('Таймаут генерации медиа'));
      }, 45000);
      pendingRenderTasks.set(id, { resolve, reject, timer });
      emit('media:render', { id, kind, payload: params });
    });

  // ── Состояние встроенного ридер-браузера ────────────────────────────────
  let browserState = {
    url: '',
    title: '',
    visible: false,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    readerMode: true,
    text: '',
  };
  const browserHistory = [];
  let browserIdx = -1;

  const stripHtmlToText = (html) => {
    const titleMatch = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '';
    const cleaned = String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { title, text: cleaned };
  };

  // ── Мобильный интерактивный терминал ────────────────────────────────────
  const terminals = new Map();

  const runShellCommand = async (cmdLine, cwd = defaultPaths.workspace) => {
    const trimmed = String(cmdLine || '').trim();
    if (!trimmed) return { output: '', cwd };
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const argStr = trimmed.slice(cmd.length).trim();

    if (cmd === 'help') {
      return {
        cwd,
        output: [
          'PSYCHIC Mobile Shell — доступные команды:',
          '  ls [path]        — список файлов',
          '  cd <dir>         — сменить директорию',
          '  pwd              — текущая папка',
          '  cat <file>       — вывести содержимое файла',
          '  mkdir <dir>      — создать папку',
          '  rm <path>        — удалить файл/папку',
          '  echo <text>      — вывести текст',
          '  whoami / uname   — информация о системе',
          '  date             — текущие дата и время',
          '  curl <url>       — загрузить URL (без CORS)',
          '  js <выражение>   — вычислить JS-выражение',
          '  clear            — очистить экран',
        ].join('\r\n'),
      };
    }
    if (cmd === 'pwd') return { cwd, output: cwd };
    if (cmd === 'whoami') return { cwd, output: 'psychic@android' };
    if (cmd === 'uname') return { cwd, output: 'Linux Android arm64 PSYCHIC-Neural-Mobile' };
    if (cmd === 'date') return { cwd, output: new Date().toLocaleString('ru-RU') };
    if (cmd === 'echo') return { cwd, output: argStr };
    if (cmd === 'cd') {
      const next = !argStr || argStr === '~' ? defaultPaths.workspace : normalizePath(argStr.startsWith('/') ? argStr : `${cwd}/${argStr}`);
      return { cwd: next, output: '' };
    }
    if (cmd === 'ls') {
      const target = argStr ? (argStr.startsWith('/') ? argStr : `${cwd}/${argStr}`) : cwd;
      const listed = fsListDir(target, true);
      const lines = listed.entries.map((e) => (e.type === 'directory' ? `\x1b[36m${e.name}/\x1b[0m` : `${e.name}  (${e.size} B)`));
      return { cwd, output: lines.join('\r\n') || '(пусто)' };
    }
    if (cmd === 'cat') {
      if (!argStr) return { cwd, output: 'Укажи имя файла: cat <file>' };
      const target = argStr.startsWith('/') ? argStr : `${cwd}/${argStr}`;
      return { cwd, output: fsReadText(target).replace(/\n/g, '\r\n') || '(файл пуст или не найден)' };
    }
    if (cmd === 'mkdir') {
      if (!argStr) return { cwd, output: 'Укажи папку: mkdir <dir>' };
      const target = normalizePath(argStr.startsWith('/') ? argStr : `${cwd}/${argStr}`);
      if (hasNativeFs) native.fsMkdir(target);
      vfs[`${target}/.keep`] = { type: 'file', content: '', modified: Date.now() };
      writeJson(STORAGE_KEYS.vfs, vfs);
      return { cwd, output: `Создано: ${target}` };
    }
    if (cmd === 'rm') {
      if (!argStr) return { cwd, output: 'Укажи путь: rm <path>' };
      const target = argStr.startsWith('/') ? argStr : `${cwd}/${argStr}`;
      fsDelete(target);
      return { cwd, output: `Удалено: ${target}` };
    }
    if (cmd === 'curl') {
      if (!argStr) return { cwd, output: 'Укажи ссылку: curl https://...' };
      try {
        const txt = await fetchText(argStr);
        return { cwd, output: txt.slice(0, 4000).replace(/\n/g, '\r\n') };
      } catch (err) {
        return { cwd, output: `Ошибка curl: ${err.message}` };
      }
    }
    if (cmd === 'js') {
      try {
        // eslint-disable-next-line no-new-func
        const val = Function(`"use strict"; return (${argStr});`)();
        return { cwd, output: String(typeof val === 'object' ? JSON.stringify(val, null, 2) : val).replace(/\n/g, '\r\n') };
      } catch (err) {
        return { cwd, output: `Ошибка: ${err.message}` };
      }
    }
    return { cwd, output: `Команда не найдена: ${cmd} (введи help для списка команд)` };
  };

  // ── Стриминг к провайдерам (OpenAI-совместимые + Gemini) ────────────────
  async function* streamOpenAICompat({ provider, model, messages, tools, temperature, maxTokens, reasoningEffort, signal }) {
    const meta = getModelMeta(provider.id, model);
    const headers = buildProviderHeaders(provider);
    const openAiMessages = messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: String(m.content || '').slice(0, 40000) };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || '',
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          })),
        };
      }
      if (m.role === 'user' && Array.isArray(m.content)) {
        return {
          role: 'user',
          content: m.content.map((p) =>
            p.type === 'image' ? { type: 'image_url', image_url: { url: p.dataUrl } } : { type: 'text', text: p.text || '' }
          ),
        };
      }
      return { role: m.role, content: String(m.content || '') };
    });

    const buildBody = (withTools, withEffort) => {
      const b = {
        model,
        messages: openAiMessages,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens || 4096,
        stream: true,
      };
      if (withTools && tools?.length && provider.supportsTools !== false) {
        b.tools = tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
        b.tool_choice = 'auto';
      }
      if (withEffort && reasoningEffort && MODELS_DATA.efforts[reasoningEffort]) {
        const spec = MODELS_DATA.efforts[reasoningEffort];
        b.reasoning_effort = spec.openaiEffort || reasoningEffort;
      }
      return b;
    };

    const attemptStream = async function* (withTools, withEffort) {
      const url = joinUrl(provider.baseUrl, '/chat/completions');
      const bodyStr = JSON.stringify(buildBody(withTools, withEffort));
      const thinkParser = createThinkParser();
      const toolMap = new Map();
      let sseBuf = '';

      for await (const part of streamHttpRequest({ url, method: 'POST', headers, body: bodyStr, signal })) {
        if (part.type !== 'chunk') continue;
        sseBuf += part.data;
        const lines = sseBuf.split(/\r?\n/);
        sseBuf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let json = null;
          try { json = JSON.parse(payload); } catch { continue; }
          if (json.usage) yield { type: 'usage', usage: json.usage };
          const delta = json.choices?.[0]?.delta || json.choices?.[0]?.message;
          if (!delta) continue;
          const rDelta = delta.reasoning_content || delta.reasoning;
          if (typeof rDelta === 'string' && rDelta) {
            yield { type: 'reasoning', text: rDelta };
          }
          if (typeof delta.content === 'string' && delta.content) {
            for (const item of thinkParser.feed(delta.content)) yield item;
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolMap.has(idx)) toolMap.set(idx, { id: tc.id || `call_${idx}`, name: '', args: '' });
              const cur = toolMap.get(idx);
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.name += tc.function.name;
              if (tc.function?.arguments) cur.args += tc.function.arguments;
            }
          }
        }
      }
      for (const item of thinkParser.flush()) yield item;
      for (const [, tc] of toolMap) {
        if (tc.name) {
          let parsedArgs = {};
          try { parsedArgs = JSON.parse(tc.args || '{}'); } catch {}
          yield { type: 'tool_call', id: tc.id, name: tc.name, arguments: parsedArgs };
        }
      }
    };

    const hasTools = Boolean(tools?.length && provider.supportsTools !== false);
    const hasEffort = Boolean(reasoningEffort && meta.efforts?.length);
    try {
      yield* attemptStream(hasTools, hasEffort);
    } catch (err) {
      if (
        provider.id === 'pollinations'
        && !provider.apiKey
        && (err.status === 404 || err.status === 400)
        && model !== 'openai'
      ) {
        model = 'openai';
        yield* attemptStream(hasTools, false);
        return;
      }
      if (hasEffort && (err.status === 400 || err.status === 422)) {
        try {
          yield* attemptStream(hasTools, false);
          return;
        } catch (err2) {
          if (hasTools && (err2.status === 400 || err2.status === 422 || err2.status === 404)) {
            yield* attemptStream(false, false);
            return;
          }
          throw formatProviderHttpError(err2, provider.name);
        }
      }
      if (hasTools && (err.status === 400 || err.status === 422 || err.status === 404)) {
        yield* attemptStream(false, false);
        return;
      }
      throw formatProviderHttpError(err, provider.name);
    }
  }

  async function* streamGemini({ provider, model, messages, tools, temperature, maxTokens, reasoningEffort, signal }) {
    const key = encodeURIComponent(provider.apiKey || '');
    const url = `${String(provider.baseUrl).replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${key}`;
    const systemMsg = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));

    const generationConfig = {
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens || 4096,
    };
    if (reasoningEffort && MODELS_DATA.efforts[reasoningEffort] && /2\.5|thinking/i.test(model)) {
      generationConfig.thinkingConfig = {
        thinkingBudget: MODELS_DATA.efforts[reasoningEffort].geminiBudget ?? 4096,
        includeThoughts: reasoningEffort !== 'none',
      };
    }

    const body = { contents, generationConfig };
    if (systemMsg?.content) body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    if (tools?.length) {
      body.tools = [{
        functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
      }];
    }

    let sseBuf = '';
    for await (const part of streamHttpRequest({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })) {
      if (part.type !== 'chunk') continue;
      sseBuf += part.data;
      const lines = sseBuf.split(/\r?\n/);
      sseBuf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        let json = null;
        try { json = JSON.parse(raw); } catch { continue; }
        const parts = json.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p.thought && p.text) yield { type: 'reasoning', text: p.text };
          else if (p.text) yield { type: 'text', text: p.text };
          else if (p.functionCall) {
            yield {
              type: 'tool_call',
              id: `gem_${uid(6)}`,
              name: p.functionCall.name,
              arguments: p.functionCall.args || {},
            };
          }
        }
      }
    }
  }

  // Выполнение инструментов ИИ на Android
  const executeMobileTool = async (name, args = {}) => {
    if (name === 'write_file') {
      const saved = fsWrite(args.path, args.content ?? '');
      return `Файл успешно записан: ${saved}`;
    }
    if (name === 'read_file') {
      const txt = fsReadText(args.path);
      return txt || '(файл пуст или не найден)';
    }
    if (name === 'list_directory') {
      const res = fsListDir(args.path || defaultPaths.workspace, false);
      return res.entries.map((e) => `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.name}`).join('\n') || '(пусто)';
    }
    if (name === 'web_search') {
      const q = encodeURIComponent(args.query || '');
      const html = await fetchText(`https://html.duckduckgo.com/html/?q=${q}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' },
      });
      const results = [];
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      while ((m = re.exec(html)) && results.length < 6) {
        const title = m[2].replace(/<[^>]+>/g, '').trim();
        const link = m[1];
        if (title) results.push(`- ${title}\n  ${link}`);
      }
      return results.length ? results.join('\n\n') : 'По запросу ничего не найдено.';
    }
    if (name === 'fetch_url') {
      const html = await fetchText(args.url);
      const { title, text } = stripHtmlToText(html);
      return `${title ? `# ${title}\n\n` : ''}${text.slice(0, 12000)}`;
    }
    if (name === 'generate_image') {
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;
      let dataUrl;
      let ext = 'jpg';
      try {
        dataUrl = await fetchBinaryDataUrl(imgUrl);
      } catch {
        const fallback = await generateProceduralImageDataUrl({ prompt: args.prompt, width: 1024, height: 1024 });
        dataUrl = fallback.dataUrl;
        ext = fallback.ext || 'png';
      }
      const filePath = `${defaultPaths.images}/img-${Date.now()}.${ext}`;
      fsWriteDataUrl(filePath, dataUrl);
      return `Изображение сгенерировано и сохранено: ${filePath}`;
    }
    if (name === 'memory_save') {
      const item = { id: uid(8), text: String(args.content || '').trim(), content: String(args.content || '').trim(), category: 'ai', tags: ['ai'], createdAt: Date.now(), updatedAt: Date.now() };
      memories.unshift(item);
      writeJson(STORAGE_KEYS.memory, memories);
      return `Сохранено в память: ${item.text}`;
    }
    return `Инструмент ${name} выполнен`;
  };

  // ── Активные генерации чатов ────────────────────────────────────────────
  const activeRuns = new Map();

  const runAgent = async ({ chatId, text, attachments = [], reasoningEffort: effortOverride }) => {
    let chat = chats.find((c) => c.id === chatId);
    if (!chat) {
      chat = {
        id: chatId || `chat-${uid(8)}`,
        title: 'Новый диалог',
        provider: config.chat.defaultProvider,
        model: config.chat.defaultModel,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
        pinned: false,
      };
      chats.unshift(chat);
    }

    const enabledProviders = (config.providers || []).filter((p) => p.enabled && (p.noKey || p.local || p.apiKey));
    const provider = enabledProviders.find((p) => p.id === chat.provider)
      || enabledProviders.find((p) => p.id === config.chat.defaultProvider)
      || enabledProviders[0];

    if (!provider) {
      throw new Error('Не включён ни один бесплатный провайдер. Открой Настройки → Провайдеры.');
    }

    let activeProvider = provider;
    let activeModel = chat.model || provider.defaultModel || provider.models?.[0] || 'openai';
    const meta = getModelMeta(activeProvider.id, activeModel);
    let activeEffort = resolveEffortForModel(meta, effortOverride ?? config.chat?.reasoningEffort ?? 'medium');
    let didProviderFallback = false;

    if (text?.trim() || attachments?.length) {
      const userMsg = {
        id: `msg-${uid(8)}`,
        role: 'user',
        content: text || '',
        attachments,
        createdAt: Date.now(),
      };
      chat.messages.push(userMsg);
      if (chat.messages.filter((m) => m.role === 'user').length === 1 && (!chat.title || chat.title === 'Новый диалог')) {
        chat.title = String(text || 'Диалог').trim().slice(0, 46);
      }
      chat.updatedAt = Date.now();
      writeJson(STORAGE_KEYS.chats, chats);
      emit('agent:event', { type: 'user_saved', chatId: chat.id, message: userMsg, title: chat.title });
    }

    const controller = new AbortController();
    const messageId = `msg-${uid(8)}`;
    activeRuns.set(chat.id, controller);

    emit('agent:event', {
      type: 'start',
      chatId: chat.id,
      messageId,
      provider: activeProvider.id,
      model: activeModel,
      reasoningEffort: activeEffort,
    });

    const activeSkillBodies = BUILTIN_SKILLS.concat(customSkills)
      .filter((s) => (config.skills?.enabled || []).includes(s.id))
      .map((s) => `### Скилл: ${s.name}\n${s.body || s.description}`)
      .join('\n\n');

    const memBlock = config.memory?.enabled && memories.length
      ? `\n\nПамять о пользователе:\n${memories.slice(0, 8).map((m) => `- ${m.text || m.content}`).join('\n')}`
      : '';

    const systemPrompt = [
      'Ты — PSYCHIC, умный русскоязычный киберпанк ИИ-ассистент, запущенный на Android-смартфоне пользователя.',
      `Рабочая папка устройства: ${defaultPaths.workspace}. Отвечай чётко, полезно и по делу.`,
      config.chat?.systemSupplement || '',
      activeSkillBodies,
      memBlock,
    ].filter(Boolean).join('\n\n');

    const conversation = [
      { role: 'system', content: systemPrompt },
      ...chat.messages.map((m) => {
        if (m.role === 'user' && m.attachments?.some((a) => a.dataUrl?.startsWith('data:image/'))) {
          return {
            role: 'user',
            content: [
              ...(m.content ? [{ type: 'text', text: m.content }] : []),
              ...m.attachments.filter((a) => a.dataUrl).map((a) => ({ type: 'image', dataUrl: a.dataUrl, name: a.name })),
            ],
          };
        }
        return { role: m.role, content: m.content || '', toolCalls: m.toolCalls };
      }),
    ];

    let finalContent = '';
    let finalReasoning = '';
    const allToolCalls = [];
    let usage = null;
    let aborted = false;

    try {
      const maxSteps = Math.min(8, Number(config.chat?.maxSteps) || 6);
      for (let step = 0; step < maxSteps; step++) {
        let stepText = '';
        let stepReasoning = '';
        const stepCalls = [];

        const streamGen = activeProvider.type === 'google'
          ? streamGemini({
              provider: activeProvider,
              model: activeModel,
              messages: conversation,
              tools: MOBILE_TOOLS,
              temperature: config.chat?.temperature,
              maxTokens: config.chat?.maxTokens,
              reasoningEffort: activeEffort,
              signal: controller.signal,
            })
          : streamOpenAICompat({
              provider: activeProvider,
              model: activeModel,
              messages: conversation,
              tools: MOBILE_TOOLS,
              temperature: config.chat?.temperature,
              maxTokens: config.chat?.maxTokens,
              reasoningEffort: activeEffort,
              signal: controller.signal,
            });

        try {
          for await (const ev of streamGen) {
            if (ev.type === 'text' && ev.text) {
              stepText += ev.text;
              emit('agent:event', { type: 'token', chatId: chat.id, messageId, delta: ev.text });
            } else if (ev.type === 'reasoning' && ev.text) {
              stepReasoning += ev.text;
              emit('agent:event', { type: 'reasoning', chatId: chat.id, messageId, delta: ev.text });
            } else if (ev.type === 'tool_call') {
              stepCalls.push(ev);
            } else if (ev.type === 'usage') {
              usage = ev.usage;
            }
          }
        } catch (err) {
          if (controller.signal.aborted || err.code === 'ABORTED') {
            aborted = true;
            finalContent += stepText;
            finalReasoning += stepReasoning;
            break;
          }
          const canFallback =
            step === 0
            && !didProviderFallback
            && !stepText
            && !stepReasoning
            && !stepCalls.length
            && !activeProvider.apiKey
            && (activeProvider.id === 'opencode' || activeProvider.id === 'pollinations');
          const altId = activeProvider.id === 'opencode' ? 'pollinations' : 'opencode';
          const altProvider = canFallback
            ? enabledProviders.find((p) => p.id === altId && !p.apiKey)
            : null;
          if (altProvider) {
            didProviderFallback = true;
            activeProvider = altProvider;
            activeModel = altProvider.defaultModel || altProvider.models?.[0] || 'openai';
            activeEffort = resolveEffortForModel(
              getModelMeta(activeProvider.id, activeModel),
              effortOverride ?? config.chat?.reasoningEffort ?? 'medium'
            );
            emit('agent:event', {
              type: 'start',
              chatId: chat.id,
              messageId,
              provider: activeProvider.id,
              model: activeModel,
              reasoningEffort: activeEffort,
            });
            step -= 1;
            continue;
          }
          throw err;
        }

        finalContent += stepText;
        finalReasoning += stepReasoning;

        if (!stepCalls.length) break;

        conversation.push({
          role: 'assistant',
          content: stepText,
          toolCalls: stepCalls.map((c) => ({ id: c.id, name: c.name, args: c.arguments })),
        });

        for (const call of stepCalls) {
          const startedAt = Date.now();
          const tc = { id: call.id, name: call.name, args: call.arguments, status: 'running' };
          allToolCalls.push(tc);
          emit('agent:event', { type: 'tool', chatId: chat.id, messageId, call: { ...tc } });
          try {
            const resText = await executeMobileTool(call.name, call.arguments);
            tc.status = 'done';
            tc.ok = true;
            tc.result = resText;
            tc.duration = Date.now() - startedAt;
            emit('agent:event', { type: 'tool', chatId: chat.id, messageId, call: { ...tc } });
            conversation.push({ role: 'tool', toolCallId: call.id, content: resText });
          } catch (toolErr) {
            tc.status = 'error';
            tc.ok = false;
            tc.error = toolErr.message;
            tc.result = `Ошибка: ${toolErr.message}`;
            tc.duration = Date.now() - startedAt;
            emit('agent:event', { type: 'tool', chatId: chat.id, messageId, call: { ...tc } });
            conversation.push({ role: 'tool', toolCallId: call.id, content: tc.result });
          }
        }
      }

      const assistantMsg = {
        id: messageId,
        role: 'assistant',
        content: finalContent,
        reasoning: finalReasoning,
        reasoningEffort: activeEffort,
        createdAt: Date.now(),
        model: activeModel,
        provider: activeProvider.id,
        toolCalls: allToolCalls,
        usage,
        aborted,
      };
      chat.messages.push(assistantMsg);
      chat.updatedAt = Date.now();
      writeJson(STORAGE_KEYS.chats, chats);

      emit('agent:event', {
        type: 'done',
        chatId: chat.id,
        messageId,
        content: finalContent,
        reasoning: finalReasoning,
        reasoningEffort: activeEffort,
        toolCalls: allToolCalls,
        usage,
        aborted,
        title: chat.title,
      });
      return { ok: true };
    } catch (err) {
      const msg = err.message || String(err);
      emit('agent:event', { type: 'error', chatId: chat.id, message: msg });
      throw err;
    } finally {
      activeRuns.delete(chat.id);
    }
  };

  // ── Обработчики всех IPC-каналов ────────────────────────────────────────
  const handlers = {
    'app:getInfo': async () => ({
      version: APP_VERSION,
      platform: 'android',
      arch: 'arm64',
      isPackaged: true,
      paths: defaultPaths,
    }),
    'app:minimize': async () => false,
    'app:toggleMaximize': async () => ({ maximized: false }),
    'app:close': async () => false,
    'app:setAutoLaunch': async () => false,
    'app:log': async () => true,
    'app:notify': async ({ title, body }) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification(title || 'PSYCHIC', { body }); } catch {}
      }
      return true;
    },
    'app:openExternal': async ({ url }) => {
      if (!url || !/^https?:\/\//i.test(url)) throw new Error('Разрешены только http(s) ссылки');
      if (native && typeof native.openExternal === 'function') {
        native.openExternal(url);
        return true;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    },
    'app:openRelease': async ({ url }) => {
      if (!url || !url.startsWith('https://github.com/Cotyk207/psychic-adventure')) {
        throw new Error('Недопустимая ссылка релиза');
      }
      return handlers['app:openExternal']({ url });
    },
    'app:openPath': async () => true,
    'app:checkUpdates': async () => {
      try {
        const raw = await fetchText('https://api.github.com/repos/Cotyk207/psychic-adventure/releases/latest', {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'PSYCHIC-Android' },
        });
        const rel = JSON.parse(raw);
        const latest = String(rel.tag_name || '').replace(/^v/i, '') || APP_VERSION;
        const apkAsset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
        return {
          current: APP_VERSION,
          latest,
          updateAvailable: latest !== APP_VERSION && latest.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0,
          url: apkAsset?.browser_download_url || rel.html_url || 'https://github.com/Cotyk207/psychic-adventure/releases',
        };
      } catch {
        return {
          current: APP_VERSION,
          latest: APP_VERSION,
          updateAvailable: false,
          url: 'https://github.com/Cotyk207/psychic-adventure/releases',
        };
      }
    },
    'app:factoryReset': async () => {
      config = createDefaultConfig();
      chats = [];
      memories = [];
      tasks = [];
      customSkills = [];
      writeJson(STORAGE_KEYS.config, config);
      writeJson(STORAGE_KEYS.chats, chats);
      writeJson(STORAGE_KEYS.memory, memories);
      writeJson(STORAGE_KEYS.tasks, tasks);
      writeJson(STORAGE_KEYS.skills, customSkills);
      return true;
    },

    // Конфиг
    'config:get': async () => config,
    'config:getKey': async ({ key }) => getByPath(config, key),
    'config:set': async ({ key, value }) => {
      if (key === 'workbench.notes') {
        // Commit to persistent storage first; a quota/storage error must not claim success.
        const next = deepClone(config);
        setByPath(next, key, value);
        localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(next));
        config = next;
        return getByPath(config, key);
      }
      setByPath(config, key, value);
      writeJson(STORAGE_KEYS.config, config);
      return getByPath(config, key);
    },
    'config:patch': async ({ value }) => {
      config = deepMerge(config, value || {});
      writeJson(STORAGE_KEYS.config, config);
      return config;
    },
    'config:reset': async () => {
      config = createDefaultConfig();
      writeJson(STORAGE_KEYS.config, config);
      return config;
    },
    'config:export': async () => {
      const exported = deepClone(config);
      const file = `${defaultPaths.downloads}/psychic-config.json`;
      const jsonStr = JSON.stringify(exported, null, 2);
      fsWrite(file, jsonStr);
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'psychic-config.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 400);
      } catch {}
      return file;
    },
    'config:import': async () =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          try {
            const txt = await file.text();
            const parsed = JSON.parse(txt);
            config = syncPresets(deepMerge(createDefaultConfig(), parsed));
            writeJson(STORAGE_KEYS.config, config);
            resolve(config);
          } catch {
            resolve(null);
          }
        };
        input.click();
      }),
    'config:openFolder': async () => defaultPaths.config,

    // Провайдеры
    'providers:list': async () => config.providers || [],
    'providers:save': async ({ provider }) => {
      const list = [...(config.providers || [])];
      const cleaned = {
        ...provider,
        free: true,
        models: filterFreeModels(provider.id, provider.models || []),
      };
      const idx = list.findIndex((p) => p.id === cleaned.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...cleaned };
      else list.push({ ...cleaned, id: cleaned.id || `custom-${uid(6)}`, custom: true });
      config.providers = list;
      writeJson(STORAGE_KEYS.config, config);
      return cleaned;
    },
    'providers:delete': async ({ id }) => {
      const list = [...(config.providers || [])];
      const cur = list.find((p) => p.id === id);
      if (cur?.builtin) {
        cur.enabled = false;
        cur.apiKey = '';
      } else {
        config.providers = list.filter((p) => p.id !== id);
      }
      writeJson(STORAGE_KEYS.config, config);
      return true;
    },
    'providers:fetchModels': async ({ provider }) => {
      let url = joinUrl(provider.baseUrl, '/models');
      if (provider.type === 'google') {
        url = `${String(provider.baseUrl).replace(/\/+$/, '')}/models?key=${encodeURIComponent(provider.apiKey || '')}`;
      }
      let raw = '';
      try {
        raw = await fetchText(url, { headers: buildProviderHeaders(provider) });
      } catch (err) {
        if (provider.id === 'opencode') {
          raw = await fetchText('https://opencode.ai/inference/v1/models', { headers: buildProviderHeaders(provider) });
        } else {
          throw err;
        }
      }
      const json = JSON.parse(raw);
      const arr = Array.isArray(json) ? json : (json.data || json.models || []);
      const ids = arr
        .map((m) => String(m.id || m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
      const filtered = filterFreeModels(provider.id, Array.from(new Set(ids)));
      const target = (config.providers || []).find((p) => p.id === provider.id);
      if (target && filtered.length) {
        target.models = Array.from(new Set([...(target.models || []), ...filtered]));
        writeJson(STORAGE_KEYS.config, config);
      }
      return filtered;
    },
    'providers:test': async ({ provider }) => {
      const started = Date.now();
      const models = await handlers['providers:fetchModels']({ provider }).catch(() => provider.models || []);
      return { ok: true, count: models.length, latency: Date.now() - started };
    },
    'providers:detectLocal': async () => [],

    // Диалоги
    'chats:list': async () =>
      [...chats]
        .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(({ messages, ...meta }) => ({ ...meta, messageCount: messages?.length || 0 })),
    'chats:get': async ({ id }) => chats.find((c) => c.id === id) || null,
    'chats:create': async ({ title, provider, model, systemPrompt } = {}) => {
      const chat = {
        id: `chat-${uid(8)}`,
        title: title || 'Новый диалог',
        provider: provider || config.chat?.defaultProvider || 'opencode',
        model: model || config.chat?.defaultModel || 'tidepool-alpha-free',
        systemPrompt: systemPrompt || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pinned: false,
        messages: [],
      };
      chats.unshift(chat);
      writeJson(STORAGE_KEYS.chats, chats);
      return chat;
    },
    'chats:save': async ({ chat }) => {
      const idx = chats.findIndex((c) => c.id === chat.id);
      if (idx >= 0) chats[idx] = { ...chats[idx], ...chat, updatedAt: Date.now() };
      else chats.unshift({ ...chat, updatedAt: Date.now() });
      writeJson(STORAGE_KEYS.chats, chats);
      return chat;
    },
    'chats:rename': async ({ id, title }) => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return null;
      chat.title = title;
      chat.updatedAt = Date.now();
      writeJson(STORAGE_KEYS.chats, chats);
      return chat;
    },
    'chats:pin': async ({ id }) => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return null;
      chat.pinned = !chat.pinned;
      writeJson(STORAGE_KEYS.chats, chats);
      return chat;
    },
    'chats:fork': async ({ id, messageId }) => {
      const src = chats.find((c) => c.id === id);
      if (!src) throw new Error('Диалог не найден');
      const idx = messageId ? src.messages.findIndex((m) => m.id === messageId) : src.messages.length - 1;
      const slice = idx >= 0 ? src.messages.slice(0, idx + 1) : src.messages.slice();
      const forked = {
        ...deepClone(src),
        id: `chat-${uid(8)}`,
        title: `${src.title || 'Диалог'} (ветка)`,
        pinned: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: deepClone(slice),
      };
      chats.unshift(forked);
      writeJson(STORAGE_KEYS.chats, chats);
      return forked;
    },
    'chats:delete': async ({ id }) => {
      chats = chats.filter((c) => c.id !== id);
      writeJson(STORAGE_KEYS.chats, chats);
      return true;
    },
    'chats:export': async ({ id }) => {
      const chat = chats.find((c) => c.id === id);
      if (!chat) return null;
      const md = [`# ${chat.title}\n`, ...chat.messages.map((m) => `## ${m.role === 'user' ? 'Вы' : 'PSYCHIC'}\n\n${m.content}\n`)].join('\n');
      const file = `${defaultPaths.downloads}/${(chat.title || 'chat').replace(/[^\wа-яА-Я-]+/g, '_')}.md`;
      fsWrite(file, md);
      return file;
    },

    // Агент
    'agent:send': async (payload) => runAgent(payload),
    'agent:stop': async ({ chatId }) => {
      const ctrl = activeRuns.get(chatId);
      if (ctrl) ctrl.abort();
      return true;
    },
    'agent:regenerate': async ({ chatId, reasoningEffort }) => {
      const chat = chats.find((c) => c.id === chatId);
      if (!chat) throw new Error('Диалог не найден');
      while (chat.messages.length && chat.messages[chat.messages.length - 1].role === 'assistant') {
        chat.messages.pop();
      }
      writeJson(STORAGE_KEYS.chats, chats);
      return runAgent({ chatId, text: '', attachments: [], reasoningEffort });
    },
    'agent:status': async () => ({ running: Array.from(activeRuns.keys()) }),

    // Интеракции и разрешения
    'interactions:resolve': async (payload) => {
      const pending = pendingInteractions.get(payload?.id);
      if (pending) {
        pendingInteractions.delete(payload.id);
        pending(payload);
      }
      return true;
    },

    // Скиллы
    'skills:list': async () => {
      const enabled = config.skills?.enabled || [];
      return [...BUILTIN_SKILLS, ...customSkills].map((s) => ({ ...s, enabled: enabled.includes(s.id) }));
    },
    'skills:toggle': async ({ id, enabled }) => {
      const set = new Set(config.skills?.enabled || []);
      if (enabled) set.add(id);
      else set.delete(id);
      config.skills.enabled = Array.from(set);
      writeJson(STORAGE_KEYS.config, config);
      return true;
    },
    'skills:save': async (skill) => {
      const id = skill.id || `skill-${uid(6)}`;
      const saved = {
        id,
        name: skill.name || 'Свой скилл',
        description: skill.description || '',
        whenToUse: skill.whenToUse || '',
        color: skill.color || '#00f0ff',
        icon: skill.icon || 'sparkles',
        tools: skill.tools || [],
        body: skill.body || skill.content || '',
        builtin: false,
        source: 'custom',
      };
      const idx = customSkills.findIndex((s) => s.id === id);
      if (idx >= 0) customSkills[idx] = saved;
      else customSkills.push(saved);
      writeJson(STORAGE_KEYS.skills, customSkills);
      return saved;
    },
    'skills:duplicate': async ({ id }) => {
      const all = [...BUILTIN_SKILLS, ...customSkills];
      const orig = all.find((s) => s.id === id);
      if (!orig) throw new Error('Скилл не найден');
      return handlers['skills:save']({ ...orig, id: `${orig.id}-copy-${uid(4)}`, name: `${orig.name} (копия)` });
    },
    'skills:delete': async ({ id }) => {
      if (BUILTIN_SKILLS.some((s) => s.id === id)) {
        throw new Error('Встроенный скилл нельзя удалить — можно отключить или клонировать.');
      }
      customSkills = customSkills.filter((s) => s.id !== id);
      writeJson(STORAGE_KEYS.skills, customSkills);
      return true;
    },
    'skills:importFolder': async () => null,
    'skills:installUrl': async ({ url }) => {
      const md = await fetchText(url);
      return handlers['skills:save']({ name: url.split('/').pop()?.replace(/\.md$/i, '') || 'Imported Skill', body: md });
    },
    'skills:generate': async ({ prompt }) =>
      handlers['skills:save']({
        name: String(prompt || 'Новый скилл').slice(0, 32),
        description: prompt,
        body: `# ${prompt}\n\nВыполняй задачу структурированно, проверяй результат и давай чёткий отчёт.`,
      }),

    // Память
    'memory:list': async () => memories,
    'memory:add': async ({ text, content, category = 'notes', tags = [] }) => {
      const val = String(text ?? content ?? '').trim();
      if (!val) throw new Error('Пустая запись');
      const item = { id: `mem-${uid(7)}`, text: val, content: val, category, tags, createdAt: Date.now(), updatedAt: Date.now() };
      memories.unshift(item);
      writeJson(STORAGE_KEYS.memory, memories);
      return item;
    },
    'memory:update': async ({ id, text, content }) => {
      const item = memories.find((m) => m.id === id);
      if (item) {
        item.text = String(text ?? content ?? item.text);
        item.content = item.text;
        item.updatedAt = Date.now();
        writeJson(STORAGE_KEYS.memory, memories);
      }
      return item;
    },
    'memory:delete': async ({ id }) => {
      memories = memories.filter((m) => m.id !== id);
      writeJson(STORAGE_KEYS.memory, memories);
      return true;
    },
    'memory:clear': async () => {
      memories = [];
      writeJson(STORAGE_KEYS.memory, memories);
      return true;
    },
    'memory:export': async () => {
      const file = `${defaultPaths.downloads}/psychic-memory.json`;
      fsWrite(file, JSON.stringify(memories, null, 2));
      return { path: file, count: memories.length };
    },
    'memory:setEnabled': async ({ enabled }) => {
      config.memory.enabled = Boolean(enabled);
      writeJson(STORAGE_KEYS.config, config);
      return true;
    },

    // Планировщик задач
    'tasks:list': async () => tasks,
    'tasks:add': async ({ task }) => {
      if (!task?.title?.trim()) throw new Error('Укажи название задачи');
      const every = Number(task.every) || 3600000;
      const item = {
        id: `task-${uid(7)}`,
        title: task.title.trim(),
        prompt: task.prompt || task.title,
        every,
        enabled: true,
        runAgent: task.runAgent !== false,
        notify: task.notify !== false,
        lastRunAt: null,
        nextRunAt: Date.now() + every,
      };
      tasks.unshift(item);
      writeJson(STORAGE_KEYS.tasks, tasks);
      return item;
    },
    'tasks:toggle': async ({ id, enabled }) => {
      const t = tasks.find((x) => x.id === id);
      if (t) {
        t.enabled = Boolean(enabled);
        writeJson(STORAGE_KEYS.tasks, tasks);
      }
      return t;
    },
    'tasks:delete': async ({ id }) => {
      tasks = tasks.filter((x) => x.id !== id);
      writeJson(STORAGE_KEYS.tasks, tasks);
      return true;
    },
    'tasks:runNow': async ({ id }) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return false;
      t.lastRunAt = Date.now();
      writeJson(STORAGE_KEYS.tasks, tasks);
      const chat = await handlers['chats:create']({ title: `Задача: ${t.title}` });
      emit('task:ran', { id: t.id, title: t.title, chatId: chat.id });
      if (t.runAgent && t.prompt) {
        runAgent({ chatId: chat.id, text: t.prompt }).catch(() => {});
      }
      return true;
    },

    // Файлы
    'fs:quickAccess': async () => ({
      home: defaultPaths.home,
      workspace: defaultPaths.workspace,
      desktop: defaultPaths.desktop,
      documents: defaultPaths.documents,
      downloads: defaultPaths.downloads,
      music: defaultPaths.music,
    }),
    'fs:list': async ({ path: p, showHidden }) => ({ text: '', data: fsListDir(p || defaultPaths.workspace, showHidden) }),
    'fs:read': async ({ path: p }) => ({ content: fsReadText(p), path: normalizePath(p), binary: false }),
    'fs:write': async ({ path: p, content }) => ({ path: fsWrite(p, content), ok: true }),
    'fs:mkdir': async ({ path: p }) => {
      const full = normalizePath(p);
      if (hasNativeFs) native.fsMkdir(full);
      vfs[`${full}/.keep`] = { type: 'file', content: '', modified: Date.now() };
      writeJson(STORAGE_KEYS.vfs, vfs);
      return { path: full, ok: true };
    },
    'fs:delete': async ({ path: p }) => ({ ok: fsDelete(p) }),
    'fs:openFile': async () => true,
    'fs:pickFolder': async () => defaultPaths.workspace,
    'fs:pickFile': async ({ multi = false } = {}) =>
      new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = Boolean(multi);
        input.onchange = async () => {
          const files = Array.from(input.files || []);
          const savedPaths = [];
          for (const f of files) {
            const dataUrl = await new Promise((res) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result || ''));
              r.readAsDataURL(f);
            });
            const dest = `${defaultPaths.workspace}/${f.name}`;
            fsWriteDataUrl(dest, dataUrl);
            savedPaths.push(dest);
          }
          resolve(savedPaths);
        };
        input.click();
      }),

    // Медиа-студия и музыка
    'media:list': async ({ type = 'all' } = {}) => {
      const dirs = type === 'images'
        ? [['images', defaultPaths.images]]
        : type === 'music'
          ? [['music', defaultPaths.music]]
          : type === 'video' || type === 'videos'
            ? [['video', defaultPaths.videos]]
            : [
                ['images', defaultPaths.images],
                ['music', defaultPaths.music],
                ['video', defaultPaths.videos],
              ];
      const items = [];
      for (const [kind, d] of dirs) {
        for (const e of fsListDir(d, false).entries) {
          if (e.type === 'file') {
            items.push({ name: e.name, path: e.path, kind, size: e.size || 0, modified: new Date(e.modified || Date.now()).toISOString() });
          }
        }
      }
      return items;
    },
    'media:dataUrl': async ({ path: p }) => fsReadDataUrl(p),
    'media:thumbnail': async ({ path: p }) => fsReadDataUrl(p),
    'media:saveDataUrl': async ({ dataUrl, name = 'media', folder = 'images' }) => {
      const match = String(dataUrl || '').match(/^data:([^;]+);base64,/);
      if (!match) throw new Error('Некорректный data URL');
      const ext = match[1].split('/')[1]?.split('+')[0] || 'png';
      const baseDir = folder === 'music' ? defaultPaths.music : folder === 'videos' ? defaultPaths.videos : defaultPaths.images;
      const target = `${baseDir}/${name}-${Date.now()}.${ext}`;
      fsWriteDataUrl(target, dataUrl);
      return { path: target, mime: match[1] };
    },
    'media:delete': async ({ path: p }) => fsDelete(p),
    'media:openFolder': async ({ kind }) => defaultPaths[kind] || defaultPaths.media,
    'media:setWallpaper': async ({ path: p }) => {
      const dataUrl = fsReadDataUrl(p);
      if (dataUrl) {
        config.appearance.wallpaper = dataUrl;
        writeJson(STORAGE_KEYS.config, config);
      }
      return dataUrl || p;
    },
    'media:generateImage': async ({ prompt, style = 'auto', width = 1024, height = 1024, count = 1 }) => {
      if (!String(prompt || '').trim()) throw new Error('Пустой промпт');
      const total = Math.min(4, Math.max(1, Number(count) || 1));
      const files = [];
      for (let i = 0; i < total; i++) {
        const seed = Math.floor(Math.random() * 999999);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
        let dataUrl;
        let ext = 'jpg';
        let mime = 'image/jpeg';
        try {
          dataUrl = await fetchBinaryDataUrl(url);
        } catch {
          const fallback = await generateProceduralImageDataUrl({ prompt, style, width, height, seed });
          dataUrl = fallback.dataUrl;
          ext = fallback.ext || 'png';
          mime = fallback.mime || 'image/png';
        }
        const name = `img-${Date.now()}-${i}.${ext}`;
        const filePath = `${defaultPaths.images}/${name}`;
        fsWriteDataUrl(filePath, dataUrl);
        const b64 = String(dataUrl).split(',')[1] || '';
        files.push({
          path: filePath,
          name,
          mime,
          size: Math.floor(b64.length * 0.75),
          dataUrl,
          width,
          height,
          prompt,
        });
      }
      return { files, images: files.map((f) => ({ path: f.path, name: f.name, dataUrl: f.dataUrl, mimeType: f.mime })) };
    },
    'media:generateMusic': async (params) => {
      const rendered = await requestRendererMedia('music', params);
      const file = `${defaultPaths.music}/synth-${Date.now()}.wav`;
      fsWriteDataUrl(file, rendered.dataUrl);
      return { file, duration: rendered.duration || params.duration || 20 };
    },
    'media:generateVideo': async (params) => {
      const rendered = await requestRendererMedia('video', params);
      const ext = rendered.ext || 'webm';
      const file = `${defaultPaths.videos}/clip-${Date.now()}.${ext}`;
      fsWriteDataUrl(file, rendered.dataUrl);
      return { file, duration: rendered.duration || 10 };
    },
    'media:renderResult': async (payload) => {
      const entry = pendingRenderTasks.get(payload?.id);
      if (entry) {
        clearTimeout(entry.timer);
        pendingRenderTasks.delete(payload.id);
        if (payload.ok) entry.resolve(payload);
        else entry.reject(new Error(payload.error || 'Ошибка рендера'));
      }
      return true;
    },

    'music:library': async () => {
      const list = fsListDir(defaultPaths.music, false).entries
        .filter((e) => /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(e.name))
        .map((e) => ({
          path: e.path,
          name: e.name,
          title: e.name.replace(/\.[^.]+$/, ''),
          artist: 'PSYCHIC Synth',
          album: 'Android',
          size: e.size || 0,
        }));
      return list;
    },
    'music:refreshLibrary': async () => handlers['music:library'](),
    'music:openLibrary': async () => defaultPaths.music,
    'music:radioList': async () => ({
      stations: [
        { name: 'Nightride FM', url: 'https://stream.nightride.fm/nightride.ogg', genre: 'Retrowave', bitrate: '128k' },
        { name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', genre: 'Ambient', bitrate: '128k' },
        { name: 'SomaFM DEF CON Radio', url: 'https://ice1.somafm.com/defcon-128-mp3', genre: 'Electronic', bitrate: '128k' },
        { name: 'Radio Paradise', url: 'https://stream.radioparadise.com/aac-128', genre: 'Eclectic', bitrate: '128k' },
      ],
    }),

    // Буфер обмена Android
    'clipboard:write': async (payload) => {
      const text = String(typeof payload === 'string' ? payload : payload?.text ?? '');
      clipboardFallback = text;
      if (native && typeof native.writeClipboard === 'function') {
        native.writeClipboard(text);
        return true;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text).catch(() => {});
      }
      return true;
    },
    'clipboard:read': async () => {
      if (native && typeof native.readClipboard === 'function') {
        const val = native.readClipboard();
        if (val) return val;
      }
      if (navigator.clipboard?.readText) {
        try {
          const val = await navigator.clipboard.readText();
          if (val) return val;
        } catch {}
      }
      return clipboardFallback;
    },

    // Ридер-браузер на Android
    'browser:setBounds': async () => true,
    'browser:hide': async () => true,
    'browser:open': async ({ url }) => {
      let target = String(url || '').trim();
      if (!target) return browserState;
      if (!/^https?:\/\//i.test(target)) {
        target = target.includes('.') && !target.includes(' ')
          ? `https://${target}`
          : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(target)}`;
      }
      browserState = { ...browserState, url: target, visible: true, loading: true, readerMode: true };
      emit('browser:state', browserState);
      try {
        const html = await fetchText(target, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36' },
        });
        const { title, text } = stripHtmlToText(html);
        browserHistory.splice(browserIdx + 1);
        browserHistory.push(target);
        browserIdx = browserHistory.length - 1;
        browserState = {
          url: target,
          title: title || target,
          visible: true,
          loading: false,
          canGoBack: browserIdx > 0,
          canGoForward: false,
          readerMode: true,
          text: text.slice(0, 25000),
        };
      } catch (err) {
        browserState = {
          ...browserState,
          loading: false,
          title: target,
          text: `Не удалось загрузить страницу во встроенном ридере (${err.message}). Нажми «В браузере телефона», чтобы открыть её в Chrome.`,
        };
      }
      emit('browser:state', browserState);
      return browserState;
    },
    'browser:read': async () => ({ url: browserState.url, title: browserState.title, text: browserState.text || '' }),
    'browser:action': async ({ action }) => {
      if (action === 'back' && browserIdx > 0) {
        browserIdx -= 1;
        return handlers['browser:open']({ url: browserHistory[browserIdx] });
      }
      if (action === 'forward' && browserIdx < browserHistory.length - 1) {
        browserIdx += 1;
        return handlers['browser:open']({ url: browserHistory[browserIdx] });
      }
      if (action === 'reload' && browserState.url) {
        return handlers['browser:open']({ url: browserState.url });
      }
      return browserState;
    },
    'browser:screenshot': async () => {
      throw new Error('На Android используй системный скриншот телефона (Питание + Громкость вниз)');
    },

    // Терминал
    'terminal:create': async ({ cwd } = {}) => {
      const id = `term-${uid(6)}`;
      const session = { id, cwd: cwd || defaultPaths.workspace, line: '' };
      terminals.set(id, session);
      setTimeout(() => {
        emit('terminal:data', {
          id,
          data: `\x1b[36mPSYCHIC Mobile Shell v${APP_VERSION} (Android)\x1b[0m\r\nВведи \x1b[33mhelp\x1b[0m для списка команд.\r\n\r\n\x1b[32mpsychic@android\x1b[0m:\x1b[34m~\x1b[0m$ `,
        });
      }, 40);
      return { id, shell: 'android-sh' };
    },
    'terminal:write': async ({ id, data }) => {
      const s = terminals.get(id);
      if (!s) return false;
      for (const ch of String(data || '')) {
        if (ch === '\r' || ch === '\n') {
          const cmd = s.line.trim();
          s.line = '';
          emit('terminal:data', { id, data: '\r\n' });
          if (cmd === 'clear') {
            emit('terminal:data', { id, data: '\x1b[2J\x1b[H\x1b[32mpsychic@android\x1b[0m:\x1b[34m~\x1b[0m$ ' });
          } else {
            const res = await runShellCommand(cmd, s.cwd);
            s.cwd = res.cwd;
            if (res.output) emit('terminal:data', { id, data: `${res.output}\r\n` });
            emit('terminal:data', { id, data: `\x1b[32mpsychic@android\x1b[0m:\x1b[34m${s.cwd === defaultPaths.workspace ? '~' : s.cwd}\x1b[0m$ ` });
          }
        } else if (ch === '\u007f' || ch === '\b') {
          if (s.line.length > 0) {
            s.line = s.line.slice(0, -1);
            emit('terminal:data', { id, data: '\b \b' });
          }
        } else if (ch >= ' ') {
          s.line += ch;
          emit('terminal:data', { id, data: ch });
        }
      }
      return true;
    },
    'terminal:resize': async () => true,
    'terminal:close': async ({ id }) => {
      terminals.delete(id);
      return true;
    },

    // Системная телеметрия смартфона
    'system:stats': async () => {
      let nativeStats = {};
      if (native && typeof native.getDeviceStats === 'function') {
        try { nativeStats = JSON.parse(native.getDeviceStats() || '{}'); } catch {}
      }
      const cores = nativeStats.cores || navigator.hardwareConcurrency || 8;
      const totalMem = nativeStats.memory?.total || 8 * 1024 ** 3;
      const usedMem = nativeStats.memory?.used || Math.round(totalMem * 0.54);
      const freeMem = Math.max(0, totalMem - usedMem);
      const memPct = nativeStats.memory?.percent ?? Math.round((usedMem / totalMem) * 100);
      const uptimeSec = Math.floor(performance.now() / 1000);
      const h = Math.floor(uptimeSec / 3600);
      const m = Math.floor((uptimeSec % 3600) / 60);

      return {
        cpu: {
          percent: Math.min(95, Math.max(6, Math.round(14 + (Math.sin(Date.now() / 4000) + 1) * 9))),
          cores,
          model: nativeStats.cpuModel || 'ARM64 Mobile Neural SoC',
          speed: 2800,
          loadAvg: [0.3, 0.4, 0.4],
        },
        memory: { total: totalMem, free: freeMem, used: usedMem, percent: memPct },
        disks: nativeStats.disks || [
          { path: '/storage', total: 128 * 1024 ** 3, free: 64 * 1024 ** 3, used: 64 * 1024 ** 3, percent: 50 },
        ],
        network: nativeStats.network || [],
        battery: nativeStats.battery ?? null,
        uptime: uptimeSec,
        uptimeText: `${h}ч ${m}м`,
        platform: 'android',
        release: nativeStats.release || 'Android Mobile',
        arch: nativeStats.arch || 'arm64-v8a',
        hostname: nativeStats.hostname || 'Android Smartphone',
        node: 'WebView',
        version: APP_VERSION,
        electron: 'Capacitor 6',
      };
    },
  };

  return {
    platform: 'android',
    versions: { app: APP_VERSION, capacitor: '6.2' },
    isElectron: false,
    isAndroid: true,
    invoke: async (channel, payload = {}) => {
      const fn = handlers[channel];
      if (!fn) return null;
      return deepClone(await fn(payload || {}));
    },
    on: (channel, callback) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(callback);
      return () => listeners.get(channel)?.delete(callback);
    },
  };
}
