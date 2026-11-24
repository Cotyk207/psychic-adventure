'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

let cached = null;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function home() {
  return app.getPath('home');
}

function init() {
  if (cached) return cached;
  const userData = app.getPath('userData');
  const workspace = path.join(home(), 'PSYCHIC Workspace');
  const dirs = {
    userData,
    workspace,
    config: path.join(userData, 'config'),
    chats: path.join(userData, 'chats'),
    attachments: path.join(userData, 'attachments'),
    media: path.join(userData, 'media'),
    images: path.join(userData, 'media', 'images'),
    music: path.join(userData, 'media', 'music'),
    video: path.join(userData, 'media', 'video'),
    screenshots: path.join(userData, 'media', 'screenshots'),
    skills: path.join(userData, 'skills'),
    memory: path.join(userData, 'memory'),
    themes: path.join(userData, 'themes'),
    logs: path.join(userData, 'logs'),
    cache: path.join(userData, 'cache'),
    home: home(),
    downloads: path.join(home(), 'Downloads'),
    desktop: path.join(home(), 'Desktop'),
    documents: path.join(home(), 'Documents'),
    musicLibrary: path.join(home(), 'Music'),
  };
  for (const key of Object.keys(dirs)) {
    if (typeof dirs[key] === 'string' && key !== 'home' && key !== 'downloads' && key !== 'desktop' && key !== 'documents' && key !== 'musicLibrary') {
      ensureDir(dirs[key]);
    }
  }
  cached = dirs;
  return dirs;
}

function get() {
  return cached || init();
}

/**
 * Путь к ресурсу приложения.
 *
 * В собранном приложении часть ресурсов лежит в extraResources рядом с app.asar
 * (skills, wallpapers), а часть — внутри самого asar (icon.png и прочее).
 * Поэтому перебираем оба варианта и берём существующий: иначе иконка окна и трея
 * в собранном EXE просто не находились.
 */
function resourcesPath(...parts) {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'resources', ...parts),
    process.resourcesPath ? path.join(process.resourcesPath, ...parts) : null,
  ].filter(Boolean);
  return candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }) || candidates[0];
}

function tempFile(ext = 'tmp') {
  return path.join(os.tmpdir(), `psychic-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
}

function expandHome(p) {
  if (!p) return p;
  if (p === '~') return home();
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(home(), p.slice(2));
  return p;
}

module.exports = { init, get, home, resourcesPath, tempFile, expandHome, ensureDir };
