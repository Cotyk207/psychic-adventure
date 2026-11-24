'use strict';

/**
 * Интеграционный прогон main-процесса: приложение реально поднимается на заглушке
 * Electron, после чего дёргается каждый IPC-обработчик с настоящими временными папками.
 */

require('./setup.cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const electron = require('electron');
const APP_VERSION = require('../package.json').version;
const { ipcMain } = electron;

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT', err && err.stack);
  process.exitCode = 3;
});

const ready = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('main process did not boot in 15s')), 15000);
  require('../src/main/index.cjs');
  setTimeout(() => {
    clearTimeout(timer);
    if (ipcMain.handlers.size === 0) return reject(new Error('no IPC handlers registered'));
    resolve();
  }, 800);
});

const call = (channel, payload) => {
  const fn = ipcMain.handlers.get(channel);
  if (!fn) throw new Error(`unknown channel ${channel}`);
  return fn({ sender: { isDestroyed: () => false } }, payload || {});
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psychic-ipc-'));
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

test.before(async () => { await ready; });

// ══ Приложение ═════════════════════════════════════════════════════════════

test('app:getInfo отдаёт версию и пути', async () => {
  const info = await call('app:getInfo');
  assert.equal(info.version, APP_VERSION);
  assert.equal(info.name, 'PSYCHIC');
  assert.ok(info.paths.userData);
  assert.equal(typeof info.uptime, 'number');
});

test('app: окно и его состояние', async () => {
  const state = await call('app:getWindowState');
  assert.equal(state.exists, true);
  assert.equal(state.maximized, false);
  await call('app:minimize');
  await call('app:maximize');
  await call('app:unmaximize');
  await call('app:setFullscreen', { enabled: true });
  await call('app:setAlwaysOnTop', { enabled: true });
  await call('app:show');
  await call('app:hide');
  assert.equal(await call('app:toggleMaximize'), false);
  await call('app:setProgress', { value: 0.5 });
});

test('app:openExternal отвергает не-http ссылки', async () => {
  await assert.rejects(() => call('app:openExternal', { url: 'file:///etc/passwd' }), /http/i);
  assert.equal(await call('app:openExternal', { url: 'https://example.com' }), true);
  assert.deepEqual(electron.shell.opened, ['https://example.com']);
});

test('app:openRelease отвергает чужие домены', async () => {
  await assert.rejects(() => call('app:openRelease', { url: 'https://evil.example/x' }), /недопустимая/i);
  assert.equal(await call('app:openRelease', { url: 'https://github.com/Cotyk207/psychic-adventure/releases' }), true);
});

test('app:log принимает уровни', async () => {
  assert.equal(await call('app:log', { level: 'warn', message: 'test warning' }), true);
  assert.equal(await call('app:log', { message: 'test info' }), true);
});

test('app:notify показывает уведомление', async () => {
  assert.equal(await call('app:notify', { title: 'Тест', body: 'Тело уведомления' }), true);
  const shown = electron.Notification.shown;
  assert.equal(shown[shown.length - 1].title, 'Тест');
});

// ══ Система и автоматизация ════════════════════════════════════════════════

test('system:stats собирает телеметрию', async () => {
  const stats = await call('system:stats');
  assert.ok(stats.cpu.percent >= 0 && stats.cpu.percent <= 100);
  assert.ok(stats.memory.total > 0);
  assert.ok(Array.isArray(stats.disks) && stats.disks.length > 0);
  assert.ok(stats.uptimeText.length > 0);
  assert.equal(stats.version, APP_VERSION);
});

test('tasks: полный цикл CRUD', async () => {
  const dir = tmp();
  const created = await call('tasks:add', {
    task: { title: 'Тестовая задача', prompt: 'проверка', every: 3600000, runAgent: false, notify: true },
  });
  assert.ok(created.id);
  assert.equal(created.enabled, true);
  assert.ok(created.nextRunAt > Date.now());

  const list = await call('tasks:list');
  assert.equal(list.length, 1);

  const updated = await call('tasks:update', { id: created.id, patch: { title: 'Переименована' } });
  assert.equal(updated.title, 'Переименована');

  await call('tasks:toggle', { id: created.id, enabled: false });
  assert.equal((await call('tasks:list'))[0].enabled, false);

  const run = await call('tasks:runNow', { id: created.id });
  assert.ok(run);

  assert.equal(await call('tasks:delete', { id: created.id }), true);
  assert.equal((await call('tasks:list')).length, 0);
});

test('tasks: невалидные данные дают понятную ошибку', async () => {
  await assert.rejects(() => call('tasks:add', { task: { title: '' } }), /название/i);
  await assert.rejects(() => call('tasks:add', { task: { title: 'Без расписания' } }), /время|период/i);
});

// ══ Конфигурация ═══════════════════════════════════════════════════════════

test('config: get/set/patch/reset', async () => {
  const config = await call('config:get');
  assert.ok(config && typeof config === 'object');

  assert.equal(await call('config:set', { key: 'chat.defaultModel', value: 'test-model' }), 'test-model');
  assert.equal(await call('config:getKey', { key: 'chat.defaultModel' }), 'test-model');

  await call('config:patch', { value: { chat: { temperature: 0.3 } } });
  assert.equal(await call('config:getKey', { key: 'chat.temperature' }), 0.3);

  await call('config:reset');
  assert.notEqual(await call('config:getKey', { key: 'chat.defaultModel' }), 'test-model');
});

test('config: экспорт и импорт через диалог', async () => {
  await call('config:set', { key: 'chat.defaultModel', value: 'exported-model' });
  const target = path.join(tmp(), 'config.json');
  electron.dialog.lastSavePath = target;
  const saved = await call('config:export');
  assert.equal(saved, target);
  assert.equal(JSON.parse(fs.readFileSync(target, 'utf8')).chat.defaultModel, 'exported-model');

  await call('config:reset');
  assert.notEqual(await call('config:getKey', { key: 'chat.defaultModel' }), 'exported-model');

  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  const imported = await call('config:import');
  assert.equal(imported.chat.defaultModel, 'exported-model');
});

// ══ Диалоги ═══════════════════════════════════════════════════════════════

test('chats: полный цикл', async () => {
  const chat = await call('chats:create', { title: 'Первый', provider: 'pollinations', model: 'openai' });
  assert.ok(chat.id);
  assert.equal(chat.title, 'Первый');

  const second = await call('chats:create', { title: 'Второй' });
  assert.equal((await call('chats:list')).length >= 2, true);

  assert.equal((await call('chats:rename', { id: chat.id, title: 'Переименован' })).title, 'Переименован');
  assert.equal((await call('chats:pin', { id: chat.id })).pinned, true);
  assert.equal((await call('chats:pin', { id: chat.id })).pinned, false);

  const loaded = await call('chats:get', { id: chat.id });
  assert.equal(loaded.id, chat.id);

  await call('chats:save', { chat: { ...loaded, messages: [{ role: 'user', content: 'привет' }] } });
  assert.equal((await call('chats:get', { id: chat.id })).messages.length, 1);

  const mdPath = path.join(tmp(), 'chat.md');
  electron.dialog.lastSavePath = mdPath;
  assert.equal(await call('chats:export', { id: chat.id }), mdPath);
  assert.match(fs.readFileSync(mdPath, 'utf8'), /привет/);

  assert.equal(await call('chats:delete', { id: second.id }), true);
  await call('chats:clear');
  assert.equal((await call('chats:list')).length, 0);
});

// ══ Провайдеры ═════════════════════════════════════════════════════════════

test('providers: сохранение, изменение, удаление', async () => {
  const saved = await call('providers:save', {
    provider: { name: 'Мой провайдер', type: 'openai', baseUrl: 'https://api.test/v1', apiKey: 'k', models: ['m1'] },
  });
  assert.ok(saved.id);
  assert.equal(saved.name, 'Мой провайдер');

  const updated = await call('providers:save', { provider: { id: saved.id, name: 'Переименован' } });
  assert.equal(updated.name, 'Переименован');
  const list = await call('providers:list');
  assert.equal(list.find((p) => p.id === saved.id).name, 'Переименован');

  assert.equal(await call('providers:delete', { id: saved.id }), true);
  assert.equal((await call('providers:list')).some((p) => p.id === saved.id), false);
});

test('providers: встроенный провайдер не удаляется, а отключается', async () => {
  const builtin = (await call('providers:list')).find((p) => p.builtin);
  assert.ok(builtin, 'встроенные провайдеры должны быть');
  assert.equal(await call('providers:delete', { id: builtin.id }), true);
  const after = (await call('providers:list')).find((p) => p.id === builtin.id);
  assert.ok(after, 'встроенный провайдер остаётся в списке');
  assert.equal(after.enabled, false);
  await call('providers:save', { provider: { id: builtin.id, enabled: true } });
});

test('providers: fetchModels ходит в API и дополняет список', async () => {
  const provider = await call('providers:save', {
    provider: { name: 'API', type: 'openai', baseUrl: 'https://api.test/v1', apiKey: 'k', models: ['m1'] },
  });
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }), { status: 200 });
  try {
    const models = await call('providers:fetchModels', { provider });
    assert.deepEqual(models.sort(), ['m1', 'm2']);
    const stored = (await call('providers:list')).find((p) => p.id === provider.id);
    assert.ok(stored.models.includes('m2'));
  } finally {
    globalThis.fetch = original;
    await call('providers:delete', { id: provider.id });
  }
});

