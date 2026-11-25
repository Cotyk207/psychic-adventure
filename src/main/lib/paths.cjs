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

function dirExists(p) {
  if (!p || typeof p !== 'string') return false;
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function home() {
  return app.getPath('home');
}

/**
 * Находит реальный системный каталог пользователя (Desktop / Documents / Downloads / Music)
 * с учётом Windows Known Folders (app.getPath), перенаправления OneDrive
 * («OneDrive/Desktop», «OneDrive/Рабочий стол» и т.д.) и резервного отката на workspace,
 * чтобы панель «Файлы» и инструменты ИИ никогда не падали с «Папка не найдена».
 */
function resolveSystemFolder(electronKey, names, fallbackDir) {
  const candidates = [];
  try {
    const fromElectron = app.getPath(electronKey);
    if (fromElectron) candidates.push(fromElectron);
  } catch {}

  const homeDir = home();
  const oneDriveRoots = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
    homeDir ? path.join(homeDir, 'OneDrive') : null,
  ].filter(Boolean);

  for (const od of oneDriveRoots) {
    for (const n of names) {
      candidates.push(path.join(od, n));
    }
  }
  if (homeDir) {
    for (const n of names) {
      candidates.push(path.join(homeDir, n));
    }
  }

  for (const candidate of candidates) {
    if (dirExists(candidate)) return candidate;
  }
  return fallbackDir;
}

function init() {
  if (cached) return cached;
  const userData = app.getPath('userData');
  const homeDir = home();
  const workspace = ensureDir(path.join(homeDir, 'PSYCHIC Workspace'));
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
    home: homeDir,
    downloads: resolveSystemFolder('downloads', ['Downloads', 'Загрузки'], workspace),
    desktop: resolveSystemFolder('desktop', ['Desktop', 'Рабочий стол'], workspace),
    documents: resolveSystemFolder('documents', ['Documents', 'Документы'], workspace),
    musicLibrary: resolveSystemFolder('music', ['Music', 'Музыка'], path.join(userData, 'media', 'music')),
  };
  for (const key of Object.keys(dirs)) {
    if (
      typeof dirs[key] === 'string'
      && key !== 'home'
      && key !== 'downloads'
      && key !== 'desktop'
      && key !== 'documents'
      && key !== 'musicLibrary'
    ) {
      ensureDir(dirs[key]);
    }
  }
  cached = dirs;
  return dirs;
}

function resetCache() {
  cached = null;
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

module.exports = {
  init,
  get,
  resetCache,
  resolveSystemFolder,
  home,
  resourcesPath,
  tempFile,
  expandHome,
  ensureDir,
};
