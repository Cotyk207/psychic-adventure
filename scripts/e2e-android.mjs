/**
 * Сквозной E2E-тест Android-версии PSYCHIC (390x844 смартфон):
 * реальный React-интерфейс (.smoke/smoke-entry.mjs)
 *   ↕ src/renderer/src/lib/mobileBridge.js (автономный Android-рантайм)
 *   ↕ симуляция нативного Java-моста window.PsychicAndroid (PsychicNativeBridge.java):
 *       streamHttp (с проверкой User-Agent: opencode/... и SSE-стриминга),
 *       writeClipboard / readClipboard, getDeviceStats, fsPaths / fsList / fsReadText / fsWriteText.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://localhost/',
  pretendToBeVisual: true,
});

const { window } = dom;
Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });

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
window.matchMedia = (query) => ({
  matches: query.includes('max-width: 860px'),
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() { return false; },
});
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
globalThis.speechSynthesis = { speak() {}, cancel() {}, getVoices: () => [] };
window.speechSynthesis = globalThis.speechSynthesis;
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
window.SpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;

// ── Симуляция нативного Java @JavascriptInterface (window.PsychicAndroid) ──
let nativeClipboard = '';
const nativeFiles = new Map();
const capturedHttpCalls = [];
let streamTurn = 0;
const baseRoot = '/storage/emulated/0/Android/data/ai.psychic.neural/files';

window.PsychicAndroid = {
  writeClipboard(text) {
    nativeClipboard = String(text ?? '');
  },
  readClipboard() {
    return nativeClipboard;
  },
  openExternal() {
    return true;
  },
  getDeviceStats() {
    return JSON.stringify({
      hostname: 'Samsung Galaxy S24',
      platform: 'android',
      release: 'Android 15 (API 35)',
      arch: 'arm64-v8a',
      cores: 8,
      cpuModel: 'Snapdragon 8 Gen 3',
      memory: { total: 12 * 1024 ** 3, free: 5 * 1024 ** 3, used: 7 * 1024 ** 3, percent: 58 },
      disks: [{ path: '/storage', total: 256 * 1024 ** 3, free: 140 * 1024 ** 3, used: 116 * 1024 ** 3, percent: 45 }],
      battery: 87,
      network: [{ name: 'wlan0', address: '192.168.1.42', family: 'IPv4' }],
    });
  },
  fsPaths() {
    return JSON.stringify({
      home: baseRoot,
      userData: baseRoot,
      config: baseRoot,
      workspace: `${baseRoot}/PSYCHIC Workspace`,
      media: `${baseRoot}/media`,
      images: `${baseRoot}/media/images`,
      music: `${baseRoot}/media/music`,
      musicLibrary: `${baseRoot}/media/music`,
      videos: `${baseRoot}/media/videos`,
      skills: `${baseRoot}/skills`,
      documents: `${baseRoot}/Documents`,
      downloads: `${baseRoot}/Downloads`,
      desktop: `${baseRoot}/PSYCHIC Workspace`,
    });
  },
  fsList(dirPath) {
    const prefix = `${String(dirPath).replace(/\/+$/, '')}/`;
    const entries = [];
    for (const [k, v] of nativeFiles.entries()) {
      if (k.startsWith(prefix)) {
        const rel = k.slice(prefix.length);
        if (rel && !rel.includes('/')) {
          entries.push({ name: rel, path: k, type: 'file', size: v.length, modified: Date.now() });
        }
      }
    }
    return JSON.stringify({ path: dirPath, entries });
  },
  fsReadText(p) {
    return nativeFiles.get(p) || '';
  },
  fsWriteText(p, content) {
    nativeFiles.set(p, String(content ?? ''));
    return true;
  },
  fsReadBase64() { return ''; },
  fsWriteBase64(p, b64) { nativeFiles.set(p, b64); return p; },
  fsMkdir() { return true; },
  fsDelete(p) { nativeFiles.delete(p); return true; },
  abortHttp() {},
  streamHttp(reqId, url, method, headersJson, body) {
    const headers = JSON.parse(headersJson || '{}');
    capturedHttpCalls.push({ url, method, headers, body: body ? JSON.parse(body) : null });

    setTimeout(() => {
      if (url.includes('example.org')) {
        window.__psychicNativeEvent({
          reqId,
          event: 'chunk',
          status: 200,
          data: '<html><head><title>Android Reader Demo</title></head><body><p>Текст статьи для мобильного ридера PSYCHIC.</p></body></html>',
        });
        window.__psychicNativeEvent({ reqId, event: 'end', status: 200 });
        return;
      }

      if (url.endsWith('/chat/completions')) {
        streamTurn += 1;
        if (streamTurn === 1) {
          const tcChunk = JSON.stringify({
            choices: [{
              delta: {
                reasoning_content: 'Мобильный агент проверяет рабочую папку смартфона...',
                tool_calls: [{
                  index: 0,
                  id: 'call_android_1',
                  function: {
                    name: 'write_file',
                    arguments: JSON.stringify({ path: 'phone-note.txt', content: 'Записано на Android!' }),
                  },
                }],
              },
            }],
          });
          window.__psychicNativeEvent({ reqId, event: 'chunk', status: 200, data: `data: ${tcChunk}\n\ndata: [DONE]\n\n` });
          window.__psychicNativeEvent({ reqId, event: 'end', status: 200 });
        } else {
          const replyMd = [
            '<think>Проверяю результат записи.</think>Файл phone-note.txt сохранён на твоём телефоне!',
            '',
            '| ЧТО | ЧТО ДЕЛАЮ | КАК ЗАДАТЬ |',
            '| --- | --- | --- |',
            '| Браузер | Открываю страницы, читаю их, делаю скриншоты. | `browser_open`, `browser_read`, `screenshot` |',
            '| Код | Пишу и запускаю скрипты в `/storage/emulated/0/Android/data/ai.psychic.neural/files/PSYCHIC Workspace`. | `write_file`, `edit_file` |',
          ].join('\n');
          const msgChunk = JSON.stringify({ choices: [{ delta: { content: replyMd } }] });
          window.__psychicNativeEvent({
            reqId,
            event: 'chunk',
            status: 200,
            data: `data: ${msgChunk}\n\ndata: [DONE]\n\n`,
          });
          window.__psychicNativeEvent({ reqId, event: 'end', status: 200 });
        }
        return;
      }

      window.__psychicNativeEvent({ reqId, event: 'chunk', status: 200, data: '{}' });
      window.__psychicNativeEvent({ reqId, event: 'end', status: 200 });
    }, 15);
  },
};

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
  const buttons = [...document.querySelectorAll('button, [role="button"], .nav-item, .settings-nav-item, .mobile-tab-item')];
  const el = buttons.find((b) => {
    const t = (b.textContent || '').trim();
    return exact ? t === label : t.includes(label);
  });
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return true;
};

await import(new URL('../.smoke/smoke-entry.mjs', import.meta.url));
await wait(1350);

check('android: mobileBridge auto-initialized (platform=android)', window.psychic?.platform === 'android' && window.psychic?.isElectron === false);
check('android: desktop window controls hidden on phone', !document.querySelector('.window-controls'));
check('android: onboarding rendered & completed', clickButton('Начать работу'));
await wait(250);
check('android: mobile bottom tabbar rendered', Boolean(document.querySelector('.mobile-tabbar')));

// Проверяем мобильную шторку меню и телеметрию смартфона
clickButton('Обзор');
await wait(300);
check('android: dashboard shows real phone telemetry', html().includes('Snapdragon 8 Gen 3') || html().includes('Samsung Galaxy S24') || html().includes('Процессор'));

// Открываем боковое меню через кнопку «Меню» нижней панели и проверяем мобильные Настройки
clickButton('Меню', true);
await wait(180);
check('android: mobile sidebar drawer opens', Boolean(document.querySelector('.sidebar.mobile-open')));

clickButton('Настройки');
await wait(220);
check(
  'android: mobile settings renders mobile top bar & hides Windows-only autostart/tray',
  Boolean(document.querySelector('.modal.settings'))
    && Boolean(document.querySelector('.settings-mobile-bar'))
    && !html().includes('Запускать вместе с Windows')
    && !html().includes('Сворачивать в трей')
    && html().includes('Android · local-first')
);
clickButton('Провайдеры');
await wait(180);
const firstProvInfo = document.querySelector('.provider-info');
if (firstProvInfo) firstProvInfo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(150);
check(
  'android: tapping provider card expands full-width provider settings on phone',
  Boolean(document.querySelector('.provider-detail'))
);
const closeSettingsBtn = document.querySelector('.settings-mobile-bar button');
if (closeSettingsBtn) closeSettingsBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(160);
check('android: mobile settings close button dismisses modal', !document.querySelector('.modal.settings'));

clickButton('Меню', true);
await wait(150);
clickButton('Скиллы');
await wait(250);
check('android: bundled 14 skills loaded in APK', html().includes('Coding') && html().includes('Web Research'));

clickButton('Меню', true);
await wait(150);
clickButton('Браузер');
await wait(220);
await window.psychic.invoke('browser:open', { url: 'https://example.org' });
await wait(200);
check('android: built-in reader mode works without Electron WebContentsView', html().includes('Android Reader Demo') && html().includes('Текст статьи для мобильного ридера'));

// Возвращаемся в Чат через нижний таббар
clickButton('Чат', true);
await wait(250);

// Выбираем модель с поддержкой глубины рассуждений и включаем «Максимум»
const modelPill = document.querySelector('.model-pill');
if (modelPill) modelPill.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(220);
check('android: free-only OpenCode models available out of the box', html().includes('OpenCode Console') && html().includes('Tidepool Alpha Free'));
const tidepool = [...document.querySelectorAll('.picker-model-item')].find((el) => (el.textContent || '').includes('Tidepool Alpha Free'));
if (tidepool) tidepool.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(200);

const effortBtn = document.querySelector('.effort-btn');
if (effortBtn) {
  effortBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(140);
  clickButton('Максимум');
  await wait(180);
}

// Проверяем долгое нажатие пальцем (long-press 500ms) и нативную вставку из буфера обмена Android!
window.PsychicAndroid.writeClipboard('Запиши заметку на телефон');
const ta = document.querySelector('.composer-input');
if (ta) {
  const touchEvt = new window.Event('touchstart', { bubbles: true });
  touchEvt.touches = [{ clientX: 100, clientY: 500 }];
  ta.dispatchEvent(touchEvt);
  await wait(540);
  const endEvt = new window.Event('touchend', { bubbles: true });
  ta.dispatchEvent(endEvt);
  check('android: touch long-press opened context menu on phone', Boolean(document.querySelector('.ctx-menu')));
  clickButton('Вставить');
  await wait(180);
  check('android: paste from native Android ClipboardManager worked', ta.value === 'Запиши заметку на телефон');
  ta.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

await wait(700);
const llmCall = capturedHttpCalls.find((c) => c.url.endsWith('/chat/completions'));
check(
  'android: native Java HTTP sent OpenCode User-Agent & reasoning_effort=max',
  llmCall?.headers?.['User-Agent'] === 'opencode/stable/1.0.0/opencode' &&
    llmCall?.headers?.Authorization === 'Bearer public' &&
    llmCall?.body?.reasoning_effort === 'max'
);
check(
  'android: agent write_file saved to native phone storage',
  nativeFiles.get(`${baseRoot}/PSYCHIC Workspace/phone-note.txt`) === 'Записано на Android!'
);
check(
  'android: assistant reply & AI reasoning rendered on phone',
  html().includes('Файл phone-note.txt сохранён на твоём телефоне!') &&
    html().includes('Рассуждения ИИ') &&
    html().includes('Проверяю результат записи.')
);
check(
  'android: markdown table enhanced with mobile card labels & send button visible',
  Boolean(document.querySelector('.msg-content .table-wrap table.has-headers')) &&
    Boolean(document.querySelector('.msg-content td[data-label="КАК ЗАДАТЬ"]')) &&
    Boolean(document.querySelector('.composer .send-btn'))
);

console.error = origErr;

console.log('\n=== Android APK Runtime E2E results ===');
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
if (errors.length) {
  console.log(`\n${errors.length} console.error / rejection(s):`);
  for (const e of errors.slice(0, 10)) console.log(' -', e.slice(0, 500));
}

const failed = checks.filter(([, ok]) => !ok);
for (const [name] of failed) {
  console.log(`::error title=android-e2e: ${name}::Проверка «${name}» не прошла`);
}
console.log(`::notice title=android-e2e::${checks.length - failed.length}/${checks.length} Android E2E-проверок прошло, ошибок консоли: ${errors.length}`);

if (failed.length || errors.length) {
  process.exit(1);
}
process.exit(0);