test('providers: detectLocal не падает без локальных серверов', async () => {
  const found = await call('providers:detectLocal');
  assert.ok(Array.isArray(found));
});

// ══ Скиллы ═════════════════════════════════════════════════════════════════

test('skills: список, переключение, клонирование, удаление', async () => {
  const skills = await call('skills:list');
  assert.ok(skills.length >= 12, `нашлось ${skills.length}`);
  const target = skills.find((s) => s.id === 'coding');
  assert.ok(target);

  const detail = await call('skills:get', { id: 'coding' });
  assert.match(detail.body, /Coding/);

  await call('skills:toggle', { id: 'coding', enabled: true });
  assert.equal((await call('skills:list')).find((s) => s.id === 'coding').enabled, true);

  await call('skills:setEnabled', { ids: ['coding', 'web-research'] });
  assert.equal((await call('skills:list')).filter((s) => s.enabled).length, 2);

  await assert.rejects(() => call('skills:delete', { id: 'coding' }), /встроенный/i);
  const copy = await call('skills:duplicate', { id: 'coding' });
  assert.ok(copy.id);
  assert.equal(await call('skills:delete', { id: copy.id }), true);
});

test('skills: сохранение пользовательского скилла', async () => {
  const saved = await call('skills:save', {
    skill: {
      name: 'Мой скилл',
      description: 'Для теста',
      whenToUse: 'Всегда',
      color: '#ff00aa',
      icon: 'sparkles',
      tools: ['read_file'],
      body: '# Делай хорошо',
    },
  });
  assert.ok(saved.id);
  assert.equal(saved.builtin, false);
  const stored = await call('skills:get', { id: saved.id });
  assert.equal(stored.name, 'Мой скилл');
  assert.equal(await call('skills:delete', { id: saved.id }), true);
});

