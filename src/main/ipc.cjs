'use strict';

const { app, dialog, shell, clipboard, Notification, ipcMain, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./lib/store.cjs');
const paths = require('./lib/paths.cjs');
const logger = require('./lib/logger.cjs');
const providers = require('./providers/index.cjs');
const files = require('./tools/files.cjs');
const { searchWeb, fetchUrl } = require('./services/search.cjs');
const { resolveRendererTask } = require('./services/media.cjs');
const system = require('./services/system.cjs');
const { checkLatest } = require('./services/updates.cjs');

function registerIpc(deps) {
  const {
    getWindow, chats, skills, memory, permissions, browser, terminal,
    media, computer, agent, interactions, scheduler, getTray,
  } = deps;

  const win = () => getWindow();

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await fn(payload || {}, event);
      } catch (err) {
        logger.error('IPC failed', channel, err.message);
        throw new Error(err.message || String(err));
      }
    });
  };

  // ── Приложение ──────────────────────────────────────────────────────────
  handle('app:getInfo', () => ({
    version: app.getVersion(),
    name: 'PSYCHIC',
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    isPackaged: app.isPackaged,
    paths: paths.get(),
    locale: app.getLocale(),
    uptime: process.uptime(),
  }));

  handle('app:getWindowState', () => {
    const w = win();
    if (!w) return { exists: false };
    return {
      exists: true,
      minimized: w.isMinimized(),
      maximized: w.isMaximized(),
      fullscreen: w.isFullScreen(),
      alwaysOnTop: w.isAlwaysOnTop(),
      bounds: w.getBounds(),
    };
  });

  handle('app:minimize', () => { win()?.minimize(); return true; });
  handle('app:maximize', () => { win()?.maximize(); return true; });
  handle('app:unmaximize', () => { win()?.unmaximize(); return true; });
  handle('app:toggleMaximize', () => {
    const w = win();
    if (!w) return false;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
    return w.isMaximized();
  });
  handle('app:close', () => { win()?.close(); return true; });
  handle('app:hide', () => { win()?.hide(); return true; });
  handle('app:show', () => {
    const w = win();
    if (!w) return false;
    w.show();
    w.focus();
    return true;
  });
  handle('app:setFullscreen', ({ enabled }) => {
    const w = win();
    if (!w) return false;
    w.setFullScreen(!!enabled);
    return true;
  });
  handle('app:setAlwaysOnTop', ({ enabled }) => { win()?.setAlwaysOnTop(!!enabled); return true; });
  handle('app:quit', () => { app.quit(); return true; });
  handle('app:relaunch', () => {
    app.relaunch();
    app.quit();
    return true;
  });
  handle('app:setAutoLaunch', ({ enabled }) => {
    app.setLoginItemSettings({ openAtLogin: !!enabled, args: ['--hidden'] });
    return app.getLoginItemSettings();
  });
  handle('app:openExternal', async ({ url }) => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('Разрешены только http(s) ссылки');
    await shell.openExternal(url);
    return true;
  });
  handle('app:openPath', async ({ path: p }) => {
    const error = await shell.openPath(p);
    if (error) throw new Error(error);
    return true;
  });
  handle('app:showItemInFolder', ({ path: p }) => {
    shell.showItemInFolder(p);
    return true;
  });
  handle('app:log', ({ level = 'info', message }) => {
    logger[level] ? logger[level](message) : logger.info(message);
    return true;
  });
  // ── Система ─────────────────────────────────────────────────────────────
  handle('system:stats', () => system.collect({
    extra: { version: app.getVersion(), electron: process.versions.electron },
  }));

  // ── Автоматизация ───────────────────────────────────────────────────────
  handle('tasks:list', () => (scheduler ? scheduler.list() : []));
  handle('tasks:add', ({ task }) => {
    if (!scheduler) throw new Error('Планировщик недоступен');
    return scheduler.add(task);
  });
  handle('tasks:update', ({ id, patch }) => {
    if (!scheduler) throw new Error('Планировщик недоступен');
    return scheduler.update(id, patch);
  });
  handle('tasks:toggle', ({ id, enabled }) => {
    if (!scheduler) throw new Error('Планировщик недоступен');
    return scheduler.toggle(id, enabled);
  });
  handle('tasks:delete', ({ id }) => (scheduler ? scheduler.remove(id) : false));
  handle('tasks:runNow', async ({ id }) => {
    if (!scheduler) throw new Error('Планировщик недоступен');
    return scheduler.runNow(id);
  });

  // ── Обновления ──────────────────────────────────────────────────────────
  handle('app:checkUpdates', () => checkLatest({
    owner: 'Cotyk207',
    repo: 'psychic-adventure',
    current: app.getVersion(),
  }));
  handle('app:openRelease', ({ url }) => {
    if (!/^https:\/\/github\.com\//.test(String(url || ''))) throw new Error('Недопустимая ссылка');
    shell.openExternal(url);
    return true;
  });

  handle('app:notify', ({ title, body, silent }) => {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title: String(title || 'PSYCHIC'), body: String(body || ''), silent: !!silent });
    n.show();
    n.on('click', () => {
      const w = win();
      if (w) { w.show(); w.focus(); }
    });
    return true;
  });
  handle('app:setProgress', ({ value }) => {
    win()?.setProgressBar(value);
    return true;
  });
  handle('app:openDevTools', () => {
    win()?.webContents.openDevTools({ mode: 'detach' });
    return true;
  });
  handle('app:factoryReset', () => {
    chats.clear();
    memory.clear();
    if (scheduler) {
      for (const task of scheduler.list()) scheduler.remove(task.id);
    }
    store.reset();
    return true;
  });

  // ── Конфигурация ────────────────────────────────────────────────────────
  handle('config:get', () => store.get());
  handle('config:getKey', ({ key }) => store.get(key));
  handle('config:set', ({ key, value }) => {
    store.set(key, value);
    return store.get(key);
  });
  handle('config:patch', ({ value }) => store.patch(value));
  handle('config:reset', () => store.reset());
  handle('config:export', async () => {
    const result = await dialog.showSaveDialog(win(), {
      title: 'Экспорт настроек PSYCHIC',
      defaultPath: path.join(app.getPath('downloads'), 'psychic-config.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return store.exportTo(result.filePath);
  });
  handle('config:import', async () => {
    const result = await dialog.showOpenDialog(win(), {
      title: 'Импорт настроек',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return store.importFrom(result.filePaths[0]);
  });
  handle('config:openFolder', () => {
    shell.openPath(paths.get().config);
    return true;
  });

  // ── Диалоги ─────────────────────────────────────────────────────────────
  handle('chats:list', () => chats.list());
  handle('chats:get', ({ id }) => chats.get(id));
  handle('chats:create', ({ title, provider, model, systemPrompt }) => chats.create({ title, provider, model, systemPrompt }));
  handle('chats:save', ({ chat }) => chats.save(chat));
  handle('chats:delete', ({ id }) => chats.remove(id));
  handle('chats:rename', ({ id, title }) => chats.rename(id, title));
  handle('chats:pin', ({ id }) => chats.togglePin(id));
  handle('chats:fork', ({ id, messageId }) => chats.fork(id, messageId));
  handle('chats:clear', () => chats.clear());
  handle('chats:export', async ({ id }) => {
    const chat = chats.get(id);
    if (!chat) return null;
    const result = await dialog.showSaveDialog(win(), {
      title: 'Экспорт диалога',
      defaultPath: path.join(app.getPath('downloads'), `${chat.title || 'chat'}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    if (result.filePath.endsWith('.md')) {
      const md = chat.messages.map((m) => `## ${m.role === 'user' ? 'Вы' : 'PSYCHIC'}\n\n${m.content || ''}\n`).join('\n---\n\n');
      fs.writeFileSync(result.filePath, md, 'utf8');
    } else {
      fs.writeFileSync(result.filePath, JSON.stringify(chat, null, 2), 'utf8');
    }
    return result.filePath;
  });

  // ── Провайдеры и модели ─────────────────────────────────────────────────
  handle('providers:list', () => store.get('providers'));
  handle('providers:save', ({ provider }) => {
    const list = store.get('providers') || [];
    const item = { ...provider };
    if (!item.id) item.id = store.newProviderId();
    const idx = list.findIndex((p) => p.id === item.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...item };
    else list.push(item);
    store.set('providers', list);
    return item;
  });
  handle('providers:delete', ({ id }) => {
    const list = store.get('providers') || [];
    const target = list.find((p) => p.id === id);
    if (!target) return false;
    if (target.builtin) {
      target.apiKey = '';
      target.enabled = false;
      store.set('providers', list);
      return true;
    }
    store.set('providers', list.filter((p) => p.id !== id));
    return true;
  });
  handle('providers:test', async ({ provider }) => {
    const started = Date.now();
    const models = await providers.listModels(provider);
    return {
      ok: true,
      latency: Date.now() - started,
      count: models.length,
      sample: models.slice(0, 10),
    };
  });
  handle('providers:fetchModels', async ({ provider }) => {
    const models = await providers.listModels(provider);
    const list = store.get('providers') || [];
    const cur = list.find((p) => p.id === provider.id);
    if (cur) {
      cur.models = Array.from(new Set([...(cur.models || []), ...models]));
      store.set('providers', list);
    }
    return models;
  });
  handle('providers:detectLocal', async () => {
    const found = await providers.detectLocal();
    const list = store.get('providers') || [];
    for (const item of found) {
      const cur = list.find((p) => p.id === item.id);
      if (cur && item.online) {
        cur.online = true;
        if (item.models?.length) cur.models = Array.from(new Set([...(cur.models || []), ...item.models]));
        if (!cur.enabled) cur.enabled = true;
      } else if (cur) {
        cur.online = false;
      }
    }
    store.set('providers', list);
    return found;
  });

  // ── Агент ───────────────────────────────────────────────────────────────
  handle('agent:send', async (payload) => {
    const result = await agent.send(payload);
    if (result?.error) throw new Error(result.error);
    return { ok: true };
  });
  handle('agent:regenerate', async ({ chatId, reasoningEffort }) => {
    const chat = chats.get(chatId);
    if (!chat) throw new Error('Диалог не найден');
    const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) throw new Error('Нет сообщения для повторной генерации');
    const result = await agent.send({
      chatId,
      text: lastUser.content,
      regenerate: true,
      providerId: chat.provider,
      model: chat.model,
      reasoningEffort,
    });
    if (result?.error) throw new Error(result.error);
    return { ok: true };
  });
  handle('agent:stop', ({ chatId }) => agent.stop(chatId));
  handle('agent:status', () => ({ active: [...agent.active.keys()] }));

  // ── Скиллы ──────────────────────────────────────────────────────────────
  handle('skills:list', () => skills.list());
  handle('skills:get', ({ id }) => skills.get(id));
  handle('skills:save', ({ skill }) => skills.save(skill));
  handle('skills:delete', ({ id }) => skills.remove(id));
  handle('skills:toggle', ({ id, enabled }) => skills.toggle(id, enabled));
  handle('skills:setEnabled', ({ ids }) => skills.setEnabledMany(ids));
  handle('skills:duplicate', ({ id }) => skills.duplicate(id));
  handle('skills:importFolder', async () => {
    const result = await dialog.showOpenDialog(win(), {
      title: 'Выбери папку со скиллом (с SKILL.md)',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return skills.importFolder(result.filePaths[0]);
  });
  handle('skills:generate', async ({ description, providerId, model }) => {
    const provider = (store.get('providers') || []).find((p) => p.id === providerId)
      || (store.get('providers') || []).find((p) => p.id === store.get('chat.defaultProvider'));
    if (!provider) throw new Error('Не выбран провайдер');
    return skills.generate(description, providers, { provider, model: model || store.get('chat.defaultModel') });
  });
  handle('skills:installUrl', async ({ url }) => skills.installFromUrl(url, providers));

  // ── Память ──────────────────────────────────────────────────────────────
  handle('memory:list', () => memory.all());
  handle('memory:add', ({ content, text, tags, category }) => memory.add(content || text, tags, category));
  handle('memory:update', ({ id, text, content, tags, category }) =>
    memory.update(id, { content: content || text, tags, category }));
  handle('memory:delete', ({ id }) => memory.remove(id));
  handle('memory:clear', () => memory.clear());
  handle('memory:search', ({ query }) => memory.search(query, 20));
  handle('memory:export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Экспорт памяти',
      defaultPath: path.join(paths.get().userData || paths.home(), 'psychic-memory.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return { path: memory.exportJson(result.filePath), count: memory.all().length };
  });
  handle('memory:setEnabled', ({ enabled }) => {
    store.set('memory.enabled', !!enabled);
    return !!enabled;
  });

  // ── Файлы ───────────────────────────────────────────────────────────────
  handle('fs:list', ({ path: p, depth, showHidden }) => files.listDirectory({ path: p, depth, showHidden }));
  handle('fs:read', ({ path: p }) => {
    const abs = files.resolvePath(p);
    const st = fs.statSync(abs);
    if (st.size > 30 * 1024 * 1024) throw new Error('Файл слишком большой');
    const buf = fs.readFileSync(abs);
    if (require('./lib/util.cjs').isProbablyBinary(buf)) {
      return { path: abs, binary: true, base64: buf.toString('base64'), size: st.size, mime: files.mimeOf(abs) };
    }
    return { path: abs, content: buf.toString('utf8'), size: st.size, binary: false, mime: files.mimeOf(abs) };
  });
  handle('fs:write', ({ path: p, content }) => {
    const abs = files.resolvePath(p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, String(content ?? ''), 'utf8');
    return { path: abs, size: fs.statSync(abs).size };
  });
  handle('fs:stat', ({ path: p }) => files.getFileInfo({ path: p }));
  handle('fs:mkdir', ({ path: p }) => {
    fs.mkdirSync(files.resolvePath(p), { recursive: true });
    return true;
  });
  handle('fs:delete', ({ path: p, recursive }) => {
    const abs = files.resolvePath(p);
    files.assertSafeTarget(abs);
    fs.rmSync(abs, { recursive: recursive !== false, force: true });
    return true;
  });
  handle('fs:rename', ({ from, to }) => {
    fs.mkdirSync(path.dirname(files.resolvePath(to)), { recursive: true });
    fs.renameSync(files.resolvePath(from), files.resolvePath(to));
    return true;
  });
  handle('fs:copy', ({ from, to }) => {
    fs.cpSync(files.resolvePath(from), files.resolvePath(to), { recursive: true });
    return true;
  });
  handle('fs:openFile', async ({ path: p }) => {
    const error = await shell.openPath(p);
    if (error) throw new Error(error);
    return true;
  });
  handle('fs:pickFile', async ({ filters, multi } = {}) => {
    const result = await dialog.showOpenDialog(win(), {
      title: 'Выбрать файл',
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: filters || [{ name: 'Все файлы', extensions: ['*'] }],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });
  handle('fs:pickFolder', async () => {
    const result = await dialog.showOpenDialog(win(), {
      title: 'Выбрать папку',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
  handle('fs:pickSave', async ({ defaultPath, filters } = {}) => {
    const result = await dialog.showSaveDialog(win(), {
      title: 'Сохранить файл',
      defaultPath: defaultPath || path.join(app.getPath('downloads'), 'file.txt'),
      filters: filters || [{ name: 'Все файлы', extensions: ['*'] }],
    });
    if (result.canceled) return null;
    return result.filePath;
  });
  handle('fs:quickAccess', () => ({
    home: paths.home(),
    workspace: paths.get().workspace,
    desktop: paths.get().desktop,
    documents: paths.get().documents,
    downloads: paths.get().downloads,
    music: paths.get().musicLibrary,
  }));

  // ── Медиа ───────────────────────────────────────────────────────────────
  handle('media:generateImage', (payload) => media.generateImage(payload));
  handle('media:generateMusic', (payload) => media.generateMusic(payload));
  handle('media:generateVideo', (payload) => media.generateVideo(payload));
  handle('media:list', ({ type }) => media.list(type || 'all'));
  handle('media:dataUrl', ({ path: p }) => media.dataUrl(p));
  handle('media:delete', ({ path: p }) => media.remove(p));
  handle('media:thumbnail', ({ path: p, size }) => {
    try {
      const image = nativeImage.createFromPath(p);
      if (image.isEmpty()) return null;
      const target = Math.min(512, Math.max(64, Number(size) || 256));
      const resized = image.resize({ width: target, quality: 'good' });
      return resized.toDataURL();
    } catch {
      return null;
    }
  });
  handle('media:openFolder', ({ kind }) => {
    const dirs = {
      images: paths.get().images,
      music: paths.get().music,
      video: paths.get().video,
      screenshots: paths.get().screenshots,
    };
    const target = dirs[kind] || paths.get().media;
    shell.openPath(target);
    return target;
  });
  handle('media:setWallpaper', ({ path: p }) => media.setWallpaper(p));
  handle('media:saveDataUrl', ({ dataUrl, name, folder }) => {
    const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) throw new Error('Некорректный data URL');
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'video/webm': 'webm', 'video/mp4': 'mp4' }[match[1]] || 'bin';
    const dir = folder === 'attachments' ? paths.get().attachments : paths.get().images;
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name || 'saved'}-${Date.now()}.${ext}`);
    fs.writeFileSync(file, Buffer.from(match[2], 'base64'));
    return { path: file, mime: match[1] };
  });
  handle('media:renderResult', (payload) => resolveRendererTask(payload));

  const scanMusicLibrary = () => {
    const roots = [paths.get().musicLibrary, paths.get().music, paths.get().downloads].filter(Boolean);
    const tracks = [];
    const seen = new Set();
    const walk = (dir, depth = 0) => {
      if (!dir || depth > 4 || tracks.length > 2000) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'AppData'].includes(entry.name)) walk(full, depth + 1);
        } else if (/\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i.test(entry.name)) {
          if (seen.has(full)) continue;
          seen.add(full);
          try {
            const st = fs.statSync(full);
            const base = path.basename(entry.name, path.extname(entry.name));
            const parts = base.split(' - ');
            tracks.push({
              path: full,
              name: entry.name,
              title: parts.length > 1 ? parts.slice(1).join(' - ').trim() : base,
              artist: parts.length > 1 ? parts[0].trim() : '',
              album: '',
              size: st.size,
            });
          } catch {}
        }
      }
    };
    for (const root of roots) walk(root);
    return tracks.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  };
  handle('music:library', () => scanMusicLibrary());
  handle('music:refreshLibrary', () => scanMusicLibrary());
  handle('music:openLibrary', () => {
    const target = paths.get().musicLibrary || paths.get().music;
    fs.mkdirSync(target, { recursive: true });
    shell.openPath(target);
    return target;
  });
  handle('music:radioList', () => ({
    stations: [
      { name: 'Synthwave FM', url: 'https://stream.zeno.fm/f7wq7q8bt3cvv', genre: 'Synthwave', bitrate: '128k' },
      { name: 'Nightride FM', url: 'https://stream.nightride.fm/nightride.ogg', genre: 'Retrowave', bitrate: '128k' },
      { name: 'Chillhop Radio', url: 'https://stream.zeno.fm/7dfq8q8bt3cvv', genre: 'Lo-fi', bitrate: '128k' },
      { name: 'Lofi Girl', url: 'https://stream.zeno.fm/f26wqbb3qf8uv', genre: 'Lo-fi', bitrate: '128k' },
      { name: 'Radio Paradise', url: 'https://stream.radioparadise.com/aac-128', genre: 'Eclectic', bitrate: '128k' },
      { name: 'SomaFM Groove Salad', url: 'https://ice1.somafm.com/groovesalad-128-mp3', genre: 'Ambient', bitrate: '128k' },
      { name: 'SomaFM DEF CON Radio', url: 'https://ice1.somafm.com/defcon-128-mp3', genre: 'Electronic', bitrate: '128k' },
    ],
  }));

  handle('clipboard:write', (payload) => {
    const text = typeof payload === 'string' ? payload : payload?.text;
    clipboard.writeText(String(text ?? ''));
    return true;
  });
  handle('clipboard:read', () => clipboard.readText());

  // ── Браузер ─────────────────────────────────────────────────────────────
  handle('browser:open', async ({ url, read }) => {
    const result = await browser.navigate(url);
    if (read) {
      try {
        return { ...result, page: await browser.read() };
      } catch {}
    }
    return result;
  });
  handle('browser:action', ({ action }) => {
    if (action === 'back') browser.back();
    else if (action === 'forward') browser.forward();
    else if (action === 'reload') browser.reload();
    else if (action === 'stop') browser.stop();
    return true;
  });
  handle('browser:setBounds', ({ bounds }) => {
    browser.setBounds(bounds);
    return true;
  });
  handle('browser:show', () => browser.show());
  handle('browser:hide', () => browser.hide());
  handle('browser:read', () => browser.read());
  handle('browser:eval', ({ script }) => browser.evalScript(script));
  handle('browser:screenshot', async () => {
    const png = await browser.capture();
    return { dataUrl: `data:image/png;base64,${png.toString('base64')}` };
  });
  handle('browser:getState', () => browser.state);

  // ── Терминал ────────────────────────────────────────────────────────────
  handle('terminal:create', ({ cwd, shell: sh }) => terminal.create({ cwd, shell: sh }));
  handle('terminal:write', ({ id, data }) => terminal.write(id, data));
  handle('terminal:resize', ({ cols, rows }) => terminal.resize(cols, rows));
  handle('terminal:close', ({ id }) => terminal.close(id));

  // ── Взаимодействие с пользователем ──────────────────────────────────────
  handle('interactions:resolve', (payload) => interactions.resolve(payload.id, payload));
  handle('interactions:reject', ({ id, error }) => {
    const item = interactions.pending.get(id);
    if (item) {
      clearTimeout(item.timer);
      interactions.pending.delete(id);
      item.reject(new Error(error || 'Отменено'));
      return true;
    }
    return false;
  });

  // ── Поиск ───────────────────────────────────────────────────────────────
  handle('web:search', async ({ query, maxResults }) => {
    const cfg = store.get('search') || {};
    return searchWeb(query, {
      maxResults: maxResults || cfg.maxResults,
      engine: cfg.engine,
      braveKey: cfg.braveKey,
      tavilyKey: cfg.tavilyKey,
      searxUrl: cfg.searxUrl,
    });
  });
  handle('web:fetch', ({ url, maxLength }) => fetchUrl(url, { maxLength }));
  handle('web:clipboard', () => clipboard.readText());

  logger.info('IPC handlers registered');
}

module.exports = { registerIpc };
