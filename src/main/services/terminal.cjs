'use strict';

const { spawn } = require('child_process');
const { uid } = require('../lib/util');

class TerminalService {
  constructor(send) {
    this.send = send;
    this.terms = new Map();
  }

  shellSpec(override) {
    const choice = String(override || 'auto').toLowerCase();
    if (process.platform === 'win32') {
      if (choice === 'powershell' || choice === 'pwsh') {
        return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'], name: 'PowerShell' };
      }
      return { cmd: 'cmd.exe', args: ['/d', '/q', '/k', 'chcp 65001>nul'], name: 'cmd' };
    }
    if (choice === 'zsh') return { cmd: '/bin/zsh', args: ['-i'], name: 'zsh' };
    return { cmd: '/bin/bash', args: ['-i'], name: 'bash' };
  }

  create({ cwd, shell } = {}) {
    const id = uid(10);
    const spec = this.shellSpec(shell);
    let proc;
    try {
      proc = spawn(spec.cmd, spec.args, {
        cwd: cwd || process.env.HOME || process.env.USERPROFILE,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        windowsHide: true,
      });
    } catch (err) {
      this.send('terminal:exit', { id, code: 1, error: err.message });
      return { id, error: err.message };
    }

    this.terms.set(id, proc);
    const push = (data) => this.send('terminal:data', { id, data });
    proc.stdout?.on('data', (chunk) => push(chunk.toString('utf8')));
    proc.stderr?.on('data', (chunk) => push(chunk.toString('utf8')));
    proc.on('exit', (code, signal) => {
      this.terms.delete(id);
      this.send('terminal:exit', { id, code, signal });
    });
    proc.on('error', (err) => {
      this.send('terminal:data', { id, data: `\r\n\x1b[31mОшибка: ${err.message}\x1b[0m\r\n` });
    });
    return { id, shell: spec.name, pid: proc.pid };
  }

  write(id, data) {
    const proc = this.terms.get(id);
    if (!proc || proc.killed) return false;
    try {
      proc.stdin.write(data);
      return true;
    } catch {
      return false;
    }
  }

  resize() {
    // Without a PTY there is nothing to resize; xterm handles line wrapping.
  }

  close(id) {
    const proc = this.terms.get(id);
    if (!proc) return;
    try { proc.kill(); } catch {}
    this.terms.delete(id);
  }

  closeAll() {
    for (const id of [...this.terms.keys()]) this.close(id);
  }
}

module.exports = { TerminalService };
