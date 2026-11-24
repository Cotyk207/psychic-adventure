/**
 * Процедурный синтезатор: генерирует настоящий музыкальный трек
 * прямо в браузере через Web Audio API (без внешних API и ключей).
 */

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const PROGRESSIONS = {
  synthwave: {
    bpm: 104,
    bars: [
      { root: 45, chord: [57, 60, 64] },
      { root: 41, chord: [53, 57, 60] },
      { root: 48, chord: [48, 52, 55] },
      { root: 43, chord: [55, 59, 62] },
    ],
    kick: [0, 2], snare: [1, 3], hat: 0.25, bass: 0.5, arp: true, lead: true,
    padGain: 0.09, bassGain: 0.16, arpGain: 0.05,
  },
  ambient: {
    bpm: 72,
    bars: [
      { root: 48, chord: [48, 52, 55, 59] },
      { root: 45, chord: [45, 48, 52, 55] },
      { root: 41, chord: [41, 45, 48, 52] },
      { root: 43, chord: [43, 47, 50, 52] },
    ],
    kick: [], snare: [], hat: 0, bass: 2, arp: true, lead: false,
    padGain: 0.14, bassGain: 0.08, arpGain: 0.035,
  },
  dark: {
    bpm: 96,
    bars: [
      { root: 50, chord: [50, 53, 57] },
      { root: 46, chord: [46, 50, 53] },
      { root: 41, chord: [41, 45, 48] },
      { root: 45, chord: [45, 49, 52] },
    ],
    kick: [0, 2], snare: [1, 3], hat: 0.5, bass: 0.5, arp: true, lead: false,
    padGain: 0.1, bassGain: 0.18, arpGain: 0.04,
  },
  house: {
    bpm: 122,
    bars: [
      { root: 41, chord: [41, 45, 48, 52] },
      { root: 40, chord: [40, 43, 47, 50] },
      { root: 38, chord: [38, 41, 45, 48] },
      { root: 36, chord: [36, 40, 43, 47] },
    ],
    kick: [0, 1, 2, 3], snare: [1, 3], hat: 0.25, bass: 0.25, arp: false, lead: true,
    padGain: 0.08, bassGain: 0.17, arpGain: 0.04,
  },
  lofi: {
    bpm: 82,
    bars: [
      { root: 45, chord: [45, 48, 52, 55] },
      { root: 38, chord: [38, 41, 45, 48] },
      { root: 43, chord: [43, 47, 50, 53] },
      { root: 36, chord: [36, 40, 43, 47] },
    ],
    kick: [0, 2], snare: [1, 3], hat: 0.5, bass: 1, arp: true, lead: false,
    padGain: 0.12, bassGain: 0.12, arpGain: 0.04,
  },
  cinematic: {
    bpm: 90,
    bars: [
      { root: 48, chord: [48, 52, 55, 60] },
      { root: 43, chord: [43, 47, 50, 55] },
      { root: 45, chord: [45, 48, 52, 57] },
      { root: 41, chord: [41, 45, 48, 53] },
    ],
    kick: [0], snare: [2], hat: 0, bass: 1, arp: true, lead: true,
    padGain: 0.16, bassGain: 0.12, arpGain: 0.05,
  },
  techno: {
    bpm: 128,
    bars: [
      { root: 45, chord: [45, 48, 52] },
      { root: 45, chord: [45, 48, 52] },
      { root: 41, chord: [41, 45, 48] },
      { root: 43, chord: [43, 47, 50] },
    ],
    kick: [0, 1, 2, 3], snare: [1, 3], hat: 0.125, bass: 0.25, arp: true, lead: false,
    padGain: 0.06, bassGain: 0.19, arpGain: 0.045,
  },
};

function createNoise(ctx, seconds = 2) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function makeImpulse(ctx, seconds = 2.6, decay = 2.4) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function env(ctx, param, time, peak, attack, decay, sustain = 0.0001, hold = 0) {
  param.setValueAtTime(0.0001, time);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
  if (hold > 0) param.setValueAtTime(Math.max(0.0002, peak), time + attack + hold);
  param.exponentialRampToValueAtTime(Math.max(0.0001, sustain), time + attack + hold + decay);
}

