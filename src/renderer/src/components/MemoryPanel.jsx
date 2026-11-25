import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn, formatBytes, formatRelative } from '../lib/utils';
import Icon from './Icon';

const TABS = [
  ['all', 'Все', 'brain'],
  ['facts', 'Факты', 'tag'],
  ['people', 'Люди', 'users'],
  ['projects', 'Проекты', 'folder-git'],
  ['notes', 'Заметки', 'sticky-note'],
];

export default function MemoryPanel() {
  const { state, refreshMemory, toast } = useApp();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');

  const memory = Array.isArray(state.memory)
    ? { items: state.memory, stats: { total: state.memory.length } }
    : (state.memory || { items: [], stats: {} });
  const rawItems = memory.items || [];
  const items = useMemo(
    () => rawItems.map((item) => ({
      ...item,
      text: item.text || item.content || '',
      category: item.category || 'notes',
      tags: item.tags || [],
    })),
    [rawItems]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (tab !== 'all' && item.category !== tab) return false;
      if (q && !`${item.text} ${item.category} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, tab, search]);

  const counts = useMemo(() => {
    const map = { all: items.length };
    for (const item of items) map[item.category] = (map[item.category] || 0) + 1;
    return map;
  }, [items]);

  const openItem = (item) => {
    setSelected(item);
    setDraft(item.text);
    setEditing(false);
  };

  const saveItem = async () => {
    if (!draft.trim()) return;
    try {
      await invoke('memory:update', { id: selected.id, text: draft.trim() });
      await refreshMemory();
      setEditing(false);
      toast('Запись обновлена', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeItem = async (item) => {
    try {
      await invoke('memory:delete', { id: item.id });
      if (selected?.id === item.id) setSelected(null);
      await refreshMemory();
      toast('Запись удалена', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const addItem = async () => {
    if (!newText.trim()) return;
    try {
      await invoke('memory:add', { text: newText.trim(), category: 'notes' });
      await refreshMemory();
      setNewText('');
      setAdding(false);
      toast('Запись добавлена в память', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const exportJson = async () => {
    try {
      const result = await invoke('memory:export');
      toast(result ? `Память экспортирована: ${result.path}` : 'Экспорт отменён', result ? 'success' : 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleMemory = async () => {
    try {
      const enabled = !state.config?.memory?.enabled;
      await invoke('memory:setEnabled', { enabled });
      await invoke('config:set', { key: 'memory.enabled', value: enabled });
      await refreshMemory();
      toast(enabled ? 'Память включена' : 'Память выключена', 'info');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          <Icon name="brain" size={14} /> Память
        </div>
        <span className="badge" style={{ marginLeft: 6 }}>{memory.stats?.total ?? items.length}</span>
        <div style={{ flex: 1 }} />
        <div className="segmented">
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={cn(tab === id && 'active')} onClick={() => setTab(id)}>
              <Icon name={icon} size={11} /> {label}
              {counts[id] ? <span style={{ opacity: 0.6 }}>{counts[id]}</span> : null}
            </button>
          ))}
        </div>
        <button
          className={cn('btn btn-sm', state.config?.memory?.enabled !== false ? 'btn-primary' : '')}
          onClick={toggleMemory}
          title="Включить / выключить память"
        >
          <Icon name={state.config?.memory?.enabled !== false ? 'brain' : 'shield-off'} size={12} />
          {state.config?.memory?.enabled !== false ? 'Активна' : 'Выключена'}
        </button>
      </div>

      <div className="panel-subbar">
        <div className="search-input" style={{ flex: 1, maxWidth: 320 }}>
          <Icon name="search" size={13} />
          <input
            className="input sm"
            placeholder="Поиск по памяти"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {memory.stats?.words || 0} слов · {formatBytes(memory.stats?.bytes || 0)}
        </span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-sm btn-ghost" onClick={exportJson}>
          <Icon name="download" size={12} /> Экспорт
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={12} /> Запись
        </button>
      </div>

      <div className="memory-layout">
        <div className="panel-body memory-list">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={cn('memory-card', selected?.id === item.id && 'active')}
              onClick={() => openItem(item)}
            >
              <div className="memory-card-head">
                <Icon
                  name={item.category === 'people' ? 'user' : item.category === 'projects' ? 'folder-git' : item.category === 'facts' ? 'tag' : 'sticky-note'}
                  size={11}
                />
                <span className="memory-cat">{item.category || 'notes'}</span>
                <span className="mono" style={{ marginLeft: 'auto', fontSize: 9 }}>{formatRelative(item.updatedAt || item.createdAt)}</span>
              </div>
              <div className="memory-text">{item.text}</div>
              {(item.tags || []).length > 0 && (
                <div className="memory-tags">
                  {item.tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
                </div>
              )}
              <div className="memory-actions">
                <button
                  className="icon-btn sm"
                  onClick={(e) => { e.stopPropagation(); removeItem(item); }}
                  title="Удалить"
                >
                  <Icon name="trash" size={11} />
                </button>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="empty">
              <Icon name="brain" size={36} />
              <div className="empty-title">Память пуста</div>
              <div className="empty-text">
                Ассистент запоминает факты, людей и проекты автоматически.
                Можно добавить запись вручную.
              </div>
            </div>
          )}
        </div>

        <aside className="memory-detail">
          {selected ? (
            <>
              <div className="memory-detail-head">
                <span className="memory-cat">{selected.category}</span>
                <span style={{ flex: 1 }} />
                <button className="icon-btn sm" onClick={() => setEditing((v) => !v)} title="Редактировать">
                  <Icon name="pencil" size={12} />
                </button>
                <button className="icon-btn sm danger" onClick={() => removeItem(selected)} title="Удалить">
                  <Icon name="trash" size={12} />
                </button>
              </div>
              {editing ? (
                <>
                  <textarea
                    className="textarea"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    style={{ minHeight: 200 }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveItem}>
                      <Icon name="check" size={12} /> Сохранить
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>Отмена</button>
                  </div>
                </>
              ) : (
                <div className="markdown-body" style={{ fontSize: 12.5 }}>{selected.text}</div>
              )}
              <div style={{ marginTop: 'auto', fontSize: 10, color: 'var(--text-faint)' }}>
                Создано {new Date(selected.createdAt).toLocaleString('ru-RU')}
              </div>
            </>
          ) : (
            <div className="empty">
              <Icon name="brain" size={30} />
              <div className="empty-text">Выбери запись, чтобы увидеть детали</div>
            </div>
          )}
        </aside>
      </div>

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal" style={{ width: 'min(520px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Icon name="plus" size={16} style={{ color: 'var(--accent)' }} />
              <div className="modal-title">Новая запись в память</div>
            </div>
            <div className="modal-body">
              <textarea
                className="textarea"
                placeholder="Например: проект Psychic — локальный ИИ-ассистент на Electron…"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                style={{ minHeight: 120 }}
                autoFocus
              />
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setAdding(false)}>Отмена</button>
              <button className="btn btn-primary" onClick={addItem} disabled={!newText.trim()}>
                <Icon name="check" size={13} /> Добавить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
