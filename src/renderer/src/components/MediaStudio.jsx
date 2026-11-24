import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn, formatBytes, formatDuration, downloadDataUrl } from '../lib/utils';
import Icon from './Icon';

const STYLES = [
  ['auto', 'Авто'], ['cyberpunk', 'Киберпанк'], ['anime', 'Аниме'], ['photo', 'Фото'],
  ['3d', '3D'], ['oil', 'Масло'], ['watercolor', 'Акварель'], ['pixel', 'Пиксель'],
  ['logo', 'Логотип'], ['dark', 'Тёмное'], ['neon', 'Неон'],
];

const GENRES = [
  ['synthwave', 'Synthwave'], ['ambient', 'Ambient'], ['dark', 'Dark'], ['house', 'House'],
  ['lofi', 'Lo-fi'], ['cinematic', 'Cinematic'], ['techno', 'Techno'],
];

function useThumb(path, enabled) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    if (!enabled || !path) return undefined;
    let cancelled = false;
    invoke('media:thumbnail', { path, size: 300 })
      .then((data) => { if (!cancelled && data) setSrc(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [path, enabled]);
  return src;
}

function GalleryItem({ item, onOpen, onDelete }) {
  const isImage = /\.(png|jpe?g|webp|gif|bmp)$/i.test(item.name);
  const thumb = useThumb(item.path, isImage);
  const kind = item.kind;
  return (
    <div className="media-item" onClick={() => onOpen(item)}>
      <div
        className="media-item-thumb"
        style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}
      >
        {!thumb && (
          <Icon
            name={kind === 'music' ? 'music' : kind === 'video' ? 'film' : 'image'}
            size={28}
          />
        )}
      </div>
      <div className="media-item-meta">
        <Icon
          name={kind === 'music' ? 'music' : kind === 'video' ? 'film' : 'image'}
          size={10}
        />
        <span className="truncate">{item.name}</span>
        <span style={{ marginLeft: 'auto' }}>{formatBytes(item.size)}</span>
      </div>
      <div className="media-item-actions">
        <button onClick={(e) => { e.stopPropagation(); onDelete(item); }} title="Удалить">
          <Icon name="trash" size={12} />
        </button>
      </div>
    </div>
  );
}

