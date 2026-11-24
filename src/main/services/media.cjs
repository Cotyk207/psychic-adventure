'use strict';

const fs = require('fs');
const path = require('path');
const { get } = require('../lib/paths');
const { uid, sleep, truncate, formatBytes } = require('../lib/util');

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

async function pollinationsImage(prompt, { width, height, seed, model = 'flux' }) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
    + `?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=true`
    + `&model=${encodeURIComponent(model)}&referrer=psychic`;
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`Pollinations HTTP ${res.status}`);
  const mime = res.headers.get('content-type') || 'image/jpeg';
  return { buffer: Buffer.from(await res.arrayBuffer()), mime, ext: extFromMime(mime) };
}

async function hordeImage(prompt, { width, height, negative }) {
  const API = 'https://stablehorde.net/api/v2';
  const key = '0000000000';
  const body = {
    prompt: `${prompt} ### ${negative || NEGATIVE}`,
    params: {
      s: String(Date.now() % 100000), steps: 24, width, height,
      cfg_scale: 7, sampler_name: 'k_euler', n: 1,
    },
    nsfw: false,
    censor_nsfw: true,
    models: ['stable_diffusion'],
    r2: true,
  };
  const res = await fetch(`${API}/generate/async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Stable Horde HTTP ${res.status}`);
  const { id } = await res.json();
  if (!id) throw new Error('Stable Horde не принял запрос');

  for (let i = 0; i < 80; i++) {
    await sleep(3000);
    const check = await fetch(`${API}/generate/check/${id}`, { headers: { apikey: key } });
    const status = await check.json();
    if (status.faulted) throw new Error('Stable Horde: генерация не удалась');
    if (status.done) {
      const done = await fetch(`${API}/generate/status/${id}`, { headers: { apikey: key } });
      const json = await done.json();
      const imageUrl = json.generations?.[0]?.img;
      if (!imageUrl) throw new Error('Stable Horde: пустой результат');
      const img = await fetch(imageUrl);
      const mime = img.headers.get('content-type') || 'image/png';
      return { buffer: Buffer.from(await img.arrayBuffer()), mime, ext: extFromMime(mime) };
    }
  }
  throw new Error('Stable Horde: очередь слишком долгая, попробуй ещё раз');
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

  async generateImage({ prompt, style = 'auto', width, height, count = 1 }, { signal } = {}) {
    const cfg = this.store.get('media') || {};
    const provider = cfg.imageProvider || 'pollinations';
    const w = Math.min(2048, Math.max(256, Number(width) || cfg.defaultWidth || 1024));
    const h = Math.min(2048, Math.max(256, Number(height) || cfg.defaultHeight || 1024));
    const fullPrompt = [String(prompt || '').trim(), STYLE_PRESETS[style] || ''].filter(Boolean).join(', ');
    if (!fullPrompt) throw new Error('Пустой промпт');

    const total = Math.min(4, Math.max(1, Number(count) || 1));
    const files = [];
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error('Отменено');
      let result;
      if (provider === 'pollinations') {
        result = await pollinationsImage(fullPrompt, { width: w, height: h, seed: Math.floor(Math.random() * 1e9), model: cfg.imageModel || 'flux' });
      } else if (provider === 'stablehorde') {
        result = await hordeImage(fullPrompt, { width: w, height: h, negative: NEGATIVE });
      } else if (provider === 'openai') {
        result = await openAiImage(fullPrompt, { width: w, height: h, baseUrl: cfg.imageBaseUrl, apiKey: cfg.imageApiKey, model: cfg.imageModel });
      } else if (provider === 'huggingface') {
        result = await huggingFaceImage(fullPrompt, { width: w, height: h, token: cfg.hfToken, model: cfg.imageModel });
      } else {
        throw new Error(`Неизвестный провайдер картинок: ${provider}`);
      }
      const name = `image-${Date.now()}-${i}.${result.ext}`;
      const file = path.join(get().images, name);
      fs.writeFileSync(file, result.buffer);
      const dataUrl = `data:${result.mime};base64,${result.buffer.toString('base64')}`;
      files.push({ path: file, name, mime: result.mime, size: result.buffer.length, dataUrl, width: w, height: h, prompt: fullPrompt, provider });
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
  MediaService, resolveRendererTask, STYLE_PRESETS,
  pollinationsImage, hordeImage, openAiImage, huggingFaceImage,
  huggingFaceMusic, replicateMusic, replicateVideo, replicatePredict,
};
