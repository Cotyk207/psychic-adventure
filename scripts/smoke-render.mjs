/**
 * Headless smoke test: renders the whole React app in jsdom with a mocked
 * `window.psychic` bridge. Catches undefined components, bad hooks and
 * runtime crashes that a plain `vite build` cannot see.
 *
 *   npx vite build --ssr scripts/smoke-entry.jsx --outDir .smoke
 *   node scripts/smoke-render.mjs
 */
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;
for (const key of [
  'window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'Element',
  'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'localStorage', 'location', 'CustomEvent', 'Event', 'KeyboardEvent', 'Blob', 'File',
  'FileReader', 'URL', 'ImageData', 'DOMParser',
]) {
  if (window[key] !== undefined) globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.self = window;
globalThis.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {}

window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;

class AudioStub {
  constructor() { this.volume = 0.7; this.src = ''; this.currentTime = 0; this.duration = 0; }
  addEventListener() {}
  play() { return Promise.resolve(); }
  pause() {}
}
globalThis.Audio = AudioStub;
window.Audio = AudioStub;

class SR {}
globalThis.SpeechRecognition = SR;
globalThis.webkitSpeechRecognition = SR;
window.SpeechRecognition = SR;
window.webkitSpeechRecognition = SR;

globalThis.speechSynthesis = { speak() {}, cancel() {}, getVoices: () => [] };
window.speechSynthesis = globalThis.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.SpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;

const CONFIG = {
  general: { language: 'ru', autostart: false, tray: true, notifications: true, showSplash: true },
  appearance: {
    theme: 'nightcity', fx: true, particles: true, grid: true, scanlines: true, glow: true,
    animations: true, wallpaper: 'nightcity', wallpaperOpacity: 0.35, fontScale: 1, radius: 14,
    density: 'comfortable', messageBubbles: true, sidebarCollapsed: false,
  },
  chat: {
    defaultProvider: 'pollinations', defaultModel: 'openai', sendOnEnter: true,
    showReasoning: true, contextMessages: 24, maxSteps: 12, autoSpeak: false,
  },
  providers: [],
  permissions: { mode: 'workspace', roots: ['C:\\Users\\test'], shell: { mode: 'confirm', allowlist: [] } },
  skills: { enabled: [] },
  memory: { enabled: true },
  voice: { sttLanguage: 'ru-RU' },
  media: { imageProvider: 'pollinations', musicProvider: 'procedural', videoProvider: 'slideshow' },
  onboardingDone: true,
};

const PROVIDERS = [
  { id: 'pollinations', name: 'Pollinations.AI', tagline: 'Без ключа', baseUrl: 'https://text.pollinations.ai/openai', models: ['openai', 'mistral'], color: '#a3ff6b', badge: 'FREE', enabled: true, builtin: true, free: true, type: 'openai' },
  { id: 'openrouter', name: 'OpenRouter', tagline: 'Агрегатор', baseUrl: 'https://openrouter.ai/api/v1', models: ['meta-llama/llama-3.3-70b-instruct:free'], color: '#7c8cff', badge: 'FREE MODELS', enabled: false, builtin: true, free: true, type: 'openai' },
];

const SKILLS = [
  { id: 'coding', name: 'Coding', description: 'Пишет и отлаживает код', whenToUse: 'Когда нужен код', color: '#3dffb0', icon: 'code', tools: ['write_file'], body: '# Coding', enabled: true, builtin: true },
  { id: 'web-research', name: 'Web Research', description: 'Поиск в интернете', whenToUse: '', color: '#5aa8ff', icon: 'globe', tools: ['web_search'], body: '', enabled: false, builtin: true },
];

const CHAT = {
  id: 'chat-1', title: 'Тестовый диалог', provider: 'pollinations', model: 'openai',
  createdAt: Date.now(), updatedAt: Date.now(), pinned: false,
  messages: [
    { id: 'm1', role: 'user', content: 'Привет! Что умеешь?', createdAt: Date.now() - 60000 },
    {
      id: 'm2', role: 'assistant', content: 'Привет! Я PSYCHIC — локальный ассистент.\n\n```js\nconsole.log("hi");\n```',
      createdAt: Date.now() - 30000, model: 'openai', toolCalls: [
        { id: 't1', name: 'list_directory', status: 'done', args: { path: '.' }, result: 'index.html\npackage.json', duration: 42 },
      ],
    },
  ],
};

const TASKS = [
  {
    id: 'task-1',
    title: 'Утренняя сводка',
    prompt: 'Найди новости ИИ за вчера',
    every: 3600000,
    at: null,
    enabled: true,
    runAgent: true,
    notify: true,
    lastRunAt: Date.now() - 3600000,
    nextRunAt: Date.now() + 60000,
  },
];

const MEDIA = [
  { name: 'image-1.jpg', path: '/tmp/image-1.jpg', kind: 'images', size: 204800, modified: new Date().toISOString() },
  { name: 'music-1.wav', path: '/tmp/music-1.wav', kind: 'music', size: 1024000, modified: new Date().toISOString() },
];

const responses = {
  'config:get': CONFIG,
  'app:getInfo': { version: '1.0.0', platform: 'win32', paths: { userData: 'C:\\Users\\test\\AppData\\Roaming\\psychic', workspace: 'C:\\Users\\test\\PSYCHIC Workspace', media: 'C:\\Users\\test\\media', skills: 'C:\\Users\\test\\skills' } },
  'chats:list': [CHAT],
  'chats:get': CHAT,
  'chats:create': { id: 'chat-2', title: 'Новый диалог', provider: 'pollinations', model: 'openai', createdAt: Date.now(), updatedAt: Date.now(), messages: [], pinned: false },
  'providers:list': PROVIDERS,
  'skills:list': SKILLS,
  'memory:list': [],
  'media:list': MEDIA,
  'music:library': [{ path: '/music/a.mp3', name: 'a.mp3', title: 'A', artist: 'B', album: '' }],
  'music:radioList': { stations: [] },
  'fs:quickAccess': { home: 'C:\\Users\\test', workspace: 'C:\\Users\\test\\PSYCHIC Workspace', desktop: 'C:\\Users\\test\\Desktop', documents: 'C:\\Users\\test\\Documents', downloads: 'C:\\Users\\test\\Downloads', music: 'C:\\Users\\test\\Music' },
  'fs:list': { text: '', data: { path: 'C:\\Users\\test', entries: [{ name: 'file.txt', path: 'C:\\Users\\test\\file.txt', type: 'file', size: 12 }, { name: 'Docs', path: 'C:\\Users\\test\\Docs', type: 'directory', size: 0 }] } },
  'media:thumbnail': null,
  'media:dataUrl': 'data:image/png;base64,AAAA',
  'terminal:create': { id: 't-1', shell: 'cmd' },
  'tasks:list': TASKS,
  'system:stats': {
    cpu: { percent: 23, cores: 8, model: 'Test CPU @ 3.20GHz', speed: 3200, loadAvg: [0.4, 0.5, 0.6] },
    memory: { total: 16 * 1024 ** 3, free: 8 * 1024 ** 3, used: 8 * 1024 ** 3, percent: 50 },
    disks: [{ path: 'C:\\', total: 512 * 1024 ** 3, free: 128 * 1024 ** 3, used: 384 * 1024 ** 3, percent: 75 }],
    network: [{ name: 'Ethernet', address: '192.168.1.10', family: 'IPv4' }],
    uptime: 3600,
    uptimeText: '1ч 0м',
    platform: 'win32',
    release: '10.0.22631',
    arch: 'x64',
    hostname: 'DESKTOP-TEST',
    node: '20',
    version: '1.0.1',
    electron: '33.2.0',
  },
  'app:checkUpdates': { current: '1.0.1', latest: '1.0.1', updateAvailable: false, url: 'https://github.com/Cotyk207/psychic-adventure/releases' },
};

const errors = [];
const NOISE = [
  /Not implemented: HTMLCanvasElement's getContext/,
  /Not implemented: HTMLCanvasElement/,
  /Warning: .*canvas/i,
];
const origError = console.error;
console.error = (...args) => {
  const text = args.map(String).join(' ');
  if (NOISE.some((re) => re.test(text))) return;
  errors.push(text);
  origError(...args);
};

const invokeLog = [];
const handlers = new Map();
window.psychic = {
  platform: 'win32',
  versions: { electron: '33.2.0', chrome: '130', node: '20' },
  isElectron: true,
  invoke: async (channel, payload) => {
    invokeLog.push({ channel, payload });
    if (channel in responses) return responses[channel];
    return null;
  },
  on: (channel, fn) => {
    if (!handlers.has(channel)) handlers.set(channel, new Set());
    handlers.get(channel).add(fn);
    return () => handlers.get(channel)?.delete(fn);
  },
};
globalThis.psychic = window.psychic;

function emitToRenderer(channel, payload) {
  const set = handlers.get(channel);
  if (!set) return false;
  for (const fn of set) {
    try { fn(payload); } catch (err) { errors.push(`handler ${channel}: ${err?.stack || err}`); }
  }
  return true;
}
globalThis.psychic = window.psychic;

process.on('unhandledRejection', (err) => {
  errors.push(`unhandledRejection: ${err?.stack || err}`);
});

const bundle = path.resolve('.smoke/smoke-entry.mjs');
if (!fs.existsSync(bundle)) {
  console.error('Bundle not found. Run: npx vite build --ssr scripts/smoke-entry.jsx --outDir .smoke');
  process.exit(2);
}

await import(bundle);
await new Promise((r) => setTimeout(r, 1200));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = (text) => {
  const nodes = [...document.querySelectorAll('.nav-item, button, .chip')];
  const el = nodes.find((n) => (n.textContent || '').trim() === text || (n.getAttribute('title') || '') === text);
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
};
const html = () => document.getElementById('root').innerHTML;
const checks = [];
const check = (name, ok) => checks.push([name, ok]);

check('root rendered', html().length > 2000);
check('sidebar', html().includes('sidebar') || html().includes('Скиллы'));
check('chat view', html().includes('Тестовый диалог') || html().includes('main'));
check('composer', html().includes('composer') || html().includes('textarea'));
check('status bar', html().includes('statusbar'));

const views = [
  ['Обзор', 'dash-hero'],
  ['Скиллы', 'skill-card'],
  ['Медиа-студия', 'media-layout'],
  ['Браузер', 'browser-panel'],
  ['Файлы', 'files-layout'],
  ['Терминал', 'terminal-panel'],
  ['Музыка', 'music-list'],
  ['Память', 'memory-layout'],
];
for (const [label, marker] of views) {
  const clicked = clickByText(label);
  await wait(250);
  check(`view: ${label}`, clicked && html().includes(marker));
}

// Settings modal
clickByText('Настройки');
await wait(250);
check('settings modal', html().includes('settings-main'));
const tabs = ['Внешний вид', 'Провайдеры', 'Скиллы', 'Память', 'Доступ', 'Автоматизация', 'Медиа', 'О программе'];
for (const tab of tabs) {
  const ok = clickByText(tab);
  await wait(200);
  check(`settings tab: ${tab}`, ok && html().includes('settings-main'));
}

// Skill editor modal
clickByText('Скиллы');
await wait(200);
clickByText('Создать');
await wait(250);
check('skill editor modal', html().includes('Новый скилл'));
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(150);

// Command palette + model picker via keyboard
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
await wait(200);
check('command palette', html().includes('palette') || html().includes('команд'));
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(150);

// Dashboard internals
clickByText('Обзор');
await wait(400);
check('dashboard stats', html().includes('Процессор') && html().includes('Память'));
check('dashboard tasks', html().includes('Утренняя сводка'));
check('dashboard quick actions', html().includes('Быстрые действия'));

// Prompt library in welcome (new empty chat)
const newChatBtn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Новый диалог'));
if (newChatBtn) newChatBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(300);
check('welcome screen', html().includes('Привет! Что создадим?'));
const promptsToggle = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Мои промпты'));
if (promptsToggle) promptsToggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(150);
check('prompt library', html().includes('Свой промпт'));

// Save current composer text as a prompt (Ctrl+K also lists it)
const ta = document.querySelector('.composer-input');
if (ta) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, 'Тестовый сохранённый промпт');
  ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(120);
}
const saveBtn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('title') === 'Сохранить текст как промпт');
if (saveBtn) saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(250);
check('prompt saved via composer', invokeLog.some((c) => c.channel === 'config:set' && c.payload?.key === 'chat.prompts'));

