'use strict';

const { joinUrl, safeJson, truncate, uid } = require('../lib/util.cjs');
const { sseJson, httpError } = require('./sse.cjs');
const { buildHeaders } = require('./openai.cjs');

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p.type === 'image' ? `[изображение: ${p.name || 'attachment'}]` : p.text || ''))
      .join('\n');
  }
  return '';
}

function toAnthropic(messages) {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');

  const out = [];
  const push = (role, blocks) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };

  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'assistant') {
      const blocks = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const tc of m.toolCalls || []) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.args || {},
        });
      }
      push('assistant', blocks.length ? blocks : [{ type: 'text', text: '' }]);
    } else if (m.role === 'tool') {
      push('user', [{
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: truncate(textOf(m.content), 60000),
      }]);
    } else {
      const blocks = [];
      if (typeof m.content === 'string') {
        blocks.push({ type: 'text', text: m.content });
      } else if (Array.isArray(m.content)) {
        for (const p of m.content) {
          if (p.type === 'image') {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: p.mimeType || 'image/png',
                data: p.data,
              },
            });
          } else {
            blocks.push({ type: 'text', text: p.text || '' });
          }
        }
      }
      push('user', blocks.length ? blocks : [{ type: 'text', text: '' }]);
    }
  }
  return { system, messages: out };
}

async function* streamAnthropic({ provider, model, messages, tools, temperature, maxTokens, signal, onUsage }) {
  const { system, messages: converted } = toAnthropic(messages);
  const body = {
    model,
    max_tokens: maxTokens || 4096,
    messages: converted,
    stream: true,
    temperature: temperature ?? 0.7,
  };
  if (system) body.system = system;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  const res = await fetch(joinUrl(provider.baseUrl, '/v1/messages'), {
    method: 'POST',
    headers: {
      ...buildHeaders(provider),
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw httpError(res.status, await res.text().catch(() => ''), provider.name);

  let current = null;
  let usage = null;
  for await (const json of sseJson(res.body)) {
    if (json.type === 'message_start' && json.message?.usage) {
      usage = { ...usage, ...json.message.usage };
      onUsage?.(usage);
    } else if (json.type === 'message_delta' && json.usage) {
      usage = { ...usage, ...json.usage };
      onUsage?.(usage);
    } else if (json.type === 'content_block_start') {
      if (json.content_block?.type === 'tool_use') {
        current = {
          id: json.content_block.id || `toolu_${uid(8)}`,
          name: json.content_block.name,
          args: '',
        };
      }
    } else if (json.type === 'content_block_delta') {
      const d = json.delta || {};
      if (d.type === 'text_delta' && d.text) yield { type: 'text', text: d.text };
      else if (d.type === 'thinking_delta' && d.thinking) yield { type: 'reasoning', text: d.thinking };
      else if (d.type === 'input_json_delta' && current) current.args += d.partial_json || '';
    } else if (json.type === 'content_block_stop') {
      if (current) {
        yield { type: 'tool_call', id: current.id, name: current.name, arguments: safeJson(current.args, {}) };
        current = null;
      }
    } else if (json.type === 'error') {
      throw new Error(json.error?.message || 'Anthropic API error');
    }
  }
  if (current) {
    yield { type: 'tool_call', id: current.id, name: current.name, arguments: safeJson(current.args, {}) };
  }
  if (usage) yield { type: 'usage', usage };
}

async function chatAnthropicNonStream(opts) {
  const events = [];
  for await (const ev of streamAnthropic({ ...opts, signal: opts.signal })) events.push(ev);
  return events;
}

module.exports = { streamAnthropic, chatAnthropicNonStream, toAnthropic };
