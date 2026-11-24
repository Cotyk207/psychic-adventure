import React from 'react';
import { useApp } from '../lib/store';
import Icon from './Icon';

const ICONS = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'alert-triangle',
  info: 'info',
};

export default function Toaster() {
  const { state, dispatch } = useApp();
  if (!state.toasts.length) return null;
  return (
    <div className="toaster">
      {state.toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          <Icon name={ICONS[toast.type] || 'info'} size={16} className="toast-icon" />
          <div style={{ flex: 1, minWidth: 0 }}>
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
          </div>
          <button
            className="icon-btn sm"
            style={{ marginTop: 2 }}
            onClick={() => dispatch({ type: 'REMOVE_TOAST', id: toast.id })}
            aria-label="Закрыть"
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
