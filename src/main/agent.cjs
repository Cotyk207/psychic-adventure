'use strict';

const fs = require('fs');
const path = require('path');
const { chat: providerChat, supportsVision } = require('./providers/index.cjs');
const { toolDefinitions, executeTool } = require('./tools/index.cjs');
const { buildSystemPrompt } = require('./prompts.cjs');
const { uid, truncate } = require('./lib/util.cjs');
const { getModelMeta, resolveEffortForModel } = require('./lib/models.cjs');
const { get } = require('./lib/paths.cjs');
const { mimeOf } = require('./tools/files.cjs');

function deriveTitle(text) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^[-*>#\s]+/, '')
    .trim();
  if (!clean) return 'Новый диалог';
  const firstSentence = clean.split(/[.!?]\s/)[0];
  return truncate(firstSentence, 56, '…');
}

class Agent {
  constructor({ store, chats, skills, memory, interactions, services, send }) {
    this.store = store;
    this.chats = chats;
    this.skills = skills;
    this.memory = memory;
    this.interactions = interactions;
    this.services = services;
    this.notify = send;
    this.active = new Map();
  }

  emit(chatId, type, payload = {}) {
    try {
      this.notify('agent:event', { chatId, type, ...payload });
    } catch (err) {
      console.error('emit failed', err);
    }
  }

  resolveProvider(id) {
    const providers = this.store.get('providers') || [];
    return providers.find((p) => p.id === id) || providers.find((p) => p.id === this.store.get('chat.defaultProvider')) || providers[0];
  }

  findFallbackNoKeyProvider(primaryProvider) {
    if (!primaryProvider || primaryProvider.apiKey) return null;
    if (primaryProvider.id !== 'opencode' && primaryProvider.id !== 'pollinations') return null;
    const altId = primaryProvider.id === 'opencode' ? 'pollinations' : 'opencode';
    const providers = this.store.get('providers') || [];
    const alt = providers.find((p) => p.id === altId && p.enabled !== false && p.baseUrl);
    return alt || null;
  }

  isActive(chatId) {
    return this.active.has(chatId);
  }

  stop(chatId) {
    const controller = this.active.get(chatId);
    if (controller) {
      controller.abort();
      this.active.delete(chatId);
      return true;
    }
    return false;
  }

  stopAll() {
    for (const c of this.active.values()) c.abort();
    this.active.clear();
  }

  prepareAttachments(attachments) {
    const prepared = [];
    for (const att of attachments || []) {
      const p = att.path;
      if (!p || !fs.existsSync(p)) continue;
      const ext = path.extname(p).toLowerCase();
      const mime = mimeOf(p);
      const size = fs.statSync(p).size;
      const item = {
        name: att.name || path.basename(p),
        path: p,
        type: mime.startsWith('image/') ? 'image' : 'file',
        mimeType: mime,
        size,
      };
      try {
        if (item.type === 'image' && size < 4 * 1024 * 1024) {
          const data = fs.readFileSync(p).toString('base64');
          item.data = data;
          item.dataUrl = `data:${mime};base64,${data}`;
        } else if (size < 200 * 1024) {
          const buf = fs.readFileSync(p);
          if (!buf.includes(0)) item.content = buf.toString('utf8');
        }
      } catch {}
      prepared.push(item);
    }
    return prepared;
  }

