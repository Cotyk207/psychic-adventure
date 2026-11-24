'use strict';

require('./setup.cjs');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const util = require('../src/main/lib/util.cjs');
const system = require('../src/main/services/system.cjs');
const { Scheduler, computeNextRun, normalizeInterval, toEpoch, formatNext } = require('../src/main/services/scheduler.cjs');
const { compareVersions, normalize, assetForPlatform, checkLatest } = require('../src/main/services/updates.cjs');
const { MemoryService, tokenize } = require('../src/main/services/memory.cjs');
const { SkillsService, parseFrontmatter } = require('../src/main/services/skills.cjs');
const { PermissionService } = require('../src/main/services/permissions.cjs');
const { buildSystemPrompt } = require('../src/main/prompts.cjs');
const paths = require('../src/main/lib/paths.cjs');
const { sseJson } = require('../src/main/providers/sse.cjs');
const { chat } = require('../src/main/providers/index.cjs');
const providers = require('../src/main/providers/index.cjs');

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'psychic-case-'));

function sseResponse(chunks) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

// ══ util ═════════════════════════════════════════════════════════════════════

test('util: deepMerge объединяет объекты и заменяет массивы', () => {
  const merged = util.deepMerge({ a: 1, list: [1, 2], nested: { x: 1 } }, { list: [9], nested: { y: 2 } });
  assert.deepEqual(merged, { a: 1, list: [9], nested: { x: 1, y: 2 } });
});

test('util: deepMerge игнорирует __proto__', () => {
  const merged = util.deepMerge({}, JSON.parse('{"__proto__":{"polluted":true}}'));
  assert.equal({}.polluted, undefined);
  assert.equal(merged.polluted, undefined);
});

test('util: getPath / setPath работают с точечной записью', () => {
  const obj = { a: { b: { c: 1 } } };
  assert.equal(util.getPath(obj, 'a.b.c'), 1);
  util.setPath(obj, 'a.b.d', 5);
  assert.equal(obj.a.b.d, 5);
  assert.equal(util.getPath(obj, 'a.x.y'), undefined);
});

test('util: normalizeBaseUrl убирает слэш и пустоту', () => {
  assert.equal(util.normalizeBaseUrl('https://api.test/v1/'), 'https://api.test/v1');
  assert.equal(util.normalizeBaseUrl(''), '');
  assert.equal(util.normalizeBaseUrl(null), '');
});

test('util: joinUrl склеивает без двойных слэшей', () => {
  assert.equal(util.joinUrl('https://api.test/v1', '/models'), 'https://api.test/v1/models');
  assert.equal(util.joinUrl('https://api.test/v1/', 'models'), 'https://api.test/v1/models');
});

test('util: safeJson не бросается на мусоре', () => {
  assert.deepEqual(util.safeJson('{"a":1}', null), { a: 1 });
  assert.equal(util.safeJson('{bad', null), null);
  assert.deepEqual(util.safeJson('[1,2]', []), [1, 2]);
});

test('util: formatBytes / truncate / escapeHtml', () => {
  assert.equal(util.formatBytes(0), '0 B');
  assert.equal(util.formatBytes(1024), '1.0 KB');
  assert.equal(util.formatBytes(1536), '1.5 KB');
  assert.equal(util.formatBytes(1024 ** 3), '1.0 GB');
  assert.equal(util.truncate('1234567890', 5), '12345…');
  assert.equal(util.truncate('коротко', 50), 'коротко');
  assert.equal(util.escapeHtml('<b>&'), '&lt;b&gt;&amp;');
});

test('util: slugify и pluralizeRu', () => {
  assert.equal(util.slugify('Hello, world!'), 'hello-world');
  assert.equal(util.slugify('Привет, мир!'), 'привет-мир');
  assert.equal(util.pluralizeRu(1, 'запись', 'записи', 'записей'), 'запись');
  assert.equal(util.pluralizeRu(3, 'запись', 'записи', 'записей'), 'записи');
  assert.equal(util.pluralizeRu(11, 'запись', 'записи', 'записей'), 'записей');
});

