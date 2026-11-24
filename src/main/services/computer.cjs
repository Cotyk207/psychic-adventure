'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { shell, clipboard, desktopCapturer, screen } = require('electron');
const { get } = require('../lib/paths.cjs');
const { truncate } = require('../lib/util.cjs');

function findShortcut(query) {
  if (process.platform !== 'win32') return null;
  const q = String(query || '').toLowerCase().trim();
  if (!q) return null;
  const roots = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : null,
    process.env.ProgramData ? path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : null,
  ].filter(Boolean);

  const results = [];
  const walk = (dir, depth = 0) => {
    if (depth > 5) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (/\.(lnk|url)$/i.test(entry.name)) {
        const base = entry.name.replace(/\.(lnk|url)$/i, '').toLowerCase();
        if (base.includes(q) || q.includes(base)) results.push(full);
      }
    }
  };
  for (const root of roots) if (fs.existsSync(root)) walk(root);
  return results.sort((a, b) => a.length - b.length)[0] || null;
}

class ComputerService {
  constructor({ interactions, store }) {
    this.interactions = interactions;
    this.store = store;
  }

  async screenshot() {
    let primary = null;
    try { primary = screen.getPrimaryDisplay(); } catch {}
    const width = Math.min(1920, primary?.size?.width || 1920);
    const height = Math.min(1080, primary?.size?.height || 1080);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
      fetchWindowIcons: false,
    });
    if (!sources.length) throw new Error('Не удалось получить изображение экрана');
    const image = sources[0].thumbnail;
    if (!image || image.isEmpty()) throw new Error('Пустой снимок экрана');
    const buffer = image.toPNG();
    const base64 = buffer.toString('base64');
    const file = path.join(get().screenshots, `screen-${Date.now()}.png`);
    fs.writeFileSync(file, buffer);
    const dataUrl = `data:image/png;base64,${base64}`;
    return {
      text: `📸 Скриншот сохранён: ${file}\nРазмер: ${(buffer.length / 1024).toFixed(0)} KB`,
      images: [{ name: path.basename(file), mimeType: 'image/png', data: base64, dataUrl, path: file }],
      data: { path: file, size: buffer.length },
    };
  }

  async openApp(target) {
    const value = String(target || '').trim();
    if (!value) throw new Error('Пустая цель');

    if (/^https?:\/\//i.test(value)) {
      await shell.openExternal(value);
      return { text: `🔗 Открыто в браузере: ${value}`, data: { type: 'url', target: value } };
    }

    if (fs.existsSync(value)) {
      const error = await shell.openPath(value);
      if (error) throw new Error(error);
      return { text: `🚀 Открыто: ${value}`, data: { type: 'file', target: value } };
    }

    const shortcut = findShortcut(value);
    if (shortcut) {
      const error = await shell.openPath(shortcut);
      if (error) throw new Error(error);
      return { text: `🚀 Запущено: ${value}`, data: { type: 'app', target: value, shortcut } };
    }

    if (process.platform === 'win32') {
      const child = spawn('cmd.exe', ['/c', 'start', '', value], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', () => {});
      child.unref();
      return { text: `🚀 Попытка запуска: ${value}`, data: { type: 'command', target: value } };
    }
    if (process.platform === 'darwin') {
      spawn('open', ['-a', value], { detached: true, stdio: 'ignore' }).unref();
      return { text: `🚀 Открыто: ${value}`, data: { type: 'app', target: value } };
    }
    spawn('xdg-open', [value], { detached: true, stdio: 'ignore' }).unref();
    return { text: `🚀 Открыто: ${value}`, data: { type: 'app', target: value } };
  }

  clipboardRead() {
    const text = clipboard.readText();
    return { text: text || 'Буфер обмена пуст', data: { text } };
  }

  clipboardWrite(text) {
    clipboard.writeText(String(text ?? ''));
    return { text: `📋 Скопировано в буфер (${String(text ?? '').length} симв.)`, data: { length: String(text ?? '').length } };
  }
}

module.exports = { ComputerService, findShortcut };
