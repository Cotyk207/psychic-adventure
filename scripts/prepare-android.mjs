import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

console.log('1/3 Building web bundle with Vite...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

console.log('2/3 Copying cyberpunk wallpapers into dist/wallpapers...');
const srcWallpapers = path.join(ROOT, 'resources', 'wallpapers');
const dstWallpapers = path.join(ROOT, 'dist', 'wallpapers');
fs.mkdirSync(dstWallpapers, { recursive: true });
for (const file of fs.readdirSync(srcWallpapers)) {
  if (/\.(jpg|jpeg|png|webp)$/i.test(file)) {
    fs.copyFileSync(path.join(srcWallpapers, file), path.join(dstWallpapers, file));
  }
}

console.log('3/3 Syncing Capacitor Android project...');
execSync('npx cap sync android', { cwd: ROOT, stdio: 'inherit' });
console.log('Android web assets synced successfully.');
