import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Обёртка для CI: запускает сборку smoke-бандла и сам прогон, а при провале
 * выводит строки вывода как аннотации GitHub Actions — их видно прямо в PR,
 * не скачивая логи (которые для больших джоб отдаются с обрывом).
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const annotate = (line) => {
  const clean = String(line).replace(/%/g, '%25').replace(/\r/g, '').slice(0, 400);
  if (clean.trim()) console.log(`::error title=smoke::${clean}`);
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', env: process.env });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.status !== 0) {
    for (const line of output.split('\n').slice(-40)) annotate(line);
    process.exit(result.status || 1);
  }
  return output;
}

run(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'scripts/vite.smoke.config.js']);
run(process.execPath, ['scripts/smoke-render.mjs']);
run(process.execPath, ['scripts/e2e-fullstack.mjs']);
