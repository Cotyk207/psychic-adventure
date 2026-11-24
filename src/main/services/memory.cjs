'use strict';

const fs = require('fs');
const path = require('path');
const { uid } = require('../lib/util');

const CATEGORIES = ['notes', 'facts', 'people', 'projects'];

const STOPWORDS = new Set([  'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то', 'все', 'она', 'так',
  'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за', 'бы', 'по', 'только', 'ее', 'мне', 'было',
  'вот', 'от', 'меня', 'еще', 'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'даже', 'ну', 'вдруг',
  'ли', 'если', 'уже', 'или', 'ни', 'быть', 'был', 'него', 'до', 'вас', 'нибудь', 'опять', 'уж',
  'вам', 'ведь', 'там', 'потом', 'себя', 'ничего', 'ей', 'может', 'они', 'тут', 'где', 'есть',
  'надо', 'ней', 'для', 'мы', 'тебя', 'их', 'чем', 'была', 'сам', 'чтоб', 'без', 'будто', 'что-то',
  'раз', 'тоже', 'себе', 'под', 'будет', 'ж', 'тогда', 'кто', 'этот', 'того', 'это', 'мой',
  'ещё', 'того', 'свой', 'моя', 'моё', 'они', 'нам', 'вас', 'них', 'могут', 'какой', 'какая',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were', 'be', 'been',
  'for', 'on', 'with', 'as', 'at', 'by', 'from', 'that', 'this', 'it', 'its', 'my', 'me', 'i',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-zа-яё0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

class MemoryService {
  constructor(dir) {
    this.file = path.join(dir, 'memory.json');
    this.items = [];
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.items = Array.isArray(raw) ? raw : [];
    } catch {
      this.items = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf8');
    } catch (err) {
      console.error('memory save failed', err);
    }
  }

  all() {
    return [...this.items].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  add(content, tags = [], category = 'notes') {
    const text = String(content || '').trim();
    if (!text) throw new Error('Пустая память');
    const existing = this.items.find((x) => x.content.toLowerCase() === text.toLowerCase());
    if (existing) {
      existing.updatedAt = Date.now();
      existing.tags = Array.from(new Set([...(existing.tags || []), ...(tags || [])]));
      if (category && category !== 'notes') existing.category = category;
      this.save();
      return existing;
    }
    const item = {
      id: uid(10),
      content: text,
      category: CATEGORIES.includes(category) ? category : 'notes',
      tags: Array.isArray(tags) ? tags : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.items.push(item);
    if (this.items.length > 500) this.items.shift();
    this.save();
    return item;
  }

  update(id, patch = {}) {
    const item = this.items.find((x) => x.id === id);
    if (!item) throw new Error('Запись не найдена');
    if (typeof patch.content === 'string' && patch.content.trim()) item.content = patch.content.trim();
    if (CATEGORIES.includes(patch.category)) item.category = patch.category;
    if (Array.isArray(patch.tags)) item.tags = patch.tags;
    item.updatedAt = Date.now();
    this.save();
    return item;
  }

  exportJson(targetPath) {
    const payload = {
      exportedAt: new Date().toISOString(),
      count: this.items.length,
      items: this.all(),
    };
    fs.writeFileSync(targetPath, JSON.stringify(payload, null, 2), 'utf8');
    return targetPath;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((x) => x.id !== id);
    this.save();
    return this.items.length < before;
  }

  clear() {
    this.items = [];
    this.save();
  }

  search(query, limit = 5) {
    const q = tokenize(query);
    if (!q.length) return this.all().slice(0, limit);
    const scored = this.items.map((item) => {
      const tokens = tokenize(item.content + ' ' + (item.tags || []).join(' '));
      let score = 0;
      for (const word of q) {
        if (tokens.includes(word)) score += 3;
        else if (tokens.some((t) => t.includes(word) || word.includes(t))) score += 1;
      }
      if (item.content.toLowerCase().includes(query.toLowerCase())) score += 2;
      return { item, score };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.item.updatedAt || 0) - (a.item.updatedAt || 0))
      .slice(0, limit)
      .map((x) => x.item);
  }
}

module.exports = { MemoryService, tokenize };
