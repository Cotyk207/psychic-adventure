'use strict';

const { normalizeBaseUrl, safeJson, uid } = require('../lib/util.cjs');
const { sseJson, httpError } = require('./sse.cjs');
const { buildHeaders } = require('./openai.cjs');

function toGoogleSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'OBJECT', properties: {} };
  const map = {
    object: 'OBJECT', string: 'STRING', number: 'NUMBER',
    integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY',
  };
  const out = {};
  if (schema.type) out.type = map[schema.type] || String(schema.type).toUpperCase();
  else out.type = 'OBJECT';
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (Array.isArray(schema.required)) out.required = schema.required;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = toGoogleSchema(v);
    }
  }
  if (schema.items) out.items = toGoogleSchema(schema.items);
  return out;
}

function toGoogleContents(messages) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const text = typeof m.content === 'string'
        ? m.content
        : (m.content || []).map((p) => (p.type === 'image' ? `[изображение]` : p.text || '')).join('\n');
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: m.name, response: { result: text } } }],
      });
    } else if (m.role === 'assistant') {
      const parts = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls || []) {
        parts.push({ functionCall: { name: tc.name, args: tc.args || {} } });
      }
      if (parts.length) contents.push({ role: 'model', parts });
    } else {
      const parts = [];
      if (typeof m.content === 'string') {
        parts.push({ text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if (p.type === 'image') {
            parts.push({
              inlineData: { mimeType: p.mimeType || 'image/png', data: p.data },
            });
          } else {
            parts.push({ text: p.text || '' });
          }
        }
      }
      if (parts.length) contents.push({ role: 'user', parts });
    }
  }
  return contents;
}

async function* streamGoogle({ provider, model, messages, tools, temperature, maxTokens, signal, onUsage }) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const body = {
    contents: toGoogleContents(messages),
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: maxTokens || 4096,
      topP: 0.95,
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (tools?.length) {
    body.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: toGoogleSchema(t.parameters),
      })),
    }];
  }

  const url = `${normalizeBaseUrl(provider.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
  const headers = { 'Content-Type': 'application/json', ...buildHeaders(provider) };
  delete headers.Authorization;
  if (provider.apiKey) headers['x-goog-api-key'] = provider.apiKey;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), provider.name);

  let usage = null;
  for await (const json of sseJson(res.body)) {
    if (json.promptFeedback?.blockReason) {
      throw new Error(`Gemini заблокировал запрос: ${json.promptFeedback.blockReason}`);
    }
    if (json.usageMetadata) {
      usage = { ...usage, ...json.usageMetadata };
      onUsage?.(usage);
    }
    const cand = json.candidates?.[0];
    if (!cand) continue;
    for (const part of cand.content?.parts || []) {
      if (part.thought && part.text) {
        yield { type: 'reasoning', text: part.text };
      } else if (part.text) {
        yield { type: 'text', text: part.text };
      }
      if (part.functionCall) {
        yield {
          type: 'tool_call',
          id: `call_${uid(10)}`,
          name: part.functionCall.name,
          arguments: safeJson(JSON.stringify(part.functionCall.args || {}), {}),
        };
      }
    }
  }
  if (usage) yield { type: 'usage', usage };
}

async function chatGoogleNonStream(opts) {
  const events = [];
  for await (const ev of streamGoogle({ ...opts, signal: opts.signal })) events.push(ev);
  return events;
}

module.exports = { streamGoogle, chatGoogleNonStream, toGoogleContents, toGoogleSchema };
