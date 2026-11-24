'use strict';

const { WebContentsView, shell } = require('electron');

function normalizeUrl(input) {
  let url = String(input || '').trim();
  if (!url) return 'https://duckduckgo.com';
  if (/^https?:\/\//i.test(url)) return url;
  if (/^file:\/\//i.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url) && !url.includes(' ')) return `https://${url}`;
  if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) return `http://${url}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
}

class BrowserService {
  constructor(getWindow, send) {
    this.getWindow = getWindow;
    this.send = send;
    this.view = null;
    this.bounds = { x: 0, y: 0, width: 0, height: 0 };
    this.state = {
      url: '', title: '', loading: false,
      canGoBack: false, canGoForward: false, visible: false,
    };
  }

  init() {
    if (this.view) return this.view;
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        partition: 'persist:psychic-browser',
        safeDialogs: true,
        spellcheck: false,
      },
    });
    this.view = view;
    view.setBackgroundColor('#000000');
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      try { shell.openExternal(url); } catch {}
      return { action: 'deny' };
    });
    wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    wc.on('did-start-loading', () => this.push({ loading: true }));
    wc.on('did-stop-loading', () => this.push({ loading: false }));
    wc.on('did-navigate', (_e, url) => this.push({ url }));
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.push({ url });
    });
    wc.on('page-title-updated', (_e, title) => this.push({ title }));
    wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.push({ error: `${code} ${desc}`, url });
    });
    wc.on('did-finish-load', () => {
      this.push({
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    });
    this.attach();
    return view;
  }

  attach() {
    const win = this.getWindow();
    if (!win || win.isDestroyed() || !this.view) return;
    try {
      if (!win.contentView.children.includes(this.view)) win.contentView.addChildView(this.view);
    } catch {}
    this.applyBounds();
  }

  applyBounds() {
    if (!this.view) return;
    const b = this.bounds;
    try {
      this.view.setBounds({
        x: Math.round(b.x),
        y: Math.round(b.y),
        width: Math.max(0, Math.round(b.width)),
        height: Math.max(0, Math.round(b.height)),
      });
    } catch {}
  }

  setBounds(bounds) {
    this.bounds = { ...this.bounds, ...bounds };
    this.applyBounds();
    return true;
  }

  show() {
    this.init();
    this.attach();
    this.applyBounds();
    this.push({ visible: true });
    return true;
  }

  hide() {
    if (this.view) {
      try { this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 }); } catch {}
    }
    this.push({ visible: false });
    return true;
  }

  async navigate(url) {
    this.init();
    this.attach();
    const target = normalizeUrl(url);
    const wc = this.view.webContents;
    await wc.loadURL(target);
    this.push({ url: target, visible: true });
    return { url: target };
  }

  back() {
    if (this.view?.webContents.navigationHistory.canGoBack()) this.view.webContents.navigationHistory.goBack();
  }

  forward() {
    if (this.view?.webContents.navigationHistory.canGoForward()) this.view.webContents.navigationHistory.goForward();
  }

  reload() {
    try { this.view?.webContents.reloadIgnoringCache(); } catch {}
  }

  stop() {
    try { this.view?.webContents.stop(); } catch {}
  }

  async read() {
    this.init();
    const wc = this.view.webContents;
    if (!wc.getURL()) return { text: 'Браузер пуст. Сначала открой страницу через browser_open.' };
    const result = await wc.executeJavaScript(`(() => {
      try {
        const clone = document.body ? document.body.cloneNode(true) : document.createElement('div');
        clone.querySelectorAll('script,style,noscript,svg,nav,footer,iframe,canvas').forEach(n => n.remove());
        const text = (clone.innerText || clone.textContent || '').replace(/\\n{3,}/g, '\\n\\n').trim();
        return JSON.stringify({ title: document.title || '', url: location.href, text: text.slice(0, 50000) });
      } catch (e) { return JSON.stringify({ title: '', url: location.href, text: '', error: String(e) }); }
    })()`, true);
    let parsed;
    try { parsed = JSON.parse(result); } catch { parsed = { text: result }; }
    return {
      text: `Страница: ${parsed.title || '—'}\nURL: ${parsed.url || wc.getURL()}\n\n${parsed.text || ''}`,
      data: parsed,
    };
  }

  async evalScript(script) {
    this.init();
    const wc = this.view.webContents;
    if (!wc.getURL()) throw new Error('Браузер пуст');
    const wrapped = `(async () => {
      try {
        const __result = await (async () => { ${script} })();
        let out;
        if (typeof __result === 'string') out = __result;
        else { try { out = JSON.stringify(__result, null, 2); } catch { out = String(__result); } }
        return JSON.stringify({ ok: true, result: out === undefined ? 'undefined' : String(out).slice(0, 30000) });
      } catch (e) {
        return JSON.stringify({ ok: false, error: String(e && e.message || e) });
      }
    })()`;
    const raw = await wc.executeJavaScript(wrapped, true);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { ok: true, result: String(raw) }; }
    if (!parsed.ok) throw new Error(parsed.error);
    return { text: parsed.result || 'undefined', data: { result: parsed.result } };
  }

  async capture() {
    this.init();
    const image = await this.view.webContents.capturePage();
    return image.toPNG();
  }

  push(patch) {
    this.state = { ...this.state, ...patch };
    try { this.send('browser:state', this.state); } catch {}
  }
}

module.exports = { BrowserService, normalizeUrl };
