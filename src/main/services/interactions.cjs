'use strict';

const { uid } = require('../lib/util.cjs');

class Interactions {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.pending = new Map();
  }

  send(channel, payload) {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return false;
    try {
      win.webContents.send(channel, payload);
      return true;
    } catch {
      return false;
    }
  }

  request(channel, payload, timeoutMs = 180000) {
    const id = uid(12);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error('Время ожидания ответа истекло'), { code: 'TIMEOUT' }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, channel });
      const sent = this.send(channel, { ...payload, id });
      if (!sent) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(Object.assign(new Error('Окно недоступно'), { code: 'NO_WINDOW' }));
      }
    });
  }

  resolve(id, value) {
    const item = this.pending.get(id);
    if (!item) return false;
    clearTimeout(item.timer);
    this.pending.delete(id);
    item.resolve(value);
    return true;
  }

  rejectAll(reason = 'Сессия завершена') {
    for (const [id, item] of this.pending) {
      clearTimeout(item.timer);
      try { item.reject(new Error(reason)); } catch {}
      this.pending.delete(id);
    }
  }
}

module.exports = { Interactions };