test('util: isProbablyBinary отличает текст от байтов', () => {
  assert.equal(util.isProbablyBinary(Buffer.from('обычный текст')), false);
  assert.equal(util.isProbablyBinary(Buffer.from([0, 1, 2, 3, 0])), true);
});

// ══ system ═══════════════════════════════════════════════════════════════════

test('system: загрузка CPU считается по разнице снапшотов', () => {
  const prev = { idle: 100, total: 200 };
  const next = { idle: 150, total: 250 };
  assert.equal(system.cpuPercentBetween(prev, next), 0);
  const busy = { idle: 100, total: 250 };
  assert.equal(system.cpuPercentBetween(prev, busy), 100);
  assert.equal(system.cpuPercentBetween(null, next), 0);
});

test('system: память и аптайм', () => {
  const mem = system.memoryStats();
  assert.ok(mem.total > 0);
  assert.equal(mem.percent, Math.round(((mem.total - mem.free) / mem.total) * 100));
  assert.equal(system.uptimeText(3661), '1ч 1м');
  assert.equal(system.uptimeText(90000), '1д 1ч');
  assert.equal(system.uptimeText(120), '2м');
});

test('system: диски и список корней', () => {
  assert.equal(system.listDriveRoots('win32').length, 24);
  assert.ok(system.listDriveRoots('win32').includes('C:\\'));
  assert.deepEqual(system.listDriveRoots('linux'), ['/']);
  const usage = system.diskUsage('/');
  assert.ok(usage && usage.total > 0);
  const disks = system.disksStats(process.platform);
  assert.ok(Array.isArray(disks));
});

test('system: collect возвращает полный снимок', async () => {
  const stats = await system.collect({ windowMs: 10, extra: { version: '9.9.9' } });
  assert.equal(stats.version, '9.9.9');
  assert.ok(stats.cpu.percent >= 0 && stats.cpu.percent <= 100);
  assert.ok(stats.memory.total > 0);
  assert.ok(Array.isArray(stats.disks));
  assert.ok(Array.isArray(stats.network));
  assert.ok(stats.uptime >= 0);
  assert.equal(typeof stats.hostname, 'string');
});

// ══ scheduler ═══════════════════════════════════════════════════════════════

test('scheduler: интервалы ограничены снизу и сверху', () => {
  assert.equal(normalizeInterval(1000), 60000);
  assert.equal(normalizeInterval('120000'), 120000);
  assert.equal(normalizeInterval(0), null);
  assert.equal(normalizeInterval('abc'), null);
  assert.equal(normalizeInterval(null), null);
});

test('scheduler: computeNextRun для разовой и повторяющейся задачи', () => {
  const now = 1_000_000;
  assert.equal(computeNextRun({ enabled: true, at: now + 5000 }, now), now + 5000);
  assert.equal(computeNextRun({ enabled: true, at: now - 5000 }, now), now - 5000);
  assert.equal(computeNextRun({ enabled: false, at: now + 5000 }, now), null);
  assert.equal(computeNextRun({ enabled: true, every: 60000, lastRunAt: now }, now), now + 60000);
  assert.equal(computeNextRun({ enabled: true, every: 60000, at: now - 130000 }, now), now + 60000 - 130000 + 120000);
  assert.equal(computeNextRun({ enabled: true, every: 60000, createdAt: now }, now), now + 60000);
  assert.equal(computeNextRun({ enabled: true, at: now - 5000, lastRunAt: now }, now), null, 'уже выполненная разовая задача не повторяется');
  assert.equal(computeNextRun({ enabled: true, at: now - 5000, lastRunAt: null }, now), now - 5000, 'просроченная разовая задача срабатывает');
  assert.equal(computeNextRun({}, now), null);
});