function kick(ctx, dest, time, gain = 1) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(155, time);
  osc.frequency.exponentialRampToValueAtTime(44, time + 0.11);
  const g = ctx.createGain();
  env(ctx, g.gain, time, 0.9 * gain, 0.004, 0.32, 0.0001);
  osc.connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + 0.45);
  const click = ctx.createBufferSource();
  click.buffer = createNoise(ctx, 0.05);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const cg = ctx.createGain();
  env(ctx, cg.gain, time, 0.12 * gain, 0.001, 0.03, 0.0001);
  click.connect(hp).connect(cg).connect(dest);
  click.start(time);
}

function snare(ctx, dest, time, gain = 0.5, noiseBuf) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  env(ctx, g.gain, time, gain, 0.002, 0.18, 0.0001);
  src.connect(bp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + 0.25);
  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(190, time);
  body.frequency.exponentialRampToValueAtTime(120, time + 0.08);
  const bg = ctx.createGain();
  env(ctx, bg.gain, time, gain * 0.5, 0.002, 0.1, 0.0001);
  body.connect(bg).connect(dest);
  body.start(time);
  body.stop(time + 0.15);
}

function hat(ctx, dest, time, gain = 0.18, noiseBuf, open = false) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7200;
  const g = ctx.createGain();
  env(ctx, g.gain, time, gain, 0.001, open ? 0.22 : 0.045, 0.0001);
  src.connect(hp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + (open ? 0.3 : 0.08));
}

function bassNote(ctx, dest, time, freq, dur, gain = 0.16) {
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = freq;
  const osc2 = ctx.createOscillator();
  osc2.type = 'square';
  osc2.frequency.value = freq / 2;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(520, time);
  filter.frequency.exponentialRampToValueAtTime(220, time + dur);
  filter.Q.value = 3;
  const g = ctx.createGain();
  env(ctx, g.gain, time, gain, 0.008, dur * 0.9, 0.0001);
  osc.connect(filter);
  osc2.connect(filter);
  filter.connect(g).connect(dest);
  osc.start(time);
  osc2.start(time);
  osc.stop(time + dur + 0.05);
  osc2.stop(time + dur + 0.05);
}

function pad(ctx, dest, time, freqs, dur, gain = 0.09) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(700, time);
  filter.frequency.linearRampToValueAtTime(1500, time + dur * 0.4);
  filter.frequency.linearRampToValueAtTime(800, time + dur);
  filter.Q.value = 0.6;
  const g = ctx.createGain();
  env(ctx, g.gain, time, gain, Math.min(1.2, dur * 0.25), dur * 0.7, 0.0001, dur * 0.1);
  filter.connect(g).connect(dest);
  for (const f of freqs) {
    for (const detune of [-6, 0, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + dur + 0.1);
    }
  }
}

function pluck(ctx, dest, time, freq, gain = 0.06, type = 'triangle', decay = 0.25) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(4200, time);
  filter.frequency.exponentialRampToValueAtTime(900, time + decay);
  const g = ctx.createGain();
  env(ctx, g.gain, time, gain, 0.004, decay, 0.0001);
  osc.connect(filter).connect(g).connect(dest);
  osc.start(time);
  osc.stop(time + decay + 0.05);
}

