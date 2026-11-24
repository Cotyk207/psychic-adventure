import React, { useEffect } from 'react';
import { AppProvider, useApp } from './lib/store';
import { cn } from './lib/utils';
import { invoke } from './lib/api';
import Icon from './components/Icon';
import BackgroundFX from './components/BackgroundFX';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import StatusBar from './components/StatusBar';
import PlayerBar from './components/PlayerBar';
import Toaster from './components/Toaster';
import LoadingScreen from './components/LoadingScreen';
import SettingsModal from './components/SettingsModal';
import CommandPalette from './components/CommandPalette';
import ModelPicker from './components/ModelPicker';
import PermissionModal from './components/PermissionModal';
import AskModal from './components/AskModal';
import Onboarding from './components/Onboarding';
import SkillEditor from './components/SkillEditor';
import SkillsPanel from './components/SkillsPanel';
import MediaStudio from './components/MediaStudio';
import BrowserPanel from './components/BrowserPanel';
import FilesPanel from './components/FilesPanel';
import TerminalPanel from './components/TerminalPanel';
import MusicPanel from './components/MusicPanel';
import MemoryPanel from './components/MemoryPanel';
import MediaRenderer from './components/MediaRenderer';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './components/Dashboard';
import ShortcutHelp from './components/ShortcutHelp';
import ContextMenu from './components/ContextMenu';
import ReasoningModal from './components/ReasoningModal';
import { getModelMeta } from './lib/models';

const VIEW_META = {
  dashboard: { title: 'Обзор', icon: 'zap' },
  chat: { title: 'Диалог', icon: 'message-square' },
  skills: { title: 'Скиллы', icon: 'sparkles' },
  media: { title: 'Медиа-студия', icon: 'image' },
  browser: { title: 'Браузер', icon: 'globe' },
  files: { title: 'Файлы', icon: 'folder' },
  terminal: { title: 'Терминал', icon: 'terminal' },
  music: { title: 'Музыка', icon: 'music' },
  memory: { title: 'Память', icon: 'brain' },
};

const VIEW_ORDER = ['dashboard', 'chat', 'skills', 'media', 'browser', 'files', 'terminal', 'music', 'memory'];

function MainHead() {
  const { state, dispatch, openSettings } = useApp();
  const meta = VIEW_META[state.view] || VIEW_META.chat;
  const provider = (state.providers || []).find((p) => p.id === (state.chat?.provider || state.config?.chat?.defaultProvider));
  const model = state.chat?.model || state.config?.chat?.defaultModel;
  const modelMeta = getModelMeta(provider?.id, model);
  const reasoningCount = (state.messages || []).filter((m) => m.role === 'assistant' && m.reasoning).length
    + (state.streaming?.chatId === state.activeChatId && state.streaming?.reasoning ? 1 : 0);

  return (
    <div className="main-head">
      {state.view === 'chat' ? (
        <div className="main-title">{state.chat?.title || 'Новый диалог'}</div>
      ) : (
        <div className="main-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={meta.icon} size={15} style={{ color: 'var(--accent)' }} />
          {meta.title}
        </div>
      )}

      <div className="main-head-actions">
        {state.view === 'chat' && (
          <>
            <button
              className={cn('reasoning-head-btn', reasoningCount > 0 && 'has-items')}
              onClick={() => dispatch({ type: 'SET_MODAL', modal: 'reasoning' })}
              title="Посмотреть ход рассуждений ИИ в этом диалоге"
            >
              <Icon name="brain" size={14} />
              <span>Рассуждения</span>
              {reasoningCount > 0 && <span className="count">{reasoningCount}</span>}
            </button>
            <button className="model-pill" onClick={() => dispatch({ type: 'SET_MODAL', modal: 'modelPicker' })}>
              <span className="dot" />
              <span>{modelMeta.name || model || 'выбрать модель'}</span>
              {provider && <span style={{ color: 'var(--text-faint)' }}>· {provider.name}</span>}
            </button>
          </>
        )}
        <button className="icon-btn" onClick={() => dispatch({ type: 'SET_MODAL', modal: 'palette' })} title="Палитра команд (Ctrl+K)">
          <Icon name="search" size={15} />
        </button>
        <button className="icon-btn" onClick={() => openSettings('general')} title="Настройки (Ctrl+,)">
          <Icon name="settings" size={15} />
        </button>
      </div>
    </div>
  );
}

