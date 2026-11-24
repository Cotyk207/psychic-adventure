import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn, formatBytes, isImageFile, isTextFile, isVideoFile, isAudioFile, fileIconName, copyToClipboard } from '../lib/utils';
import Icon from './Icon';

const QUICK = [
  { key: 'home', label: 'Домой', icon: 'home' },
  { key: 'workspace', label: 'PSYCHIC', icon: 'sparkles' },
  { key: 'desktop', label: 'Рабочий стол', icon: 'monitor' },
  { key: 'documents', label: 'Документы', icon: 'file-text' },
  { key: 'downloads', label: 'Загрузки', icon: 'download' },
  { key: 'music', label: 'Музыка', icon: 'music' },
];

export default function FilesPanel() {
  const { state, toast, sendMessage, setView } = useApp();
  const [quick, setQuick] = useState({});
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [showHidden, setShowHidden] = useState(false);
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState(null);
  const [creating, setCreating] = useState(null);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    invoke('fs:quickAccess')
      .then((q) => {
        setQuick(q);
        setPath(q.workspace);
      })
      .catch(() => {});
  }, []);

  const load = async (target) => {
    if (!target) return;
    setLoading(true);
    try {
      const result = await invoke('fs:list', { path: target, depth: 1, showHidden });
      setPath(target);
      setEntries(result?.data?.entries || []);
    } catch (err) {
      toast(err.message, 'error', 'Файлы');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (path) load(path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHidden]);

  const go = (target) => {
    setHistory((h) => [...h, path].slice(-30));
    load(target);
  };

  const back = () => {
    setHistory((h) => {
      const prev = h.pop() || quick.home;
      load(prev);
      return h;
    });
  };

  const up = () => {
    const parent = path.replace(/[\\/][^\\/]+$/, '');
    if (parent && parent !== path) load(parent);
  };

  const openEntry = async (entry) => {
    if (entry.type === 'directory') {
      go(entry.path);
      return;
    }
    try {
      if (isImageFile(entry.name) || isVideoFile(entry.name) || isAudioFile(entry.name)) {
        const dataUrl = await invoke('media:dataUrl', { path: entry.path });
        setPreview({ ...entry, dataUrl });
        return;
      }
      const result = await invoke('fs:read', { path: entry.path });
      if (result.binary) {
        setPreview({ ...entry, binary: true, size: result.size });
        return;
      }
      setPreview({ ...entry, content: result.content, size: result.size });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const createItem = async () => {
    if (!newName.trim()) return;
    try {
      const target = `${path}${path.endsWith('\\') || path.endsWith('/') ? '' : '/'}${newName.trim()}`;
      if (creating === 'folder') await invoke('fs:mkdir', { path: target });
      else await invoke('fs:write', { path: target, content: '' });
      setCreating(null);
      setNewName('');
      await load(path);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeEntry = async (entry) => {
    if (!window.confirm(`Удалить «${entry.name}»?`)) return;
    try {
      await invoke('fs:delete', { path: entry.path, recursive: true });
      setPreview(null);
      await load(path);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const crumbs = useMemo(() => {
    if (!path) return [];
    const sep = path.includes('\\') ? '\\' : '/';
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join(sep) + (index === 0 && sep === '\\' ? '\\' : ''),
    }));
  }, [path]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, filter]);

  const sendToChat = () => {
    if (!preview) return;
    sendMessage(`Работай с этим файлом: ${preview.path}`, [{ path: preview.path, name: preview.name }]);
    setView('chat');
  };

  return (
    <div className="files-layout">
      <div className="files-tree">
        <div className="tree-section">Быстрый доступ</div>
        {QUICK.map((item) => (
          <div
            key={item.key}
            className={cn('tree-item', path === quick[item.key] && 'active')}
            onClick={() => quick[item.key] && go(quick[item.key])}
          >
            <Icon name={item.icon} size={14} />
            <span className="tree-name">{item.label}</span>
          </div>
        ))}
        <div className="tree-section">Инструменты</div>
        <div className="tree-item" onClick={() => invoke('app:openPath', { path: state.appInfo?.paths?.workspace })}>
          <Icon name="external" size={14} />
          <span className="tree-name">Открыть в проводнике</span>
        </div>
        <div className="tree-item" onClick={() => invoke('app:openPath', { path: state.appInfo?.paths?.media })}>
          <Icon name="folder-open" size={14} />
          <span className="tree-name">Папка медиа</span>
        </div>
        <div className="tree-section">Подсказка</div>
        <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.6 }}>
          Ассистент может читать и менять любые файлы — просто попроси его в чате.
        </div>
      </div>

      <div className="files-main">
        <div className="files-toolbar">
          <button className="icon-btn" onClick={back} title="Назад">
            <Icon name="chevron-left" size={15} />
          </button>
          <button className="icon-btn" onClick={up} title="Вверх">
            <Icon name="arrow-up" size={14} />
          </button>
          <div className="files-path">
            <Icon name="folder-open" size={12} />
            {crumbs.map((crumb, i) => (
              <span key={crumb.path}>
                {i > 0 && <span style={{ opacity: 0.4 }}> › </span>}
                <span
                  style={{ cursor: 'pointer' }}
                  onClick={() => go(crumb.path)}
                >
                  {crumb.label}
                </span>
              </span>
            ))}
          </div>
          <button
            className={cn('icon-btn', showHidden && 'active')}
            onClick={() => setShowHidden((v) => !v)}
            title="Скрытые файлы"
          >
            <Icon name="eye" size={14} />
          </button>
          <button className="icon-btn" onClick={() => load(path)} title="Обновить">
            <Icon name="refresh" size={14} />
          </button>
          <button className="btn btn-sm" onClick={() => { setCreating('folder'); setNewName(''); }}>
            <Icon name="folder-plus" size={12} /> Папка
          </button>
          <button className="btn btn-sm" onClick={() => { setCreating('file'); setNewName(''); }}>
            <Icon name="file-plus" size={12} /> Файл
          </button>
        </div>

        <div className="files-toolbar" style={{ borderTop: 0, paddingBottom: 6 }}>
          <div className="search-input" style={{ flex: 1, maxWidth: 300 }}>
            <Icon name="search" size={13} />
            <input
              className="input sm"
              placeholder="Фильтр по имени"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
            {filtered.length} объектов
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>
            {loading ? 'загрузка…' : ''}
          </span>
        </div>

        <div className="files-grid">
          {filtered.map((entry) => (
            <button key={entry.path} className="file-card" onClick={() => openEntry(entry)}>
              <div className={cn('file-card-icon', entry.type === 'directory' && 'dir')}>
                <Icon name={entry.type === 'directory' ? 'folder' : fileIconName(entry.name)} size={16} />
              </div>
              <div className="file-card-name">{entry.name}</div>
              <div className="file-card-meta">
                {entry.type === 'file' ? formatBytes(entry.size) : 'папка'}
              </div>
            </button>
          ))}
          {!filtered.length && !loading && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              <Icon name="folder-open" size={36} />
              <div className="empty-title">Папка пуста</div>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(null)}>
          <div className="modal" style={{ width: 'min(380px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Icon name={creating === 'folder' ? 'folder-plus' : 'file-plus'} size={16} style={{ color: 'var(--accent)' }} />
              <div className="modal-title">{creating === 'folder' ? 'Новая папка' : 'Новый файл'}</div>
            </div>
            <div className="modal-body">
              <input
                className="input"
                placeholder={creating === 'folder' ? 'Название папки' : 'имя-файла.txt'}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') createItem(); }}
                autoFocus
              />
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setCreating(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={createItem}>Создать</button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" onClick={() => setPreview(null)}>
          <div className="modal" style={{ width: 'min(820px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Icon name={fileIconName(preview.name)} size={16} style={{ color: 'var(--accent)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="modal-title truncate">{preview.name}</div>
                <div className="modal-subtitle truncate">{preview.path} · {formatBytes(preview.size)}</div>
              </div>
              <button className="icon-btn modal-close" onClick={() => setPreview(null)}>
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', padding: 0 }}>
              {preview.dataUrl ? (
                isImageFile(preview.name) ? (
                  <div style={{ display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg0)' }}>
                    <img src={preview.dataUrl} alt="" style={{ maxHeight: '55vh', maxWidth: '100%', borderRadius: 10 }} />
                  </div>
                ) : isVideoFile(preview.name) ? (
                  <video src={preview.dataUrl} controls style={{ width: '100%', maxHeight: '55vh' }} />
                ) : (
                  <div style={{ padding: 20 }}>
                    <audio src={preview.dataUrl} controls style={{ width: '100%' }} />
                  </div>
                )
              ) : preview.binary ? (
                <div className="empty">
                  <Icon name="file" size={32} />
                  <div className="empty-title">Бинарный файл</div>
                  <div className="empty-text">Предпросмотр недоступен. Можно открыть системным приложением.</div>
                </div>
              ) : (
                <pre className="code-editor" style={{ maxHeight: '55vh', overflow: 'auto' }}>{preview.content}</pre>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => copyToClipboard(preview.path)}>
                <Icon name="copy" size={13} /> Путь
              </button>
              <button className="btn btn-ghost" onClick={() => invoke('fs:openFile', { path: preview.path })}>
                <Icon name="external" size={13} /> Открыть
              </button>
              <button className="btn" onClick={sendToChat}>
                <Icon name="message-square" size={13} /> В чат
              </button>
              <button className="btn btn-danger" onClick={() => removeEntry(preview)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
