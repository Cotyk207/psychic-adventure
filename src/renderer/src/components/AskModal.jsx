import React, { useState } from 'react';
import { useApp } from '../lib/store';
import Icon from './Icon';

export default function AskModal() {
  const { state, resolveAsk } = useApp();
  const request = state.ask;
  const [value, setValue] = useState('');
  if (!request) return null;
  const options = request.options || [];

  return (
    <div className="modal-backdrop" style={{ zIndex: 2500 }}>
      <div className="modal" style={{ width: 'min(520px, 94vw)' }}>
        <div className="modal-head">
          <div className="perm-icon" style={{ background: 'color-mix(in srgb, var(--accent-3) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-3) 40%, transparent)', color: 'var(--accent-3)' }}>
            <Icon name="message-circle-question" size={20} />
          </div>
          <div>
            <div className="modal-title">PSYCHIC уточняет</div>
            <div className="modal-subtitle">Ответ поможет сделать всё правильно</div>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: options.length ? 16 : 4 }}>
            {request.question}
          </div>
          {options.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {options.map((option) => (
                <button key={option} className="ask-option" onClick={() => resolveAsk(option)}>
                  <Icon name="chevron-right" size={13} />
                  {option}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input
              className="input"
              placeholder="Или напиши свой ответ…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && value.trim()) resolveAsk(value.trim());
              }}
              autoFocus
            />
            <button className="btn btn-primary" onClick={() => resolveAsk(value.trim() || '(без ответа)')}>
              Ответить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
