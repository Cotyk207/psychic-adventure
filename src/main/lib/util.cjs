'use strict';

const crypto = require('crypto');

function uid(len = 12) {
  return crypto.randomBytes(len).toString('hex').slice(0, len);
}

function deepMerge(base, extra) {
  if (Array.isArray(base)) return Array.isArray(extra) ? extra : base;
  if (typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
  if (typeof extra !== 'object' || extra === null) return base;
  const out = { ...base };
  for (const key of Object.keys(extra)) {
    if (key === '__proto__' || key === 'constructor') continue;
    out[key] = deepMerge(base[key], extra[key]);
  }
  return out;
}

function getPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function setPath(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Таймаут: ${label} (${ms} мс)`)), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

function normalizeBaseUrl(url) {
  if (!url) return '';
  return String(url).trim().replace(/\/+$/, '');
}

function joinUrl(base, path) {
  const b = normalizeBaseUrl(base);
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function safeJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeEntities(str = '') {
  const map = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&nbsp;': ' ', '&mdash;': '—', '&ndash;': '–', '&laquo;': '«', '&raquo;': '»',
    '&hellip;': '…', '&copy;': '©', '&reg;': '®', '&trade;': '™',
  };
  return String(str)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|#39|nbsp|mdash|ndash|laquo|raquo|hellip|copy|reg|trade);/gi, (m) => map[m.toLowerCase()] ?? m);
}

function truncate(str, max = 2000, ellipsis = '…') {
  if (!str) return '';
  const s = String(str);
  return s.length > max ? s.slice(0, max) + ellipsis : s;
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'item';
}

function isProbablyBinary(buf) {
  const len = Math.min(buf.length, 8000);
  let suspicious = 0;
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
    if (buf[i] < 7 || (buf[i] > 13 && buf[i] < 32)) suspicious++;
  }
  return suspicious / Math.max(1, len) > 0.12;
}

function todayString() {
  return new Date().toLocaleDateString('ru-RU', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
}

function pluralizeRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

module.exports = {
  uid, deepMerge, getPath, setPath, clamp, sleep, withTimeout, normalizeBaseUrl,
  joinUrl, safeJson, formatBytes, escapeHtml, decodeEntities, truncate, slugify,
  isProbablyBinary, todayString, pluralizeRu,
};
