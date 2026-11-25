/**
 * Процедурный генератор киберпанк/неон-арта (Canvas 2D + чистый PNG fallback для headless-сред).
 * Используется как мгновенный офлайн-режим и надёжный резерв при недоступности облачных API.
 */

function hashPrompt(str = '') {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let x = (seed >>> 0) || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const PALETTES = {
  cyberpunk: ['#070616', '#1b0b3a', '#ff2a6d', '#05d9e8', '#d1f7ff'],
  neon: ['#050814', '#12082e', '#b829ff', '#00f5d4', '#fee440'],
  anime: ['#101935', '#2c2a6c', '#ff6b9d', '#64dfdf', '#fff1e6'],
  dark: ['#040508', '#111622', '#7f5af0', '#2cb67d', '#e2e8f0'],
  auto: ['#060818', '#191038', '#00f0ff', '#ff2e97', '#f8fafc'],
};

// Компактный фоллбэк валидного 1x1 PNG на случай среды без Canvas 2D (jsdom)
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export async function generateProceduralImageDataUrl({
  prompt = 'PSYCHIC Neural Art',
  style = 'cyberpunk',
  width = 1024,
  height = 1024,
  seed,
} = {}) {
  const w = Math.min(1536, Math.max(256, Number(width) || 1024));
  const h = Math.min(1536, Math.max(256, Number(height) || 1024));

  if (typeof document === 'undefined') {
    return { dataUrl: TINY_PNG_DATA_URL, mime: 'image/png', ext: 'png', size: 68 };
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) {
    return { dataUrl: TINY_PNG_DATA_URL, mime: 'image/png', ext: 'png', size: 68 };
  }

  const rng = makeRng((Number(seed) || hashPrompt(`${prompt}:${style}`)) ^ 0x9e3779b9);
  const pal = PALETTES[style] || PALETTES.auto;

  // Небо-градиент
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, pal[0]);
  sky.addColorStop(0.55, pal[1]);
  sky.addColorStop(1, '#04030c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Звёзды и частицы
  for (let i = 0; i < 140; i++) {
    const sx = rng() * w;
    const sy = rng() * h * 0.62;
    const r = 0.6 + rng() * 1.8;
    ctx.fillStyle = i % 5 === 0 ? pal[3] : pal[4];
    ctx.globalAlpha = 0.25 + rng() * 0.7;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Неоновое солнце / сфера на горизонте
  const horizonY = h * 0.62;
  const sunX = w * (0.35 + rng() * 0.3);
  const sunR = Math.min(w, h) * (0.16 + rng() * 0.08);
  const sunGrad = ctx.createRadialGradient(sunX, horizonY - sunR * 0.35, sunR * 0.05, sunX, horizonY - sunR * 0.35, sunR * 1.6);
  sunGrad.addColorStop(0, pal[4]);
  sunGrad.addColorStop(0.35, pal[2]);
  sunGrad.addColorStop(0.7, `${pal[3]}44`);
  sunGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, horizonY - sunR * 0.35, sunR * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Силуэт мегаполиса
  const buildings = 22;
  for (let i = 0; i < buildings; i++) {
    const bw = (w / buildings) * (0.8 + rng() * 0.9);
    const bx = (i / buildings) * w - bw * 0.15;
    const bh = h * (0.08 + rng() * 0.32);
    const by = horizonY - bh;
    ctx.fillStyle = '#070814';
    ctx.fillRect(bx, by, bw, bh + 4);
    ctx.strokeStyle = i % 2 === 0 ? `${pal[3]}66` : `${pal[2]}66`;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, by, bw, bh);

    // Светящиеся окна
    const cols = Math.max(2, Math.floor(bw / 14));
    const rows = Math.max(3, Math.floor(bh / 16));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() > 0.42) continue;
        ctx.fillStyle = rng() > 0.3 ? pal[3] : pal[2];
        ctx.globalAlpha = 0.35 + rng() * 0.5;
        ctx.fillRect(bx + 5 + c * 12, by + 6 + r * 14, 5, 7);
      }
    }
    ctx.globalAlpha = 1;
  }

  // Перспективная сетка пола
  const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
  floorGrad.addColorStop(0, `${pal[2]}33`);
  floorGrad.addColorStop(1, '#03030a');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, horizonY, w, h - horizonY);

  ctx.strokeStyle = pal[3];
  ctx.lineWidth = 1.2;
  for (let i = -12; i <= 12; i++) {
    ctx.globalAlpha = 0.32;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 + i * (w * 0.03), horizonY);
    ctx.lineTo(w * 0.5 + i * (w * 0.22), h);
    ctx.stroke();
  }
  for (let j = 1; j <= 10; j++) {
    const t = (j / 10) ** 1.8;
    const y = horizonY + t * (h - horizonY);
    ctx.globalAlpha = 0.18 + t * 0.35;
    ctx.strokeStyle = j % 2 === 0 ? pal[2] : pal[3];
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Подпись промпта в стиле HUD
  const caption = String(prompt || '').trim().slice(0, 72);
  if (caption) {
    ctx.font = `600 ${Math.max(13, Math.round(w * 0.018))}px monospace`;
    ctx.fillStyle = 'rgba(5, 8, 22, 0.72)';
    ctx.fillRect(24, h - 56, Math.min(w - 48, caption.length * 12 + 36), 34);
    ctx.strokeStyle = `${pal[3]}88`;
    ctx.strokeRect(24, h - 56, Math.min(w - 48, caption.length * 12 + 36), 34);
    ctx.fillStyle = pal[4];
    ctx.fillText(`// ${caption}`, 36, h - 34);
  }

  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl || !dataUrl.startsWith('data:image/')) {
    return { dataUrl: TINY_PNG_DATA_URL, mime: 'image/png', ext: 'png', size: 68 };
  }
  const b64 = dataUrl.split(',')[1] || '';
  return {
    dataUrl,
    mime: 'image/png',
    ext: 'png',
    size: Math.floor(b64.length * 0.75),
  };
}
