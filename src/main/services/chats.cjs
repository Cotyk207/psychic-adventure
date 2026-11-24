'use strict';

const fs = require('fs');
const path = require('path');
const { uid, truncate } = require('../lib/util.cjs');

function fileFor(dir, id) {
  return path.join(dir, `${id}.json`);
}

class ChatsService {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  list() {
    let files = [];
    try {
      files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    } catch {
      return [];
    }
    const chats = [];
    for (const file of files) {
      try {
        const chat = JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf8'));
        const messages = Array.isArray(chat.messages) ? chat.messages : [];
        const lastUser = [...messages].reverse().find((m) => m.role === 'user');
        chats.push({
          id: chat.id,
          title: chat.title || 'Новый диалог',
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt || chat.createdAt,
          messageCount: messages.length,
          preview: lastUser ? truncate(lastUser.content, 90) : '',
          provider: chat.provider,
          model: chat.model,
          pinned: !!chat.pinned,
          folder: chat.folder || null,
        });
      } catch {}
    }
    return chats.sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
  }

  get(id) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(this.dir, id), 'utf8'));
    } catch {
      return null;
    }
  }

  create({ title, provider, model, systemPrompt } = {}) {
    const now = Date.now();
    const chat = {
      id: uid(12),
      title: title || 'Новый диалог',
      createdAt: now,
      updatedAt: now,
      messages: [],
      provider: provider || null,
      model: model || null,
      systemPrompt: systemPrompt || '',
      pinned: false,
    };
    this.save(chat);
    return chat;
  }

  save(chat) {
    chat.updatedAt = Date.now();
    fs.writeFileSync(fileFor(this.dir, chat.id), JSON.stringify(chat, null, 2), 'utf8');
    return chat;
  }

  remove(id) {
    try {
      fs.rmSync(fileFor(this.dir, id), { force: true });
      return true;
    } catch {
      return false;
    }
  }

  rename(id, title) {
    const chat = this.get(id);
    if (!chat) return null;
    chat.title = String(title || 'Диалог').slice(0, 120);
    this.save(chat);
    return chat;
  }

  togglePin(id) {
    const chat = this.get(id);
    if (!chat) return null;
    chat.pinned = !chat.pinned;
    this.save(chat);
    return chat;
  }

  clear() {
    for (const chat of this.list()) this.remove(chat.id);
    return true;
  }

  export(id) {
    return this.get(id);
  }
}

module.exports = { ChatsService };
