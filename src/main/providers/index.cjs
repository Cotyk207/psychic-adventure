'use strict';

const { normalizeBaseUrl, withTimeout } = require('../lib/util');
const openai = require('./openai');
const anthropic = require('./anthropic');
const google = require('./google');

const VISION_PATTERNS = [
  /gpt-4o/i, /gpt-4\.1/i, /gpt-4-turbo/i, /gpt-4-vision/i, /o4/i,
  /claude-3/i, /claude-4/i, /gemini/i, /llava/i, /qwen.*vl/i, /vl/i,
  /pixtral/i, /grok.*vision/i, /vision/i, /gemma-3/i, /phi-4-multimodal/i,
  /molmo/i, /cogvlm/i, /internvl/i, /minicpm-v/i,
];

function supportsVision(model) {
  if (!model) return false;
  return VISION_PATTERNS.some((re) => re.test(String(model)));
}

function adapterFor(provider) {
  const type = String(provider.type || 'openai').toLowerCase();
  if (type === 'anthropic' || type === 'claude') return anthropic;
  if (type === 'google' || type === 'gemini') return google;
  return openai;
}

async function* chat(provider, model, messages, options = {}) {
  const { signal, onUsage } = options;
  const stream = options.stream !== false;
  const adapter = adapterFor(provider);
  const base = {
    provider,
    model,
    messages,
    tools: options.tools,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    signal,
    onUsage,
  };
  if (stream && adapter.streamOpenAI) {
    yield* openai.streamOpenAI(base);
    return;
  }
  if (stream && adapter.streamAnthropic) {
    yield* anthropic.streamAnthropic(base);
    return;
  }
  if (stream && adapter.streamGoogle) {
    yield* google.streamGoogle(base);
    return;
  }
  const events = adapter === anthropic
    ? await anthropic.chatAnthropicNonStream(base)
    : adapter === google
      ? await google.chatGoogleNonStream(base)
      : await openai.chatOpenAINonStream(base);
  for (const ev of events) yield ev;
}

async function listModels(provider, signal) {
  const type = String(provider.type || 'openai').toLowerCase();
  if (!provider.baseUrl) throw new Error('Не указан Base URL провайдера');
  if (type === 'anthropic' || type === 'claude') {
    return openai.listAnthropicModels(provider, signal);
  }
  if (type === 'google' || type === 'gemini') {
    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey) headers['x-goog-api-key'] = provider.apiKey;
    const res = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/models`, { headers, signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    return (json.models || [])
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }
  return openai.listModels(provider, signal);
}

async function testProvider(provider) {
  const started = Date.now();
  const models = await withTimeout(listModels(provider), 20000, 'проверка провайдера');
  return {
    ok: true,
    latency: Date.now() - started,
    models: models.slice(0, 500),
  };
}

async function detectLocal() {
  const found = [];
  const candidates = [
    { id: 'ollama', url: 'http://127.0.0.1:11434/api/tags' },
    { id: 'lmstudio', url: 'http://127.0.0.1:1234/v1/models' },
  ];
  for (const c of candidates) {
    try {
      const res = await fetch(c.url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) continue;
      const json = await res.json();
      const models = c.id === 'ollama'
        ? (json.models || []).map((m) => m.name)
        : (json.data || []).map((m) => m.id);
      found.push({ id: c.id, online: true, models });
    } catch {
      found.push({ id: c.id, online: false, models: [] });
    }
  }
  return found;
}

module.exports = { chat, listModels, testProvider, detectLocal, supportsVision };