  buildHistory(chat, limit) {
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const picked = messages.filter((m) => !m.error).slice(-Math.max(2, limit));
    const out = [];
    for (const m of picked) {
      if (m.role === 'user') {
        const parts = [];
        if (m.content) parts.push({ type: 'text', text: String(m.content) });
        for (const a of m.attachments || []) {
          if (a.type === 'image' && a.data) {
            parts.push({ type: 'image', mimeType: a.mimeType || 'image/png', data: a.data, dataUrl: a.dataUrl });
          } else if (a.content) {
            parts.push({ type: 'text', text: `--- Файл: ${a.name} ---\n${a.content}` });
          } else if (a.path) {
            parts.push({ type: 'text', text: `[Приложен файл: ${a.path}]` });
          }
        }
        if (!parts.length) continue;
        out.push({
          role: 'user',
          content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts,
        });
      } else if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length) {
          out.push({
            role: 'assistant',
            content: m.content || '',
            toolCalls: m.toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: tc.args || {} })),
          });
          for (const tc of m.toolCalls) {
            const text = tc.resultText || (tc.result != null
              ? (typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result))
              : '');
            out.push({ role: 'tool', toolCallId: tc.id, name: tc.name, content: truncate(text, 60000) });
          }
        } else if (m.content) {
          out.push({ role: 'assistant', content: m.content });
        }
      }
    }
    while (out.length && out[0].role === 'tool') out.shift();
    return out;
  }

  async send({ chatId, text, attachments = [], regenerate = false, providerId, model: modelOverride, reasoningEffort }) {
    const chat = this.chats.get(chatId);
    if (!chat) throw new Error('Диалог не найден');
    if (this.active.has(chatId)) throw new Error('Этот диалог уже занят — останови генерацию.');

    const config = this.store.get();
    const provider = this.resolveProvider(providerId || chat.provider);
    if (!provider) throw new Error('Не настроен ни один провайдер. Добавь модель в настройках.');
    const model = modelOverride || chat.model || config.chat.defaultModel;
    if (!model) throw new Error('Не выбрана модель');
    const modelMeta = getModelMeta(provider.id, model);
    const resolvedEffort = resolveEffortForModel(modelMeta, reasoningEffort || config.chat.reasoningEffort || 'medium');

    const controller = new AbortController();
    this.active.set(chatId, controller);
    const signal = controller.signal;

    try {
      if (regenerate) {
        const lastUserIndex = chat.messages.map((m) => m.role).lastIndexOf('user');
        if (lastUserIndex >= 0) {
          chat.messages = chat.messages.slice(0, lastUserIndex + 1);
          chat.messages = chat.messages.filter((m) => !m.error);
        }
      } else {
        const prepared = this.prepareAttachments(attachments);
        const userMessage = {
          id: uid(10),
          role: 'user',
          content: String(text || ''),
          createdAt: Date.now(),
          attachments: prepared,
        };
        chat.messages.push(userMessage);
        if (config.chat.autoTitle && chat.messages.filter((m) => m.role === 'user').length === 1) {
          chat.title = deriveTitle(text);
        }
        chat.provider = provider.id;
        chat.model = model;
        this.chats.save(chat);
        this.emit(chatId, 'user_saved', { message: userMessage, title: chat.title });
      }

      const memoryEnabled = this.store.get('memory.enabled') !== false;
      const memoryHits = memoryEnabled ? this.memory.search(text || '', 5) : [];
      const systemPrompt = buildSystemPrompt({
        config,
        skills: this.skills,
        memories: memoryHits,
        tools: toolDefinitions(),
        provider,
        model,
        permissionMode: this.store.get('permissions.mode'),
      });

      const history = this.buildHistory(chat, config.chat.contextMessages);
      const messages = [{ role: 'system', content: systemPrompt }, ...history];

      let activeProvider = provider;
      let activeModel = model;
      let activeEffort = resolvedEffort;
      let didProviderFallback = false;

      const messageId = uid(10);
      this.emit(chatId, 'start', {
        messageId,
        provider: activeProvider.id,
        providerName: activeProvider.name,
        model: activeModel,
        reasoningEffort: activeEffort,
      });

      const tools = toolDefinitions();
      const maxSteps = Math.max(1, Math.min(20, Number(config.chat.maxSteps) || 12));
      let finalContent = '';
      let finalReasoning = '';
      const allToolCalls = [];
      let usage = null;
      let aborted = false;

      for (let step = 0; step < maxSteps; step++) {
        let text = '';
        let reasoning = '';
        const calls = [];

        try {
          for await (const ev of providerChat(activeProvider, activeModel, messages, {
            tools,
            temperature: config.chat.temperature,
            maxTokens: config.chat.maxTokens,
            reasoningEffort: activeEffort,
            signal,
            stream: config.chat.stream,
            onUsage: (u) => { usage = { ...usage, ...u }; },
          })) {
            if (signal.aborted) throw Object.assign(new Error('aborted'), { code: 'ABORTED' });
            if (ev.type === 'text') {
              text += ev.text;
              this.emit(chatId, 'token', { messageId, delta: ev.text });
            } else if (ev.type === 'reasoning') {
              reasoning += ev.text;
              this.emit(chatId, 'reasoning', { messageId, delta: ev.text });
            } else if (ev.type === 'tool_call') {
              calls.push(ev);
            }
          }
        } catch (err) {
          if (signal.aborted || err.code === 'ABORTED' || err.name === 'AbortError') {
            aborted = true;
            finalContent += text;
            finalReasoning += reasoning;
            break;
          }
          // Автоматический резервный переход между бесплатными безключевыми пулами (opencode <-> pollinations)
          // при 429 FreeUsageLimitError / 402 / 403 / 404 / 5xx до начала генерации текста
          const altProvider = step === 0 && !didProviderFallback && !text && !reasoning && !calls.length
            ? this.findFallbackNoKeyProvider(activeProvider)
            : null;
          if (altProvider) {
            didProviderFallback = true;
            activeProvider = altProvider;
            activeModel = altProvider.defaultModel || altProvider.models?.[0] || 'openai';
            activeEffort = resolveEffortForModel(
              getModelMeta(activeProvider.id, activeModel),
              reasoningEffort || config.chat.reasoningEffort || 'medium'
            );
            this.emit(chatId, 'start', {
              messageId,
              provider: activeProvider.id,
              providerName: activeProvider.name,
              model: activeModel,
              reasoningEffort: activeEffort,
            });
            step -= 1;
            continue;
          }
          throw err;
        }

        if (!calls.length) {
          finalContent += text;
          finalReasoning += reasoning;
          break;
        }

        finalContent += text;
        finalReasoning += reasoning;

        messages.push({
          role: 'assistant',
          content: text,
          toolCalls: calls.map((c) => ({ id: c.id, name: c.name, args: c.arguments })),
        });

        for (const call of calls) {
          const toolCall = {
            id: call.id,
            name: call.name,
            args: call.arguments,
            status: 'running',
            startedAt: Date.now(),
          };
          allToolCalls.push(toolCall);
          this.emit(chatId, 'tool', { messageId, call: { ...toolCall } });

          const ctx = {
            chatId,
            provider: activeProvider,
            model: activeModel,
            store: this.store,
            services: this.services,
            interactions: this.interactions,
            mainWindow: this.services?.mainWindow,
          };
          const result = await executeTool(call.name, call.arguments, ctx);

          toolCall.status = result.ok ? 'done' : 'error';
          toolCall.ok = result.ok;
          toolCall.duration = result.duration;
          toolCall.result = result.ok ? result.text : result.error;
          toolCall.resultText = result.text || result.error;
          toolCall.error = result.ok ? undefined : result.error;
          toolCall.denied = result.denied;
          toolCall.data = result.data;
          toolCall.images = result.images;

          this.emit(chatId, 'tool', { messageId, call: { ...toolCall, result: truncate(toolCall.result, 20000) } });

          messages.push({
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: truncate(result.text || result.error || 'OK', 60000),
          });

          if (result.ok && result.images && result.images.length && supportsVision(activeModel)) {
            const parts = [
              { type: 'text', text: `Результат инструмента ${call.name} — прикреплённые изображения:` },
              ...result.images.slice(0, 4).map((img) => ({
                type: 'image',
                mimeType: img.mimeType || 'image/png',
                data: img.data,
                dataUrl: img.dataUrl,
                name: img.name,
              })),
            ];
            messages.push({ role: 'user', content: parts });
          }
        }
      }

      // Если упёрлись в лимит шагов — просим завершить без инструментов
      if (allToolCalls.length && !aborted && finalContent.trim().length < 20) {
        messages.push({
          role: 'user',
          content: 'Лимит шагов инструментов исчерпан. Ответь пользователю текстом: что сделано и что осталось.',
        });
        try {
          for await (const ev of providerChat(activeProvider, activeModel, messages, {
            temperature: config.chat.temperature,
            maxTokens: config.chat.maxTokens,
            signal,
            stream: config.chat.stream,
          })) {
            if (ev.type === 'text') {
              finalContent += ev.text;
              this.emit(chatId, 'token', { messageId, delta: ev.text });
            }
          }
        } catch (err) {
          if (signal.aborted || err.code === 'ABORTED') aborted = true;
          else throw err;
        }
      }

      const assistantMessage = {
        id: messageId,
        role: 'assistant',
        content: finalContent,
        reasoning: finalReasoning,
        reasoningEffort: activeEffort,
        createdAt: Date.now(),
        model: activeModel,
        provider: activeProvider.id,
        toolCalls: allToolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          args: tc.args,
          result: tc.resultText,
          ok: tc.ok,
          duration: tc.duration,
          error: tc.error,
          denied: tc.denied,
        })),
        usage,
        aborted,
      };

      const lastUserIndex = chat.messages.map((m) => m.role).lastIndexOf('user');
      const existing = chat.messages.find((m) => m.id === messageId);
      if (existing) Object.assign(existing, assistantMessage);
      else chat.messages.push(assistantMessage);
      chat.updatedAt = Date.now();
      this.chats.save(chat);

      this.emit(chatId, 'done', {
        messageId,
        content: finalContent,
        reasoning: finalReasoning,
        reasoningEffort: activeEffort,
        toolCalls: assistantMessage.toolCalls,
        usage,
        aborted,
        title: chat.title,
      });
      return assistantMessage;
    } catch (err) {
      const message = err.message || String(err);
      this.emit(chatId, 'error', { message, code: err.code, status: err.status });
      const chatNow = this.chats.get(chatId);
      if (chatNow) {
        chatNow.updatedAt = Date.now();
        this.chats.save(chatNow);
      }
      return { error: message };
    } finally {
      this.active.delete(chatId);
    }
  }
}

module.exports = { Agent, deriveTitle };
