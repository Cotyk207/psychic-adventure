'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { get, expandHome } = require('../lib/paths.cjs');
const { isProbablyBinary, truncate, formatBytes } = require('../lib/util.cjs');

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/opus',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska', '.gifv': 'video/mp4',
  '.pdf': 'application/pdf', '.zip': 'application/zip', '.json': 'application/json',
  '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.cjs': 'text/javascript',
  '.jsx': 'text/javascript', '.ts': 'text/typescript', '.tsx': 'text/typescript',
  '.py': 'text/x-python', '.rs': 'text/x-rust', '.go': 'text/x-go', '.java': 'text/x-java',
  '.c': 'text/x-c', '.cpp': 'text/x-c++', '.h': 'text/x-c', '.cs': 'text/x-csharp',
  '.sh': 'text/x-shellscript', '.ps1': 'text/x-powershell', '.bat': 'text/x-batch',
  '.yaml': 'text/yaml', '.yml': 'text/yaml', '.toml': 'text/toml', '.ini': 'text/plain',
  '.xml': 'application/xml', '.sql': 'text/x-sql', '.php': 'text/x-php', '.rb': 'text/x-ruby',
};

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', '.next', '.nuxt', '.output',
  '__pycache__', '.pytest_cache', '.mypy_cache', '.venv', 'venv', '.tox', '.cache',
  'AppData', '$Recycle.Bin', 'System Volume Information', '.turbo', '.parcel-cache',
  'target', 'out', 'release', '.idea', '.vscode', 'coverage',
]);

function workspaceRoot() {
  return get().workspace;
}

function resolvePath(p, cwd) {
  if (!p || !String(p).trim()) return workspaceRoot();
  let out = expandHome(String(p).trim());
  if (out.startsWith('file://')) {
    try { out = require('url').fileURLToPath(out); } catch {}
  }
  if (!path.isAbsolute(out)) out = path.resolve(cwd || workspaceRoot(), out);
  return path.normalize(out);
}

function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function isDeniedPath(p, denied = []) {
  const resolved = path.resolve(p).toLowerCase();
  for (const d of denied) {
    if (!d) continue;
    const dd = path.resolve(expandHome(String(d))).toLowerCase();
    if (resolved === dd || resolved.startsWith(dd + path.sep)) return true;
  }
  return false;
}

function assertSafeTarget(p) {
  const resolved = path.resolve(p);
  const root = path.parse(resolved).root;
  const home = os.homedir();
  const critical = [
    root,
    home,
    path.join(home, 'AppData'),
    process.env.SystemRoot || 'C:\\Windows',
    '/etc', '/usr', '/bin', '/sbin', '/boot', '/sys', '/proc',
  ].map((x) => path.resolve(x));
  if (critical.some((c) => resolved === c)) {
    throw new Error(`Отказано в доступе: ${resolved} — системный путь.`);
  }
  if (resolved === path.resolve(workspaceRoot())) {
    throw new Error('Отказано: нельзя удалять корень рабочего пространства.');
  }
}

function mimeOf(p) {
  return MIME[String(path.extname(p)).toLowerCase()] || 'application/octet-stream';
}