// Shortcut help overlay
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true }));
await wait(200);
check('shortcut help', html().includes('Горячие клавиши'));
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(150);

// Main → renderer events
emitToRenderer('permission:request', {
  tool: { name: 'write_file', label: 'Запись файла', risk: 'write', riskLabel: 'изменение файлов' },
  summary: 'C:\\Users\\test\\file.txt · 12 симв.',
  args: { path: 'C:\\Users\\test\\file.txt' },
});
await wait(200);
check('permission modal', html().includes('Запрос разрешения'));
const deny = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Отклонить');
if (deny) deny.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(200);
check('permission resolved', invokeLog.some((c) => c.channel === 'interactions:resolve'));

emitToRenderer('ask:request', { question: 'Какой формат выбрать?', options: ['JSON', 'Markdown'] });
await wait(200);
check('ask modal', html().includes('Какой формат выбрать?') || html().includes('ask'));

emitToRenderer('app:updateAvailable', { latest: '9.9.9', current: '1.0.1', url: 'https://github.com/x' });
await wait(200);
check('update toast', html().includes('9.9.9'));

emitToRenderer('app:scheduled', { title: 'Тестовая задача', body: 'Пора' });
await wait(200);
check('scheduled toast', html().includes('Тестовая задача'));

// Streaming state from agent event
emitToRenderer('agent:event', { type: 'start', chatId: 'chat-2', messageId: 'm3', provider: 'pollinations', model: 'openai' });
await wait(200);
check('streaming banner', html().includes('PSYCHIC работает'));
emitToRenderer('agent:event', { type: 'token', chatId: 'chat-2', messageId: 'm3', delta: 'Привет, я думаю…' });
await wait(150);
check('streaming text', html().includes('Привет, я думаю'));
emitToRenderer('agent:event', { type: 'done', chatId: 'chat-2', messageId: 'm3', content: 'Готово' });
await wait(200);
check('stream ended', !html().includes('PSYCHIC работает'));

// Model picker
const modelPill = document.querySelector('.model-pill');
if (modelPill) modelPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(200);
check('model picker', html().includes('модел') || html().includes('Pollinations'));

console.log(`\nroot html length: ${html().length}`);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);

if (errors.length) {
  console.log(`\n${errors.length} console.error / rejection(s):`);
  for (const e of errors.slice(0, 12)) console.log(' -', e.slice(0, 600));
}
const failed = checks.filter(([, ok]) => !ok).length;

// GitHub Actions annotations: так провалы видно прямо в PR, не скачивая логи.
for (const [name, ok] of checks) {
  if (!ok) console.log(`::error title=smoke: ${name}::Проверка «${name}» не прошла`);
}
for (const e of errors.slice(0, 10)) {
  console.log(`::error title=smoke: console::${String(e).split('\n')[0].slice(0, 300)}`);
}
console.log(`::notice title=smoke::${checks.length - failed}/${checks.length} проверок прошло, ошибок консоли: ${errors.length}`);

process.exit(errors.length || failed ? 1 : 0);