function riser(ctx, dest, time, dur, noiseBuf, gain = 0.06) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(300, time);
  bp.frequency.exponentialRampToValueAtTime(8000, time + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(gain, time + dur * 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  src.connect(bp).connect(g).connect(dest);
  src.start(time);
  src.stop(time + dur + 0.05);
}

export async function renderTrack({ genre = 'synthwave', duration = 45, prompt = '' } = {}) {
  const preset = PROGRESSIONS[genre] || PROGRESSIONS.synthwave;
  const sampleRate = 44100;
  const total = Math.min(180, Math.max(8, Number(duration) || 45));
  const length = Math.ceil(total * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);

  const noiseBuf = createNoise(ctx, 2);
  const master = ctx.createGain();
  master.gain.value = 0.82;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 24;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.22;
  master.connect(compressor).connect(ctx.destination);

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 3.2, 2.6);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.34;
  reverb.connect(reverbGain).connect(master);

  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = (60 / preset.bpm) * 0.75;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = 'lowpass';
  delayFilter.frequency.value = 2600;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.22;
  delay.connect(delayFilter).connect(feedback).connect(delay);
  delay.connect(delayGain).connect(master);

  const bus = (send = 0.2) => {
    const g = ctx.createGain();
    g.connect(master);
    const sendGain = ctx.createGain();
    sendGain.gain.value = send;
    g.connect(sendGain).connect(reverb);
    return g;
  };

  const drums = bus(0.12);
  const pads = bus(0.4);
  const basses = bus(0.08);
  const arps = bus(0.35);
  const leads = bus(0.45);

  const beat = 60 / preset.bpm;
  const bar = beat * 4;
  const bars = Math.ceil(total / bar) + 1;
  const chordNotes = preset.bars[0].chord;

  for (let b = 0; b < bars; b++) {
    const t = b * bar;
    if (t >= total) break;
    const prog = preset.bars[b % preset.bars.length];
    const remaining = Math.max(0.2, total - t);

    // Pad
    pad(ctx, pads, t, prog.chord.map(midi), Math.min(bar, remaining), preset.padGain);

    // Bass
    if (preset.bass > 0) {
      const steps = Math.floor(4 / preset.bass);
      for (let i = 0; i < steps; i++) {
        const bt = t + i * beat * preset.bass;
        if (bt >= total) break;
        const octave = i % 4 === 3 ? 12 : 0;
        bassNote(ctx, basses, bt, midi(prog.root + octave), beat * preset.bass * 0.9, preset.bassGain);
      }
    }

    // Drums
    for (const k of preset.kick) {
      const kt = t + k * beat;
      if (kt < total) kick(ctx, drums, kt, 1);
    }
    for (const s of preset.snare) {
      const st = t + s * beat;
      if (st < total) snare(ctx, drums, st, 0.45, noiseBuf);
    }
    if (preset.hat > 0) {
      const hatSteps = Math.floor(4 / preset.hat);
      for (let i = 0; i < hatSteps; i++) {
        const ht = t + i * beat * preset.hat;
        if (ht < total) hat(ctx, drums, ht, i % 2 === 0 ? 0.11 : 0.07, noiseBuf, i % 4 === 3);
      }
    }

    // Arp
    if (preset.arp) {
      const arpPattern = [0, 1, 2, 1, 0, 2, 1, 2];
      const step = beat / 2;
      for (let i = 0; i < 8; i++) {
        const at = t + i * step;
        if (at >= total) break;
        const note = prog.chord[arpPattern[i] % prog.chord.length] + (i >= 4 ? 12 : 0);
        pluck(ctx, arps, at, midi(note), preset.arpGain, 'square', 0.18);
        if (i % 2 === 0) {
          const dl = ctx.createGain();
          dl.gain.value = 0.5;
          pluck(ctx, dl, at, midi(note + 12), preset.arpGain * 0.4, 'triangle', 0.2);
        }
      }
    }

    // Lead melody every other bar
    if (preset.lead && b % 2 === 0) {
      const scale = [0, 3, 5, 7, 10, 12, 15];
      const base = prog.root + 24;
      const pattern = [0, 2, 4, 2, 3, 1, 4, 5];
      for (let i = 0; i < pattern.length; i++) {
        const lt = t + i * (beat / 2);
        if (lt >= total) break;
        if (i % 3 === 0) {
          pluck(ctx, leads, lt, midi(base + scale[pattern[i] % scale.length]), 0.07, 'sawtooth', 0.4);
        }
      }
    }

    if (b % 4 === 3 && t + bar < total) riser(ctx, pads, t + bar * 0.5, bar * 0.45, noiseBuf, 0.05);
  }

  const rendered = await ctx.startRendering();
  return { buffer: rendered, duration: total };
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

export function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const len = buffer.length;
  const blockAlign = numCh * 2;
  const dataSize = len * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numCh; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function generateMusicDataUrl(opts) {
  const { buffer } = await renderTrack(opts);
  const wav = audioBufferToWav(buffer);
  const base64 = await blobToBase64(wav);
  return { dataUrl: `data:audio/wav;base64,${base64}`, duration: buffer.duration, size: wav.size };
}

export const MUSIC_GENRES = Object.keys(PROGRESSIONS);
