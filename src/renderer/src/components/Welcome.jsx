import React from 'react';
import { useApp } from '../lib/store';
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
  const { state, sendMessage } = useApp();
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