test('scheduler: тик запускает только наступившие задачи', async () => {
  const dir = tempDir();
  let clock = 1_700_000_000_000;
  const fired = [];
  const scheduler = new Scheduler({
    file: path.join(dir, 'tasks.json'),
    now: () => clock,
    onDue: async (task) => { fired.push(task.title); return { ok: true }; },
  });

  const once = scheduler.add({ title: 'Разовая', prompt: 'сделай', at: clock + 1000 });
  assert.equal(once.nextRunAt, clock + 1000);

  assert.equal((await scheduler.tick()).length, 0, 'не должна сработать раньше времени');

  clock += 1500;
  const result = await scheduler.tick();
  assert.equal(result.length, 1);
  assert.deepEqual(fired, ['Разовая']);
  const after = scheduler.get(once.id);
  assert.equal(after.lastRunAt, clock);
  assert.equal(after.nextRunAt, null, 'разовая задача больше не планируется');
});

test('scheduler: повторяющаяся задача сдвигается вперёд', async () => {
  const dir = tempDir();
  let clock = 1_700_000_000_000;
  const scheduler = new Scheduler({ file: path.join(dir, 'tasks.json'), now: () => clock, onDue: async () => ({}) });
  const task = scheduler.add({ title: 'Каждую минуту', every: 60000 });
  assert.equal(task.nextRunAt, clock + 60000);

  clock += 61000;
  await scheduler.tick();
  const after = scheduler.get(task.id);
  assert.equal(after.lastRunAt, clock);
  assert.equal(after.nextRunAt, clock + 60000);
});

test('scheduler: отключённая задача не запускается, runNow — запускает', async () => {
  const dir = tempDir();
  let clock = 1_700_000_000_000;
  const fired = [];
  const scheduler = new Scheduler({ file: path.join(dir, 'tasks.json'), now: () => clock, onDue: async (t) => { fired.push(t.title); } });
  const task = scheduler.add({ title: 'Проверка', prompt: 'сделай', every: 60000 });

  scheduler.toggle(task.id, false);
  clock += 120000;
  assert.equal((await scheduler.tick()).length, 0);
  assert.deepEqual(fired, []);

  scheduler.toggle(task.id, true);
  await scheduler.runNow(task.id);
  assert.deepEqual(fired, ['Проверка']);

  assert.equal(scheduler.remove(task.id), true);
  assert.equal(scheduler.remove('nope'), false);
});

test('scheduler: невалидная задача отвергается', () => {
  const dir = tempDir();
  const scheduler = new Scheduler({ file: path.join(dir, 'tasks.json'), now: () => 1 });
  assert.throws(() => scheduler.add({ title: '' }), /название/i);
  assert.throws(() => scheduler.add({ title: 'Без времени' }), /время|период/i);
});

test('scheduler: formatNext', () => {
  const now = 1_000_000_000_000;
  assert.equal(formatNext(null), '—');
  assert.equal(formatNext(now - 5, now), 'сейчас');
  assert.equal(formatNext(now + 60_000, now), 'через 1 мин');
  assert.equal(formatNext(now + 3_600_000, now), 'через 1 ч');
  assert.equal(formatNext(now + 2 * 86_400_000, now), 'через 2 дн');
});

test('scheduler: задачи переживают перезапуск', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tasks.json');
  let clock = 1_700_000_000_000;
  const first = new Scheduler({ file, now: () => clock, onDue: async () => ({}) });
  first.add({ title: 'Persist', every: 3600000 });
  const second = new Scheduler({ file, now: () => clock, onDue: async () => ({}) });
  assert.equal(second.list().length, 1);
  assert.equal(second.list()[0].title, 'Persist');
});

// ══ updates ═════════════════════════════════════════════════════════════════

test('updates: compareVersions', () => {
  assert.equal(compareVersions('1.0.1', '1.0.1'), 0);
  assert.equal(compareVersions('v1.0.2', '1.0.1'), 1);
  assert.equal(compareVersions('1.0.0', '1.1.0'), -1);
  assert.equal(compareVersions('2.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0-beta', '1.0.0'), 0);
  assert.equal(compareVersions('', '1.0.0'), -1);
  assert.deepEqual(normalize('v1.2.3'), [1, 2, 3]);
  assert.deepEqual(normalize('2'), [2, 0, 0]);
});

