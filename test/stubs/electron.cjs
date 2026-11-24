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
  setLoginItemSettings: () => {},
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
class BrowserWindowImpl {
  constructor(options = {}) {
    this.options = options;
    this.webContents = chameleon('window.webContents');
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

module.exports = {
  app,
  Notification,
  Tray,
  Menu,
  BrowserWindow,
  WebContentsView,
  nativeImage,
  dialog,
  shell,
  clipboard: { readText: () => '', writeText: () => {}, writeBuffer: () => {} },
  ipcMain: {
    handlers: new Map(),
    handle: (channel, fn) => module.exports.ipcMain.handlers.set(channel, fn),
    on: () => {},
    removeHandler: () => {},
  },
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: () => {} },
      setPermissionRequestHandler: () => {},
      setPermissionCheckHandler: () => {},
    },
  },
  protocol: { handle: () => {}, registerSchemesAsPrivileged: () => {} },
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  net: { fetch: (...args) => globalThis.fetch(...args) },
  safeStorage: { isEncryptionAvailable: () => false, encryptString: (s) => s, decryptString: (s) => s },
  __dirs: dirs,
  __root: root,
  __windowCalls: windowCalls,
};
