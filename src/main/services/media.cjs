'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { get } = require('../lib/paths.cjs');
const { uid, sleep, truncate, formatBytes } = require('../lib/util.cjs');

const HORDE_CLIENT_AGENT = 'PSYCHIC:1.0.10:github.com/Cotyk207/psychic-adventure';

const STYLE_PRESETS = {
  auto: '',
  cyberpunk: 'cyberpunk style, neon lights, rain-soaked streets, holographic signs, high-tech low-life, cinematic lighting, ultra detailed, 8k',
  anime: 'anime style, studio quality, vibrant colors, detailed character, cinematic composition',
  photo: 'professional photography, 85mm lens, shallow depth of field, natural light, photorealistic, sharp focus',
  '3d': '3d render, octane, subsurface scattering, volumetric light, high poly, cinematic',
  oil: 'oil painting, textured brush strokes, classical composition, gallery quality',
  watercolor: 'watercolor painting, soft washes, paper texture, delicate details',
  pixel: 'pixel art, 16-bit, crisp pixels, limited palette, retro game aesthetic',
  logo: 'minimal logo design, vector style, flat colors, centered, white background, clean geometry',
  dark: 'dark moody atmosphere, dramatic rim light, deep shadows, gothic, high contrast',
  neon: 'neon glow, electric colors, dark background, glowing outlines, synthwave',
};

const NEGATIVE = 'lowres, blurry, watermark, text, deformed, extra limbs, bad anatomy, jpeg artifacts, cropped';

function extFromMime(mime = '') {
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  return 'bin';
}

const pending = new Map();

function rendererTask(send, kind, payload, timeoutMs = 240000) {
  const id = uid(12);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Генерация ${kind} заняла слишком много времени`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try {
      send('media:render', { id, kind, payload });
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

function resolveRendererTask(payload) {
  const item = pending.get(payload?.id);
  if (!item) return false;
  clearTimeout(item.timer);
  pending.delete(payload.id);
  if (payload.ok) item.resolve(payload);
  else item.reject(new Error(payload.error || 'Ошибка генерации'));
  return true;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function proceduralPngBuffer(prompt = '', { width = 512, height = 512 } = {}) {
  const w = Math.min(768, Math.max(128, Number(width) || 512));
  const h = Math.min(768, Math.max(128, Number(height) || 512));
  let seed = 2166136261;
  const s = String(prompt || 'PSYCHIC');
  for (let i = 0; i < s.length; i++) seed = Math.imul(seed ^ s.charCodeAt(i), 16777619) >>> 0;
  const accentR = 180 + (seed & 0x3f);
  const accentB = 200 + ((seed >>> 6) & 0x37);

  const stride = w * 3 + 1;
  const raw = Buffer.alloc(stride * h);
  const horizon = Math.floor(h * 0.62);
  const sunX = Math.floor(w * (0.35 + ((seed & 0xff) / 255) * 0.3));
  const sunY = Math.floor(horizon - h * 0.08);
  const sunR2 = Math.floor((Math.min(w, h) * 0.18) ** 2);

  for (let y = 0; y < h; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0; // filter None
    const isFloor = y >= horizon;
    const t = isFloor ? (y - horizon) / Math.max(1, h - horizon) : y / Math.max(1, horizon);
    for (let x = 0; x < w; x++) {
      let r;
      let g;
      let b;
      if (!isFloor) {
        r = Math.round(8 + t * 44);
        g = Math.round(6 + t * 18);
        b = Math.round(24 + t * 68);
        const dx = x - sunX;
        const dy = y - sunY;
        const d2 = dx * dx + dy * dy;
        if (d2 < sunR2) {
          const glow = 1 - d2 / sunR2;
          r = Math.min(255, Math.round(r + glow * accentR));
          g = Math.min(255, Math.round(g + glow * 70));
          b = Math.min(255, Math.round(b + glow * 150));
        }
      } else {
        const gridY = Math.abs(((t ** 0.55) * 14) % 1) < 0.08;
        const perspectiveX = ((x - w * 0.5) / Math.max(0.12, t)) / (w * 0.09);
        const gridX = Math.abs(perspectiveX - Math.round(perspectiveX)) < 0.06;
        if (gridX || gridY) {
          r = 16;
          g = 225;
          b = accentB;
        } else {
          r = Math.round(18 * (1 - t));
          g = Math.round(8 * (1 - t));
          b = Math.round(32 * (1 - t) + 10);
        }
      }
      const p = rowOff + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const compressed = zlib.deflateSync(raw, { level: 6 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return {
    buffer: Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]),
    mime: 'image/png',
    ext: 'png',
  };
}

function clampHordeDim(val, isAnon) {
  const max = isAnon ? 512 : 1024;
  const clamped = Math.min(max, Math.max(256, Number(val) || 512));
  return Math.max(256, Math.round(clamped / 64) * 64);
}

async function pollinationsImage(prompt, { width, height, seed, model = 'flux', apiKey = '' }) {
  const encoded = encodeURIComponent(prompt);
  const query = `?width=${width}&height=${height}&seed=${seed}&nologo=true&model=${encodeURIComponent(model)}`;
  const urls = apiKey
    ? [
        { url: `https://gen.pollinations.ai/image/${encoded}${query}`, headers: { Authorization: `Bearer ${apiKey}` } },
        { url: `https://image.pollinations.ai/prompt/${encoded}${query}&referrer=psychic`, headers: {} },
      ]
    : [
        { url: `https://image.pollinations.ai/prompt/${encoded}${query}&referrer=psychic`, headers: {} },
      ];

  let lastErr = null;
  for (const candidate of urls) {
    try {
      const res = await fetch(candidate.url, {
        headers: candidate.headers,
        signal: AbortSignal.timeout(35000),
      });
      if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
      const mime = res.headers.get('content-type') || 'image/jpeg';
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 64) throw new Error('Pollinations вернул пустой ответ');
      return { buffer, mime, ext: extFromMime(mime) };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Pollinations недоступен');
}

