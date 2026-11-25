/**
 * Полноценный сквозной E2E-тест всего приложения:
 * реальный React-интерфейс (.smoke/smoke-entry.mjs)
 *   ↕ window.psychic из реального src/preload/preload.cjs
 *   ↕ ipcRenderer / ipcMain со строгой проверкой structuredClone (как в Electron)
 *   ↕ реальный src/main/index.cjs, ipc.cjs, сервисы, хранилище, агент и инструменты.
 *
 * Ловит любые несоответствия форматов ответов main ↔ renderer, неклонируемые
 * структуры в IPC, гонки сохранения настроек и падения экранов.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'psychic-e2e-'));
process.env.PSYCHIC_TEST_HOME = userData;
require('../test/setup.cjs');

const electron = require('electron');

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;
for (const key of [
  'window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
  'Node', 'Element', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'localStorage', 'location', 'CustomEvent', 'Event',
  'KeyboardEvent', 'MouseEvent', 'Blob', 'File', 'FileReader', 'ImageData', 'DOMParser',
]) {
  if (window[key] !== undefined) globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.self = window;
globalThis.document = window.document;
try {
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
} catch {}

window.confirm = () => true;
if (window.HTMLCanvasElement) {
  window.HTMLCanvasElement.prototype.getContext = () => null;
}
window.matchMedia = window.matchMedia || ((query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {},
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = RO;
window.ResizeObserver = RO;

class AudioStub {
  constructor() { this.volume = 0.7; this.src = ''; this.currentTime = 0; this.duration = 120; }
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

// Заглушаем внешние сетевые вызовы (обновления GitHub и стриминг LLM), не трогая локальную логику.
let agentTurn = 0;
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes('api.github.com/repos/')) {
    return new Response(JSON.stringify({ tag_name: 'v1.0.0', html_url: 'https://github.com/Cotyk207/psychic-adventure/releases' }), { status: 200 });
  }
  if (u.endsWith('/models')) {
    return new Response(JSON.stringify({ data: [{ id: 'openai' }, { id: 'mistral' }] }), { status: 200 });
  }
  if (!u.endsWith('/chat/completions')) {
    return new Response('ok', { status: 200 });
  }
  const reqBody = init.body ? JSON.parse(init.body) : {};
  if (!reqBody.stream) {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Заметка E2E' } }] }), { status: 200 });
  }
  agentTurn += 1;
  const info = await electron.ipcRenderer.invoke('app:getInfo');
  const notePath = path.join(info.paths.workspace, 'e2e-note.txt');
  const chunks = agentTurn === 1
    ? [
        'data: {"choices":[{"delta":{"reasoning_content":"Шаг 1: проверяю путь к рабочей папке и готовлю запись файла."}}]}\n\n',
        `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'tc-e2e', function: { name: 'write_file', arguments: JSON.stringify({ path: notePath, content: 'Привет из E2E!' }) } }] } }] })}\n\n`,
        'data: [DONE]\n\n',
      ]
    : [
        'data: {"choices":[{"delta":{"reasoning_content":"Шаг 2: файл записан, формирую ответ пользователю."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Заметка успешно записана в рабочую папку!"}}]}\n\n',
        'data: [DONE]\n\n',
      ];
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    start(c) { for (const ch of chunks) c.enqueue(enc.encode(ch)); c.close(); },
  }), { status: 200 });
};

// Запускаем реальный main-процесс и реальный preload.cjs!
const mainApp = require('../src/main/index.cjs');
await electron.app.whenReady();
await new Promise((r) => setTimeout(r, 80));

// Засеем один трек в папку музыки, чтобы проверить рендер и кнопку «Обновить» на реальных данных
const bootInfo = await electron.ipcRenderer.invoke('app:getInfo');
const sampleTrack = path.join(bootInfo.paths.music, 'synthwave-demo.mp3');
fs.mkdirSync(path.dirname(sampleTrack), { recursive: true });
fs.writeFileSync(sampleTrack, Buffer.alloc(2048, 1));

require('../src/preload/preload.cjs');

const errors = [];
const origErr = console.error;
console.error = (...args) => {
  errors.push(args.map((a) => (a?.stack || String(a))).join(' '));
};
window.addEventListener('error', (e) => errors.push(`window.error: ${e.error?.stack || e.message}`));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandled: ${e.reason?.stack || e.reason}`));

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const html = () => document.getElementById('root')?.innerHTML || '';
const checks = [];
const check = (name, ok) => checks.push([name, Boolean(ok)]);

const clickButton = (label, exact = false) => {
  const buttons = [...document.querySelectorAll('button, [role="button"], .nav-item, .settings-nav-item, .theme-card')];
  const el = buttons.find((b) => {
    const t = (b.textContent || '').trim();
    return exact ? t === label : t.includes(label);
  });
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
};

await import(new URL('../.smoke/smoke-entry.mjs', import.meta.url));
// Ждём завершения загрузочного сплэша (в конфиге по умолчанию showSplash=true → 950 мс)
await wait(1350);

check('e2e: booted without bootError', !html().includes('Не удалось запустить интерфейс') && !html().includes('could not be cloned'));
check('e2e: onboarding shown on fresh start', html().includes('Твой ИИ-ассистент для идей') && html().includes('Начать работу'));

// Завершаем онбординг и проверяем запись onboardingDone на диск
clickButton('Начать работу');
await wait(250);
const cfgAfterOnboarding = await electron.ipcRenderer.invoke('config:get');
check('e2e: onboarding saved to disk', cfgAfterOnboarding.onboardingDone === true);

// Проходим все разделы с реальным IPC
for (const [nav, marker] of [
  ['Обзор', 'Процессор'],
  ['Скиллы', 'Coding'],
  ['Медиа-студия', 'Медиа'],
  ['Браузер', 'Браузер'],
  ['Файлы', 'Быстрый доступ'],
  ['Терминал', 'Терминал'],
  ['Музыка', 'synthwave-demo'],
  ['Память', 'Память'],
]) {
  clickButton(nav);
  await wait(300);
  check(`e2e: view ${nav}`, html().includes(marker));
}

// Проверяем музыкальную панель: кнопка «Обновить» вызывает реальный music:refreshLibrary (возвращает массив)
clickButton('Музыка');
await wait(200);
clickButton('Обновить');
await wait(250);
check('e2e: music refresh keeps track list', html().includes('synthwave-demo'));

// Переключаемся обратно в Диалоги и проверяем:
// 1) Только бесплатные модели (OpenCode Console + Pollinations без ключа, платных нет)
// 2) Переключение модели и появление/скрытие кнопки уровня рассуждений
// 3) Контекстное меню по правой кнопке мыши (Копировать / Вставить)
// 4) Отправку сообщения, просмотр рассуждений ИИ в сообщении и в отдельном окне
clickButton('Новый диалог');
await wait(300);

// Открываем селектор моделей и проверяем бесплатный каталог в стиле OpenCode Console
const modelPill = document.querySelector('.model-pill');
if (modelPill) modelPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(250);
check(
  'e2e: free-only model picker shows OpenCode & hides paid providers',
  html().includes('OpenCode Console') &&
    html().includes('Tidepool Alpha Free') &&
    html().includes('бесплатно · без ключа') &&
    !html().includes('Anthropic Claude') &&
    !html().includes('xAI Grok')
);

// Выбираем обычную модель mistral без рассуждений -> кнопка уровня рассуждений НЕ должна отображаться
const mistralItem = [...document.querySelectorAll('.picker-model-item')].find((el) => (el.textContent || '').includes('Mistral Small'));
if (mistralItem) mistralItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(250);
check('e2e: reasoning effort button hidden for non-reasoning model', !document.querySelector('.effort-btn'));

// Снова открываем селектор моделей и выбираем Tidepool Alpha Free (поддерживает 6 уровней рассуждений)
const modelPill2 = document.querySelector('.model-pill');
if (modelPill2) modelPill2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(250);
const tidepoolItem = [...document.querySelectorAll('.picker-model-item')].find((el) => (el.textContent || '').includes('Tidepool Alpha Free'));
if (tidepoolItem) tidepoolItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(250);

const effortBtn = document.querySelector('.effort-btn');
check('e2e: reasoning effort button shown for reasoning model', Boolean(effortBtn));
if (effortBtn) {
  effortBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(150);
  clickButton('Максимум');
  await wait(200);
}
const cfgEffort = await electron.ipcRenderer.invoke('config:get');
check('e2e: reasoning effort saved to config (max)', cfgEffort.chat.reasoningEffort === 'max');

// Проверяем контекстное меню по правой кнопке мыши (Вставить в поле ввода)
await electron.ipcRenderer.invoke('clipboard:write', { text: 'Создай заметку в рабочей папке' });
const ta = document.querySelector('.composer-input');
if (ta) {
  ta.focus();
  ta.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 200 }));
  await wait(180);
  check('e2e: right-click context menu opened with Paste & Copy', Boolean(document.querySelector('.ctx-menu')) && html().includes('Вставить'));
  clickButton('Вставить');
  await wait(180);
  check('e2e: right-click Paste inserted clipboard text into composer', ta.value === 'Создай заметку в рабочей папке');
  ta.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}
await wait(750);
const writtenNote = path.join(bootInfo.paths.workspace, 'e2e-note.txt');
check('e2e: agent executed write_file tool', fs.existsSync(writtenNote) && fs.readFileSync(writtenNote, 'utf8') === 'Привет из E2E!');
check('e2e: assistant reply rendered in chat', html().includes('Заметка успешно записана'));
// Поиск в текущем диалоге, копирование и цитирование работают на живом состоянии.
const toolButton = label => [...document.querySelectorAll('.chat-tools button')].find(b => b.textContent.includes(label));
toolButton('Поиск')?.click();
await wait(80);
const findInput = document.querySelector('[aria-label="Найти в диалоге"]');
if (findInput) {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(findInput, 'Заметка успешно');
  findInput.dispatchEvent(new window.Event('input', { bubbles: true }));
}
await wait(100);
check('e2e: chat search filters messages', html().includes('1 найдено') && (document.querySelector('.chat-inner')?.textContent || '').includes('Заметка успешно записана') && !(document.querySelector('.chat-inner')?.textContent || '').includes('Создай заметку в рабочей папке'));
toolButton('Поиск')?.click();
await wait(80);
toolButton('Копировать')?.click();
await wait(100);
const copiedConversation = await electron.ipcRenderer.invoke('clipboard:read');
check('e2e: copies conversation with newlines', copiedConversation.includes('Вы:\nСоздай заметку') && copiedConversation.includes('PSYCHIC:\nЗаметка'));
const quoteButton = [...document.querySelectorAll('.msg-action')].find(b => b.textContent.includes('Цитировать'));
quoteButton?.click();
await wait(100);
check('e2e: quote inserts into composer', document.querySelector('.composer-input')?.value.includes('> Создай заметку'));
const composerAfterQuote = document.querySelector('.composer-input');
if (composerAfterQuote) {
  Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(composerAfterQuote, '');
  composerAfterQuote.dispatchEvent(new window.Event('input', { bubbles: true }));
}
await wait(80);
check(
  'e2e: AI reasoning block and toggle button rendered on message',
  html().includes('Рассуждения ИИ') && html().includes('Шаг 1: проверяю путь') && html().includes('Скрыть рассуждения')
);

// Открываем модальное окно рассуждений через кнопку «Рассуждения» в верхней панели
const reasoningHeadBtn = document.querySelector('.reasoning-head-btn');
if (reasoningHeadBtn) reasoningHeadBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(220);
check('e2e: reasoning viewer modal opened', html().includes('Ход рассуждений ИИ в диалоге') && html().includes('Уровень: Максимум'));
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(150);

// Открываем настройки, проверяем переключение темы (два подряд updateConfig без потери первого!) и экспорт/импорт
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
await wait(250);
check('e2e: settings modal open', html().includes('Настройки'));

clickButton('Внешний вид');
await wait(200);
clickButton('Ghost Shell');
await wait(250);
const cfgAfterTheme = await electron.ipcRenderer.invoke('config:get');
check('e2e: consecutive updateConfig preserved theme', cfgAfterTheme.appearance.theme === 'ghost' && cfgAfterTheme.appearance.customTheme === null);

clickButton('Общие');
await wait(200);
const exportPath = path.join(userData, 'exported-config.json');
electron.dialog.lastSavePath = exportPath;
clickButton('Экспорт настроек');
await wait(250);
check('e2e: config exported via UI', fs.existsSync(exportPath) && html().includes('Настройки экспортированы'));

electron.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [exportPath] });
clickButton('Импорт настроек');
await wait(250);
check('e2e: config imported via UI', html().includes('Настройки импортированы'));

// Отправляем в живой чат сообщение с авто-ссылкой и Markdown-ссылкой (сценарий «В чат» из Браузера, регрессия marked@12 parseInline в v1.0.6)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await wait(160);
const composerForLink = document.querySelector('.composer textarea') || document.querySelector('textarea');
if (composerForLink) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  nativeSetter.call(
    composerForLink,
    '[Ссылка]\nPollinations.ai - Official Site\nhttp://Pollinations.AI и [OpenCode](https://opencode.ai "Сайт")'
  );
  composerForLink.dispatchEvent(new window.Event('input', { bubbles: true }));
  composerForLink.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(450);
}
check(
  'e2e: chat message with autolink & titled markdown link rendered in live UI without ErrorBoundary crash',
  !html().includes('СБОЙ ИНТЕРФЕЙСА')
    && html().includes('href="http://Pollinations.AI"')
    && html().includes('href="https://opencode.ai"')
    && html().includes('target="_blank"')
);

// Сброс до заводских настроек через UI (вкладка «О программе»)
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
await wait(220);
clickButton('О программе');
await wait(200);
clickButton('Сбросить всё');
await wait(350);
const cfgAfterReset = await electron.ipcRenderer.invoke('config:get');
check('e2e: factory reset restored defaults and created fresh chat', cfgAfterReset.appearance.theme === 'nightcity');

console.error = origErr;
await mainApp.shutdownServices();
try { fs.rmSync(userData, { recursive: true, force: true }); } catch {}

console.log('\n=== Full-stack E2E results ===');
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
if (errors.length) {
  console.log(`\n${errors.length} console.error / rejection(s):`);
  for (const e of errors.slice(0, 12)) console.log(' -', e.slice(0, 600));
}

const failed = checks.filter(([, ok]) => !ok).length;
for (const [name, ok] of checks) {
  if (!ok) console.log(`::error title=e2e: ${name}::Проверка «${name}» не прошла`);
}
for (const e of errors.slice(0, 10)) {
  console.log(`::error title=e2e: console::${String(e).split('\n')[0].slice(0, 300)}`);
}
console.log(`::notice title=e2e::${checks.length - failed}/${checks.length} сквозных E2E-проверок прошло, ошибок консоли: ${errors.length}`);

process.exit(errors.length || failed ? 1 : 0);
