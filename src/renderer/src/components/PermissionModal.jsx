import React from 'react';
import { useApp } from '../lib/store';
import Icon from './Icon';

export default function PermissionModal() {
  const { state, resolvePermission } = useApp();
  const request = state.permission;
  if (!request) return null;

  const dangerous = request.tool?.risk === 'exec' || request.tool?.risk === 'write';

  return (
    <div className="modal-backdrop" style={{ zIndex: 2500 }}>
      <div className="modal perm-modal">
        <div className="modal-head" style={{ alignItems: 'flex-start' }}>
          <div className={`perm-icon ${dangerous ? 'danger' : ''}`}>
            <Icon name={dangerous ? 'alert-triangle' : 'shield'} size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="modal-title">Запрос разрешения</div>
            <div className="modal-subtitle">
              {request.tool?.label || request.tool?.name} · {request.tool?.riskLabel || request.tool?.risk}
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="label" style={{ marginBottom: 6 }}>PSYCHIC хочет выполнить действие</div>
          <div className="perm-summary">{request.summary || request.tool?.name}</div>
          {request.args && Object.keys(request.args).length > 0 && (
            <pre className="perm-args">{JSON.stringify(request.args, null, 2)}</pre>
          )}
          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Ты можешь разрешить один раз, до конца сессии или отклонить.
            Настройки доступа меняются в разделе «Инструменты».
          </div>
        </div>
        <div className="modal-foot" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => resolvePermission('deny')}>
            Отклонить
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => resolvePermission('always')}>
              Всегда разрешать
            </button>
            <button className="btn btn-primary" onClick={() => resolvePermission('allow')}>
              <Icon name="check" size={14} /> Разрешить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
