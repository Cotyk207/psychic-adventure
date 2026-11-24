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

const MEDIA = [
  { name: 'image-1.jpg', path: '/tmp/image-1.jpg', kind: 'images', size: 204800, modified: new Date().toISOString() },
  { name: 'music-1.wav', path: '/tmp/music-1.wav', kind: 'music', size: 1024000, modified: new Date().toISOString() },
];

const responses = {
  'config:get': CONFIG,
  'app:getInfo': { version: '1.0.0', platform: 'win32', paths: { userData: 'C:\\Users\\test\\AppData\\Roaming\\psychic', workspace: 'C:\\Users\\test\\PSYCHIC Workspace', media: 'C:\\Users\\test\\media', skills: 'C:\\Users\\test\\skills' } },
  'chats:list': [CHAT],
  'chats:get': CHAT,
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

window.psychic = {
  platform: 'win32',
  versions: { electron: '33.2.0', chrome: '130', node: '20' },
  isElectron: true,
  invoke: async (channel, payload) => {
    if (channel in responses) return responses[channel];
    if (channel === 'terminal:write' || channel === 'browser:hide' || channel === 'browser:setBounds') return null;
    return null;
  },
  on: () => () => {},
};
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
const tabs = ['Внешний вид', 'Провайдеры', 'Скиллы', 'Память', 'Доступ', 'Медиа', 'О программе'];
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

clickByText('Диалоги');
await wait(200);
const modelPill = document.querySelector('.model-pill');
if (modelPill) modelPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(200);
check('model picker', html().includes('model') && html().length > 2000);

console.log(`\nroot html length: ${html().length}`);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);

if (errors.length) {
  console.log(`\n${errors.length} console.error / rejection(s):`);
  for (const e of errors.slice(0, 12)) console.log(' -', e.slice(0, 600));
}
const failed = checks.filter(([, ok]) => !ok).length;
process.exit(errors.length || failed ? 1 : 0);
