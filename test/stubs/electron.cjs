'use strict';

/**
 * Заглушка Electron для юнит-тестов main-процесса.
 * Даёт настоящие временные папки вместо userData/home, чтобы сервисы
 * (память, скиллы, права, планировщик) работали как в бою.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = process.env.PSYCHIC_TEST_HOME
  || fs.mkdtempSync(path.join(os.tmpdir(), 'psychic-test-'));

const userData = path.join(root, 'userData');
const dirs = {
  home: path.join(root, 'home'),
  userData,
  appData: path.join(root, 'AppData', 'Roaming'),
  temp: os.tmpdir(),
  downloads: path.join(root, 'Downloads'),
  desktop: path.join(root, 'Desktop'),
  documents: path.join(root, 'Documents'),
  music: path.join(root, 'Music'),
};
for (const dir of Object.values(dirs)) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

const listeners = new Map();
const app = {
  getPath: (name) => dirs[name] || root,
  getName: () => 'PSYCHIC',
  name: 'psychic',
  getVersion: () => {
    try {
      return require(path.resolve(__dirname, '..', '..', 'package.json')).version;
    } catch {
      return '0.0.0';
    }
  },
  getLocale: () => 'ru',
  isPackaged: false,
  getAppPath: () => process.cwd(),
  setAppUserModelId: () => {},
  setLoginItemSettings: (settings = {}) => { app.__loginSettings = { openAtLogin: !!settings.openAtLogin }; },
  getLoginItemSettings: () => app.__loginSettings || { openAtLogin: false },
  requestSingleInstanceLock: () => true,
  on: (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(fn);
    return app;
  },
  whenReady: () => ({ then: (fn) => fn() }),
  quit: () => {},
  relaunch: () => {},
  exit: () => {},
  hide: () => {},
  show: () => {},
  focus: () => {},
};

class Notification {
  static isSupported() { return true; }
  constructor(options) { this.options = options; }
  show() { Notification.shown.push(this.options); }
  on() { return this; }
}
Notification.shown = [];

class Tray {
  setToolTip() {}
  setContextMenu() {}
  on() {}
  destroy() {}
}

class Menu {
  static buildFromTemplate(template) { return template; }
}

function noopSink(log) {
  return new Proxy({}, {
    get: (obj, prop) => {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      return (...args) => { log.push([String(prop), args]); return undefined; };
    },
    set: (obj, prop, value) => { obj[prop] = value; return true; },
    has: () => true,
  });
}

const windowCalls = [];

// Объект, который отвечает «да» на любой вызов: webContents, session и т.п.
function chameleon(name = 'wc') {
  const fn = function stub() { return undefined; };
  return new Proxy(fn, {
    get(target, prop) {
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      if (prop in target) return target[prop];
      return chameleon(`${name}.${String(prop)}`);
    },
    apply() { return undefined; },
    construct() { return chameleon(name); },
  });
}
const sentEvents = [];

// В реальном Electron и ipcRenderer.invoke, и webContents.send прогоняют данные
// через Structured Clone — любая функция/нативный объект внутри ответа роняет вызов
// с «An object could not be cloned». Повторяем это поведение прямо в стабе.
function ipcClone(value, label) {
  if (value === undefined) return undefined;
  try {
    return structuredClone(value);
  } catch (err) {
    throw new Error(`An object could not be cloned (${label}): ${err.message}`);
  }
}

class BrowserWindowImpl {
  constructor(options = {}) {
    this.options = options;
    const wc = chameleon('window.webContents');
    wc.send = (channel, payload) => {
      const cloned = ipcClone(payload, `webContents.send(${channel})`);
      sentEvents.push({ channel, payload: cloned });
      for (const listener of BrowserWindowImpl.rendererListeners.get(channel) || []) {
        listener({ sender: wc }, cloned);
      }
    };
    this.webContents = wc;
  }
  loadURL() {}
  loadFile() {}
  on() {}
  once() {}
  show() {}
  hide() {}
  focus() {}
  close() {}
  isDestroyed() { return false; }
  isMinimized() { return false; }
  isMaximized() { return false; }
  isFullScreen() { return false; }
  isVisible() { return true; }
  isAlwaysOnTop() { return false; }
  getBounds() { return { x: 0, y: 0, width: 1200, height: 800 }; }
  getContentBounds() { return this.getBounds(); }
  setBounds() {}
  setAlwaysOnTop() {}
  setFullScreen() {}
  setProgressBar() {}
  setTitle() {}
  setTitleBarOverlay() {}
  maximize() {}
  unmaximize() {}
  minimize() {}
  restore() {}
  static getAllWindows() { return BrowserWindowImpl.instances; }
  static fromWebContents() { return BrowserWindowImpl.instances[0] || null; }
  static getFocusedWindow() { return BrowserWindowImpl.instances[0] || null; }
}
BrowserWindowImpl.instances = [];
BrowserWindowImpl.rendererListeners = new Map();

const BrowserWindow = new Proxy(BrowserWindowImpl, {
  construct(target, args) {
    const instance = new target(...args);
    const wrapped = new Proxy(instance, {
      get(obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop === 'symbol') return undefined;
        return (...callArgs) => { windowCalls.push([String(prop), callArgs]); return undefined; };
      },
      set(obj, prop, value) { obj[prop] = value; return true; },
    });
    BrowserWindowImpl.instances.push(wrapped);
    return wrapped;
  },
  get(target, prop) { return Reflect.get(target, prop); },
});

class WebContentsViewImpl {
  constructor(options = {}) {
    this.options = options;
    const wc = chameleon('view.webContents');
    this.url = 'about:blank';
    wc.getURL = () => this.url;
    wc.loadURL = async (u) => { this.url = u; this.options.__loaded = u; };
    wc.executeJavaScript = async () => JSON.stringify({ ok: true, result: '2' });
    wc.capturePage = async () => ({ toPNG: () => Buffer.from('not-a-real-png') });
    this.webContents = wc;
  }
}

const WebContentsView = new Proxy(WebContentsViewImpl, {
  construct(target, args) {
    const instance = new target(...args);
    return new Proxy(instance, {
      get(obj, prop) {
        if (prop in obj) return obj[prop];
        if (typeof prop === 'symbol') return undefined;
        return (...callArgs) => { windowCalls.push([String(prop), callArgs]); return undefined; };
      },
      set(obj, prop, value) { obj[prop] = value; return true; },
    });
  },
});

const nativeImage = {
  createFromPath: () => ({ isEmpty: () => true, resize: () => ({ toDataURL: () => '' }) }),
  createFromBuffer: () => ({ isEmpty: () => true, resize: () => ({ toDataURL: () => '' }) }),
};

const screen = {
  getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 } }),
};

const desktopCapturer = {
  getSources: async () => [{
    id: 'screen:0:0',
    name: 'Entire Screen',
    thumbnail: {
      isEmpty: () => false,
      toPNG: () => Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
        'base64'
      ),
    },
  }],
};

const dialog = {
  lastSavePath: null,
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: false, filePath: dialog.lastSavePath || path.join(root, 'export.json') }),
};

const shell = {
  opened: [],
  openExternal: async (url) => { shell.opened.push(url); return ''; },
  openPath: async (p) => { shell.opened.push(p); return ''; },
  showItemInFolder: () => {},
};

let _clipboardText = '';

module.exports = {
  app,
  Notification,
  Tray,
  Menu,
  BrowserWindow,
  WebContentsView,
  nativeImage,
  screen,
  desktopCapturer,
  dialog,
  shell,
  clipboard: {
    readText: () => _clipboardText,
    writeText: (t) => { _clipboardText = String(t ?? ''); },
    writeBuffer: () => {},
  },
  ipcMain: {
    handlers: new Map(),
    handle: (channel, fn) => module.exports.ipcMain.handlers.set(channel, async (event, payload) => {
      const clonedIn = ipcClone(payload, `ipcMain.handle(${channel}) request`);
      const result = await fn(event, clonedIn);
      return ipcClone(result, `ipcMain.handle(${channel}) response`);
    }),
    on: () => {},
    removeHandler: (channel) => module.exports.ipcMain.handlers.delete(channel),
  },
  ipcRenderer: {
    invoke: async (channel, payload) => {
      const fn = module.exports.ipcMain.handlers.get(channel);
      if (!fn) throw new Error(`No handler registered for '${channel}'`);
      return fn({ sender: { isDestroyed: () => false } }, payload);
    },
    on: (channel, handler) => {
      if (!BrowserWindowImpl.rendererListeners.has(channel)) {
        BrowserWindowImpl.rendererListeners.set(channel, new Set());
      }
      BrowserWindowImpl.rendererListeners.get(channel).add(handler);
    },
    removeListener: (channel, handler) => {
      BrowserWindowImpl.rendererListeners.get(channel)?.delete(handler);
    },
  },
  contextBridge: {
    exposed: {},
    exposeInMainWorld: (key, api) => {
      module.exports.contextBridge.exposed[key] = api;
      if (typeof globalThis.window !== 'undefined') {
        globalThis.window[key] = api;
      }
    },
  },
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: () => {} },
      setPermissionRequestHandler: () => {},
      setPermissionCheckHandler: () => {},
    },
  },
  protocol: {
    handlers: new Map(),
    handle: (scheme, fn) => module.exports.protocol.handlers.set(scheme, fn),
    registerSchemesAsPrivileged: () => {},
  },
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  net: { fetch: (...args) => globalThis.fetch(...args) },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => s, decryptString: (s) => s },
  __dirs: dirs,
  __root: root,
  __windowCalls: windowCalls,
  __sentEvents: sentEvents,
};