async function hordeImage(prompt, { width, height, negative, apiKey = '' }) {
  const key = String(apiKey || '').trim() || '0000000000';
  const isAnon = key === '0000000000';
  const w = clampHordeDim(width, isAnon);
  const h = clampHordeDim(height, isAnon);
  const commonHeaders = {
    'Content-Type': 'application/json',
    apikey: key,
    'Client-Agent': HORDE_CLIENT_AGENT,
  };
  const body = {
    prompt: `${prompt} ### ${negative || NEGATIVE}`,
    params: {
      steps: isAnon ? 20 : 24,
      width: w,
      height: h,
      cfg_scale: 7,
      sampler_name: 'k_euler',
      n: 1,
    },
    nsfw: false,
    censor_nsfw: true,
    models: ['AlbedoBase XL (SDXL)', 'ICBINP - I Can\'t Believe It\'s Not Photography', 'stable_diffusion'],
    r2: true,
  };

  let baseApi = 'https://aihorde.net/api/v2';
  let res = await fetch(`${baseApi}/generate/async`, {
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  }).catch(() => null);

  if (!res || !res.ok) {
    // Пробуем резервный домен и только базовую модель stable_diffusion (минимальный расход kudos)
    baseApi = 'https://stablehorde.net/api/v2';
    body.models = ['stable_diffusion'];
    res = await fetch(`${baseApi}/generate/async`, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`AI Horde HTTP ${res.status}${errText ? `: ${truncate(errText, 180)}` : ''}`);
  }
  const { id } = await res.json();
  if (!id) throw new Error('AI Horde не принял запрос');

  const statusHeaders = { apikey: key, 'Client-Agent': HORDE_CLIENT_AGENT };
  for (let i = 0; i < 45; i++) {
    await sleep(3000);
    const check = await fetch(`${baseApi}/generate/check/${id}`, { headers: statusHeaders });
    if (!check.ok) continue;
    const status = await check.json();
    if (status.faulted) throw new Error('AI Horde: генерация не удалась');
    if (status.done) {
      const done = await fetch(`${baseApi}/generate/status/${id}`, { headers: statusHeaders });
      const json = await done.json();
      const imageVal = json.generations?.[0]?.img;
      if (!imageVal) throw new Error('AI Horde: пустой результат');
      if (/^https?:\/\//i.test(imageVal)) {
        const img = await fetch(imageVal);
        const mime = img.headers.get('content-type') || 'image/webp';
        return { buffer: Buffer.from(await img.arrayBuffer()), mime, ext: extFromMime(mime) };
      }
      return { buffer: Buffer.from(imageVal, 'base64'), mime: 'image/webp', ext: 'webp' };
    }
  }
  throw new Error('AI Horde: очередь слишком долгая, попробуй ещё раз');
}

