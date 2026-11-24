'use strict';

const { spawn } = require('child_process');
const { resolvePath } = require('./files.cjs');
const { truncate, formatBytes } = require('../lib/util.cjs');

function buildShell(command, cwd) {
  if (process.platform === 'win32') {
    return {
      cmd: 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      stdin: [
        '$ProgressPreference = "SilentlyContinue"',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
        '$OutputEncoding = [System.Text.Encoding]::UTF8',
        command,
        '',
      ].join('\n'),
      cwd,
    };
  }
  return {
    cmd: '/bin/bash',
    args: ['-lc', command],
    stdin: null,
    cwd,
  };
}

async function runCommand(args, ctx) {
  const command = String(args.command || '').trim();
  if (!command) throw new Error('Пустая команда');
  const cfgTimeout = ctx?.store?.get?.('permissions.shell.timeout') || 120000;
  const timeout = Math.min(600000, Math.max(1000, Number(args.timeout) || cfgTimeout));
  const cwd = resolvePath(args.cwd, resolvePath(''));
  const spec = buildShell(command, cwd);

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(spec.cmd, spec.args, {
        cwd,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', PAGER: 'cat' },
        windowsHide: true,
        shell: false,
      });
    } catch (err) {
      return reject(new Error(`Не удалось запустить shell: ${err.message}`));
    }

    let stdout = '';
    let stderr = '';
    let truncated = false;
    let done = false;
    const started = Date.now();

    const finish = (exitCode, signal) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const out = truncate(stdout, 60000);
      const err = truncate(stderr, 20000);
      const text = [
        `$ ${command}`,
        `Каталог: ${cwd}`,
        exitCode === 0 ? `✅ Код: 0` : `⚠️ Код: ${exitCode ?? 'null'}${signal ? ` (${signal})` : ''}`,
        `⏱ ${((Date.now() - started) / 1000).toFixed(2)} c`,
        stdout.trim() ? `\n── STDOUT ──\n${out}` : '',
        stderr.trim() ? `\n── STDERR ──\n${err}` : '',
        truncated ? '\n…(вывод обрезан)' : '',
      ].filter(Boolean).join('\n');
      resolve({
        text,
        data: {
          command, cwd, exitCode, signal,
          stdout: truncate(stdout, 200000),
          stderr: truncate(stderr, 60000),
          duration: Date.now() - started,
          truncated,
        },
      });
    };

    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      stderr += `\n\n⏱ Превышен таймаут ${timeout} мс — процесс остановлен.`;
      finish(null, 'SIGKILL');
    }, timeout);

    child.stdout?.on('data', (chunk) => {
      if (stdout.length < 250000) stdout += chunk.toString('utf8');
      else truncated = true;
    });
    child.stderr?.on('data', (chunk) => {
      if (stderr.length < 100000) stderr += chunk.toString('utf8');
      else truncated = true;
    });
    child.on('error', (err) => {
      stderr += `\nОшибка: ${err.message}`;
      finish(1);
    });
    child.on('close', (code, signal) => finish(code, signal));

    if (spec.stdin != null) {
      try {
        child.stdin.write(spec.stdin);
        child.stdin.end();
      } catch {}
    }
  });
}

module.exports = { runCommand, buildShell };