test('skills: импорт из папки', async () => {
  const folder = tmp();
  fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\nname: "Импорт"\ndescription: "Из папки"\n---\nТело скилла');
  electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  const skill = await call('skills:importFolder');
  assert.equal(skill.name, 'Импорт');
  await call('skills:delete', { id: skill.id });
});

// ══ Память ═════════════════════════════════════════════════════════════════

test('memory: полный цикл через IPC', async () => {
  const item = await call('memory:add', { content: 'Люблю синтвейв', tags: ['музыка'], category: 'facts' });
  assert.ok(item.id);
  assert.equal((await call('memory:list')).length, 1);

  assert.equal((await call('memory:search', { query: 'синтвейв' })).length, 1);

  const updated = await call('memory:update', { id: item.id, text: 'Люблю синтвейв и неон' });
  assert.equal(updated.content, 'Люблю синтвейв и неон');

  const target = path.join(tmp(), 'memory.json');
  electron.dialog.lastSavePath = target;
  const exported = await call('memory:export');
  assert.equal(exported.count, 1);
  assert.ok(fs.existsSync(target));

  assert.equal(await call('memory:delete', { id: item.id }), true);
  await call('memory:add', { content: 'Вторая запись' });
  await call('memory:clear');
  assert.equal((await call('memory:list')).length, 0);

  assert.equal(await call('memory:setEnabled', { enabled: false }), false);
  assert.equal(await call('config:getKey', { key: 'memory.enabled' }), false);
});

// ══ Файлы ═════════════════════════════════════════════════════════════════

