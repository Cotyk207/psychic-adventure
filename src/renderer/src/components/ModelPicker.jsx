import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn } from '../lib/utils';
import Icon from './Icon';

export default function ModelPicker() {
  const { state, dispatch, updateConfig, openSettings } = useApp();
  const [query, setQuery] = useState('');

  const providers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (state.providers || [])
      .filter((p) => p.enabled !== false && p.models && p.models.length)
      .map((p) => ({
        ...p,
        models: q
          ? p.models.filter((m) => m.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
          : p.models,
      }))
      .filter((p) => p.models.length);
  }, [state.providers, query]);

  const choose = async (provider, model) => {
    if (state.chat) {
      const chat = { ...state.chat, provider: provider.id, model };
      dispatch({ type: 'SET_CHAT', chat });
      try {
        await invoke('chats:save', { chat });
      } catch {}
    }
    await updateConfig('chat.defaultProvider', provider.id);
    await updateConfig('chat.defaultModel', model);
    dispatch({ type: 'SET_MODAL', modal: null });
  };

  return (
    <div className="modal-backdrop" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>
      <div className="modal" style={{ width: 'min(580px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="cpu" size={16} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="modal-title">Выбор модели</div>
            <div className="modal-subtitle">Бесплатные провайдеры можно включить в настройках</div>
          </div>
          <button className="icon-btn modal-close" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: '12px 18px 0' }}>
          <div className="search-input">
            <Icon name="search" size={14} />
            <input
              className="input"
              placeholder="Поиск модели или провайдера…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '52vh', paddingTop: 12 }}>
          {providers.map((provider) => (
            <div key={provider.id} style={{ marginBottom: 14 }}>
              <div className="provider-name" style={{ marginBottom: 6, padding: '0 2px' }}>
                <span
                  className="provider-logo"
                  style={{ width: 20, height: 20, fontSize: 9, borderRadius: 5 }}
                >
                  {provider.name.slice(0, 2).toUpperCase()}
                </span>
                {provider.name}
                {provider.badge && <span className={`badge ${provider.free ? 'free' : 'paid'}`}>{provider.badge}</span>}
                {provider.local && <span className="badge local">LOCAL</span>}
              </div>
              <div className="model-list">
                {provider.models.map((model) => {
                  const active = model === (state.chat?.model || state.config?.chat?.defaultModel)
                    && provider.id === (state.chat?.provider || state.config?.chat?.defaultProvider);
                  return (
                    <div
                      key={model}
                      className={cn('model-row', active && 'active')}
                      onClick={() => choose(provider, model)}
                      style={active ? { background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' } : {}}
                    >
                      {model}
                      {/:free|free$/i.test(model) && <span className="free">FREE</span>}
                      {active && <Icon name="check" size={12} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!providers.length && (
            <div className="empty">
              <Icon name="plug" size={32} />
              <div className="empty-title">Нет доступных моделей</div>
              <div className="empty-text">
                Добавь API-ключ бесплатного провайдера — и модели появятся здесь.
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => openSettings('providers')}>
            <Icon name="settings" size={14} /> Управление провайдерами
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