test('updates: выбирает portable-ассет для Windows', () => {
  const assets = [
    { name: 'latest.yml' },
    { name: 'PSYCHIC.Setup.1.0.0.exe' },
    { name: 'PSYCHIC-Portable-1.0.0.exe' },
  ];
  assert.equal(assetForPlatform(assets, 'win32', 'x64').name, 'PSYCHIC-Portable-1.0.0.exe');
  assert.equal(assetForPlatform([{ name: 'PSYCHIC.Setup.1.0.0.exe' }], 'win32', 'x64').name, 'PSYCHIC.Setup.1.0.0.exe');
  assert.equal(assetForPlatform(assets, 'linux', 'x64'), null);
});

test('updates: checkLatest понимает новый релиз', async () => {
  const fetchImpl = async (url) => {
    assert.match(url, /api\.github\.com/);
    return new Response(JSON.stringify({
      tag_name: 'v2.0.0',
      html_url: 'https://github.com/x/y/releases/tag/v2.0.0',
      body: 'notes',
      assets: [{ name: 'PSYCHIC-Portable-2.0.0.exe' }],
    }), { status: 200 });
  };
  const info = await checkLatest({ owner: 'o', repo: 'r', current: '1.0.0', fetchImpl, platform: 'win32', arch: 'x64' });
  assert.equal(info.updateAvailable, true);
  assert.equal(info.latest, 'v2.0.0');
  assert.equal(info.asset.name, 'PSYCHIC-Portable-2.0.0.exe');
});

test('updates: checkLatest на актуальной версии и на ошибке', async () => {
  const same = await checkLatest({
    owner: 'o', repo: 'r', current: '1.2.0',
    fetchImpl: async () => new Response(JSON.stringify({ tag_name: 'v1.2.0' }), { status: 200 }),
  });
  assert.equal(same.updateAvailable, false);

  await assert.rejects(
    () => checkLatest({ owner: 'o', repo: 'r', current: '1.0.0', fetchImpl: async () => new Response('nope', { status: 404 }) }),
    /404/
  );
  await assert.rejects(() => checkLatest({ owner: '', repo: 'r', current: '1' }), /репозиторий/i);
});

// ══ memory ═════════════════════════════════════════════════════════════════

test('memory: add / update / search / remove / clear', () => {
  const dir = tempDir();
  const memory = new MemoryService(dir);

  const first = memory.add('Я учу Python и делаю ботов', ['python'], 'facts');
  assert.equal(first.category, 'facts');
  const dup = memory.add('Я учу Python и делаю ботов');
  assert.equal(dup.id, first.id, 'дубликаты склеиваются');
  assert.ok(dup.tags.includes('python'));

  const second = memory.add('Проект Psychic на Electron', ['psychic'], 'projects');
  assert.equal(second.category, 'projects');

  memory.add('странный текст', [], 'unknown-category');
  assert.equal(memory.all().find((i) => i.content === 'странный текст').category, 'notes');

  memory.update(first.id, { content: 'Я учу Python, JS и делаю ботов' });
  assert.equal(memory.get?.(first.id), undefined);
  assert.equal(memory.all().find((i) => i.id === first.id).content, 'Я учу Python, JS и делаю ботов');
  assert.equal(memory.search('python').length >= 1, true);

  const exported = memory.exportJson(path.join(dir, 'export.json'));
  assert.equal(JSON.parse(fs.readFileSync(exported, 'utf8')).count, memory.all().length);

  assert.equal(memory.remove(first.id), true);
  assert.equal(memory.remove(first.id), false);
  memory.clear();
  assert.equal(memory.all().length, 0);
});

