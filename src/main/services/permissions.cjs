'use strict';

const path = require('path');
const { isInside, isDeniedPath, resolvePath } = require('../tools/files.cjs');
const { truncate } = require('../lib/util.cjs');

class PermissionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermissionError';
    this.code = 'PERMISSION_DENIED';
  }
}

const RISK_LABEL = {
  read: 'чтение',
  write: 'изменение файлов',
  exec: 'выполнение',
  network: 'сеть',
  media: 'медиа',
};

function summarize(tool, args = {}) {
  switch (tool.name) {
    case 'run_command':
      return String(args.command || '').slice(0, 300);
    case 'write_file':
      return `${args.path} · ${(args.content || '').length} симв.`;
    case 'edit_file':
      return args.path;
    case 'delete_path':
      return args.path;
    case 'move_path':
      return `${args.from} → ${args.to}`;
    case 'screenshot':
      return 'Снимок всего экрана';
    case 'open_app':
      return args.target;
    case 'clipboard_write':
      return truncate(args.text, 120);
    case 'generate_image':
    case 'generate_music':
    case 'generate_video':
      return truncate(args.prompt, 140);
    case 'browser_eval':
      return truncate(args.script, 160);
    case 'save_memory':
      return truncate(args.content, 160);
    case 'install_skill':
      return args.url || truncate(args.description, 140);
    case 'ask_user':
      return truncate(args.question, 160);
    default: {
      const parts = [];
      for (const [k, v] of Object.entries(args)) {
        if (typeof v === 'string') parts.push(`${k}: ${truncate(v, 60)}`);
      }
      return parts.join(' · ').slice(0, 200);
    }
  }
}

function commandMatches(command, pattern) {
  if (!pattern) return false;
  const cmd = String(command || '').toLowerCase().trim();
  const p = String(pattern).toLowerCase().trim();
  if (p.startsWith('*')) return cmd.includes(p.slice(1));
  return cmd === p || cmd.startsWith(p + ' ') || cmd.startsWith(p + '&&') || cmd.startsWith(p + ';') || cmd.startsWith(p + '|');
}

class PermissionService {
  constructor({ store, interactions }) {
    this.store = store;
    this.interactions = interactions;
    this.sessionAllowed = new Set();
  }

  mode() {
    return this.store.get('permissions.mode') || 'workspace';
  }

  roots() {
    return this.store.get('permissions.roots') || [];
  }

  isInsideRoots(p) {
    const abs = path.resolve(resolvePath(p));
    return this.roots().some((r) => isInside(abs, path.resolve(resolvePath(r))));
  }

  async check(tool, args = {}) {
    const mode = this.mode();
    const denied = this.store.get('permissions.deniedPaths') || [];

    const targetPath = args.path || args.from || args.to;
    if (targetPath && typeof targetPath === 'string' && isDeniedPath(targetPath, denied)) {
      throw new PermissionError(`Путь «${targetPath}» в списке запрещённых в настройках.`);
    }

    if (tool.name === 'run_command') {
      const denylist = this.store.get('permissions.shell.denylist') || [];
      if (denylist.some((p) => commandMatches(args.command, p))) {
        throw new PermissionError(`Команда заблокирована правилом безопасности: «${truncate(args.command, 80)}»`);
      }
      const shellMode = this.store.get('permissions.shell.mode') || 'confirm';
      if (shellMode === 'off') {
        throw new PermissionError('Терминал отключён в настройках доступа.');
      }
      if (shellMode === 'auto') return;
      if (shellMode === 'allowlist') {
        const allowlist = this.store.get('permissions.shell.allowlist') || [];
        if (allowlist.some((p) => commandMatches(args.command, p))) return;
      }
    }

    if (this.sessionAllowed.has(tool.name) && tool.risk !== 'exec') return;

    if (tool.risk === 'read') return;

    if (mode === 'full') return;

    if (mode === 'readonly') {
      throw new PermissionError('Включён режим «Только чтение». Разрешены только операции чтения.');
    }

    if (mode === 'workspace') {
      if (tool.risk === 'write' && targetPath && this.isInsideRoots(targetPath)) return;
      if (tool.name === 'run_command') {
        const allowlist = this.store.get('permissions.shell.allowlist') || [];
        if (allowlist.some((p) => commandMatches(args.command, p))) return;
      }
      if (tool.risk === 'network' && ['web_search', 'fetch_url', 'browser_open', 'browser_read'].includes(tool.name)) return;
    }

    return this.confirm(tool, args);
  }

  async confirm(tool, args) {
    const decision = await this.interactions.request('permission:request', {
      tool: {
        name: tool.name,
        label: tool.label || tool.name,
        icon: tool.icon || 'alert-triangle',
        risk: tool.risk,
        riskLabel: RISK_LABEL[tool.risk] || tool.risk,
      },
      summary: summarize(tool, args),
      args: Object.fromEntries(
        Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? truncate(v, 500) : v])
      ),
    }, 300000);

    if (!decision || decision.decision === 'deny' || decision.decision === undefined) {
      throw new PermissionError('Пользователь отклонил операцию.');
    }
    if (decision.decision === 'always') {
      this.sessionAllowed.add(tool.name);
    }
    return decision.decision;
  }

  resetSession() {
    this.sessionAllowed.clear();
  }
}

module.exports = { PermissionService, PermissionError, summarize, commandMatches, RISK_LABEL };
