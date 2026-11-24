import React from 'react';
import { useApp } from '../lib/store';
import Icon from './Icon';
import Logo from './Logo';

const FEATURES = [
  { icon: 'cpu', title: 'Бесплатные модели', text: 'Pollinations работает сразу без ключа. Подключай Groq, Gemini, OpenRouter, Ollama.' },
  { icon: 'folder', title: 'Доступ к компьютеру', text: 'Читает и создаёт файлы, запускает команды, открывает приложения — под твоим контролем.' },
  { icon: 'globe', title: 'Поиск в интернете', text: 'Находит актуальную информацию и читает страницы встроенным браузером.' },
  { icon: 'image', title: 'Картинки, музыка, видео', text: 'Генератор изображений, процедурный синтезатор музыки и локальный видеоредактор.' },
];

export default function Onboarding() {
  const { state, updateConfig, openSettings } = useApp();
  const provider = (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);

  const finish = () => updateConfig('onboardingDone', true);

  return (
    <div className="modal-backdrop" style={{ zIndex: 2400 }}>
      <div className="modal onboarding">
        <div className="onboarding-hero">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <Logo size={64} />
          </div>
          <div className="onboarding-title">PSYCHIC</div>
          <div className="onboarding-sub">
            Локальный киберпанк-ассистент с полным доступом к компьютеру.
            Всё бесплатно, всё настраивается, всё остаётся у тебя.
          </div>
        </div>

        <div className="onboarding-body">
          <div className="onboarding-steps">
            {FEATURES.map((feature) => (
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--bg0) 40%, transparent)', marginBottom: 16 }}>
            <Icon name="cpu" size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
              Текущая модель: <b style={{ color: 'var(--text)' }}>{state.config?.chat?.defaultModel}</b> · {provider?.name}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={finish}>
              <Icon name="zap" size={15} /> Начать работу
            </button>
            <button className="btn btn-lg" onClick={() => { finish(); openSettings('providers'); }}>
              <Icon name="plug" size={15} /> Подключить модели
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 9.5, color: 'var(--text-faint)', lineHeight: 1.6 }}>
            Настройки всегда доступны по Ctrl + , или в сайдбаре
          </div>
        </div>
      </div>
    </div>
  );
}
