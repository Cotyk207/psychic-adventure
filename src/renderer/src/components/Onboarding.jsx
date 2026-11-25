import React from 'react';
import { useApp } from '../lib/store';
import { isAndroidApp } from '../lib/api';
import Icon from './Icon';
import Logo from './Logo';

export default function Onboarding() {
  const { state, updateConfig, openSettings } = useApp();
  const provider = (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);
  const androidApp = isAndroidApp();

  const features = [
    { icon: 'cpu', title: 'Только бесплатные модели', text: 'OpenCode Console и Pollinations работают сразу без ключа. Groq, Gemini, OpenRouter Free и GitHub Models — бесплатно по ключу.' },
    { icon: 'brain', title: 'Управление рассуждениями ИИ', text: 'Смотри ход мыслей нейросети и настраивай глубину рассуждений: от быстрого ответа до максимума.' },
    {
      icon: 'folder',
      title: androidApp ? 'Файлы и буфер обмена' : 'Доступ к компьютеру',
      text: androidApp
        ? 'Читает и создаёт файлы в хранилище приложения, работает с буфером обмена по долгому нажатию.'
        : 'Читает и создаёт файлы, запускает команды, копирует и вставляет по правой кнопке мыши.',
    },
    { icon: 'image', title: 'Картинки, музыка, видео', text: 'Генератор изображений с авто-резервом, процедурный синтезатор музыки и создание видео.' },
  ];

  const finish = () => updateConfig('onboardingDone', true);

  return (
    <div className="modal-backdrop" style={{ zIndex: 2400 }}>
      <div className="modal onboarding">
        <div className="onboarding-hero">
          <div className="onboarding-logo-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Logo size={56} />
          </div>
          <div className="onboarding-title">PSYCHIC</div>
          <div className="onboarding-sub">
            {androidApp
              ? 'Автономный киберпанк-ассистент на твоём смартфоне. Всё бесплатно, всё настраивается, все данные хранятся у тебя.'
              : 'Локальный киберпанк-ассистент с полным доступом к компьютеру. Всё бесплатно, всё настраивается, всё остаётся у тебя.'}
          </div>
        </div>

        <div className="onboarding-body">
          <div className="onboarding-steps">
            {features.map((feature) => (
              <div key={feature.title} className="onboarding-step">
                <div className="onboarding-step-num">
                  <Icon name={feature.icon} size={12} />
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{feature.title}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2, lineHeight: 1.45 }}>
                    {feature.text}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="onboarding-model-pill" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg0) 40%, transparent)', marginBottom: 16 }}>
            <Icon name="cpu" size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)', minWidth: 0 }}>
              Текущая модель: <b style={{ color: 'var(--text)' }}>{state.config?.chat?.defaultModel}</b> · {provider?.name}
            </span>
          </div>

          <div className="onboarding-actions">
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={finish}>
              <Icon name="zap" size={15} /> Начать работу
            </button>
            <button className="btn btn-lg" onClick={() => { finish(); openSettings('providers'); }}>
              <Icon name="plug" size={15} /> Подключить модели
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            {androidApp
              ? 'Настройки всегда доступны по значку шестерёнки сверху или в меню'
              : 'Настройки всегда доступны по Ctrl + , или в сайдбаре'}
          </div>
        </div>
      </div>
    </div>
  );
}
