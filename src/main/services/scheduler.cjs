'use strict';

/**
 * Планировщик напоминаний и повторяющихся задач.
 * Чистая логика времени вынесена в computeNextRun(), поэтому легко тестировать
 * с фиктивными часами.
 */

const fs = require('fs');
const path = require('path');
const { uid } = require('../lib/util.cjs');

const MIN_INTERVAL_MS = 60 * 1000; // чаще раза в минуту не даём
const MAX_INTERVAL_MS = 365 * 24 * 3600 * 1000;

function normalizeInterval(value) {
  if (value === null || value === undefined || value === '' || value === false) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(num)));
}

function toEpoch(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Когда задача должна сработать в следующий раз.
 *  - once: ровно в `at`
 *  - every: каждые `every` мс от последнего запуска (или от `at`, если запусков ещё не было)
 */
function computeNextRun(task, now) {
  if (!task || task.enabled === false) return null;
  const every = normalizeInterval(task.every);
  const at = toEpoch(task.at);

  if (every) {
    // Отсчёт от последнего запуска, иначе от создания задачи — иначе задача,
    // добавленная «каждый час», никогда не наступит: каждый пересчёт
    // отодвигал бы её ещё на час от текущего момента.
    const base = Number(task.lastRunAt) || at || Number(task.createdAt) || now;
    let next = base + every;
    while (next <= now) next += every;
    return next;
  }
  if (at) {
    if (at > now) return at;
    // Время уже пришло (например, приложение было закрыто): задача должна
    // сработать, а не исчезнуть. После запуска lastRunAt >= at → null.
    const last = Number(task.lastRunAt) || 0;
    return last >= at ? null : at;
  }
  return null;
}

function normalizeTask(input = {}, now = Date.now()) {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Укажи название задачи');
  const prompt = String(input.prompt || '').trim();
  const every = normalizeInterval(input.every);
  const at = toEpoch(input.at);
  if (!every && !at) throw new Error('Укажи время или период задачи');
  return {
    id: input.id || uid(10),
    title: title.slice(0, 200),
    prompt: prompt.slice(0, 4000),
    at: at || null,
    every: every || null,
    enabled: input.enabled !== false,
    runAgent: input.runAgent !== false,
    notify: input.notify !== false,
    createdAt: input.createdAt || now,
    lastRunAt: input.lastRunAt || null,
    nextRunAt: null,
  };
}

class Scheduler {
  constructor({ file, now = () => Date.now(), onDue = null, onNotify = null, logger = console } = {}) {
    this.file = file;
    this.now = now;
    this.onDue = onDue;
    this.onNotify = onNotify;
    this.logger = logger;
    this.items = [];
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.items = Array.isArray(raw) ? raw : [];
    } catch {
      this.items = [];
    }
    this.recompute();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.items, null, 2), 'utf8');
    } catch (err) {
      this.logger.error?.('scheduler save failed', err.message);
    }
  }

  recompute() {
    const now = this.now();
    this.items = this.items.map((task) => {
      if (task.enabled === false) return { ...task, nextRunAt: null };
      // Уже запланированное время не пересчитываем: иначе просроченная задача
      // («пора было сработать час назад») молча отодвигалась бы в будущее
      // и никогда бы не выполнилась.
      if (task.nextRunAt) return task;
      return { ...task, nextRunAt: computeNextRun(task, now) };
    });
  }

  list() {
    this.recompute();
    return [...this.items].sort((a, b) => {
      const an = a.nextRunAt ?? Number.MAX_SAFE_INTEGER;
      const bn = b.nextRunAt ?? Number.MAX_SAFE_INTEGER;
      return an - bn || String(a.title).localeCompare(String(b.title), 'ru');
    });
  }

  get(id) {
    return this.items.find((task) => task.id === id) || null;
  }

  add(input) {
    const task = normalizeTask(input, this.now());
    task.nextRunAt = computeNextRun(task, this.now());
    this.items.push(task);
    this.save();
    return task;
  }

  update(id, patch = {}) {
    const task = this.get(id);
    if (!task) throw new Error('Задача не найдена');
    const merged = normalizeTask({ ...task, ...patch, id }, this.now());
    merged.lastRunAt = task.lastRunAt;
    merged.nextRunAt = computeNextRun(merged, this.now());
    this.items = this.items.map((item) => (item.id === id ? merged : item));
    this.save();
    return merged;
  }

  remove(id) {
    const before = this.items.length;
    this.items = this.items.filter((task) => task.id !== id);
    this.save();
    return this.items.length < before;
  }

  toggle(id, enabled) {
    const task = this.get(id);
    if (!task) throw new Error('Задача не найдена');
    task.enabled = enabled !== false;
    task.nextRunAt = computeNextRun(task, this.now());
    this.save();
    return task;
  }

  /** Немедленный запуск задачи (кнопка «Выполнить»). */
  async runNow(id) {
    const task = this.get(id);
    if (!task) throw new Error('Задача не найдена');
    const result = await this.fire(task);
    return result;
  }

  async fire(task) {
    const now = this.now();
    const index = this.items.findIndex((item) => item.id === task.id);
    if (index >= 0) {
      this.items[index] = {
        ...this.items[index],
        lastRunAt: now,
        nextRunAt: computeNextRun({ ...this.items[index], lastRunAt: now }, now),
      };
      this.save();
    }
    let result = null;
    if (task.notify !== false) {
      const payload = { title: task.title, body: task.prompt || 'Пора выполнить задачу', task };
      try {
        this.onNotify?.(payload);
      } catch (err) {
        this.logger.warn?.('scheduler notify failed', err.message);
      }
    }
    if (task.runAgent !== false && task.prompt) {
      try {
        result = await this.onDue?.(task);
      } catch (err) {
        this.logger.error?.('scheduler task failed', err.message);
        result = { error: err.message };
      }
    }
    return { task: this.items[index] || task, result };
  }

  /** Проверить, что пора. Возвращает сработавшие задачи. */
  async tick() {
    const now = this.now();
    this.recompute();
    const due = this.items.filter((task) => task.enabled !== false && task.nextRunAt && task.nextRunAt <= now);
    const fired = [];
    for (const task of due) {
      fired.push(await this.fire(task));
    }
    return fired;
  }

  start(intervalMs = 30000) {
    this.stop();
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error?.('scheduler tick failed', err.message));
    }, intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
    return this.timer;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  upcoming(limit = 3) {
    const now = this.now();
    return this.list()
      .filter((task) => task.enabled !== false && task.nextRunAt && task.nextRunAt > now)
      .slice(0, limit);
  }
}

function formatNext(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const diff = timestamp - now;
  if (diff <= 0) return 'сейчас';
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'через минуту';
  if (minutes < 60) return `через ${minutes} мин`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `через ${hours} ч`;
  const days = Math.round(hours / 24);
  if (days < 7) return `через ${days} дн`;
  return new Date(timestamp).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

module.exports = {
  Scheduler,
  computeNextRun,
  normalizeTask,
  normalizeInterval,
  toEpoch,
  formatNext,
};
