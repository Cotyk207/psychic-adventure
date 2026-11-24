import React from 'react';
import Logo from './Logo';

export default function LoadingScreen({ error }) {
  return (
    <div className="loading-screen">
      <div className="loading-inner">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
          <Logo size={72} />
        </div>
        <div className="loading-logo">PSYCHIC</div>
        <div className="loading-sub">
          {error ? 'ОШИБКА ЗАГРУЗКИ' : 'ИНИЦИАЛИЗАЦИЯ НЕЙРОСВЯЗИ'}
        </div>
        {!error && <div className="loading-bar" />}
        {error && (
          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--danger)', maxWidth: 420, lineHeight: 1.6 }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
