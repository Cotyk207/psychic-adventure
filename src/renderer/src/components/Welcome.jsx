import React, { useState } from 'react';
import { useApp } from '../lib/store';
import { cn } from '../lib/utils';
import Icon from './Icon';

const SUGGESTIONS = [
  {
    icon: 'code',
    title: 'Напиши код',
    text: 'Создай Telegram-бота на Python с кнопками и базой данных',
    prompt: 'Создай Telegram-бота на Python с кнопками и базой данных. Положи проект в рабочую папку и объясни, как запустить.',
  },
  {
    icon: 'image',
    title: 'Сгенерируй картинку',
    text: 'Киберпанк-город под дождём, неон, кинематографично',
    prompt: 'Сгенерируй картинку: киберпанк-город под дождём, неоновые вывески, отражения на мокром асфальте, кинематографичный свет.',
  },
  {
    icon: 'globe',
    title: 'Найди в интернете',
    text: 'Что нового в мире ИИ за последнюю неделю?',
    prompt: 'Найди в интернете, что нового произошло в мире ИИ за последнюю неделю. Дай краткую выжимку со ссылками.',
  },
  {
    icon: 'terminal',
    title: 'Работа с ПК',
    text: 'Покажи файлы на рабочем столе и наведи порядок',
    prompt: 'Покажи, какие файлы лежат на рабочем столе, и предложи, как навести порядок.',
  },
  {
    icon: 'music',
    title: 'Создай музыку',
    text: 'Синтвейв-трек на 40 секунд для работы',
    prompt: 'Создай синтвейв-трек на 40 секунд — энергичный, для работы за компьютером.',
  },
  {
    icon: 'brain',
    title: 'Запомни контекст',
    text: 'Запомни: я учу Python и делаю ботов',
    prompt: 'Запомни: я учу Python и делаю Telegram-ботов. Учти это в будущих ответах.',
  },
];

export default function Welcome() {
  const { state, sendMessage, savePrompt, deletePrompt, toast } = useApp();
  const [showPrompts, setShowPrompts] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const prompts = state.config?.chat?.prompts || [];
  const provider = (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);
  const model = state.config?.chat?.defaultModel;
  const enabledSkills = state.skills.filter((s) => s.enabled).length;

  return (
    <div className="welcome">
      <div className="welcome-badge">
        <span className="status-dot" style={{ animation: 'none' }} />
        NEURAL LINK ESTABLISHED
      </div>
      <h1 className="welcome-logo" data-text="PSYCHIC">
        PSYCHIC
      </h1>
      <p className="welcome-sub">
        Локальный ИИ-ассистент с доступом к твоему компьютеру. Пиши код, создавай приложения,
        ищи в интернете, генерируй картинки и музыку — всё в одном неоновом интерфейсе.
      </p>

      <div className="welcome-stats">
        <div className="welcome-stat">
          <Icon name="cpu" size={12} />
          <b>{model || 'модель не выбрана'}</b>
        </div>
        <div className="welcome-stat">
          <Icon name="plug" size={12} />
          <b>{provider?.name || 'провайдер'}</b>
        </div>
        <div className="welcome-stat">
          <Icon name="sparkles" size={12} />
          <b>{enabledSkills}</b> скиллов активно
        </div>
        <div className="welcome-stat">
          <Icon name="shield" size={12} />
          <b>{state.config?.permissions?.mode || 'workspace'}</b>
        </div>
      </div>

      <div className="welcome-prompts">
        <button className="welcome-prompts-toggle" onClick={() => setShowPrompts((v) => !v)}>
          <Icon name={showPrompts ? 'chevron-down' : 'bookmark'} size={13} />
          Мои промпты
          <span className="badge">{prompts.length}</span>
        </button>
        {showPrompts && (
          <div className="welcome-prompts-body">
            {prompts.map((prompt) => (
              <div key={prompt.id} className="prompt-row">
                <button className="prompt-use" onClick={() => sendMessage(prompt.text)} title={prompt.text}>
                  <Icon name="corner-down-left" size={11} />
                  <span className="truncate">{prompt.title}</span>
                </button>
                <button
                  className="icon-btn sm danger"
                  onClick={() => deletePrompt(prompt.id)}
                  title="Удалить промпт"
                >
                  <Icon name="trash" size={11} />
                </button>
              </div>
            ))}
            <div className="prompt-add">
              <input
                className="input sm"
                placeholder="Свой промпт: «Перепиши текст короче и по делу»"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== 'Enter') return;
                  const text = newPrompt.trim();
                  if (!text) return;
                  await savePrompt(text.slice(0, 40), text);
                  setNewPrompt('');
                  toast('Промпт сохранён', 'success');
                }}
              />
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const text = newPrompt.trim();
                  if (!text) return;
                  await savePrompt(text.slice(0, 40), text);
                  setNewPrompt('');
                  toast('Промпт сохранён', 'success');
                }}
              >
                <Icon name="plus" size={12} /> Сохранить
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s.title} className="suggestion" onClick={() => sendMessage(s.prompt)}>
            <div className="suggestion-icon">
              <Icon name={s.icon} size={15} />
            </div>
            <div className="suggestion-title">{s.title}</div>
            <div className="suggestion-text">{s.text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
