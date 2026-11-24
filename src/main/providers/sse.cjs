'use strict';

const { safeJson } = require('../lib/util.cjs');

async function* sseJson(body) {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        const json = safeJson(data, null);
        if (json) yield json;
      }
    }
    const rest = buffer.trim();
    if (rest.startsWith('data:')) {
      const data = rest.slice(5).trim();
      if (data && data !== '[DONE]') {
        const json = safeJson(data, null);
        if (json) yield json;
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

function httpError(status, bodyText, providerName) {
  let hint = '';
  if (status === 401 || status === 403) hint = 'Неверный или просроченный API-ключ.';
  else if (status === 429) hint = 'Превышен лимит запросов (rate limit). Подожди или смени модель.';
  else if (status === 402) hint = 'Недостаточно средств на балансе.';
  else if (status === 404) hint = 'Модель или эндпоинт не найден. Проверь название модели и Base URL.';
  else if (status >= 500) hint = 'Сервер провайдера недоступен. Попробуй позже.';
  const err = new Error(`${providerName || 'API'} ${status}${hint ? ` — ${hint}` : ''}${bodyText ? `\n${String(bodyText).slice(0, 400)}` : ''}`);
  err.status = status;
  err.provider = providerName;
  return err;
}

module.exports = { sseJson, httpError };