function walk(dir, { depth = 6, maxFiles = 20000, ignore = IGNORED_DIRS } = {}) {
  const results = [];
  const queue = [{ dir: path.resolve(dir), level: 0 }];
  while (queue.length && results.length < maxFiles) {
    const { dir: cur, level } = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (ignore.has(entry.name)) continue;
        if (level + 1 < depth) queue.push({ dir: full, level: level + 1 });
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  return results;
}

function globToRegex(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        re += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`, 'i');
}

async function readFile(args) {
  const p = resolvePath(args.path);
  let info;
  try {
    info = fs.statSync(p);
  } catch {
    throw new Error(`Файл не найден: ${p}`);
  }
  if (info.isDirectory()) {
    throw new Error(`Это папка, а не файл. Используй list_directory: ${p}`);
  }
  if (info.size > 25 * 1024 * 1024) {
    throw new Error(`Файл слишком большой (${formatBytes(info.size)}). Максимум 25 MB.`);
  }
  const ext = path.extname(p).toLowerCase();
  const buf = fs.readFileSync(p);

  if (IMAGE_EXT.has(ext) && info.size < 6 * 1024 * 1024) {
    const data = buf.toString('base64');
    const dataUrl = `data:${mimeOf(p)};base64,${data}`;
    return {
      text: `Изображение: ${p}\nРазмер: ${info.size}×${info.size ? '' : ''}${formatBytes(info.size)}\n(изображение прикреплено к сообщению)`,
      images: [{ name: path.basename(p), mimeType: mimeOf(p), data, dataUrl, path: p }],
      data: { path: p, size: info.size, mime: mimeOf(p) },
    };
  }

  if (args.encoding === 'base64') {
    return { text: buf.toString('base64'), data: { path: p, size: info.size } };
  }

  if (isProbablyBinary(buf)) {
    return {
      text: `⚠️ Бинарный файл: ${p}\nРазмер: ${formatBytes(info.size)}\nТип: ${mimeOf(p)}\nДля содержимого используй encoding=base64.`,
      data: { path: p, size: info.size, binary: true },
    };
  }

  const content = buf.toString('utf8');
  const truncated = content.length > 200000;
  return {
    text: truncated ? content.slice(0, 200000) + '\n\n…(файл обрезан до 200 000 символов)' : content,
    data: { path: p, size: info.size, truncated, mime: mimeOf(p) },
  };
}

async function writeFile(args) {
  const p = resolvePath(args.path);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (args.append && fs.existsSync(p)) {
    fs.appendFileSync(p, String(args.content ?? ''), 'utf8');
  } else {
    fs.writeFileSync(p, String(args.content ?? ''), 'utf8');
  }
  const info = fs.statSync(p);
  return {
    text: `✅ Файл сохранён: ${p}\nРазмер: ${formatBytes(info.size)}`,
    data: { path: p, size: info.size, bytes: Buffer.byteLength(String(args.content ?? '')) },
  };
}

async function editFile(args) {
  const p = resolvePath(args.path);
  if (!fs.existsSync(p)) throw new Error(`Файл не найден: ${p}`);
  const original = fs.readFileSync(p, 'utf8');
  const { oldText, newText, replaceAll } = args;
  if (!oldText) throw new Error('oldText не может быть пустым');
  const count = original.split(oldText).length - 1;
  if (count === 0) {
    throw new Error(`Фрагмент не найден в ${p}. Проверь отступы и точное совпадение.`);
  }
  if (count > 1 && !replaceAll) {
    throw new Error(`Фрагмент встречается ${count} раза. Уточни его или передай replaceAll=true.`);
  }
  const updated = replaceAll ? original.split(oldText).join(newText) : original.replace(oldText, newText);
  fs.writeFileSync(p, updated, 'utf8');
  return {
    text: `✅ Файл обновлён: ${p}\nЗамен: ${replaceAll ? count : 1}`,
    data: { path: p, replacements: replaceAll ? count : 1 },
  };
}

async function listDirectory(args) {
  const p = resolvePath(args.path);
  if (!fs.existsSync(p)) throw new Error(`Папка не найдена: ${p}`);
  if (!fs.statSync(p).isDirectory()) throw new Error(`Не папка: ${p}`);
  const depth = Math.min(3, Math.max(1, Number(args.depth) || 1));
  const showHidden = !!args.showHidden;

  const entries = [];
  const rec = (dir, level, prefix) => {
    let list;
    try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    list.sort((a, b) => (b.isDirectory() ? 1 : 0) - (a.isDirectory() ? 1 : 0) || a.name.localeCompare(b.name));
    for (const entry of list) {
      if (!showHidden && entry.name.startsWith('.')) continue;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      let size = 0;
      let mtime = null;
      try {
        const st = fs.statSync(full);
        size = st.size;
        mtime = st.mtime;
      } catch {}
      entries.push({
        name: entry.name,
        path: full,
        type: entry.isDirectory() ? 'directory' : 'file',
        size,
        modified: mtime ? mtime.toISOString() : null,
        depth: level,
      });
      if (entry.isDirectory() && level < depth) rec(full, level + 1, `${prefix}${entry.name}/`);
      if (entries.length > 600) return;
    }
  };
  rec(p, 1, '');

  const lines = entries.map((e) =>
    `${e.type === 'directory' ? '📁' : '📄'} ${e.path}${e.type === 'file' ? `  (${formatBytes(e.size)})` : ''}`
  );
  return {
    text: `Папка: ${p}\nВсего: ${entries.length}\n\n${lines.join('\n')}`,
    data: { path: p, entries },
  };
}

async function searchFiles(args) {
  const query = String(args.query || '').trim();
  if (!query) throw new Error('Пустой запрос');
  const root = resolvePath(args.path);
  if (!fs.existsSync(root)) throw new Error(`Папка не найдена: ${root}`);

  let re;
  if (query.startsWith('/') && query.lastIndexOf('/') > 0) {
    const last = query.lastIndexOf('/');
    try {
      re = new RegExp(query.slice(1, last), query.slice(last + 1) || 'i');
    } catch {
      re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
  } else {
    re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const maxResults = Math.min(200, Math.max(1, Number(args.maxResults) || 60));
  const files = walk(root, { depth: 10, maxFiles: 8000 });
  const matches = [];

  outer: for (const file of files) {
    if (matches.length >= maxResults) break;
    try {
      const st = fs.statSync(file);
      if (st.size > 2 * 1024 * 1024) continue;
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.zip', '.exe', '.dll', '.pdf', '.woff', '.woff2', '.ttf'].includes(ext)) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (!re.test(content)) continue;
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          matches.push({
            path: file,
            line: i + 1,
            text: truncate(lines[i].trim(), 300),
          });
          if (matches.length >= maxResults) break outer;
        }
      }
    } catch {}
  }

  const lines = matches.map((m) => `${m.path}:${m.line}: ${m.text}`);
  return {
    text: matches.length
      ? `Найдено совпадений: ${matches.length}\n\n${lines.join('\n')}`
      : `Ничего не найдено по запросу «${query}» в ${root}`,
    data: { query, root, matches },
  };
}

async function findFiles(args) {
  const pattern = String(args.pattern || '*');
  const root = resolvePath(args.path);
  if (!fs.existsSync(root)) throw new Error(`Папка не найдена: ${root}`);
  const re = globToRegex(pattern);
  const maxResults = Math.min(300, Math.max(1, Number(args.maxResults) || 100));
  const files = walk(root, { depth: 12, maxFiles: 20000 });
  const matches = [];
  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (re.test(rel) || re.test(path.basename(f))) {
      matches.push(f);
      if (matches.length >= maxResults) break;
    }
  }
  return {
    text: matches.length
      ? `Найдено файлов: ${matches.length}\n\n${matches.join('\n')}`
      : `Файлы по шаблону «${pattern}» не найдены в ${root}`,
    data: { pattern, root, matches },
  };
}

async function deletePath(args) {
  const p = resolvePath(args.path);
  assertSafeTarget(p);
  if (!fs.existsSync(p)) throw new Error(`Путь не найден: ${p}`);
  const stat = fs.statSync(p);
  if (stat.isDirectory() && !args.recursive) {
    throw new Error('Это папка. Передай recursive=true для удаления.');
  }
  fs.rmSync(p, { recursive: !!args.recursive, force: true });
  return { text: `🗑️ Удалено: ${p}`, data: { path: p } };
}

async function movePath(args) {
  const from = resolvePath(args.from);
  const to = resolvePath(args.to);
  assertSafeTarget(from);
  if (!fs.existsSync(from)) throw new Error(`Источник не найден: ${from}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code === 'EXDEV') {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
  return { text: `📦 Перемещено: ${from} → ${to}`, data: { from, to } };
}

async function getFileInfo(args) {
  const p = resolvePath(args.path);
  let st;
  try {
    st = fs.statSync(p);
  } catch {
    throw new Error(`Путь не найден: ${p}`);
  }
  const info = {
    path: p,
    type: st.isDirectory() ? 'directory' : 'file',
    size: st.size,
    created: st.birthtime,
    modified: st.mtime,
    mime: st.isFile() ? mimeOf(p) : null,
    extension: path.extname(p),
  };
  return {
    text: [
      `Путь: ${p}`,
      `Тип: ${info.type === 'directory' ? 'папка' : 'файл'}`,
      `Размер: ${formatBytes(info.size)}`,
      `Изменён: ${st.mtime.toLocaleString('ru-RU')}`,
      info.mime ? `MIME: ${info.mime}` : '',
    ].filter(Boolean).join('\n'),
    data: info,
  };
}

module.exports = {
  readFile, writeFile, editFile, listDirectory, searchFiles, findFiles,
  deletePath, movePath, getFileInfo, resolvePath, isInside, isDeniedPath,
  assertSafeTarget, mimeOf, walk, workspaceRoot, IGNORED_DIRS, IMAGE_EXT,
};
