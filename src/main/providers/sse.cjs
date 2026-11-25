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

function extractReadableBody(bodyText) {
  const raw = String(bodyText || '').trim();
  if (!raw) return { detail: '', errorType: '' };
  const parsed = safeJson(raw, null);
  if (parsed && typeof parsed === 'object') {
    const errObj = parsed.error && typeof parsed.error === 'object' ? parsed.error : null;
    const errorType = String(errObj?.type || errObj?.code || parsed.type || '');
    const msg =
      errObj?.message
      || (typeof parsed.error === 'string' ? parsed.error : '')
      || parsed.message
      || parsed.detail
      || '';
    return { detail: String(msg || '').trim(), errorType };
  }
  return { detail: raw.slice(0, 320), errorType: '' };
}

function httpError(status, bodyText, providerName) {
  const name = providerName || 'API';
  const lowerName = name.toLowerCase();
  const { detail, errorType } = extractReadableBody(bodyText);
  const combined = `${errorType} ${detail}`.toLowerCase();

  let hint = '';
  if (/freeusagelimiterror/i.test(combined)) {
    hint = 'Исчерпан бесплатный лимит публичного пула OpenCode. Переключись на Pollinations.AI или укажи бесплатный ключ (Groq / Gemini / OpenRouter).';
  } else if (status === 402 && lowerName.includes('hugging')) {
    hint = 'Исчерпаны бесплатные месячные кредиты Hugging Face Inference. Переключись на Pollinations.AI, Groq или Google Gemini.';
  } else if (status === 404 && lowerName.includes('ollama')) {
    hint = 'Модель не скачана в Ollama. Выполни «ollama pull <модель>» в терминале или нажми «Найти локальные модели» в Настройках.';
  } else if (status === 404 && /classic api/i.test(combined)) {
    hint = 'Эта модель отключена в бесплатном Classic API Pollinations — выбери модель openai, openai-fast, qwen-coder, mistral или gemini.';
  } else if (status === 401 || status === 403) {
    hint = 'Неверный или просроченный API-ключ.';
  } else if (status === 429) {
    hint = 'Превышен лимит запросов (rate limit). Подожди немного или смени бесплатный провайдер.';
  } else if (status === 402) {
    hint = 'Исчерпан бесплатный лимит или баланс у этого провайдера — выбери другой бесплатный провайдер.';
  } else if (status === 404) {
    hint = 'Модель или эндпоинт не найден. Проверь название модели и Base URL.';
  } else if (status >= 500) {
    hint = 'Сервер провайдера временно перегружен. Попробуй позже или выбери другую модель.';
  }

  const tail = detail && !hint.includes(detail) ? `\n${detail.slice(0, 300)}` : '';
  const err = new Error(`${name} ${status}${hint ? ` — ${hint}` : ''}${tail}`);
  err.status = status;
  err.code = errorType || undefined;
  err.provider = providerName;
  return err;
}

module.exports = { sseJson, httpError, extractReadableBody };
