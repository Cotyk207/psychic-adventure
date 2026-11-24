'use strict';

const { truncate, decodeEntities, escapeHtml } = require('../lib/util.cjs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 PSYCHIC/1.0';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrapDdg(url) {
  if (!url) return url;
  if (url.startsWith('//')) url = `https:${url}`;
  try {
    const u = new URL(url, 'https://duckduckgo.com');
    if (u.pathname.includes('/l/')) {
      const target = u.searchParams.get('uddg');
      if (target) return decodeURIComponent(target);
    }
    return u.toString();
  } catch {
    return url;
  }
}

async function ddgHtml(query, maxResults) {
  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml',
    },
    body: new URLSearchParams({ q: query, kl: 'ru-ru', s: '0' }).toString(),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  const html = await res.text();

  const results = [];
  const anchorRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchorRe.exec(html)) && results.length < maxResults) {
    const url = unwrapDdg(decodeEntities(m[1]));
    const title = stripTags(m[2]);
    const after = html.slice(m.index, m.index + 3000);
    const snip = after.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    results.push({
      title: title || url,
      url,
      snippet: snip ? stripTags(snip[1]) : '',
    });
  }
  return results;
}

async function ddgLite(query, maxResults) {
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`DDG Lite HTTP ${res.status}`);
  const html = await res.text();
  const results = [];
  const linkRe = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) && results.length < maxResults) {
    results.push({
      title: stripTags(m[2]),
      url: unwrapDdg(decodeEntities(m[1])),
      snippet: '',
    });
  }
  return results;
}

async function braveSearch(query, maxResults, key) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': key,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
  const json = await res.json();
  return (json.web?.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.description || '',
  }));
}

async function tavilySearch(query, maxResults, key) {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: maxResults,
      include_answer: false,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const json = await res.json();
  return (json.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
  }));
}

async function searxSearch(query, maxResults, baseUrl) {
  const url = `${baseUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json&language=ru-RU`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const json = await res.json();
  return (json.results || []).slice(0, maxResults).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content || '',
  }));
}

async function wikipediaSearch(query, maxResults) {
  const url = `https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults}&utf8=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = await res.json();
  return (json.query?.search || []).map((r) => ({
    title: r.title,
    url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    snippet: stripTags(r.snippet || ''),
  }));
}

async function searchWeb(query, { maxResults = 8, engine = 'auto', braveKey = '', tavilyKey = '', searxUrl = '' } = {}) {
  const limit = Math.min(15, Math.max(1, Number(maxResults) || 8));
  const attempts = [];
  if (engine === 'brave' || (engine === 'auto' && braveKey)) attempts.push(['brave', () => braveSearch(query, limit, braveKey)]);
  if (engine === 'tavily' || (engine === 'auto' && tavilyKey)) attempts.push(['tavily', () => tavilySearch(query, limit, tavilyKey)]);
  if (engine === 'searx' || (engine === 'auto' && searxUrl)) attempts.push(['searx', () => searxSearch(query, limit, searxUrl)]);
  if (engine === 'auto' || engine === 'duckduckgo') {
    attempts.push(['duckduckgo', () => ddgHtml(query, limit)]);
    attempts.push(['duckduckgo-lite', () => ddgLite(query, limit)]);
  }
  attempts.push(['wikipedia', () => wikipediaSearch(query, limit)]);

  let lastError = null;
  for (const [name, fn] of attempts) {
    try {
      const results = await fn();
      if (results && results.length) return { engine: name, results };
    } catch (err) {
      lastError = err;
    }
  }
  return {
    engine: 'none',
    results: [],
    error: lastError?.message || 'Поиск не дал результатов',
  };
}

function htmlToText(html, baseUrl = '') {
  let title = '';
  let description = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) title = decodeEntities(stripTags(titleMatch[1]));
  const descMatch = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
  if (descMatch) description = decodeEntities(descMatch[1]);

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
  body = decodeEntities(body).trim();
  const header = [
    title ? `# ${title}` : '',
    description ? description : '',
    baseUrl ? `Источник: ${baseUrl}` : '',
  ].filter(Boolean).join('\n');
  return [header, body].filter(Boolean).join('\n\n');
}

async function fetchUrl(url, { maxLength = 30000 } = {}) {
  if (!/^https?:\/\//i.test(url)) throw new Error('URL должен начинаться с http:// или https://');
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const type = (res.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 20 * 1024 * 1024) throw new Error(`Файл слишком большой: ${formatBytes(buf.length)}`);

  if (type.includes('image/')) {
    const dataUrl = `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
    return {
      text: `Изображение ${type.split(';')[0]}, ${formatBytes(buf.length)}`,
      images: [{ name: 'downloaded', mimeType: type.split(';')[0], data: buf.toString('base64'), dataUrl }],
    };
  }
  if (type.includes('application/json')) {
    const text = truncate(buf.toString('utf8'), maxLength);
    return { text: `\`\`\`json\n${text}\n\`\`\``, data: { type } };
  }
  if (type.startsWith('text/') || type.includes('javascript') || type.includes('xml')) {
    const text = truncate(buf.toString('utf8'), maxLength);
    return { text, data: { type } };
  }
  const text = truncate(htmlToText(buf.toString('utf8'), url), maxLength);
  return { text, data: { type } };
}

module.exports = {
  searchWeb, fetchUrl, htmlToText, stripTags, unwrapDdg, UA,
};