function Shell() {
  const { state, dispatch, setView, createChat, openSettings, closeModal, updateConfig, stopGeneration, player, toast } = useApp();

  useEffect(() => {
    const onKeyDown = (event) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'k') {
        event.preventDefault();
        dispatch({ type: 'SET_MODAL', modal: state.modal === 'palette' ? null : 'palette' });
      } else if (mod && event.key === ',') {
        event.preventDefault();
        openSettings('general');
      } else if (mod && key === 'n' && !event.shiftKey) {
        event.preventDefault();
        createChat();
      } else if (mod && key === 'b') {
        event.preventDefault();
        updateConfig('appearance.sidebarCollapsed', !state.config?.appearance?.sidebarCollapsed);
      } else if (mod && key === 'o') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('psychic:attach'));
      } else if (mod && key === 'e') {
        event.preventDefault();
        if (state.activeChatId) {
          invoke('chats:export', { id: state.activeChatId })
            .then((path) => { if (path) toast(`Диалог экспортирован: ${path}`, 'success'); })
            .catch((err) => toast(err.message, 'error'));
        }
      } else if (mod && key === 'm') {
        event.preventDefault();
        player.toggle();
      } else if (mod && /^[1-9]$/.test(event.key) && !event.shiftKey) {
        event.preventDefault();
        const view = VIEW_ORDER[Number(event.key) - 1];
        if (view) setView(view);
      } else if (event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        dispatch({ type: 'SET_MODAL', modal: state.modal === 'shortcuts' ? null : 'shortcuts' });
      } else if (event.key === 'Escape') {
        if (state.modal) closeModal();
        else if (state.streaming) stopGeneration();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state.modal, state.view, state.config, state.streaming, state.activeChatId, dispatch, setView, createChat, openSettings, closeModal, updateConfig, stopGeneration, player, toast]);

  if (state.splash || !state.booted) return <LoadingScreen />;
  if (state.bootError && !state.config) return <LoadingScreen error={state.bootError} />;

  const renderView = () => {
    switch (state.view) {
      case 'dashboard': return <Dashboard />;
      case 'skills': return <SkillsPanel />;
      case 'media': return <MediaStudio />;
      case 'browser': return <BrowserPanel />;
      case 'files': return <FilesPanel />;
      case 'terminal': return <TerminalPanel />;
      case 'music': return <MusicPanel />;
      case 'memory': return <MemoryPanel />;
      default: return <ChatView />;
    }
  };

  return (
    <div className="app">
      <BackgroundFX />
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className={cn('main', state.view === 'browser' && 'browser-main')}>
          <MainHead />
          <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
            {renderView()}
          </div>
        </main>
      </div>
      <PlayerBar />
      <StatusBar />
      <Toaster />
      <MediaRenderer />
      <ContextMenu />

      {state.modal === 'settings' && <SettingsModal initialTab={state.settingsTab} />}
      {state.modal === 'shortcuts' && <ShortcutHelp />}
      {state.modal === 'palette' && <CommandPalette />}
      {state.modal === 'modelPicker' && <ModelPicker />}
      {state.modal === 'reasoning' && <ReasoningModal data={state.modalData} />}
      {state.modal === 'skillEditor' && <SkillEditor skill={state.modalData} />}
      {state.permission && <PermissionModal />}
      {state.ask && <AskModal />}
      {state.config && !state.config.onboardingDone && <Onboarding />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  );
}