export default function MediaStudio() {
  const { state, refreshMedia, refreshAll, updateConfig, toast, sendMessage, setView } = useApp();
  const [tab, setTab] = useState('images');
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState('cyberpunk');
  const [size, setSize] = useState('1024x1024');
  const [genre, setGenre] = useState('synthwave');
  const [musicDuration, setMusicDuration] = useState(45);
  const [videoDuration, setVideoDuration] = useState(10);
  const [useImages, setUseImages] = useState(true);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState('');
  const fileRef = useRef(null);

  const items = useMemo(() => {
    const source = state.media[tab] || [];
    const q = filter.trim().toLowerCase();
    return q ? source.filter((i) => i.name.toLowerCase().includes(q)) : source;
  }, [state.media, tab, filter]);

  const openItem = async (item) => {
    try {
      const dataUrl = await invoke('media:dataUrl', { path: item.path });
      setPreview({ ...item, dataUrl });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const deleteItem = async (item) => {
    try {
      await invoke('media:delete', { path: item.path });
      if (preview?.path === item.path) setPreview(null);
      await refreshMedia();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const generate = async () => {
    if (!prompt.trim()) {
      toast('Опиши, что нужно создать', 'warning');
      return;
    }
    setBusy(true);
    setProgress('');
    try {
      if (tab === 'images') {
        const [width, height] = size.split('x').map(Number);
        setProgress('Генерирую изображение… это может занять до минуты');
        const result = await invoke('media:generateImage', {
          prompt, style, width, height, count,
        });
        await refreshMedia();
        if (result?.files?.length) {
          const first = result.files[0];
          setPreview({
            path: first.path,
            name: first.name,
            kind: 'images',
            dataUrl: first.dataUrl || await invoke('media:dataUrl', { path: first.path }),
          });
        }
        toast(`Создано изображений: ${result.files.length}`, 'success');
      } else if (tab === 'music') {
        setProgress('Синтезирую трек…');
        const result = await invoke('media:generateMusic', {
          prompt, genre, duration: musicDuration,
        });
        await refreshMedia();
        if (result?.file) {
          const dataUrl = await invoke('media:dataUrl', { path: result.file });
          setPreview({ path: result.file, name: result.file.split(/[\\/]/).pop(), kind: 'music', dataUrl });
        }
        toast('Трек готов', 'success');
      } else {
        setProgress('Собираю видео… это может занять пару минут');
        const images = useImages
          ? (state.media.images || []).slice(-4).map((i) => i.path)
          : [];
        const result = await invoke('media:generateVideo', {
          prompt, duration: videoDuration, images,
        });
        await refreshMedia();
        if (result?.file) {
          const dataUrl = await invoke('media:dataUrl', { path: result.file });
          setPreview({ path: result.file, name: result.file.split(/[\\/]/).pop(), kind: 'video', dataUrl });
        }
        toast('Видео готово', 'success');
      }
    } catch (err) {
      toast(err.message, 'error', 'Генерация');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const setWallpaper = async () => {
    if (!preview?.path) return;
    try {
      const target = await invoke('media:setWallpaper', { path: preview.path });
      const name = String(target).split(/[\\/]/).pop();
      await updateConfig('appearance.wallpaper', name);
      toast('Обои установлены', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const sendToChat = () => {
    if (!preview?.path) return;
    sendMessage('Опиши этот файл подробно и предложи, что с ним можно сделать', [
      { path: preview.path, name: preview.name },
    ]);
    setView('chat');
  };

  const download = () => {
    if (preview?.dataUrl) downloadDataUrl(preview.dataUrl, preview.name || 'media');
  };

  const openFolder = () => invoke('media:openFolder', { kind: tab });

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="image" size={14} /> Медиа-студия
        </div>
        <div style={{ flex: 1 }} />
        <div className="segmented">
          {[
            ['images', 'Картинки', 'image'],
            ['music', 'Музыка', 'music'],
            ['video', 'Видео', 'film'],
          ].map(([id, label, icon]) => (
            <button
              key={id}
              className={cn(tab === id && 'active')}
              onClick={() => { setTab(id); setPreview(null); }}
            >
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={openFolder} title="Открыть папку">
          <Icon name="folder-open" size={15} />
        </button>
      </div>

      <div className="media-layout">
        <div className="media-controls">
          <div className="card">
            <div className="label" style={{ marginBottom: 6 }}>Промпт</div>
            <textarea
              className="textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                tab === 'images'
                  ? 'Киберпанк-город ночью, неон, дождь, отражения…'
                  : tab === 'music'
                    ? 'Энергичный синтвейв для работы, 80-е, ретро'
                    : 'Кинематографичный ролик о будущем, неоновые улицы'
              }
              style={{ minHeight: 88 }}
            />

            {tab === 'images' && (
              <>
                <div style={{ marginTop: 10 }}>
                  <div className="label" style={{ marginBottom: 5 }}>Стиль</div>
                  <div className="style-grid">
                    {STYLES.map(([id, label]) => (
                      <button
                        key={id}
                        className={cn('style-btn', style === id && 'active')}
                        onClick={() => setStyle(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                  <div>
                    <div className="label" style={{ marginBottom: 5 }}>Размер</div>
                    <select className="select sm" value={size} onChange={(e) => setSize(e.target.value)}>
                      <option value="1024x1024">1024 × 1024</option>
                      <option value="1280x720">1280 × 720</option>
                      <option value="720x1280">720 × 1280</option>
                      <option value="1536x768">1536 × 768</option>
                      <option value="768x1536">768 × 1536</option>
                    </select>
                  </div>
                  <div>
                    <div className="label" style={{ marginBottom: 5 }}>Кол-во</div>
                    <select className="select sm" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={4}>4</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {tab === 'music' && (
              <>
                <div style={{ marginTop: 10 }}>
                  <div className="label" style={{ marginBottom: 5 }}>Жанр</div>
                  <div className="style-grid">
                    {GENRES.map(([id, label]) => (
                      <button
                        key={id}
                        className={cn('style-btn', genre === id && 'active')}
                        onClick={() => setGenre(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field" style={{ border: 0, padding: '10px 0 0' }}>
                  <div className="field-label">Длительность</div>
                  <div className="range-row">
                    <input
                      type="range"
                      min={10}
                      max={120}
                      value={musicDuration}
                      onChange={(e) => setMusicDuration(Number(e.target.value))}
                    />
                    <span className="range-value">{musicDuration}с</span>
                  </div>
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.5 }}>
                  Локальный процедурный синтезатор работает без ключей и интернета.
                  Hugging Face / Replicate можно включить в настройках медиа.
                </div>
              </>
            )}

            {tab === 'video' && (
              <>
                <div className="field" style={{ border: 0, padding: '10px 0 0' }}>
                  <div className="field-label">Длительность</div>
                  <div className="range-row">
                    <input
                      type="range"
                      min={3}
                      max={30}
                      value={videoDuration}
                      onChange={(e) => setVideoDuration(Number(e.target.value))}
                    />
                    <span className="range-value">{videoDuration}с</span>
                  </div>
                </div>
                <div className="field" style={{ border: 0, padding: '8px 0 0' }}>
                  <div className="field-label">
                    Использовать последние картинки
                    <div className="field-hint">Слайд-шоу из сгенерированных изображений</div>
                  </div>
                  <button
                    className={cn('switch', useImages && 'on')}
                    onClick={() => setUseImages((v) => !v)}
                  />
                </div>
              </>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              onClick={generate}
              disabled={busy || !prompt.trim()}
            >
              {busy ? <span className="spinner sm" /> : <Icon name={tab === 'music' ? 'music' : tab === 'video' ? 'film' : 'wand'} size={15} />}
              {busy ? 'Создаю…' : tab === 'music' ? 'Создать музыку' : tab === 'video' ? 'Создать видео' : 'Сгенерировать'}
            </button>
            {busy && (
              <div className="media-progress">
                <span className="spinner sm" />
                {progress || 'Работаю…'}
              </div>
            )}
          </div>

          <div className="card">
            <div className="label" style={{ marginBottom: 8 }}>Предпросмотр</div>
            <div className="media-preview">
              {preview ? (
                preview.kind === 'music' ? (
                  <audio controls src={preview.dataUrl} style={{ width: '100%' }} />
                ) : preview.kind === 'video' ? (
                  <video controls src={preview.dataUrl} style={{ maxHeight: 240 }} />
                ) : (
                  <img src={preview.dataUrl} alt="" />
                )
              ) : (
                <div className="empty">
                  <Icon name="image" size={30} />
                  <div className="empty-text">Здесь появится результат</div>
                </div>
              )}
            </div>
            {preview && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={sendToChat}>
                  <Icon name="message-square" size={12} /> В чат
                </button>
                <button className="btn btn-sm" onClick={download}>
                  <Icon name="download" size={12} /> Скачать
                </button>
                {preview.kind === 'images' && (
                  <button className="btn btn-sm" onClick={setWallpaper}>
                    <Icon name="palette" size={12} /> Обои
                  </button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => deleteItem(preview)}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
            )}
            {preview && (
              <div style={{ marginTop: 8, fontSize: 9.5, color: 'var(--text-faint)', wordBreak: 'break-all' }}>
                {preview.path}
              </div>
            )}
          </div>
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div className="search-input" style={{ flex: 1, maxWidth: 260 }}>
              <Icon name="search" size={13} />
              <input
                className="input sm"
                placeholder="Поиск по названию"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              {items.length} файлов
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm btn-ghost" onClick={refreshAll}>
              <Icon name="refresh" size={12} /> Обновить
            </button>
          </div>
          <div className="media-gallery" style={{ padding: 14 }}>
            {items.map((item) => (
              <GalleryItem key={item.path} item={item} onOpen={openItem} onDelete={deleteItem} />
            ))}
            {!items.length && (
              <div className="empty" style={{ gridColumn: '1 / -1' }}>
                <Icon name="image" size={36} />
                <div className="empty-title">Пока пусто</div>
                <div className="empty-text">Создай первую картинку, трек или видео слева</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
