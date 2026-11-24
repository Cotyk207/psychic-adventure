import React from 'react';
import { useApp } from '../lib/store';
import { cn, pluralRu } from '../lib/utils';
import Icon from './Icon';

export default function StatusBar() {
  const { state } = useApp();
  const provider = (state.providers || []).find((p) => p.id === (state.chat?.provider || state.config?.chat?.defaultProvider));
  const model = state.chat?.model || state.config?.chat?.defaultModel;
  const mode = state.config?.permissions?.mode || 'workspace';
  const modeLabel = {
    full: 'ПОЛНЫЙ ДОСТУП',
    workspace: 'РАБОЧАЯ ПАПКА',
    confirm: 'С ПОДТВЕРЖДЕНИЕМ',
    readonly: 'ТОЛЬКО ЧТЕНИЕ',
  }[mode] || mode;
  const streaming = !!state.streaming;

  return (
    <footer className="statusbar">
      <div className="statusbar-group">
        <span className={cn('status-dot', streaming && 'warn')} />
        <span>{streaming ? 'ГЕНЕРАЦИЯ' : 'NEURAL LINK: STABLE'}</span>
      </div>
      <span className="statusbar-sep" />
      <div className="statusbar-group">
        <Icon name="shield" size={11} />
        <span>{modeLabel}</span>
      </div>
      <span className="statusbar-sep" />
      <div className="statusbar-group">
        <Icon name="folder" size={11} />
        <span className="truncate" style={{ maxWidth: 260 }} title={state.appInfo?.paths?.workspace}>
          {state.appInfo?.paths?.workspace || '—'}
        </span>
      </div>

      <div className="statusbar-right">
        <div className="statusbar-group">
          <Icon name="cpu" size={11} />
          <span>{provider?.name || 'нет провайдера'}</span>
          {model && <span style={{ color: 'var(--accent)' }}>· {model}</span>}
        </div>
        <span className="statusbar-sep" />
        <div className="statusbar-group">
          <Icon name="brain" size={11} />
          <span>{state.memory.length} {pluralRu(state.memory.length, 'запись', 'записи', 'записей')}</span>
        </div>
        <span className="statusbar-sep" />
        <div className="statusbar-group">
          <Icon name="sparkles" size={11} />
          <span>{state.skills.filter((s) => s.enabled).length} скиллов</span>
        </div>
        <span className="statusbar-sep" />
        <span className="statusbar-group">v{state.appInfo?.version || '1.0.0'}</span>
      </div>
    </footer>
  );
}
