'use strict';

const { joinUrl, safeJson, truncate } = require('../lib/util.cjs');
const { getModelMeta, getEffortSpec, filterFreeModels } = require('../lib/models.cjs');
const { sseJson, httpError } = require('./sse.cjs');

function buildHeaders(provider) {
  const h = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (provider.id === 'opencode') {
    h.Authorization = `Bearer ${provider.apiKey || 'public'}`;
    h['User-Agent'] = 'opencode/stable/1.0.0/opencode';
  } else if (provider.apiKey && provider.id !== 'ovhcloud' && provider.id !== 'vireonix') {
    h.Authorization = `Bearer ${provider.apiKey}`;
  }
  if (provider.id === 'openrouter') {
    h['HTTP-Referer'] = 'https://github.com/Cotyk207/psychic-adventure';
    h['X-Title'] = 'PSYCHIC';
  }
  if (provider.extraHeaders && typeof provider.extraHeaders === 'object') {
    Object.assign(h, provider.extraHeaders);
  }
  // OVHcloud's anonymous tier is free; authenticated requests can be billed.
  if (provider.id === 'ovhcloud' || provider.id === 'vireonix') {
    for (const name of Object.keys(h)) if (name.toLowerCase() === 'authorization') delete h[name];
  }
  return h;
}

function textOfParts(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p.type === 'image' ? `[изображение: ${p.name || 'attachment'}]` : p.text || ''))
      .join('\n');
  }
  return '';
}

function toOpenAIMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: m.content });
    } else if (m.role === 'user') {
      if (Array.isArray(m.content)) {
        out.push({
          role: 'user',
          content: m.content.map((p) =>
            p.type === 'image'
              ? { type: 'image_url', image_url: { url: p.dataUrl } }
              : { type: 'text', text: p.text || '' }
          ),
        });
      } else {
        out.push({ role: 'user', content: textOfParts(m.content) });
      }
    } else if (m.role === 'assistant') {
      const msg = { role: 'assistant', content: m.content || '' };
      if (m.toolCalls && m.toolCalls.length) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
        }));
      }
      out.push(msg);
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: truncate(textOfParts(m.content), 60000),
      });
    }
  }
  return out;
}

