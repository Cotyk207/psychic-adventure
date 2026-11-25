import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke, isAndroidApp } from '../lib/api';
import { cn, formatDuration } from '../lib/utils';
import Icon from './Icon';

const SOURCE = [
  ['library', 'Библиотека', 'music'],
  ['generate', 'Генератор', 'wand'],
  ['radio', 'Радио', 'radio'],
];

export default function MusicPanel() {
  const { state, toast, player } = useApp();
  const [tab, setTab] = useState('library');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genre, setGenre] = useState('synthwave');
  const [duration, setDuration] = useState(30);
  const [prompt, setPrompt] = useState('');
  const [stations, setStations] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const current = state.music || {};

  useEffect(() => {
    setLoading(true);
    invoke('music:library')
      .then((result) => setTracks(Array.isArray(result) ? result : result?.tracks || []))
      .catch((err) => toast(err.message, 'error', 'Музыка'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'radio') return;
    invoke('music:radioList')
      .then((result) => setStations(result?.stations || []))
      .catch(() => {});
  }, [tab]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
  }, [tracks, search]);

  const play = async (track, index) => {
    if (current?.current?.path === track.path) {
      player.toggle();
      return;
    }
    setBusyId(track.path);
    try {
      player.queue = filtered;
      player.index = index;
      await player.playTrack(track);
    } catch (err) {
      toast(err.message || player.error, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const result = await invoke('media:generateMusic', {
        prompt: prompt || 'space ambient synthwave',
        genre,
        duration,
      });
      const file = result?.file;
      if (file) {
        const dataUrl = await invoke('media:dataUrl', { path: file });
        const name = String(file).split(/[\\/]/).pop();
        const track = {
          path: file, name, title: name.replace(/\.[^.]+$/, ''), artist: 'PSYCHIC', duration: result.duration || duration,
        };
        setTracks((prev) => [track, ...prev.filter((t) => t.path !== file)]);
        player.queue = [track];
        player.index = 0;
        await player.playTrack(track);
        toast(`Трек «${track.title}» готов и играет`, 'success');
      }
    } catch (err) {
      toast(err.message, 'error', 'Генератор музыки');
    } finally {
      setGenerating(false);
    }
  };

  const openFolder = () => invoke('music:openLibrary');

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="music" size={14} /> Музыка
        </div>
        <div style={{ flex: 1 }} />
        <div className="segmented">
          {SOURCE.map(([id, label, icon]) => (
            <button key={id} className={cn(tab === id && 'active')} onClick={() => setTab(id)}>
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>
        {!isAndroidApp() && (
          <button className="icon-btn" onClick={openFolder} title="Открыть папку музыки">
            <Icon name="folder-open" size={15} />
          </button>
        )}
      </div>

      {tab === 'library' && (
        <>
          <div className="panel-subbar">
            <div className="search-input" style={{ flex: 1, maxWidth: 320 }}>
              <Icon name="search" size={13} />
              <input
                className="input sm"
                placeholder="Поиск по трекам"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {filtered.length} треков
            </span>
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-sm"
              onClick={() => {
                invoke('music:refreshLibrary')
                  .then((r) => {
                    setTracks(Array.isArray(r) ? r : r?.tracks || []);
                    toast('Библиотека обновлена', 'success');
                  })
                  .catch((err) => toast(err.message, 'error'));
              }}
            >
              <Icon name="refresh" size={12} /> Обновить
            </button>
          </div>
          <div className="panel-body">
            <div className="music-list">
              {filtered.map((track, index) => {
                const active = current?.current?.path === track.path;
                return (
                  <div
                    key={track.path}
                    className={cn('track-row', active && 'active')}
                    onDoubleClick={() => play(track, index)}
                  >
                    <div className="track-index">
                      {active ? (
                        <span className="eq"><i /><i /><i /></span>
                      ) : (
                        <span className="mono" style={{ fontSize: 10 }}>{index + 1}</span>
                      )}
                    </div>
                    <button
                      className="track-play"
                      onClick={() => play(track, index)}
                      title={active && current.playing ? 'Пауза' : 'Играть'}
                    >
                      {busyId === track.path ? <span className="spinner sm" /> : <Icon name={active && current.playing ? 'pause' : 'play'} size={13} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="track-title truncate">{track.title}</div>
                      <div className="track-artist truncate">{track.artist || '—'}{track.album ? ` · ${track.album}` : ''}</div>
                    </div>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{formatDuration(track.duration)}</span>
                    {!isAndroidApp() && (
                      <button
                        className="icon-btn sm"
                        onClick={() => invoke('app:openPath', { path: track.path })}
                        title="Показать в папке"
                      >
                        <Icon name="external" size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              {!filtered.length && !loading && (
                <div className="empty">
                  <Icon name="music" size={36} />
                  <div className="empty-title">{loading ? 'Сканирую библиотеку…' : 'Треков нет'}</div>
                  <div className="empty-text">
                    Положи музыку в папку Music или сгенерируй трек во вкладке «Генератор»
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'generate' && (
        <div className="panel-body" style={{ display: 'flex', justifyContent: 'center', paddingTop: 30 }}>
          <div className="card" style={{ width: 'min(520px, 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="wand" style={{ color: 'var(--accent)' }} size={16} />
              <div className="card-title">Генератор музыки</div>
            </div>
            <div className="label" style={{ marginBottom: 5 }}>Описание (необязательно)</div>
            <input
              className="input"
              placeholder="Космический эмбиент, медленный темп"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div style={{ marginTop: 12 }}>
              <div className="label" style={{ marginBottom: 5 }}>Жанр</div>
              <div className="style-grid">
                {[['synthwave', 'Synthwave'], ['ambient', 'Ambient'], ['dark', 'Dark'], ['house', 'House'], ['lofi', 'Lo-fi'], ['cinematic', 'Cinematic'], ['techno', 'Techno']].map(([id, label]) => (
                  <button key={id} className={cn('style-btn', genre === id && 'active')} onClick={() => setGenre(id)}>
                    {label}
                  </button>
                ))}
              </div>
    </div>
            <div className="field" style={{ border: 0, padding: '12px 0 0' }}>
              <div className="field-label">Длительность</div>
              <div className="range-row">
                <input type="range" min={10} max={120} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
                <span className="range-value">{duration}с</span>
              </div>
            </div>
            <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={generate} disabled={generating}>
              {generating ? <span className="spinner sm" /> : <Icon name="music" size={14} />}
              {generating ? 'Синтезирую…' : 'Создать и играть'}
            </button>
            <div style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 8, lineHeight: 1.6 }}>
              Процедурный синтезатор на WebAudio — мгновенно и полностью офлайн.
            </div>
          </div>
        </div>
      )}

      {tab === 'radio' && (
        <div className="panel-body">
          <div className="music-list">
            {stations.map((station) => {
              const active = current?.current?.path === station.url;
              return (
                <div key={station.url} className={cn('track-row', active && 'active')}>
                  <div className="track-index"><Icon name="radio" size={12} /></div>
                  <button
                    className="track-play"
                    onClick={() => {
                      if (active) {
                        player.toggle();
                        return;
                      }
                      player.queue = [station];
                      player.index = 0;
                      player.playTrack({ ...station, path: station.url }).catch((err) => toast(err.message, 'error'));
                    }}
                  >
                    <Icon name={active && current.playing ? 'pause' : 'play'} size={13} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="track-title truncate">{station.name}</div>
                    <div className="track-artist truncate">{station.genre || 'Internet radio'} · {station.bitrate || ''}</div>
                  </div>
                  <span className="badge" style={{ fontSize: 8.5 }}>{station.codec || 'MP3'}</span>
                </div>
              );
            })}
            {!stations.length && (
              <div className="empty">
                <Icon name="radio" size={32} />
                <div className="empty-title">Станции загружаются…</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
