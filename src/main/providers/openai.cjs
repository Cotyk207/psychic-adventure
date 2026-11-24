'use strict';

const { joinUrl, normalizeBaseUrl, safeJson, truncate } = require('../lib/util.cjs');
const { sseJson, httpError } = require('./sse.cjs');

function buildHeaders(provider) {
  const h = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (provider.apiKey) h.Authorization = `Bearer ${provider.apiKey}`;
  if (provider.id === 'openrouter') {
    h['HTTP-Referer'] = 'https://github.com/Cotyk207/psychic-adventure';
    h['X-Title'] = 'PSYCHIC';
  }
  if (provider.extraHeaders && typeof provider.extraHeaders === 'object') {
    Object.assign(h, provider.extraHeaders);
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

async function* streamOpenAI({ provider, model, messages, tools, temperature, maxTokens, signal, onUsage }) {
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
  let res;
  try {
    res = await request(provider, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    }, signal);
  } catch (err) {
    if (openaiTools && isToolsUnsupportedError(err)) {
      delete body.tools;
      delete body.tool_choice;
      res = await request(provider, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
      }, signal);
    } else {
      throw err;
    }
  }

  const toolAcc = new Map();
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
    if (delta.content) yield { type: 'text', text: delta.content };
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
  for (const acc of toolAcc.values()) {
    if (!acc.name) continue;
    yield { type: 'tool_call', id: acc.id, name: acc.name, arguments: safeJson(acc.args, {}) };
  }
  if (usage) yield { type: 'usage', usage };
}

async function chatOpenAINonStream({ provider, model, messages, tools, temperature, maxTokens, signal }) {
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
  let res;
  try {
    res = await request(provider, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify(body),
    }, signal);
  } catch (err) {
    if (openaiTools && isToolsUnsupportedError(err)) {
      delete body.tools;
      delete body.tool_choice;
      res = await request(provider, '/chat/completions', {
        method: 'POST',
        body: JSON.stringify(body),
      }, signal);
    } else {
      throw err;
    }
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message || {};
  const events = [];
  if (msg.reasoning_content) events.push({ type: 'reasoning', text: msg.reasoning_content });
  if (msg.content) events.push({ type: 'text', text: msg.content });
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
  const res = await request(provider, '/models', { method: 'GET' }, signal);
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
  return Array.from(new Set(models));
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
};
