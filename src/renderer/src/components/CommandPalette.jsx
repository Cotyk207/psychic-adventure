import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { THEMES } from '../lib/themes';
import { cn } from '../lib/utils';
import Icon from './Icon';

const VIEWS = [
  { id: 'dashboard', label: 'Обзор', icon: 'zap' },
  { id: 'chat', label: 'Диалоги', icon: 'message-square' },
  { id: 'skills', label: 'Скиллы', icon: 'sparkles' },
  { id: 'media', label: 'Медиа-студия', icon: 'image' },
  { id: 'aisites', label: 'ИИ-сайты', icon: 'globe' },
  { id: 'browser', label: 'Браузер', icon: 'globe' },
  { id: 'files', label: 'Файлы', icon: 'folder' },
  { id: 'terminal', label: 'Терминал', icon: 'terminal' },
  { id: 'music', label: 'Музыка', icon: 'music' },
  { id: 'memory', label: 'Память', icon: 'brain' },
];

export default function CommandPalette() {
  const { state, dispatch, setView, createChat, openSettings, updateConfig, loadChat, sendMessage } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const actions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items = [];

    items.push({ group: 'Действия', label: 'Новый диалог', icon: 'plus', shortcut: 'Ctrl+N', run: () => createChat() });
    items.push({ group: 'Действия', label: 'Настройки', icon: 'settings', shortcut: 'Ctrl+,', run: () => openSettings('general') });
    items.push({ group: 'Действия', label: 'Выбрать модель', icon: 'cpu', run: () => dispatch({ type: 'SET_MODAL', modal: 'modelPicker' }) });

    for (const view of VIEWS) {
      items.push({
        group: 'Разделы',
        label: view.label,
        icon: view.icon,
        run: () => setView(view.id),
      });
    }

    items.push({
      group: 'Действия',
      label: 'Горячие клавиши',
      icon: 'keyboard',
      shortcut: '?',
      run: () => dispatch({ type: 'SET_MODAL', modal: 'shortcuts' }),
    });

    for (const prompt of state.config?.chat?.prompts || []) {
      items.push({
        id: `prompt-${prompt.id}`,
        group: 'Промпты',
        label: prompt.title || prompt.text,
        icon: 'bookmark',
        hint: prompt.text,
        run: () => { setView('chat'); sendMessage(prompt.text); },
      });
    }

    for (const theme of THEMES) {
      items.push({
        id: `theme-${theme.id}`,
        group: 'Темы',
        label: theme.name,
        icon: 'palette',
        hint: theme.tagline,
        run: () => updateConfig('appearance.theme', theme.id),
      });
    }

    for (const chat of state.chats.slice(0, 40)) {
      items.push({
        id: `chat-${chat.id}`,
        group: 'Диалоги',
        label: chat.title,
        icon: 'message-square',
        hint: `${chat.messageCount} сообщ.`,
        run: () => { setView('chat'); loadChat(chat.id); },
      });
    }

    if (!q) return items;
    return items.filter((item) => `${item.label} ${item.group}`.toLowerCase().includes(q));
  }, [query, state.chats, state.config?.chat?.prompts, createChat, openSettings, setView, updateConfig, loadChat, dispatch, sendMessage]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = (item) => {
    dispatch({ type: 'SET_MODAL', modal: null });
    setTimeout(() => item.run(), 10);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((v) => Math.min(actions.length - 1, v + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((v) => Math.max(0, v - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (actions[active]) run(actions[active]);
    } else if (event.key === 'Escape') {
      dispatch({ type: 'SET_MODAL', modal: null });
    }
  };

  let lastGroup = null;

  return (
    <div className="modal-backdrop" style={{ alignItems: 'start' }} onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>
      <div className="palette" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Команда, диалог, тема или раздел…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="palette-list" ref={listRef}>
          {actions.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
              Ничего не найдено
            </div>
          )}
          {actions.map((item, index) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id || `${item.group}-${item.label}-${index}`}>
                {showGroup && <div className="palette-group">{item.group}</div>}
                <div
                  className={cn('palette-item', index === active && 'active')}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => run(item)}
                >
                  <Icon name={item.icon} size={15} style={{ color: 'var(--accent)' }} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.hint && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{item.hint}</span>}
                  {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
