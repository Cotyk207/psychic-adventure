import React from 'react';
import { useApp } from '../lib/store';
import { cn, formatDuration } from '../lib/utils';
import Icon from './Icon';

export default function PlayerBar() {
  const { state, player } = useApp();
  const music = state.music || {};
  const track = music.current;

  if (!track) return null;

  const pct = music.duration ? Math.min(100, (music.position / music.duration) * 100) : 0;

  const seek = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    if (music.duration) player.seek(ratio * music.duration);
  };

  return (
    <div className="player-bar">
      <div className="player-art">
        <Icon name="music" size={16} />
      </div>

      <div className="player-meta">
        <div className="player-title truncate">{track.title || track.name || 'Без названия'}</div>
        <div className="player-artist truncate">{track.artist || 'PSYCHIC'}</div>
      </div>

      <div className="player-controls">
        <button className="player-btn" onClick={() => player.prev()} title="Предыдущий">
          <Icon name="skip-back" size={14} />
        </button>
        <button
          className={cn('player-btn play', music.playing && 'playing')}
          onClick={() => player.toggle()}
          title={music.playing ? 'Пауза' : 'Играть'}
        >
          <Icon name={music.playing ? 'pause' : 'play'} size={15} />
        </button>
        <button className="player-btn" onClick={() => player.next()} title="Следующий">
          <Icon name="skip-forward" size={14} />
        </button>
      </div>

      <div className="player-progress">
        <span className="player-time">{formatDuration(music.position)}</span>
        <div className="player-track" onClick={seek}>
          <div className="player-track-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="player-time">{formatDuration(music.duration)}</span>
      </div>

      <div className="player-extra">
        <div className="player-bars">
          {[0, 1, 2, 3, 4].map((i) => (
            <i
              key={i}
              style={{
                animationDelay: `${i * 0.12}s`,
                animationPlayState: music.playing ? 'running' : 'paused',
              }}
            />
          ))}
        </div>
        <button
          className="player-btn"
          onClick={() => player.setVolume(music.volume > 0 ? 0 : 0.7)}
          title={music.volume > 0 ? 'Выключить звук' : 'Включить звук'}
        >
          <Icon name={music.volume > 0 ? 'volume' : 'volume-x'} size={14} />
        </button>
        <input
          className="player-volume"
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={music.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          title="Громкость"
        />
        <button className="player-btn" onClick={() => player.stop()} title="Остановить">
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}