test('memory: поиск по словам и токенизация', () => {
  const dir = tempDir();
  const memory = new MemoryService(dir);
  memory.add('Люблю синтвейв и неон', ['музыка']);
  memory.add('Работаю с Electron и React');
  assert.equal(memory.search('синтвейв').length, 1);
  assert.equal(memory.search('react').length, 1);
  assert.equal(memory.search('量子').length, 0);
  assert.deepEqual(tokenize('Привет, мир! И я'), ['привет', 'мир']);
});

test('memory: пустая запись отвергается', () => {
  const memory = new MemoryService(tempDir());
  assert.throws(() => memory.add('   '), /пустая/i);
});

// ══ skills ═════════════════════════════════════════════════════════════════

test('skills: разбор frontmatter', () => {
  const md = `---
name: "Web Research"
description: "Поиск в сети"
when_to_use: "Когда нужен актуальный ответ"
color: "#5aa8ff"
icon: "globe"
tools: [web_search, fetch_url]
---
# Инструкция
Делай так.`;
  const { meta, body } = parseFrontmatter(md);
  assert.equal(meta.name, 'Web Research');
  assert.equal(meta.icon, 'globe');
  assert.deepEqual(meta.tools, ['web_search', 'fetch_url']);
  assert.match(body, /^# Инструкция/);
});

test('skills: без frontmatter весь файл — тело', () => {
  const { meta, body } = parseFrontmatter('# Просто файл\nТекст');
  assert.deepEqual(meta, {});
  assert.equal(body.trim(), '# Просто файл\nТекст');
});

test('skills: встроенные скиллы читаются из resources/skills', () => {
  const service = new SkillsService({ get: () => [], set: () => {} });
  const builtinDir = path.resolve(__dirname, '..', 'resources', 'skills');
  service.builtinDir = () => builtinDir;
  service.customDir = () => tempDir();
  const skills = service.list();
  assert.ok(skills.length >= 12, `нашлось ${skills.length}`);
  const coding = skills.find((s) => s.id === 'coding');
  assert.ok(coding, 'скилл coding должен быть встроенным');
  assert.equal(coding.builtin, true);
  assert.ok(coding.tools.includes('write_file'));
  assert.ok(coding.body.includes('Coding'));
});

test('skills: сохранение, переключение, клонирование, удаление', () => {
  const store = {
    data: { 'skills.enabled': [] },
    get(key) { return this.data[key]; },
    set(key, value) { this.data[key] = value; },
  };
  const service = new SkillsService(store);
  const custom = tempDir();
  service.builtinDir = () => tempDir();
  service.customDir = () => custom;

  const saved = service.save({
    name: 'My Skill',
    description: 'Тестовый',
    whenToUse: 'Когда тестируем',
    color: '#ff0000',
    icon: 'bug',
    tools: ['run_command'],
    body: '# Делай',
  });
  assert.ok(saved.id);
  assert.equal(saved.builtin, false);

  const list = service.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].enabled, false);

  service.toggle(saved.id, true);
  assert.equal(service.list()[0].enabled, true);
  assert.deepEqual(store.data['skills.enabled'], [saved.id]);

  const copy = service.duplicate(saved.id);
  assert.match(copy.name, /копия/i);
  assert.equal(service.list().length, 2);

  assert.equal(service.remove('no-such-skill'), false);
  service.remove(copy.id);
  assert.equal(service.list().length, 1);
});

test('skills: импорт из папки со SKILL.md', () => {
  const service = new SkillsService({ get: () => [], set: () => {} });
  service.builtinDir = () => tempDir();
  const custom = tempDir();
  service.customDir = () => custom;
  const folder = tempDir();
  fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\nname: "Imported"\ndescription: "Из папки"\n---\nТело');

  const skill = service.importFolder(folder);
  assert.equal(skill.name, 'Imported');
  assert.equal(service.list().length, 1);
  assert.equal(service.list()[0].name, 'Imported');
});

// ══ permissions ═════════════════════════════════════════════════════════════

