import React, { useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { copyToClipboard, formatTime } from '../lib/utils';
import { EFFORT_META } from '../lib/models';
import Icon from './Icon';

export default function ReasoningModal({ data }) {
  const { state, closeModal, updateConfig, toast } = useApp();
  const [filter, setFilter] = useState('');

  const singleMessage = data?.message || null;
  const showInline = state.config?.chat?.showReasoning !== false;

  const entries = useMemo(() => {
    if (singleMessage) {
      return singleMessage.reasoning ? [singleMessage] : [];
    }
    const list = (state.messages || []).filter((m) => m.role === 'assistant' && m.reasoning);
    if (state.streaming?.chatId === state.activeChatId && state.streaming?.reasoning) {
      list.push({
        id: state.streaming.messageId || 'streaming',
        role: 'assistant',
        model: state.streaming.model,
        reasoning: state.streaming.reasoning,
        reasoningEffort: state.streaming.reasoningEffort,
        streaming: true,
      });
    }
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((m) => String(m.reasoning || '').toLowerCase().includes(q));
  }, [singleMessage, state.messages, state.streaming, state.activeChatId, filter]);

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal" style={{ width: 'min(720px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="brain" size={17} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="modal-title">
              {singleMessage ? 'Рассуждения ИИ к ответу' : 'Ход рассуждений ИИ в диалоге'}
            </div>
            <div className="modal-subtitle">
              Внутренняя цепочка мыслей нейросети перед формированием итогового ответа
            </div>
          </div>
          <button className="icon-btn modal-close" onClick={closeModal} title="Закрыть">
            <Icon name="x" size={15} />
          </button>
        </div>

        {!singleMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px 0', flexWrap: 'wrap' }}>
            <div className="search-input" style={{ flex: 1, minWidth: 200 }}>
              <Icon name="search" size={14} />
              <input
                className="input sm"
                placeholder="Поиск по мыслям ИИ…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <button
              className={`btn btn-sm ${showInline ? 'btn-primary' : ''}`}
              onClick={() => updateConfig('chat.showReasoning', !showInline)}
              title="Автоматически показывать блок рассуждений над ответами в чате"
            >
              <Icon name={showInline ? 'eye' : 'eye-off'} size={13} />
              {showInline ? 'Блок в чате: Вкл' : 'Блок в чате: Скрыт'}
            </button>
          </div>
        )}

        <div className="modal-body" style={{ maxHeight: '62vh', paddingTop: 14 }}>
          {entries.length > 0 ? (
            entries.map((entry, idx) => {
              const effortInfo = entry.reasoningEffort ? EFFORT_META[entry.reasoningEffort] : null;
              const words = String(entry.reasoning || '').trim().split(/\s+/).filter(Boolean).length;
              return (
                <div key={entry.id || idx} className="reasoning-card-full">
                  <div className="reasoning-card-head">
                    <span className="reasoning-badge">
                      <Icon name="brain" size={12} />
                      {entry.streaming ? 'Рассуждает сейчас…' : `Шаг #${idx + 1}`}
                    </span>
                    {entry.model && <span className="msg-model">{entry.model}</span>}
                    {effortInfo && (
                      <span className="reasoning-effort-pill" title={effortInfo.desc}>
                        Уровень: {effortInfo.label}
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                      {words} сл. · {entry.reasoning.length} симв.
                      {entry.createdAt ? ` · ${formatTime(entry.createdAt)}` : ''}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ marginLeft: 'auto' }}
                      onClick={async () => {
                        await copyToClipboard(entry.reasoning);
                        toast('Рассуждения скопированы', 'success');
                      }}
                    >
                      <Icon name="copy" size={12} /> Копировать
                    </button>
                  </div>
                  <pre className="reasoning-card-text">{entry.reasoning}</pre>
                </div>
              );
            })
          ) : (
            <div className="empty" style={{ padding: '32px 16px' }}>
              <Icon name="brain" size={34} />
              <div className="empty-title">Пока нет записанных рассуждений</div>
              <div className="empty-text">
                Выбери рассуждающую модель (со значком мозга в списке моделей — например Tidepool Alpha Free,
                DeepSeek V4.1 Flash Free, Hy4 flash Free, DeepSeek R1 или Gemini 2.5) и задай вопрос.
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={closeModal}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}
