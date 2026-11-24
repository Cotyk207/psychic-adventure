/**
 * Syntax check for every main-process / preload file (CommonJS).
 * Vite only compiles the renderer, so this catches typos in the Node side.
 *
 *   node scripts/check-syntax.mjs
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const targets = [];

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
    } else if (/\.(cjs|js|mjs)$/.test(entry.name)) {
      targets.push(full);
    }
  }
};

walk(path.join(ROOT, 'src', 'main'));
walk(path.join(ROOT, 'src', 'preload'));
walk(path.join(ROOT, 'src', 'shared'));

let failed = 0;
for (const file of targets) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    console.log(`ok    ${path.relative(ROOT, file)}`);
  } catch (err) {
    failed += 1;
    console.log(`FAIL  ${path.relative(ROOT, file)}`);
    console.log(String(err.stderr || err.message).split('\n').slice(0, 4).join('\n'));
  }
}
console.log(`\n${targets.length} files checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
