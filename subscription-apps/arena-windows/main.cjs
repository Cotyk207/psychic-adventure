// Unofficial standalone browser for the live Arena site. No Node access is exposed to pages.
const { app, BrowserWindow, dialog, session } = require('electron');
const HOME = 'https://arena.ai/';
const isHttps = value => {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const isArena = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'arena.ai' || url.hostname.endsWith('.arena.ai')); } catch { return false; }
};
function secureWindow(win) {
  const wc = win.webContents;
  wc.on('will-navigate', (event, url) => { if (!isHttps(url)) event.preventDefault(); });
  wc.on('will-redirect', (event, url) => { if (!isHttps(url)) event.preventDefault(); });
  wc.setWindowOpenHandler(({ url }) => isHttps(url) || url === 'about:blank'
    ? { action: 'allow', overrideBrowserWindowOptions: { width: 1000, height: 720, webPreferences: { partition: 'persist:arena', nodeIntegration: false, contextIsolation: true, sandbox: true } } }
    : { action: 'deny' });
  wc.on('did-create-window', secureWindow);
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.alt && input.key === 'ArrowLeft' && wc.canGoBack()) { wc.goBack(); event.preventDefault(); }
    else if (input.alt && input.key === 'ArrowRight' && wc.canGoForward()) { wc.goForward(); event.preventDefault(); }
    else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { wc.reload(); event.preventDefault(); }
  });
}
app.whenReady().then(() => {
  const ses = session.fromPartition('persist:arena');
  ses.setPermissionCheckHandler((_wc, permission, origin) => isArena(origin) && ['media', 'fullscreen'].includes(permission));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = details.requestingUrl || wc.getURL();
    if (!isArena(origin)) return callback(false);
    if (permission === 'fullscreen') return callback(true);
    if (permission !== 'media') return callback(false);
    const types = details.mediaTypes || [];
    if (!types.length || types.some(type => !['audio', 'video'].includes(type))) return callback(false);
    const result = dialog.showMessageBoxSync(BrowserWindow.fromWebContents(wc), {
      type: 'question', buttons: ['Разрешить', 'Отказать'], defaultId: 1, cancelId: 1,
      title: 'Доступ к устройству', message: `Разрешить Arena.ai доступ: ${types.join(', ')}?`
    });
    callback(result === 0);
  });
  const win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 360, minHeight: 500, title: 'Arena',
    webPreferences: { partition: 'persist:arena', nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  secureWindow(win);
  win.loadURL(HOME);
});
app.on('window-all-closed', () => app.quit());