function makePermissions(overrides = {}) {
  const workspace = tempDir();
  const store = {
    data: {
      'permissions.mode': 'workspace',
      'permissions.roots': [workspace],
      'permissions.deniedPaths': [],
      'permissions.shell.denylist': ['rm -rf /'],
      'permissions.shell.allowlist': ['git status'],
      'permissions.shell.mode': 'confirm',
      ...overrides,
    },
    get(key) { return this.data[key]; },
    set(key, value) { this.data[key] = value; },
  };
  const requests = [];
  const interactions = {
    request: async (channel, payload) => {
      requests.push({ channel, payload });
      return { decision: 'allow' };
    },
  };
  return { service: new PermissionService({ store, interactions }), store, requests, workspace };
}

test('permissions: чтение разрешено всегда', async () => {
  const { service } = makePermissions();
  await service.check({ name: 'read_file', risk: 'read' }, { path: '/any/file.txt' });
});

test('permissions: режим readonly запрещает запись', async () => {
  const { service } = makePermissions({ 'permissions.mode': 'readonly' });
  await assert.rejects(
    () => service.check({ name: 'write_file', risk: 'write' }, { path: '/tmp/x.txt', content: 'x' }),
    /только чтение/i
  );
});

test('permissions: workspace разрешает запись в корень и спрашивает вне его', async () => {
  const { service, workspace, requests } = makePermissions();
  await service.check({ name: 'write_file', risk: 'write' }, { path: path.join(workspace, 'a.txt'), content: 'x' });
  assert.equal(requests.length, 0);

  await service.check({ name: 'write_file', risk: 'write' }, { path: path.join(tempDir(), 'b.txt'), content: 'x' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].channel, 'permission:request');
});

test('permissions: режим full не спрашивает', async () => {
  const { service, requests } = makePermissions({ 'permissions.mode': 'full' });
  await service.check({ name: 'write_file', risk: 'write' }, { path: path.join(tempDir(), 'c.txt'), content: 'x' });
  assert.equal(requests.length, 0);
});

test('permissions: запрещённый путь блокируется даже в full', async () => {
  const forbidden = tempDir();
  const { service } = makePermissions({ 'permissions.mode': 'full', 'permissions.deniedPaths': [forbidden] });
  await assert.rejects(
    () => service.check({ name: 'read_file', risk: 'read' }, { path: path.join(forbidden, 'secret.txt') }),
    /запрещённ/i
  );
});

test('permissions: denylist команд блокируется', async () => {
  const { service } = makePermissions();
  await assert.rejects(
    () => service.check({ name: 'run_command', risk: 'exec' }, { command: 'rm -rf /' }),
    /заблокирована/i
  );
});

test('permissions: режимы shell off / auto / allowlist', async () => {
  const off = makePermissions({ 'permissions.shell.mode': 'off' });
  await assert.rejects(() => off.service.check({ name: 'run_command', risk: 'exec' }, { command: 'echo hi' }), /отключён/i);

  const auto = makePermissions({ 'permissions.shell.mode': 'auto' });
  await auto.service.check({ name: 'run_command', risk: 'exec' }, { command: 'echo hi' });
  assert.equal(auto.requests.length, 0);

  const allowlist = makePermissions({ 'permissions.shell.mode': 'allowlist' });
  await allowlist.service.check({ name: 'run_command', risk: 'exec' }, { command: 'git status' });
  assert.equal(allowlist.requests.length, 0, 'безопасная команда не спрашивает');

  await allowlist.service.check({ name: 'run_command', risk: 'exec' }, { command: 'npm test' });
  assert.equal(allowlist.requests.length, 1, 'остальное — с подтверждением');
});

test('permissions: always запоминает разрешение на сессию', async () => {
  const { service, requests } = makePermissions({ 'permissions.mode': 'full' });
  const tool = { name: 'browser_open', risk: 'network' };
  await service.check(tool, { url: 'https://example.com' });
  service.sessionAllowed.add('browser_open');
  await service.check(tool, { url: 'https://example.com' });
  assert.equal(requests.length, 0);
});

// ══ ресурсы приложения ═══════════════════════════════════════════════════

