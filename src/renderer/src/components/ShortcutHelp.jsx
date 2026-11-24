import React, { useEffect } from 'react';
import { useApp } from '../lib/store';
import Icon from './Icon';

const GROUPS = [
  {
    title: 'Интерфейс',
    items: [
      ['Ctrl+K', 'Палитра команд: разделы, темы, диалоги, промпты'],
      ['Ctrl+,', 'Настройки'],
      ['Ctrl+N', 'Новый диалог'],
      ['Ctrl+B', 'Свернуть / развернуть сайдбар'],
      ['Ctrl+1…9', 'Переключение разделов'],
      ['?', 'Эта справка'],
    ],
  },
  {
    title: 'Диалог',
    items: [
      ['Enter', 'Отправить сообщение'],
      ['Shift+Enter', 'Перенос строки'],
      ['Esc', 'Остановить генерацию / закрыть окно'],
      ['Ctrl+Shift+Space', 'Показать / скрыть PSYCHIC (глобально)'],
    ],
  },
  {
    title: 'Медиа и файлы',
    items: [
      ['Ctrl+O', 'Прикрепить файлы'],
      ['Ctrl+E', 'Экспорт текущего диалога'],
      ['Ctrl+M', 'Плеер: играть / пауза'],
    ],
  },
];

export default function ShortcutHelp() {
  const { closeModal } = useApp();

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeModal]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className="modal shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="keyboard" size={16} style={{ color: 'var(--accent)' }} />
          <div style={{ flex: 1 }}>
            <div className="modal-title">Горячие клавиши</div>
            <div className="modal-subtitle">Всё, что можно делать не трогая мышку</div>
          </div>
          <button className="icon-btn modal-close" onClick={closeModal}>
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="modal-body">
          <div className="shortcuts-grid">
            {GROUPS.map((group) => (
              <div key={group.title} className="shortcut-group">
                <div className="shortcut-group-title">{group.title}</div>
                {group.items.map(([keys, label]) => (
                  <div key={keys} className="shortcut-row">
                    <span className="keys">
                      {keys.split('+').map((k) => <kbd key={k}>{k}</kbd>)}
                    </span>
                    <span className="shortcut-label">{label}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <span style={{ fontSize: 10, color: 'var(--text-faint)', marginRight: 'auto' }}>
            Esc — закрыть
          </span>
          <button className="btn btn-primary" onClick={closeModal}>Понятно</button>
        </div>
      </div>
    </div>
  );
}
