'use strict';

const {
  app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut,
  session, protocol, shell, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const url = require('url');

const paths = require('./lib/paths.cjs');
const store = require('./lib/store.cjs');
const logger = require('./lib/logger.cjs');
const { Interactions } = require('./services/interactions.cjs');
const { ChatsService } = require('./services/chats.cjs');
const { SkillsService } = require('./services/skills.cjs');
const { MemoryService } = require('./services/memory.cjs');
const { PermissionService } = require('./services/permissions.cjs');
const { BrowserService } = require('./services/browser.cjs');
const { TerminalService } = require('./services/terminal.cjs');
const { MediaService } = require('./services/media.cjs');
const { ComputerService } = require('./services/computer.cjs');
const { Scheduler } = require('./services/scheduler.cjs');
const { checkLatest } = require('./services/updates.cjs');
const { Agent } = require('./agent.cjs');
const { registerIpc } = require('./ipc.cjs');
const providers = require('./providers/index.cjs');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const APP_ID = 'com.psychic.app';

let mainWindow = null;
let tray = null;
let services = null;
let isQuiting = false;

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: file: psychic: https:",
  "media-src 'self' data: blob: file: https: psychic:",
  "connect-src 'self' ws: http: https:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'self' psychic:",
].join('; ');

protocol.registerSchemesAsPrivileged([{
  scheme: 'psychic',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false },
}]);

function send(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch (err) {
    logger.error('send failed', channel, err);
  }
}

function getWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function seedWallpapers() {
  try {
    const dirs = paths.get();
    const src = paths.resourcesPath('wallpapers');
    if (!fs.existsSync(src)) return;
    for (const name of fs.readdirSync(src)) {
      const target = path.join(dirs.themes, name);
      if (!fs.existsSync(target)) {
        fs.copyFileSync(path.join(src, name), target);
      }
    }
  } catch (err) {
    logger.warn('wallpaper seed failed', err.message);
  }
}

