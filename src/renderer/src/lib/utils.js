export function cn(...args) {
  return args.filter(Boolean).join(' ');
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'сейчас';
  if (min < 60) return `${min} мин`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} ч`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} дн`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function uid(len = 8) {
  return Math.random().toString(36).slice(2, 2 + len) + Date.now().toString(36).slice(-3);
}

export function debounce(fn, ms = 250) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function truncate(str, n = 200, ellipsis = '…') {
  if (!str) return '';
  const s = String(str);
  return s.length > n ? s.slice(0, n) + ellipsis : s;
}

export function fileExt(name = '') {
  const parts = String(name).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

export function isImageFile(name = '') {
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(fileExt(name));
}

export function isVideoFile(name = '') {
  return ['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(fileExt(name));
}

export function isAudioFile(name = '') {
  return ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'].includes(fileExt(name));
}

export function isTextFile(name = '') {
  return ['txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'xml', 'yml', 'yaml', 'toml', 'ini', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'cs', 'sh', 'ps1', 'bat', 'sql', 'log', 'env', 'gitignore', 'svg'].includes(fileExt(name));
}

export const EXT_ICONS = {
  js: 'braces', jsx: 'braces', ts: 'braces', tsx: 'braces', json: 'braces', css: 'palette',
  html: 'code-2', md: 'file-text', txt: 'file-text', py: 'file-code', rs: 'file-code',
  go: 'file-code', java: 'file-code', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image',
  gif: 'image', svg: 'image', mp3: 'music', wav: 'music', ogg: 'music', flac: 'music',
  mp4: 'film', webm: 'film', mov: 'film', zip: 'archive', pdf: 'book-open',
};

export function fileIconName(name = '') {
  return EXT_ICONS[fileExt(name)] || 'file';
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 500);
}

export function downloadText(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
}

export function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export function sanitizeFilename(name) {
  return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}

export function parseDataUrlSize(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return 0;
  return Math.floor(m[2].length * 0.75);
}

export function formatDuration(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function extractYoutubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=)([\w-]{6,})/);
  return m ? m[1] : null;
}