test('resources: иконка, обои и скиллы находятся по resourcesPath', () => {
  const icon = paths.resourcesPath('icon.png');
  assert.equal(fs.existsSync(icon), true, `нет иконки: ${icon}`);
  assert.ok(fs.statSync(icon).size > 1000, 'иконка не пустая');

  const wallpapers = paths.resourcesPath('wallpapers');
  const images = fs.readdirSync(wallpapers).filter((f) => /\.(jpg|png)$/i.test(f));
  assert.ok(images.length >= 10, `обоев всего ${images.length}`);

  const skills = paths.resourcesPath('skills');
  const skillDirs = fs.readdirSync(skills, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.ok(skillDirs.length >= 12, `папок скиллов ${skillDirs.length}`);
  for (const dir of skillDirs) {
    assert.equal(fs.existsSync(path.join(skills, dir.name, 'SKILL.md')), true, `нет SKILL.md в ${dir.name}`);
  }
});

// ══ prompts ═════════════════════════════════════════════════════════════════

test('prompts: системный промпт собирает всё вместе', () => {
  const config = {
    appearance: { theme: 'nightcity' },
    chat: { systemPrompt: 'Отвечай кратко.' },
    permissions: { mode: 'workspace' },
    memory: { enabled: true },
    general: { language: 'ru' },
  };
  const skills = {
    enabled: () => [{ name: 'Coding', description: 'Пишет код', enabled: true }],
  };
  const prompt = buildSystemPrompt({
    config,
    skills,
    memories: [{ content: 'Люблю синтвейв' }],
    tools: [{ name: 'read_file', description: 'Читает файл', parameters: { type: 'object' } }],
    provider: { name: 'Pollinations' },
    model: 'openai',
    permissionMode: 'workspace',
  });
  assert.match(prompt, /PSYCHIC/);
  assert.match(prompt, /Coding/);
  assert.match(prompt, /Люблю синтвейв/);
  assert.match(prompt, /read_file/);
  assert.match(prompt, /Отвечай кратко/);
  assert.match(prompt, /workspace|рабоч/i);
});

// ══ SSE и провайдеры ════════════════════════════════════════════════════════

test('sse: парсит чанки, игнорирует комментарии и [DONE]', async () => {
  const body = sseResponse([
    ': ping\n',
    'data: {"a":1}\n\n',
    'data: {"b":2}\n',
    'data: [DONE]\n',
  ]).body;
  const events = [];
  for await (const json of sseJson(body)) events.push(json);
  assert.deepEqual(events, [{ a: 1 }, { b: 2 }]);
});

test('sse: дочитывает хвост без завершающего \\n', async () => {
  const body = sseResponse(['data: {"tail":true}']).body;
  const events = [];
  for await (const json of sseJson(body)) events.push(json);
  assert.deepEqual(events, [{ tail: true }]);
});

test('providers: OpenAI-стрим отдаёт текст и вызов инструмента', async () => {
  const provider = { id: 'test', name: 'Test', type: 'openai', baseUrl: 'https://api.test/v1', apiKey: 'k' };
  const chunks = [
    'data: {"choices":[{"delta":{"content":"При"}}]}\n',
    'data: {"choices":[{"delta":{"content":"вет"}}]}\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{}"}}]}}]}\n',
    'data: [DONE]\n',
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => sseResponse(chunks);
  try {
    const events = [];
    for await (const ev of chat(provider, 'gpt-4o', [{ role: 'user', content: 'hi' }], { stream: true })) {
      events.push(ev);
    }
    const text = events.filter((e) => e.type === 'text').map((e) => e.text).join('');
    assert.equal(text, 'Привет');
    const call = events.find((e) => e.type === 'tool_call');
    assert.equal(call.name, 'read_file');
    assert.equal(call.id, 'call_1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('providers: Anthropic-стрим отдаёт reasoning и текст', async () => {
  const provider = { id: 'anthropic', name: 'Claude', type: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'k' };
  const chunks = [
    'event: content_block_delta\n',
    'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"думаю"}}\n\n',
    'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ответ"}}\n\n',
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => sseResponse(chunks);
  try {
    const events = [];
    for await (const ev of chat(provider, 'claude-3-5-sonnet', [{ role: 'user', content: 'hi' }], { stream: true })) {
      events.push(ev);
    }
    assert.equal(events.filter((e) => e.type === 'reasoning').map((e) => e.text).join(''), 'думаю');
    assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'ответ');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('providers: Gemini-стрим отдаёт reasoning, текст и tool_call', async () => {
  const provider = { id: 'gemini', name: 'Gemini', type: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKey: 'k' };
  const chunks = [
    'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"размышляю"}]}}]}\n\n',
    'data: {"candidates":[{"content":{"parts":[{"text":"ответ"},{"functionCall":{"name":"web_search","args":{"query":"ai"}}}]}}]}\n\n',
  ];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => sseResponse(chunks);
  try {
    const events = [];
    for await (const ev of chat(provider, 'gemini-2.0-flash', [{ role: 'user', content: 'hi' }], { stream: true })) {
      events.push(ev);
    }
    assert.equal(events.filter((e) => e.type === 'reasoning').map((e) => e.text).join(''), 'размышляю');
    assert.equal(events.filter((e) => e.type === 'text').map((e) => e.text).join(''), 'ответ');
    const call = events.find((e) => e.type === 'tool_call');
    assert.equal(call.name, 'web_search');
    assert.deepEqual(call.arguments, { query: 'ai' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('providers: адаптер выбирается по типу', () => {
  assert.equal(typeof providers.chat, 'function');
  assert.equal(providers.supportsVision('gpt-4o'), true);
  assert.equal(providers.supportsVision('text-embedding-3-small'), false);
});

test('providers: список моделей OpenAI-совместимого API', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), { status: 200 });
  try {
    const list = await providers.listModels({ id: 'x', name: 'X', type: 'openai', baseUrl: 'https://api.test/v1', apiKey: 'k' });
    assert.deepEqual(list.sort(), ['model-a', 'model-b']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ══ упаковка: все require main-процесса должны попадать в asar ════════════════
//
// electron-builder собирает приложение только из build.files. Если какой-то
// require в src/main или src/preload ведёт за пределы этого списка (как было
// с src/shared/providers.json), в dev всё работает, а собранный EXE падает
// при старте с «Cannot find module». Этот тест ловит такое заранее.

test('упаковка: каждый require main-процесса покрыт build.files', () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const whitelist = pkg.build.files;

  const covered = (rel) => whitelist.some((pattern) => {
    if (pattern.endsWith('/**/*')) {
      const dir = pattern.slice(0, -'/**/*'.length);
      return rel === dir || rel.startsWith(`${dir}/`);
    }
    return rel === pattern;
  });

  // Node не подставляет .cjs сам — пробуем только то, что реально резолвится.
  const resolveRequire = (fromDir, request) => {
    const base = path.resolve(fromDir, request);
    const candidates = [base, `${base}.js`, `${base}.json`, `${base}.node`,
      path.join(base, 'index.js'), path.join(base, 'index.json')];
    return candidates.find((candidate) => {
      try { return fs.statSync(candidate).isFile(); } catch { return false; }
    }) || null;
  };

  const problems = [];
  for (const dir of ['src/main', 'src/preload']) {
    const walk = (current) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(cjs|js)$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        for (const match of source.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
          const request = match[1];
          const resolved = resolveRequire(path.dirname(full), request);
          if (!resolved) {
            problems.push(`${path.relative(root, full)}: не разрешается ${request}`);
            continue;
          }
          const rel = path.relative(root, resolved).split(path.sep).join('/');
          if (!covered(rel)) {
            problems.push(`${path.relative(root, full)}: ${request} -> ${rel} вне build.files`);
          }
        }
      }
    };
    walk(path.join(root, dir));
  }

  assert.deepEqual(problems, []);
});
