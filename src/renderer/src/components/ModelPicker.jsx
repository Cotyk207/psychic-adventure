import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke, isAndroidApp } from '../lib/api';
import { cn } from '../lib/utils';
import { getModelMeta, providerAccessGroup } from '../lib/models';
import Icon from './Icon';

const FILTERS = [
  ['all', 'Все бесплатные'],
  ['nokey', 'Без ключа'],
  ['freekey', 'По ключу'],
  ['pinned', '★ Избранные'],
];

export default function ModelPicker() {
  const { state, dispatch, updateConfig, openSettings, togglePinModel } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const pinnedSet = useMemo(
    () => new Set(Array.isArray(state.config?.models?.pinned) ? state.config.models.pinned : []),
    [state.config?.models?.pinned]
  );

  const activeProviderId = state.chat?.provider || state.config?.chat?.defaultProvider;
  const activeModel = state.chat?.model || state.config?.chat?.defaultModel;

  const { readyProviders, lockedProviders } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ready = [];
    const locked = [];

    for (const p of state.providers || []) {
      if (p.custom && (!p.models || !p.models.length)) continue;
      const group = providerAccessGroup(p);
      if (filter === 'nokey' && group !== 'nokey') continue;
      if (filter === 'freekey' && group !== 'freekey') continue;

      const models = (p.models || []).filter((m) => {
        if (filter === 'pinned' && !pinnedSet.has(`${p.id}::${m}`)) return false;
        if (!q) return true;
        const meta = getModelMeta(p.id, m);
        return (
          m.toLowerCase().includes(q) ||
          meta.name.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q)
        );
      });

      if (!models.length) continue;

      const isReady = p.enabled !== false && (group === 'nokey' || Boolean(p.apiKey) || !p.keyUrl);
      if (isReady) ready.push({ ...p, group, models });
      else if (filter !== 'pinned') locked.push({ ...p, group, models });
    }

    return { readyProviders: ready, lockedProviders: locked };
  }, [state.providers, query, filter, pinnedSet]);

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
      <div className="modal model-picker-modal" style={{ width: 'min(620px, 95vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="cpu" size={16} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="modal-title">Выбор бесплатной модели</div>
            <div className="modal-subtitle">Только бесплатные нейросети: сразу без ключа или по бесплатному ключу</div>
          </div>
          <button className="icon-btn modal-close" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: '12px 18px 0' }}>
          <div className="search-input model-search-pill">
            <Icon name="search" size={15} />
            <input
              className="input"
              placeholder="Поиск моделей…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus={!isAndroidApp() && (typeof window === 'undefined' || window.innerWidth > 860)}
            />
          </div>

          <div className="picker-tabs">
            {FILTERS.map(([id, label]) => (
              <button
                key={id}
                className={cn('picker-tab', filter === id && 'active')}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '56vh', paddingTop: 10 }}>
          {readyProviders.map((provider) => (
            <div key={provider.id} className="picker-provider-group">
              <div className="picker-provider-head" style={{ '--prov-color': provider.color || 'var(--accent)' }}>
                <span className="picker-provider-title">{provider.name}</span>
                <span className={cn('badge', provider.group === 'nokey' ? 'free' : 'local')}>
                  {provider.local ? 'ЛОКАЛЬНО · БЕЗ КЛЮЧА' : provider.group === 'nokey' ? 'БЕЗ КЛЮЧА' : 'БЕСПЛАТНО · КЛЮЧ ОК'}
                </span>
              </div>

              <div className="picker-model-list">
                {provider.models.map((model) => {
                  const meta = getModelMeta(provider.id, model);
                  const active = model === activeModel && provider.id === activeProviderId;
                  const pinned = pinnedSet.has(`${provider.id}::${model}`);

                  return (
                    <div
                      key={model}
                      className={cn('picker-model-item', active && 'active')}
                      onClick={() => choose(provider, model)}
                    >
                      <div className="picker-model-main">
                        <div className="picker-model-title-row">
                          <span className="picker-model-name">{meta.name}</span>
                          {meta.name.toLowerCase() !== model.toLowerCase() && (
                            <span className="picker-model-id">{model}</span>
                          )}
                        </div>
                        <div className="picker-model-sub">
                          {meta.reasoning && (
                            <span
                              className="cap-chip reasoning"
                              title={meta.efforts.length ? `Уровни рассуждения: ${meta.efforts.join(', ')}` : 'Рассуждающая модель'}
                            >
                              <Icon name="brain" size={11} />
                            </span>
                          )}
                          {meta.vision && (
                            <span className="cap-chip" title="Понимает изображения">
                              <Icon name="image" size={11} />
                            </span>
                          )}
                          {meta.context && <span>{meta.context}</span>}
                          <span>·</span>
                          <span className="free-tag">
                            {provider.group === 'nokey' ? 'бесплатно · без ключа' : 'бесплатно'}
                          </span>
                        </div>
                      </div>

                      <div className="picker-model-right">
                        {active && <Icon name="check" size={14} style={{ color: 'var(--accent)' }} />}
                        <button
                          className={cn('star-btn', pinned && 'pinned')}
                          title={pinned ? 'Убрать из избранного' : 'В избранное'}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinModel(provider.id, model);
                          }}
                        >
                          <Icon name="star" size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {lockedProviders.length > 0 && (
            <div className="picker-locked-section">
              <div className="picker-locked-banner">
                <Icon name="key" size={13} />
                <span>Ещё больше бесплатных моделей — добавь бесплатный ключ провайдера:</span>
              </div>
              {lockedProviders.map((provider) => (
                <div key={provider.id} className="picker-locked-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600 }}>
                      <span style={{ color: provider.color || 'var(--accent)' }}>{provider.name}</span>
                      <span className="badge free">БЕСПЛАТНО ПО КЛЮЧУ</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
                      {provider.models.slice(0, 4).map((m) => getModelMeta(provider.id, m).name).join(' · ')}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => openSettings('providers')}
                  >
                    <Icon name="plug" size={12} /> Подключить
                  </button>
                </div>
              ))}
            </div>
          )}

          {!readyProviders.length && !lockedProviders.length && (
            <div className="empty">
              <Icon name="search" size={32} />
              <div className="empty-title">Модели не найдены</div>
              <div className="empty-text">
                Попробуй изменить поисковый запрос или переключить вкладку фильтра.
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={() => openSettings('providers')}>
            <Icon name="sliders" size={14} /> Провайдеры
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'SET_MODAL', modal: null })}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