async function openAiImage(prompt, { width, height, baseUrl, apiKey, model }) {
  if (!baseUrl) throw new Error('Не задан Base URL для генерации картинок (Настройки → Медиа)');
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model || 'dall-e-3',
      prompt,
      n: 1,
      size: `${width}x${height}`,
      response_format: 'b64_json',
    }),
    signal: AbortSignal.timeout(180000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message || `Images API HTTP ${res.status}`);
  const b64 = json.data?.[0]?.b64_json;
  if (b64) return { buffer: Buffer.from(b64, 'base64'), mime: 'image/png', ext: 'png' };
  const url = json.data?.[0]?.url;
  if (url) {
    const img = await fetch(url);
    const mime = img.headers.get('content-type') || 'image/png';
    return { buffer: Buffer.from(await img.arrayBuffer()), mime, ext: extFromMime(mime) };
  }
  throw new Error('API не вернул изображение');
}

async function huggingFaceImage(prompt, { width, height, token, model }) {
  if (!token) throw new Error('Нужен Hugging Face токен (Настройки → Медиа)');
  const res = await fetch(`https://api-inference.huggingface.co/models/${model || 'black-forest-labs/FLUX.1-schnell'}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { num_inference_steps: 4, width, height },
    }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HuggingFace HTTP ${res.status}: ${truncate(text, 300)}`);
  }
  const mime = res.headers.get('content-type') || 'image/png';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime, ext: extFromMime(mime) };
}

