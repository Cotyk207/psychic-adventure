import React from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { THEMES } from '../lib/themes';
import Icon from './Icon';
import Logo from './Logo';

export default function TitleBar() {
  const { state, openSettings, dispatch, updateConfig } = useApp();
  const config = state.config;
  const appearance = config?.appearance || {};
  const themeId = appearance.theme;
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const version = state.appInfo?.version || '1.0.0';

  const cycleTheme = () => {
    const idx = THEMES.findIndex((t) => t.id === themeId);
    const next = THEMES[(idx + 1) % THEMES.length];
    updateConfig('appearance.theme', next.id);
  };

  const openPalette = () => dispatch({ type: 'SET_MODAL', modal: 'palette' });

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <div className="brand">
          <div className="brand-mark">
            <Logo size={26} />
          </div>
          <div className="brand-text">
            <div className="brand-name">PSYCHIC</div>
          </div>
          <span className="brand-version">v{version}</span>
        </div>
      </div>

      <div className="titlebar-center">
        <button className="btn btn-ghost btn-sm" onClick={openPalette} title="Командная палитра (Ctrl+K)">
          <Icon name="search" size={13} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em' }}>
            CTRL + K
          </span>
        </button>
        <button
          className="icon-btn"
          onClick={cycleTheme}
          title={`Тема: ${theme.name}. Нажми, чтобы сменить.`}
        >
          <Icon name="palette" size={15} />
        </button>
        <button className="icon-btn" onClick={() => openSettings('appearance')} title="Настройки">
          <Icon name="settings" size={15} />
        </button>
      </div>

      <div className="titlebar-right">
        <div className="window-controls">
          <button className="win-btn" onClick={() => invoke('app:minimize')} title="Свернуть">
            <Icon name="minimize" size={13} />
          </button>
          <button
            className="win-btn"
            onClick={() => invoke('app:toggleMaximize')}
            title={state.windowState.maximized ? 'Восстановить' : 'Развернуть'}
          >
            <Icon name={state.windowState.maximized ? 'minimize' : 'maximize'} size={11} />
          </button>
          <button className="win-btn close" onClick={() => invoke('app:close')} title="Закрыть">
            <Icon name="x" size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