function registerProtocol() {
  try {
    protocol.handle('psychic', async (request) => {
      try {
        const parsed = new URL(request.url);
        if (parsed.host !== 'wallpaper') return new Response('Not found', { status: 404 });
        const name = path.basename(decodeURIComponent(parsed.pathname));
        const themesDir = paths.get().themes;
        const file = path.join(themesDir, name);
        if (!path.resolve(file).startsWith(path.resolve(themesDir))) {
          return new Response('Forbidden', { status: 403 });
        }
        if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
        return net.fetch(url.pathToFileURL(file).toString());
      } catch (err) {
        return new Response(String(err), { status: 500 });
      }
    });
  } catch (err) {
    logger.error('protocol registration failed', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 660,
    show: false,
    frame: false,
    backgroundColor: '#04050d',
    title: 'PSYCHIC',
    icon: paths.resourcesPath('icon.png'),
    roundedCorners: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      backgroundThrottling: false,
      devTools: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setZoomFactor(1);

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (target !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  mainWindow.on('maximize', () => send('window:state', { maximized: true }));
  mainWindow.on('unmaximize', () => send('window:state', { maximized: false }));
  mainWindow.on('enter-full-screen', () => send('window:state', { fullscreen: true }));
  mainWindow.on('leave-full-screen', () => send('window:state', { fullscreen: false }));
  mainWindow.on('focus', () => send('window:focus', true));
  mainWindow.on('blur', () => send('window:focus', false));

  mainWindow.on('close', (event) => {
    if (!isQuiting && store.get('general.tray') && tray) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (store.get('general.startMinimized')) mainWindow.minimize();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    send('app:ready', { version: app.getVersion() });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  if (!store.get('general.tray')) return;
  try {
    const iconPath = paths.resourcesPath('icon.png');
    if (!fs.existsSync(iconPath)) return;
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('PSYCHIC — Neural Interface');
    const menu = Menu.buildFromTemplate([
      { label: 'Показать PSYCHIC', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: 'Свернуть в трей', click: () => mainWindow?.hide() },
      { type: 'separator' },
      { label: 'Новый диалог', click: () => send('app:action', { action: 'new-chat' }) },
      { label: 'Настройки', click: () => send('app:action', { action: 'settings' }) },
      { type: 'separator' },
      { label: 'Выход', click: () => { isQuiting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
    tray.on('balloon-click', () => mainWindow?.show());
  } catch (err) {
    logger.warn('tray creation failed', err.message);
  }
}

function registerShortcuts() {
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      if (!mainWindow) return createWindow();
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
      else { mainWindow.show(); mainWindow.focus(); }
    });
  } catch (err) {
    logger.warn('shortcut failed', err.message);
  }
}

function initServices() {
  const dirs = paths.get();
  const interactions = new Interactions(getWindow);
  const chats = new ChatsService(dirs.chats);
  const skills = new SkillsService(store);
  const memory = new MemoryService(dirs.memory);
  const permissions = new PermissionService({ store, interactions });
  const browser = new BrowserService(getWindow, send);
  const terminal = new TerminalService(send);
  const media = new MediaService({ store, send });
  const computer = new ComputerService({ interactions, store });
  const scheduler = new Scheduler({
    file: path.join(dirs.userData, 'tasks.json'),
    logger,
    onNotify: (payload) => {
      send('app:scheduled', payload);
      if (store.get('general.notifications') !== false) {
        try {
          const { Notification } = require('electron');
          if (Notification.isSupported()) {
            const notification = new Notification({
              title: `⏰ ${payload.title}`,
              body: payload.body || '',
              silent: false,
            });
            notification.on('click', () => {
              mainWindow?.show();
              mainWindow?.focus();
            });
            notification.show();
          }
        } catch {}
      }
    },
    onDue: (task) => {
      // Запускаем агента в отдельном диалоге и не ждём завершения —
      // планировщик не должен блокироваться на генерации.
      const provider = store.get('chat.defaultProvider');
      const model = store.get('chat.defaultModel');
      Promise.resolve()
        .then(() => chats.create({ title: `⏰ ${task.title}`, provider, model }))
        .then((chat) => {
          send('app:action', { action: 'open-chat', chatId: chat.id });
          return agent.send({ chatId: chat.id, text: task.prompt });
        })
        .catch((err) => logger.warn('scheduled task failed', err.message));
      return { started: true };
    },
  });
  scheduler.start(30000);

  services = {
    mainWindow: null,
    interactions,
    chats,
    skills,
    memory,
    permissions,
    browser,
    terminal,
    media,
    computer,
    scheduler,
  };
  services.mainWindow = mainWindow;

  const agent = new Agent({
    store, chats, skills, memory, interactions, services, send,
  });
  services.agent = agent;

  registerIpc({
    getWindow,
    chats,
    skills,
    memory,
    permissions,
    browser,
    terminal,
    media,
    computer,
    scheduler,
    agent,
    interactions,
    getTray: () => tray,
  });

  return services;
}

function applyAutoLaunch() {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!store.get('general.autostart'),
      args: ['--hidden'],
    });
  } catch {}
}

async function checkForUpdates(silent = false) {
  try {
    const cfg = store.get('updates') || {};
    if (silent && cfg.auto === false) return null;
    const info = await checkLatest({
      owner: 'Cotyk207',
      repo: 'psychic-adventure',
      current: app.getVersion(),
    });
    if (info.updateAvailable) {
      send('app:updateAvailable', info);
      if (!silent) {
        shell.openExternal(info.url);
        return info;
      }
    }
    return info;
  } catch (err) {
    logger.warn('update check failed', err.message);
    return null;
  }
}

async function detectLocalProviders() {
  try {
    const found = await providers.detectLocal();
    const list = store.get('providers') || [];
    for (const item of found) {
      const cur = list.find((p) => p.id === item.id);
      if (cur && item.online) {
        cur.online = true;
        if (item.models?.length) cur.models = Array.from(new Set([...(cur.models || []), ...item.models]));
      } else if (cur) {
        cur.online = false;
      }
    }
    store.set('providers', list);
    send('providers:localDetected', found);
  } catch (err) {
    logger.warn('local detection failed', err.message);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_ID);
    paths.init();
    store.init();
    logger.init();
    seedWallpapers();
    registerProtocol();

    if (!isDev) {
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [CSP],
          },
        });
      });
    }

    // Микрофон нужен для голосового ввода, уведомления — для «ответ готов».
    // Всё остальное (геолокация, cookies, экран и т.п.) — запрещено.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      const allowed = ['media', 'notifications', 'clipboard-sanitized-write'];
      callback(allowed.includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler(() => false);

    createWindow();
    createTray();
    registerShortcuts();
    applyAutoLaunch();
    initServices();
    detectLocalProviders();
    checkForUpdates(true);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    isQuiting = true;
    try { services?.terminal?.closeAll(); } catch {}
    try { services?.agent?.stopAll(); } catch {}
    try { globalShortcut.unregisterAll(); } catch {}
  });
}
