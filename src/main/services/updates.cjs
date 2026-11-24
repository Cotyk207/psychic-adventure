'use strict';

/**
 * Проверка обновлений через GitHub Releases (без токенов и сборки).
 */

function normalize(value) {
  const digits = String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .slice(0, 3)
    .map((part) => parseInt(part, 10));
  while (digits.length < 3) digits.push(0);
  return digits.map((n) => (Number.isNaN(n) ? 0 : n));
}

/** Сравнение семантических версий: -1 если a < b, 0 если равны, 1 если a > b. */
function compareVersions(a, b) {
  const va = normalize(a);
  const vb = normalize(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] > vb[i]) return 1;
    if (va[i] < vb[i]) return -1;
  }
  return 0;
}

function assetForPlatform(assets = [], platform = process.platform, arch = process.arch) {
  if (platform !== 'win32') return null;
  const portable = assets.find((a) => /portable/i.test(a.name || '') && /\.exe$/i.test(a.name || ''));
  const installer = assets.find((a) => /\.exe$/i.test(a.name || '') && !/portable/i.test(a.name || ''));
  return portable || installer || null;
}

async function checkLatest({
  owner,
  repo,
  current,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15000,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (!owner || !repo) throw new Error('Не задан репозиторий для проверки обновлений');
  if (typeof fetchImpl !== 'function') throw new Error('fetch недоступен');
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'PSYCHIC-UpdateCheck', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
  const json = await res.json();
  const latest = json.tag_name || json.name || '';
  const cmp = compareVersions(current, latest);
  return {
    current,
    latest,
    updateAvailable: cmp < 0,
    url: json.html_url || `https://github.com/${owner}/${repo}/releases`,
    publishedAt: json.published_at || null,
    notes: json.body || '',
    asset: assetForPlatform(json.assets || [], platform, arch),
  };
}

module.exports = { checkLatest, compareVersions, normalize, assetForPlatform };
