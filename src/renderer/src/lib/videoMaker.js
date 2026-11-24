/**
 * Локальный генератор видео: слайд-шоу с эффектом Ken Burns,
 * кроссфейдами, неоновыми оверлеями и звуковой дорожкой.
 * Работает полностью в браузере (canvas + MediaRecorder).
 */

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function seededRandom(seed) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoisePattern(size = 128) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 18;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawCover(ctx, img, w, h, scale, dx, dy) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const ratio = Math.max(w / iw, h / ih) * scale;
  const dw = iw * ratio;
  const dh = ih * ratio;
  ctx.drawImage(img, (w - dw) / 2 + dx, (h - dh) / 2 + dy, dw, dh);
}

export async function renderSlideshow({
  images = [],
  duration = 10,
  prompt = '',
  title = '',
  musicDataUrl = null,
  width = 1280,
  height = 720,
  accent = '#00f0ff',
  accent2 = '#ff2d95',
} = {}) {
  const totalSec = Math.min(60, Math.max(3, Number(duration) || 10));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });

  const loaded = (await Promise.all(images.map((i) => loadImage(i.dataUrl || i)))).filter(Boolean);
  const noise = makeNoisePattern();
  const seed = hashString(prompt + title + loaded.length);
  const rand = seededRandom(seed);

  // Фоновые градиенты для слайдов без картинок
  const gradients = [];
  for (let i = 0; i < Math.max(1, loaded.length); i++) {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.45, i % 2 ? '#151033' : '#0b1c2a');
    g.addColorStop(1, '#04050d');
    gradients.push(g);
  }

  const stream = canvas.captureStream(30);
  let audioEl = null;
  let audioCtx = null;
  let audioTracks = [];
  if (musicDataUrl) {
    try {
      audioCtx = new AudioContext();
      audioEl = new Audio(musicDataUrl);
      audioEl.crossOrigin = 'anonymous';
      const source = audioCtx.createMediaElementSource(audioEl);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);
      audioTracks = dest.stream.getAudioTracks();
      await audioEl.play().catch(() => {});
    } catch {
      audioTracks = [];
    }
  }

  const tracks = [...stream.getVideoTracks(), ...audioTracks];
  const mimeType = pickMime();
  const recorder = new MediaRecorder(new MediaStream(tracks), {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 8_000_000,
    audioBitsPerSecond: 192_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve;
  });

  const started = performance.now();
  recorder.start(400);

  const slideCount = Math.max(1, loaded.length);
  const slideDur = totalSec / slideCount;
  const fade = Math.min(1.1, slideDur * 0.35);

  await new Promise((resolve) => {
    const frame = () => {
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= totalSec) {
        resolve();
        return;
      }
      const idx = Math.min(slideCount - 1, Math.floor(elapsed / slideDur));
      const local = elapsed - idx * slideDur;
      const progress = local / slideDur;

      // фон
      ctx.fillStyle = gradients[idx % gradients.length];
      ctx.fillRect(0, 0, width, height);

      const img = loaded[idx];
      if (img) {
        const scale = 1.04 + progress * 0.14;
        const dx = Math.sin(progress * Math.PI * 2 + idx) * 18;
        const dy = Math.cos(progress * Math.PI * 1.5 + idx) * 12;
        drawCover(ctx, img, width, height, scale, dx, dy);
      } else {
        // абстрактные неоновые кольца
        for (let k = 0; k < 9; k++) {
          const r = 40 + k * 46 + progress * 90;
          ctx.beginPath();
          ctx.strokeStyle = k % 2 ? accent : accent2;
          ctx.globalAlpha = 0.16 - k * 0.012;
          ctx.lineWidth = 1.4;
          ctx.arc(width / 2 + Math.sin(idx + k) * 120, height / 2 + Math.cos(idx * 2 + k) * 80, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // кроссфейд
      if (fade > 0) {
        if (local < fade && idx > 0) {
          const prev = loaded[idx - 1];
          ctx.globalAlpha = 1 - local / fade;
          if (prev) drawCover(ctx, prev, width, height, 1.16, 0, 0);
          ctx.globalAlpha = 1;
        }
        if (local > slideDur - fade && idx < slideCount - 1) {
          const next = loaded[idx + 1];
          ctx.globalAlpha = (local - (slideDur - fade)) / fade;
          if (next) drawCover(ctx, next, width, height, 1.06, 0, 0);
          ctx.globalAlpha = 1;
        }
      }

      // затемнение + виньетка
      const vg = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.78)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);

      // сетка
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.05;
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 64) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // сканлайны
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);

      // зерно
      ctx.save();
      ctx.globalAlpha = 0.25;
      const off = Math.floor(performance.now() / 60) % 128;
      ctx.drawImage(noise, -off, -off, width + 128, height + 128);
      ctx.restore();

      // заголовок
      const text = title || prompt || 'PSYCHIC';
      if (text) {
        ctx.save();
        ctx.font = '700 64px Bahnschrift, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = accent;
        ctx.shadowBlur = 34;
        ctx.fillStyle = 'rgba(255,255,255,0.94)';
        const chars = String(text).slice(0, 34);
        ctx.fillText(chars.toUpperCase(), width / 2, height * 0.82);
        ctx.shadowBlur = 0;
        ctx.font = '400 22px Consolas, monospace';
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.85;
        ctx.fillText('PSYCHIC // NEURAL CINEMA', width / 2, height * 0.82 + 40);
        ctx.restore();
      }

      // прогресс-бар
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(40, height - 28, width - 80, 3);
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      ctx.fillRect(40, height - 28, (width - 80) * (elapsed / totalSec), 3);
      ctx.shadowBlur = 0;

      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await stopped;
  try { audioEl?.pause(); } catch {}
  try { await audioCtx?.close(); } catch {}

  const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
  return {
    dataUrl: await blobToDataUrl(blob),
    mime: recorder.mimeType || 'video/webm',
    size: blob.size,
  };
}