test('fs: запись, чтение, инфо, папки, копирование, переименование, удаление', async () => {
  const dir = tmp();
  const file = path.join(dir, 'nested', 'hello.txt');

  const written = await call('fs:write', { path: file, content: 'привет мир' });
  assert.equal(written.size, 19);
  assert.equal(fs.existsSync(file), true);

  const read = await call('fs:read', { path: file });
  assert.equal(read.content, 'привет мир');
  assert.equal(read.binary, false);
  assert.equal(read.mime, 'text/plain');

  const info = await call('fs:stat', { path: file });
  assert.equal(info.data.size, 19);
  assert.equal(info.data.type, 'file');
  assert.equal(info.data.mime, 'text/plain');
  assert.match(info.text, /hello\.txt/);

  assert.equal(await call('fs:mkdir', { path: path.join(dir, 'empty') }), true);
  const list = await call('fs:list', { path: dir, depth: 2 });
  assert.equal(list.data.path, dir);
  assert.ok(list.data.entries.some((e) => /[\\/]nested$/.test(e.path)));
  assert.ok(list.data.entries.some((e) => /[\\/]empty$/.test(e.path)));

  const copy = path.join(dir, 'copy.txt');
  assert.equal(await call('fs:copy', { from: file, to: copy }), true);
  assert.equal(fs.readFileSync(copy, 'utf8'), 'привет мир');

  const moved = path.join(dir, 'moved.txt');
  assert.equal(await call('fs:rename', { from: copy, to: moved }), true);
  assert.equal(fs.existsSync(copy), false);

  assert.equal(await call('fs:delete', { path: moved }), true);
  assert.equal(fs.existsSync(moved), false);

  const quick = await call('fs:quickAccess');
  assert.ok(quick.home && quick.downloads);
});

test('fs: бинарный файл читается как base64', async () => {
  const file = path.join(tmp(), 'blob.bin');
  fs.writeFileSync(file, Buffer.from([0, 1, 2, 3, 0, 0, 255]));
  const read = await call('fs:read', { path: file });
  assert.equal(read.binary, true);
  assert.ok(read.base64.length > 0);
});

test('fs: защищённые пути нельзя удалить', async () => {
  await assert.rejects(() => call('fs:delete', { path: os.homedir() }), /системный путь|нельзя|запрещ/i);

});

// ══ Медиа и музыка ═════════════════════════════════════════════════════════

test('media: сохранение data URL, чтение, список, удаление', async () => {
  const saved = await call('media:saveDataUrl', {
    dataUrl: `data:image/png;base64,${pngBase64}`,
    name: 'test-image',
  });
  assert.ok(saved.path.endsWith('.png'));
  assert.ok(fs.existsSync(saved.path));

  const dataUrl = await call('media:dataUrl', { path: saved.path });
  assert.match(dataUrl, /^data:image\/png;base64,/);

  const list = await call('media:list', { type: 'images' });
  assert.ok(Array.isArray(list));

  assert.equal(await call('media:thumbnail', { path: saved.path }), null);
  assert.equal(await call('media:delete', { path: saved.path }), true);
  assert.equal(fs.existsSync(saved.path), false);

  await assert.rejects(() => call('media:saveDataUrl', { dataUrl: 'not-a-data-url' }), /некорректн/i);
});

test('media: renderResult разрешает ожидающую задачу', async () => {
  assert.equal(await call('media:renderResult', { id: 'nope' }), false);
});

test('media: папки и обои', async () => {
  assert.ok((await call('media:openFolder', { kind: 'images' })).length > 0);
  const wallpaper = path.join(tmp(), 'wall.png');
  fs.writeFileSync(wallpaper, Buffer.from(pngBase64, 'base64'));
  const result = await call('media:setWallpaper', { path: wallpaper });
  assert.ok(result);
});

test('music: библиотека и радио', async () => {
  const tracks = await call('music:library');
  assert.ok(Array.isArray(tracks));
  const radio = await call('music:radioList');
  assert.ok(radio.stations.length >= 5);
  assert.ok(radio.stations.every((s) => /^https?:/.test(s.url)));
  assert.ok((await call('music:openLibrary')).length > 0);
});

// ══ Буфер обмена ═══════════════════════════════════════════════════════════

test('clipboard: запись и чтение', async () => {
  assert.equal(await call('clipboard:write', { text: 'тест буфера' }), true);
  assert.equal(typeof await call('clipboard:read'), 'string');
});

// ══ Браузер ════════════════════════════════════════════════════════════════

