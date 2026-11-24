import { invoke } from './api';

function scoreTrack(track, q) {
  if (!q) return 1;
  const hay = `${track.title || ''} ${track.artist || ''} ${track.album || ''} ${track.genre || ''}`.toLowerCase();
  let score = 0;
  for (const word of q.split(/\s+/).filter(Boolean)) {
    if (hay.includes(word)) score += 3;
    else if ((track.title || '').toLowerCase().startsWith(word)) score += 1;
  }
  return score;
}

class MusicPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0.7;
    this.queue = [];
    this.index = -1;
    this.library = [];
    this.playing = false;
    this.position = 0;
    this.duration = 0;
    this.current = null;
    this.loading = false;
    this.error = null;
    this.listeners = new Set();

    this.audio.addEventListener('play', () => { this.playing = true; this.emit(); });
    this.audio.addEventListener('pause', () => { this.playing = false; this.emit(); });
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('timeupdate', () => {
      this.position = this.audio.currentTime || 0;
      this.duration = this.audio.duration || 0;
      this.emit();
    });
    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration || 0;
      this.emit();
    });
    this.audio.addEventListener('error', () => {
      this.error = 'Не удалось воспроизвести файл';
      this.playing = false;
      this.emit();
    });
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) {
      try { fn(this.getState()); } catch {}
    }
  }

  getState() {
    return {
      queue: this.queue,
      index: this.index,
      current: this.current,
      playing: this.playing,
      position: this.position,
      duration: this.duration,
      volume: this.audio.volume,
      library: this.library,
      loading: this.loading,
      error: this.error,
    };
  }

  async loadLibrary() {
    try {
      const lib = await invoke('music:library');
      this.library = Array.isArray(lib) ? lib : [];
      this.emit();
      return this.library;
    } catch {
      return [];
    }
  }

  async playTrack(track) {
    if (!track) return;
    this.loading = true;
    this.error = null;
    this.emit();
    try {
      const isRemote = /^https?:/i.test(track.path || track.url || '');
      const source = isRemote ? (track.path || track.url) : await invoke('media:dataUrl', { path: track.path });
      this.audio.src = source;
      await this.audio.play();
      this.current = { ...track, path: track.path || track.url };
    } catch (err) {
      this.error = err.message || 'Ошибка воспроизведения';
      this.playing = false;
    } finally {
      this.loading = false;
      this.emit();
    }
  }

  async playIndex(i) {
    const track = this.queue[i];
    if (!track) return;
    this.index = i;
    await this.playTrack(track);
  }

  async playLibraryIndex(i) {
    if (!this.library.length) await this.loadLibrary();
    this.queue = this.library.slice();
    this.index = i;
    await this.playTrack(this.queue[i]);
  }

  async playQuery(query) {
    if (!this.library.length) await this.loadLibrary();
    const q = String(query || '').toLowerCase().trim();
    if (!q) {
      if (this.library.length) {
        this.queue = this.library.slice(0, 30);
        await this.playIndex(0);
        return this.queue[0];
      }
      throw new Error('Музыкальная библиотека пуста');
    }
    const scored = this.library
      .map((t) => ({ t, score: scoreTrack(t, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!scored.length) {
      throw new Error(`В библиотеке нет треков по запросу «${query}». Добавь музыку в папку Music или Media.`);
    }
    this.queue = scored.slice(0, 30).map((x) => x.t);
    await this.playIndex(0);
    return this.queue[0];
  }

  pause() {
    this.audio.pause();
  }

  resume() {
    if (this.audio.src) this.audio.play().catch(() => {});
  }

  toggle() {
    if (this.playing) this.pause();
    else this.resume();
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.playing = false;
    this.emit();
  }

  next() {
    if (!this.queue.length) return;
    const next = (this.index + 1) % this.queue.length;
    this.playIndex(next);
  }

  prev() {
    if (!this.queue.length) return;
    const prev = (this.index - 1 + this.queue.length) % this.queue.length;
    this.playIndex(prev);
  }

  setVolume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v));
    this.emit();
  }

  seek(sec) {
    this.audio.currentTime = sec;
  }
}

export const player = new MusicPlayer();