function toOpenAITools(tools) {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

async function request(provider, path, init, signal) {
  const url = joinUrl(provider.baseUrl, path);
  const res = await fetch(url, {
    ...init,
    headers: { ...buildHeaders(provider), ...(init.headers || {}) },
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw httpError(res.status, text, provider.name);
  }
  return res;
}

function isToolsUnsupportedError(err) {
  const status = Number(err?.status) || 0;
  if (status !== 400 && status !== 404 && status !== 422 && status !== 501) return false;
  return /tool|function.?call|functions?\s+are\s+not|does\s+not\s+support/i.test(String(err?.message || ''));
}

function isReasoningParamError(err) {
  const status = Number(err?.status) || 0;
  if (status !== 400 && status !== 422) return false;
  return /reasoning_effort|thinking|unrecognized|unknown\s+field|extra_forbidden|invalid_request|not\s+supported/i.test(String(err?.message || ''));
}

function applyReasoningEffort(body, providerId, model, reasoningEffort) {
  if (!reasoningEffort) return false;
  const spec = getEffortSpec(reasoningEffort);
  if (!spec) return false;
  const meta = getModelMeta(providerId, model);
  if (!meta.efforts.length) return false;
  if (reasoningEffort === 'none' && meta.toggle) {
    body.thinking = { type: 'disabled' };
    return true;
  }
  body.reasoning_effort = spec.openaiEffort;
  return true;
}

/**
 * Потоковый парсер тегов <think>...</think> (DeepSeek R1, QwQ, Qwen3 и др.),
 * корректно обрабатывающий разрыв открывающего/закрывающего тега между чанками.
 */
function createThinkParser() {
  let inThink = false;
  let buffer = '';

  const OPEN = '<think>';
  const CLOSE = '</think>';

  function feed(chunk) {
    buffer += chunk;
    const out = [];
    while (buffer.length > 0) {
      if (!inThink) {
        const idx = buffer.indexOf(OPEN);
        if (idx >= 0) {
          if (idx > 0) out.push({ type: 'text', text: buffer.slice(0, idx) });
          buffer = buffer.slice(idx + OPEN.length);
          inThink = true;
          continue;
        }
        // проверяем, не обрывается ли хвост на префиксе '<think>'
        let keep = 0;
        for (let len = Math.min(OPEN.length - 1, buffer.length); len > 0; len--) {
          if (OPEN.startsWith(buffer.slice(-len))) {
            keep = len;
            break;
          }
        }
        const emitLen = buffer.length - keep;
        if (emitLen > 0) {
          out.push({ type: 'text', text: buffer.slice(0, emitLen) });
          buffer = buffer.slice(emitLen);
        }
        break;
      } else {
        const idx = buffer.indexOf(CLOSE);
        if (idx >= 0) {
          if (idx > 0) out.push({ type: 'reasoning', text: buffer.slice(0, idx) });
          buffer = buffer.slice(idx + CLOSE.length).replace(/^\r?\n/, '');
          inThink = false;
          continue;
        }
        let keep = 0;
        for (let len = Math.min(CLOSE.length - 1, buffer.length); len > 0; len--) {
          if (CLOSE.startsWith(buffer.slice(-len))) {
            keep = len;
            break;
          }
        }
        const emitLen = buffer.length - keep;
        if (emitLen > 0) {
          out.push({ type: 'reasoning', text: buffer.slice(0, emitLen) });
          buffer = buffer.slice(emitLen);
        }
        break;
      }
    }
    return out;
  }

  function flush() {
    if (!buffer) return [];
    const item = { type: inThink ? 'reasoning' : 'text', text: buffer };
    buffer = '';
    return [item];
  }

  return { feed, flush };
}

function isClassicApiModelError(err) {
  const status = Number(err?.status) || 0;
  if (status === 404) return true;
  if (status === 400) {
    return /classic api|invalid model|model.*not found|unknown model/i.test(String(err?.message || ''));
  }
  return false;
}

async function sendCompletionWithFallback(provider, body, hasTools, hasReasoning, signal, retriedModel = false) {
  try {
    return await request(provider, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    }, signal);
  } catch (err) {
    if (hasReasoning && isReasoningParamError(err)) {
      delete body.reasoning_effort;
      delete body.thinking;
      return sendCompletionWithFallback(provider, body, hasTools, false, signal, retriedModel);
    }
    if (hasTools && isToolsUnsupportedError(err)) {
      delete body.tools;
      delete body.tool_choice;
      return sendCompletionWithFallback(provider, body, false, hasReasoning, signal, retriedModel);
    }
    if (
      !retriedModel
      && provider.id === 'pollinations'
      && !provider.apiKey
      && body.model !== 'openai'
      && isClassicApiModelError(err)
    ) {
      body.model = 'openai';
      return sendCompletionWithFallback(provider, body, hasTools, false, signal, true);
    }
    throw err;
  }
}

async function* streamOpenAI({ provider, model, messages, tools, temperature, maxTokens, reasoningEffort, signal, onUsage }) {
  const body = {
    model,
    messages: toOpenAIMessages(messages),
    stream: true,
    temperature: temperature ?? 0.7,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  const openaiTools = toOpenAITools(tools);
  if (openaiTools) {
    body.tools = openaiTools;
    body.tool_choice = 'auto';
  }
  const hasReasoning = applyReasoningEffort(body, provider.id, model, reasoningEffort);
  const res = await sendCompletionWithFallback(provider, body, Boolean(openaiTools), hasReasoning, signal);

  const toolAcc = new Map();
  const thinkParser = createThinkParser();
  let usage = null;
  for await (const json of sseJson(res.body)) {
    if (json.usage) {
      usage = { ...usage, ...json.usage };
      onUsage?.(usage);
    }
    const choice = json.choices?.[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (delta.reasoning_content) yield { type: 'reasoning', text: delta.reasoning_content };
    if (delta.reasoning) yield { type: 'reasoning', text: delta.reasoning };
    if (delta.content) {
      for (const ev of thinkParser.feed(delta.content)) {
        if (ev.text) yield ev;
      }
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const key = tc.index ?? 0;
        if (!toolAcc.has(key)) toolAcc.set(key, { id: tc.id || `call_${key}`, name: '', args: '' });
        const acc = toolAcc.get(key);
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
      }
    }
    if (choice.finish_reason === 'length') yield { type: 'notice', text: 'Достигнут лимит длины ответа.' };
  }
  for (const ev of thinkParser.flush()) {
    if (ev.text) yield ev;
  }
  for (const acc of toolAcc.values()) {
    if (!acc.name) continue;
    yield { type: 'tool_call', id: acc.id, name: acc.name, arguments: safeJson(acc.args, {}) };
  }
  if (usage) yield { type: 'usage', usage };
}

async function chatOpenAINonStream({ provider, model, messages, tools, temperature, maxTokens, reasoningEffort, signal }) {
  const body = {
    model,
    messages: toOpenAIMessages(messages),
    stream: false,
    temperature: temperature ?? 0.7,
  };
  if (maxTokens) body.max_tokens = maxTokens;
  const openaiTools = toOpenAITools(tools);
  if (openaiTools) {
    body.tools = openaiTools;
    body.tool_choice = 'auto';
  }
  const hasReasoning = applyReasoningEffort(body, provider.id, model, reasoningEffort);
  const res = await sendCompletionWithFallback(provider, body, Boolean(openaiTools), hasReasoning, signal);
  const json = await res.json();
  const msg = json.choices?.[0]?.message || {};
  const events = [];
  if (msg.reasoning_content) events.push({ type: 'reasoning', text: msg.reasoning_content });
  if (msg.reasoning) events.push({ type: 'reasoning', text: msg.reasoning });
  if (msg.content) {
    const thinkParser = createThinkParser();
    for (const ev of [...thinkParser.feed(msg.content), ...thinkParser.flush()]) {
      if (ev.text) events.push(ev);
    }
  }
  for (const tc of msg.tool_calls || []) {
    events.push({
      type: 'tool_call',
      id: tc.id,
      name: tc.function?.name,
      arguments: safeJson(tc.function?.arguments, {}),
    });
  }
  if (json.usage) events.push({ type: 'usage', usage: json.usage });
  return events;
}

async function listModels(provider, signal) {
  if (!provider.baseUrl) throw new Error('Не указан Base URL');
  let res;
  try {
    res = await request(provider, '/models', { method: 'GET' }, signal);
  } catch (err) {
    if (provider.id === 'opencode') {
      const alt = await fetch('https://opencode.ai/inference/v1/models', {
        headers: buildHeaders(provider),
        signal,
      });
      if (!alt.ok) throw err;
      res = alt;
    } else if (provider.id === 'pollinations') {
      const alt = await fetch('https://gen.pollinations.ai/text/models', { signal }).catch(() => null);
      if (alt?.ok) {
        const catalog = await alt.json().catch(() => []);
        if (Array.isArray(catalog) && catalog.length) {
          const classicFree = ['openai', 'openai-fast', 'openai-large', 'qwen-coder', 'mistral', 'gemini', 'gemini-fast'];
          if (!provider.apiKey) return classicFree;
          const ids = catalog
            .filter((m) => m && m.paid_only !== true)
            .map((m) => m.name || m.id)
            .filter(Boolean);
          return filterFreeModels(provider.id, Array.from(new Set([...classicFree, ...ids])));
        }
      }
      if (Array.isArray(provider.models) && provider.models.length) {
        return filterFreeModels(provider.id, provider.models);
      }
      throw err;
    } else {
      throw err;
    }
  }
  const json = await res.json();
  const list = Array.isArray(json)
    ? json
    : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
        ? json.models
        : [];
  const models = [];
  for (const item of list) {
    const id = item.id || item.name || item.model;
    if (typeof id === 'string' && id) models.push(id);
  }
  return filterFreeModels(provider.id, Array.from(new Set(models)));
}

async function listAnthropicModels(provider, signal) {
  const headers = buildHeaders(provider);
  const res = await fetch(joinUrl(provider.baseUrl, '/v1/models'), {
    headers: { ...headers, 'anthropic-version': '2023-06-01' },
    signal,
  });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), provider.name);
  const json = await res.json();
  return (json.data || []).map((m) => m.id).filter(Boolean);
}

module.exports = {
  streamOpenAI,
  chatOpenAINonStream,
  listModels,
  listAnthropicModels,
  buildHeaders,
  request,
  toOpenAIMessages,
  createThinkParser,
};
