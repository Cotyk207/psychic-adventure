import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { cn, formatRelative } from '../lib/utils';
import Icon from './Icon';
import Logo from './Logo';

const NAV = [
  { id: 'dashboard', label: 'Обзор', icon: 'zap', view: 'dashboard' },
  { id: 'chat', label: 'Диалоги', icon: 'message-square', view: 'chat' },
  { id: 'skills', label: 'Скиллы', icon: 'sparkles', view: 'skills' },
  { id: 'media', label: 'Медиа-студия', icon: 'image', view: 'media' },
  { id: 'browser', label: 'Браузер', icon: 'globe', view: 'browser' },
  { id: 'files', label: 'Файлы', icon: 'folder', view: 'files' },
  { id: 'terminal', label: 'Терминал', icon: 'terminal', view: 'terminal' },
  { id: 'music', label: 'Музыка', icon: 'music', view: 'music' },
  { id: 'memory', label: 'Память', icon: 'brain', view: 'memory' },
];

export default function Sidebar({ mobileOpen = false, onCloseMobile }) {
  const { state, setView, createChat, loadChat, deleteChat, renameChat, pinChat, openSettings, updateConfig } = useApp();
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const collapsed = state.config?.appearance?.sidebarCollapsed && !mobileOpen;

  const activeSkillCount = state.skills.filter((s) => s.enabled).length;
  const provider = (state.providers || []).find((p) => p.id === state.chat?.provider)
    || (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);
  const model = state.chat?.model || state.config?.chat?.defaultModel;

  const toggleCollapsed = () => updateConfig('appearance.sidebarCollapsed', !collapsed);

  const startRename = (chat) => {
    setEditingId(chat.id);
    setEditValue(chat.title);
  };

  const commitRename = async (id) => {
    const title = editValue.trim();
    setEditingId(null);
    if (title) await renameChat(id, title);
  };

  return (
    <aside className={cn('sidebar', collapsed && 'collapsed', mobileOpen && 'mobile-open')}>
      <div className="sidebar-head">
        <div className="sidebar-logo">
          <Logo size={20} />
        </div>
        <div className="brand-text">
          <div className="sidebar-title">PSYCHIC</div>
          <div className="sidebar-subtitle">Neural Interface</div>
        </div>
        {mobileOpen ? (
          <button
            className="icon-btn sm mobile-only"
            style={{ marginLeft: 'auto' }}
            onClick={onCloseMobile}
            title="Закрыть меню"
          >
            <Icon name="x" size={15} />
          </button>
        ) : (
          <button
            className="icon-btn sm"
            style={{ marginLeft: 'auto' }}
            onClick={toggleCollapsed}
            title={collapsed ? 'Развернуть' : 'Свернуть'}
          >
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          </button>
        )}
      </div>

      <button className="new-chat-btn" onClick={() => { createChat(); onCloseMobile?.(); }}>
        <Icon name="plus" size={15} />
        <span>Новый диалог</span>
      </button>

      <nav className="nav">
        {NAV.map((item) => {
          const badge = item.id === 'skills' && activeSkillCount ? activeSkillCount : null;
          return (
            <div
              key={item.id}
              className={cn('nav-item', state.view === item.view && 'active')}
              onClick={() => { setView(item.view); onCloseMobile?.(); }}
              title={item.label}
            >
              <Icon name={item.icon} size={17} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
              {badge != null && <span className="nav-badge">{badge}</span>}
            </div>
          );
        })}
        <div style={{ height: 1, margin: '6px 10px', background: 'var(--border)' }} />
        <div
          className={cn('nav-item', state.modal === 'settings' && 'active')}
          onClick={() => { openSettings('general'); onCloseMobile?.(); }}
          title="Настройки"
        >
          <Icon name="settings" size={17} className="nav-icon" />
          <span className="nav-label">Настройки</span>
        </div>
      </nav>

      {!collapsed && (
        <>
          <div className="sidebar-section">
            <span className="sidebar-section-title">История</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-faint)' }}>
              {state.chats.length}
            </span>
          </div>
          <div className="chats scroll-thin">
            {state.chats.map((chat) => (
              <div
                key={chat.id}
                className={cn('chat-item', state.activeChatId === chat.id && 'active')}
                onClick={() => { setView('chat'); loadChat(chat.id); onCloseMobile?.(); }}
              >
                <div className="chat-item-main">
                  {editingId === chat.id ? (
                    <input
                      className="input sm"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(chat.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onBlur={() => commitRename(chat.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="chat-item-title">
                      {chat.pinned && <span className="chat-pin">◆ </span>}
                      {chat.title}
                    </div>
                  )}
                  <div className="chat-item-meta">
                    {formatRelative(chat.updatedAt)} · {chat.messageCount}
                  </div>
                </div>
                <div className="chat-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="chat-item-btn" onClick={() => pinChat(chat.id)} title="Закрепить">
                    <Icon name="pin" size={12} />
                  </button>
                  <button className="chat-item-btn" onClick={() => startRename(chat)} title="Переименовать">
                    <Icon name="pencil" size={12} />
                  </button>
                  <button className="chat-item-btn" onClick={() => deleteChat(chat.id)} title="Удалить">
                    <Icon name="trash" size={12} />
                  </button>
                </div>
              </div>
            ))}
            {!state.chats.length && (
              <div style={{ padding: '12px 10px', fontSize: 11, color: 'var(--text-faint)' }}>
                Диалогов пока нет
              </div>
            )}
          </div>
        </>
      )}

      <div className="sidebar-foot">
        <div className="status-pill" title={provider ? `${provider.name} · ${model}` : 'Провайдер не выбран'}>
          <span className={cn('status-dot', !provider && 'warn')} />
          <span className="status-text">{state.streaming ? 'ГЕНЕРАЦИЯ' : 'ОНЛАЙН'}</span>
        </div>
        <div className="sidebar-user">
          <div className="avatar">PS</div>
          <div className="brand-text">
            <div className="user-name">Пользователь</div>
            <div className="user-role">Operator</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