test('browser: состояние и действия', async () => {
  const state = await call('browser:getState');
  assert.ok(state && typeof state === 'object');
  for (const action of ['back', 'forward', 'reload', 'stop']) {
    assert.equal(await call('browser:action', { action }), true);
  }
  assert.equal(await call('browser:setBounds', { bounds: { x: 0, y: 0, width: 800, height: 600 } }), true);
  assert.equal(await call('browser:show'), true);
  assert.equal(await call('browser:hide'), true);
  const opened = await call('browser:open', { url: 'example.com' });
  assert.equal(opened.url, 'https://example.com');
  const after = await call('browser:getState');
  assert.equal(after.url, 'https://example.com');
  assert.equal(after.visible, true);
  const evaluated = await call('browser:eval', { script: '1+1' });
  assert.equal(evaluated.text, '2');
  const shot = await call('browser:screenshot');
  assert.match(shot.dataUrl, /^data:image\/png;base64,/);
});

// ══ Терминал ═══════════════════════════════════════════════════════════════

test('terminal: создание, resize, закрытие', async () => {
  const session = await call('terminal:create', { cwd: tmp() });
  assert.ok(session.id);
  assert.equal(await call('terminal:resize', { cols: 120, rows: 30 }), true);
  await call('terminal:write', { id: session.id, data: 'echo hi\r' });
  await call('terminal:close', { id: session.id });
  assert.equal(await call('terminal:close', { id: session.id }), undefined);
});

// ══ Взаимодействия и поиск ═════════════════════════════════════════════════

test('interactions: resolve/reject для неизвестного id', async () => {
  assert.equal(await call('interactions:resolve', { id: 'nope', decision: 'allow' }), false);
  assert.equal(await call('interactions:reject', { id: 'nope' }), false);
});

test('web: search и fetch через сеть', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('duckduckgo')) {
      return new Response('<html><body><a class="result__a" href="https://example.com">Заголовок</a></body></html>', { status: 200 });
    }
    return new Response('<html><body><p>Содержимое страницы</p></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };
  try {
    const results = await call('web:search', { query: 'psychic ai', maxResults: 3 });
    assert.equal(Array.isArray(results.results), true);
    const page = await call('web:fetch', { url: 'https://example.com', maxLength: 500 });
    assert.match(page.text, /Содержимое страницы/);
  } finally {
    globalThis.fetch = original;
  }
});

test('agent: статус и остановка', async () => {
  const status = await call('agent:status');
  assert.deepEqual(status.active, []);
  assert.equal(await call('agent:stop', { chatId: 'nope' }), false);
});

test('agent: send без провайдеров объясняет проблему', async () => {
  const chat = await call('chats:create', { title: 'Без провайдера', provider: 'nope', model: 'openai' });
  const originalProviders = await call('config:getKey', { key: 'providers' });
  await call('config:set', { key: 'providers', value: [] });
  try {
    await assert.rejects(() => call('agent:send', { chatId: chat.id, text: 'привет' }), /провайдер/i);
  } finally {
    await call('config:set', { key: 'providers', value: originalProviders });
    await call('chats:delete', { id: chat.id });
  }
});

test('agent: send с недоступным эндпоинтом возвращает ошибку, а не зависает', async () => {
  const provider = await call('providers:save', {
    provider: { id: 'broken', name: 'Сломанный', type: 'openai', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k', models: ['m'], enabled: true },
  });
  const chat = await call('chats:create', { title: 'Сеть', provider: provider.id, model: 'm' });
  try {
    await assert.rejects(() => call('agent:send', { chatId: chat.id, text: 'привет' }));
  } finally {
    await call('chats:delete', { id: chat.id });
    await call('providers:delete', { id: provider.id });
  }
});

test('каждый канал, который вызывает интерфейс, существует в main', () => {
  const used = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|cjs)$/.test(entry.name)) {
        const src = fs.readFileSync(full, 'utf8');
        for (const m of src.matchAll(/invoke\(\s*['"]([a-z]+:[A-Za-z]+)['"]/g)) used.add(m[1]);
      }
    }
  };
  walk(path.resolve(__dirname, '..', 'src', 'renderer', 'src'));
  walk(path.resolve(__dirname, '..', 'src', 'preload'));
  assert.ok(used.size >= 60, `найдено всего ${used.size} каналов`);
  const missing = [...used].filter((c) => !ipcMain.handlers.has(c));
  assert.deepEqual(missing, [], `каналы без обработчика: ${missing.join(', ')}`);
});
