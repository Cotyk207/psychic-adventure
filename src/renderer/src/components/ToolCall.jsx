import React, { useMemo, useState } from 'react';
import { toolMeta } from '../lib/toolMeta';
import { cn } from '../lib/utils';
import Icon from './Icon';

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ToolCall({ call }) {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(call.name);
  const status = call.status || (call.ok === false ? 'error' : 'done');
  const running = status === 'running';
  const error = status === 'error';
  const denied = !!call.denied;

  const argsText = useMemo(() => safeJson(call.args || {}), [call.args]);
  const resultText = typeof call.result === 'string'
    ? call.result
    : call.result != null
      ? safeJson(call.result)
      : '';
  const images = Array.isArray(call.images) ? call.images : [];
  const duration = call.duration ? `${call.duration} мс` : '';

  return (
    <div className={cn('tool-card', running && 'running', error && 'error', denied && 'denied')}>
      <div className="tool-head" onClick={() => setOpen((v) => !v)}>
        <div className="tool-icon">
          <Icon name={meta.icon} size={12} />
        </div>
        <span className="tool-name">{call.name}</span>
        <span className="tool-label">{meta.label}</span>
        <div className={cn('tool-status', running && 'running', status === 'done' && 'done', error && 'error', denied && 'denied')}>
          <span className="dot" />
          {running ? 'ВЫПОЛНЯЕТСЯ' : denied ? 'ОТКАЗАНО' : error ? 'ОШИБКА' : 'ГОТОВО'}
          {duration && !running ? ` · ${duration}` : ''}
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        </div>
      </div>
      {open && (
        <>
          <div className="tool-body">
            <div style={{ color: 'var(--text-faint)', marginBottom: 4 }}>АРГУМЕНТЫ</div>
            <div style={{ color: 'var(--accent)', opacity: 0.8 }}>{argsText}</div>
            {resultText && (
              <>
                <div style={{ color: 'var(--text-faint)', marginTop: 10, marginBottom: 4 }}>РЕЗУЛЬТАТ</div>
                <div className={cn(error && 'is-error')}>{resultText}</div>
              </>
            )}
          </div>
          {images.length > 0 && (
            <div className="tool-result-images">
              {images.map((img, i) => (
                <img key={i} src={img.dataUrl} alt={img.name || ''} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