async function huggingFaceMusic(prompt, { token, duration }) {
  if (!token) throw new Error('Нужен Hugging Face токен (Настройки → Медиа)');
  const res = await fetch('https://api-inference.huggingface.co/models/facebook/musicgen-small', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: Math.min(1500, Math.max(256, duration * 50)) } }),
    signal: AbortSignal.timeout(240000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HuggingFace HTTP ${res.status}: ${truncate(text, 300)}`);
  }
  const mime = res.headers.get('content-type') || 'audio/wav';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime, ext: extFromMime(mime) };
}

async function replicatePredict(model, input, apiKey, { timeoutMs = 300000 } = {}) {
  if (!apiKey) throw new Error('Нужен Replicate API-токен (Настройки → Медиа)');
  const create = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait',
    },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await create.json().catch(() => ({}));
  if (!create.ok) throw new Error(json.detail || `Replicate HTTP ${create.status}`);
  let prediction = json;
  const started = Date.now();
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
    if (Date.now() - started > timeoutMs) throw new Error('Replicate: таймаут');
    await sleep(4000);
    const res = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    prediction = await res.json();
  }
  if (prediction.status !== 'succeeded') {
    throw new Error(prediction.error || `Replicate: статус ${prediction.status}`);
  }
  return prediction.output;
}

async function replicateMusic(prompt, { apiKey, duration }) {
  const output = await replicatePredict(
    'meta/musicgen',
    { prompt, duration: Math.min(30, Math.max(5, duration || 15)), model_version: 'stereo-large', output_format: 'mp3', normalization_strategy: 'peak' },
    apiKey,
    { timeoutMs: 300000 }
  );
  const url = Array.isArray(output) ? output[0] : output;
  if (!url) throw new Error('Replicate не вернул аудио');
  const res = await fetch(url);
  const mime = res.headers.get('content-type') || 'audio/mpeg';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime, ext: extFromMime(mime) };
}

async function replicateVideo(prompt, { apiKey, duration, image }) {
  const input = { prompt, duration: Math.min(10, Math.max(3, duration || 5)) };
  if (image) input.first_frame_image = image;
  const output = await replicatePredict('minimax/video-01', input, apiKey, { timeoutMs: 600000 });
  const url = typeof output === 'string' ? output : output?.video || output?.[0];
  if (!url) throw new Error('Replicate не вернул видео');
  const res = await fetch(url);
  const mime = res.headers.get('content-type') || 'video/mp4';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime, ext: extFromMime(mime) };
}

class MediaService {
  constructor({ store, send }) {
    this.store = store;
    this.send = send;
  }

  async renderProceduralImage({ prompt, width, height }) {
    return proceduralPngBuffer(prompt, { width, height });
  }

  async generateImage({ prompt, style = 'auto', width, height, count = 1 }, { signal } = {}) {
    const cfg = this.store.get('media') || {};
    const providersList = this.store.get('providers') || [];
    const polliProvider = providersList.find((p) => p.id === 'pollinations');
    const provider = cfg.imageProvider || 'pollinations';
    const w = Math.min(2048, Math.max(256, Number(width) || cfg.defaultWidth || 1024));
    const h = Math.min(2048, Math.max(256, Number(height) || cfg.defaultHeight || 1024));
    const fullPrompt = [String(prompt || '').trim(), STYLE_PRESETS[style] || ''].filter(Boolean).join(', ');
    if (!fullPrompt) throw new Error('Пустой промпт');

    const total = Math.min(4, Math.max(1, Number(count) || 1));
    const files = [];
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('Отменено');
      const seed = Math.floor(Math.random() * 1e9);
      let result;
      let usedProvider = provider;
      if (provider === 'procedural') {
        result = await this.renderProceduralImage({ prompt: fullPrompt, style, width: w, height: h, seed });
      } else if (provider === 'pollinations') {
        try {
          result = await pollinationsImage(fullPrompt, {
            width: w,
            height: h,
            seed,
            model: cfg.imageModel || 'flux',
            apiKey: polliProvider?.apiKey || '',
          });
        } catch {
          try {
            usedProvider = 'stablehorde';
            result = await hordeImage(fullPrompt, { width: w, height: h, negative: NEGATIVE });
          } catch {
            usedProvider = 'procedural';
            result = await this.renderProceduralImage({ prompt: fullPrompt, style, width: w, height: h, seed });
          }
        }
      } else if (provider === 'stablehorde') {
        try {
          result = await hordeImage(fullPrompt, { width: w, height: h, negative: NEGATIVE });
        } catch {
          usedProvider = 'procedural';
          result = await this.renderProceduralImage({ prompt: fullPrompt, style, width: w, height: h, seed });
        }
      } else if (provider === 'openai') {
        result = await openAiImage(fullPrompt, { width: w, height: h, baseUrl: cfg.imageBaseUrl, apiKey: cfg.imageApiKey, model: cfg.imageModel });
      } else if (provider === 'huggingface') {
        result = await huggingFaceImage(fullPrompt, { width: w, height: h, token: cfg.hfToken, model: cfg.imageModel });
      } else {
        throw new Error(`Неизвестный провайдер картинок: ${provider}`);
      }
      const name = `image-${Date.now()}-${i}.${result.ext}`;
      const file = path.join(get().images, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, result.buffer);
      const dataUrl = `data:${result.mime};base64,${result.buffer.toString('base64')}`;
      files.push({ path: file, name, mime: result.mime, size: result.buffer.length, dataUrl, width: w, height: h, prompt: fullPrompt, provider: usedProvider });
    }
    return {
      files,
      text: `🖼 Сгенерировано изображений: ${files.length}\n${files.map((f) => `${f.path} (${formatBytes(f.size)})`).join('\n')}`,
      images: files.map((f) => ({
        name: f.name, mimeType: f.mime, data: f.dataUrl.split(',')[1], dataUrl: f.dataUrl, path: f.path,
      })),
    };
  }

  async generateMusic({ prompt, genre = 'synthwave', duration = 45 }, { signal } = {}) {
    const cfg = this.store.get('media') || {};
    const provider = cfg.musicProvider || 'procedural';
    const seconds = Math.min(180, Math.max(10, Number(duration) || 45));
    let result;
    if (provider === 'procedural') {
      const res = await rendererTask(this.send, 'music', { prompt, genre, duration: seconds }, 240000);
      result = { buffer: Buffer.from(String(res.dataUrl).split(',')[1], 'base64'), mime: 'audio/wav', ext: 'wav' };
    } else if (provider === 'huggingface') {
      result = await huggingFaceMusic(`${genre}. ${prompt}`, { token: cfg.hfToken, duration: seconds });
    } else if (provider === 'replicate') {
      result = await replicateMusic(`${genre}. ${prompt}`, { apiKey: cfg.replicateKey, duration: seconds });
    } else {
      throw new Error(`Неизвестный музыкальный провайдер: ${provider}`);
    }
    const name = `music-${Date.now()}.${result.ext}`;
    const file = path.join(get().music, name);
    fs.writeFileSync(file, result.buffer);
    return {
      file,
      text: `🎵 Трек создан: ${file}\nДлительность: ~${seconds} c, размер ${formatBytes(result.buffer.length)}`,
      data: { path: file, mime: result.mime, duration: seconds, provider },
    };
  }

  async generateVideo({ prompt, duration = 10, images = [] }, { signal } = {}) {
    const cfg = this.store.get('media') || {};
    const provider = cfg.videoProvider || 'slideshow';
    const seconds = Math.min(60, Math.max(3, Number(duration) || 10));

    if (provider === 'slideshow') {
      const imageData = [];
      for (const p of images.slice(0, 8)) {
        try {
          const buf = fs.readFileSync(p);
          const ext = path.extname(p).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          imageData.push({ dataUrl: `data:${mime};base64,${buf.toString('base64')}`, path: p });
        } catch {}
      }
      const res = await rendererTask(this.send, 'video', { prompt, duration: seconds, images: imageData }, 300000);
      const buffer = Buffer.from(String(res.dataUrl).split(',')[1], 'base64');
      const name = `video-${Date.now()}.${res.ext || 'webm'}`;
      const file = path.join(get().video, name);
      fs.writeFileSync(file, buffer);
      return {
        file,
        text: `🎬 Видео создано: ${file}\nДлительность: ~${seconds} c, размер ${formatBytes(buffer.length)}`,
        data: { path: file, mime: res.mime || 'video/webm', duration: seconds, provider: 'slideshow' },
      };
    }

    if (provider === 'replicate') {
      const result = await replicateVideo(prompt, { apiKey: cfg.replicateKey, duration: seconds, image: images[0] });
      const name = `video-${Date.now()}.${result.ext}`;
      const file = path.join(get().video, name);
      fs.writeFileSync(file, result.buffer);
      return {
        file,
        text: `🎬 Видео создано: ${file}`,
        data: { path: file, mime: result.mime, duration: seconds, provider: 'replicate' },
      };
    }

    throw new Error(`Неизвестный видео-провайдер: ${provider}`);
  }

  list(type = 'all') {
    const dirs = {
      images: get().images,
      music: get().music,
      video: get().video,
      screenshots: get().screenshots,
    };
    const out = [];
    const targets = type === 'all' ? Object.entries(dirs) : [[type, dirs[type]]];
    for (const [kind, dir] of targets) {
      if (!dir || !fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;
          const ext = path.extname(name).toLowerCase();
          out.push({
            name, path: full, kind, ext, size: st.size,
            created: st.birthtime?.toISOString?.() || st.birthtime,
            modified: st.mtime?.toISOString?.() || st.mtime,
            mime: kind === 'images' ? 'image/*' : kind === 'music' ? 'audio/*' : 'video/*',
          });
        } catch {}
      }
    }
    return out.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  }

  dataUrl(file, { maxBytes = 80 * 1024 * 1024 } = {}) {
    const st = fs.statSync(file);
    if (st.size > maxBytes) throw new Error(`Файл слишком большой (${formatBytes(st.size)})`);
    const ext = path.extname(file).toLowerCase();
    const mime = {
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
      '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
    }[ext] || 'application/octet-stream';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  }

  remove(file) {
    const allowed = [get().images, get().music, get().video, get().screenshots, get().attachments];
    if (!allowed.some((dir) => path.resolve(file).startsWith(path.resolve(dir)))) {
      throw new Error('Удалять можно только файлы из библиотеки PSYCHIC');
    }
    fs.rmSync(file, { force: true });
    return true;
  }

  setWallpaper(source) {
    const dir = get().themes;
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, 'custom-wallpaper' + path.extname(source));
    fs.copyFileSync(source, target);
    return target;
  }
}

module.exports = {
  MediaService, resolveRendererTask, STYLE_PRESETS, HORDE_CLIENT_AGENT,
  pollinationsImage, hordeImage, openAiImage, huggingFaceImage,
  huggingFaceMusic, replicateMusic, replicateVideo, replicatePredict,
  proceduralPngBuffer, clampHordeDim,
};
