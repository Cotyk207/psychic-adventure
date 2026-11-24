import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { THEMES, makeCustomTheme } from '../lib/themes';
import { cn } from '../lib/utils';
import Icon from './Icon';
import Logo from './Logo';

const TABS = [
  ['general', 'Общие', 'settings'],
  ['appearance', 'Внешний вид', 'palette'],
  ['providers', 'Провайдеры', 'plug'],
  ['skills', 'Скиллы', 'sparkles'],
  ['memory', 'Память', 'brain'],
  ['permissions', 'Доступ', 'shield'],
  ['automation', 'Автоматизация', 'alarm-clock'],
  ['media', 'Медиа', 'image'],
  ['about', 'О программе', 'info'],
];

const WALLPAPERS = [
  ...THEMES.map((t) => [t.wallpaper.replace(/^wallpapers\//, ''), t.name]),
  ['none', 'Без обоев'],
];

function Switch({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      className={cn('switch', value && 'on')}
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
    />
  );
}

function Field({ label, hint, children, wide }) {
  return (
    <div className={cn('field', wide && 'wide')}>
      <div style={{ minWidth: 0 }}>
        <div className="field-label">{label}</div>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  );
}

export default function SettingsModal({ initialTab }) {
  const { state, closeModal, updateConfig, patchConfig, refreshConfig, refreshProviders, refreshSkills, refreshMemory, refreshTasks, refreshAll, createChat, toast } = useApp();
  const [tab, setTab] = useState(initialTab || 'general');
  const config = state.config || {};
  const providers = state.providers || [];

  const close = () => closeModal();

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const set = (key, value) => updateConfig(key, value);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="modal settings" onMouseDown={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px 14px' }}>
            <Logo size={20} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '0.18em' }}>
              PSYCHIC
            </span>
          </div>
          {TABS.map(([id, label, icon]) => (
            <button
              key={id}
              className={cn('settings-nav-item', tab === id && 'active')}
              onClick={() => setTab(id)}
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
          <div className="settings-nav-sep" />
          <div className="settings-nav-foot">
            v{state.appInfo?.version || '1.0.0'}
            <br />
            {window.psychic?.platform === 'win32' ? 'Windows' : 'Desktop'} · local-first
          </div>
        </nav>

        <div className="settings-main">
          <div className="settings-head">
            <div style={{ flex: 1 }}>
              <div className="settings-title">{TABS.find((t) => t[0] === tab)?.[1]}</div>
              <div className="settings-subtitle">Настройки сохраняются автоматически</div>
            </div>
            <button className="icon-btn" onClick={close} title="Закрыть (Esc)">
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="settings-body">
            {tab === 'general' && (
              <>
                <div className="section">
                  <div className="section-title"><Icon name="settings" size={13} /> Приложение</div>
                  <Field label="Язык интерфейса" hint="Влияет на язык системного промпта и подсказок">
                    <select className="select" value={config.general?.language || 'ru'} onChange={(e) => set('general.language', e.target.value)}>
                      <option value="ru">Русский</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                  <Field label="Запускать вместе с Windows" hint="PSYCHIC будет стартовать в фоне">
                    <Switch value={!!config.general?.autostart} onChange={async (v) => {
                      await invoke('app:setAutoLaunch', { enabled: v }).catch(() => {});
                      set('general.autostart', v);
                    }} />
                  </Field>
                  <Field label="Сворачивать в трей" hint="Не показывать иконку в панели задач">
                    <Switch value={config.general?.tray !== false} onChange={(v) => set('general.tray', v)} />
                  </Field>
                  <Field label="Уведомления" hint="Показывать системное уведомление, когда ответ готов">
                    <Switch value={config.general?.notifications !== false} onChange={(v) => set('general.notifications', v)} />
                  </Field>
                  <Field label="Заставка при запуске" hint="Анимированный splash-экран PSYCHIC">
                    <Switch value={config.general?.showSplash !== false} onChange={(v) => set('general.showSplash', v)} />
                  </Field>
                  <Field label="Режим разработчика" hint="DevTools, логи и системная информация">
                    <Switch value={!!config.general?.developerMode} onChange={(v) => set('general.developerMode', v)} />
                  </Field>
                </div>

                <div className="section">
                  <div className="section-title"><Icon name="message-square" size={13} /> Диалог</div>
                  <Field label="Провайдер по умолчанию" hint="Используется для новых диалогов">
                    <select className="select" value={config.chat?.defaultProvider || ''} onChange={(e) => set('chat.defaultProvider', e.target.value)}>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Модель по умолчанию">
                    <select className="select" value={config.chat?.defaultModel || ''} onChange={(e) => set('chat.defaultModel', e.target.value)}>
                      {(providers.find((p) => p.id === config.chat?.defaultProvider)?.models || []).map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Отправлять по Enter" hint="Если выключено — Ctrl+Enter, а Enter переносит строку">
                    <Switch value={config.chat?.sendOnEnter !== false} onChange={(v) => set('chat.sendOnEnter', v)} />
                  </Field>
                  <Field label="Показывать рассуждения" hint="Блоки reasoning у моделей, которые их отдают">
                    <Switch value={config.chat?.showReasoning !== false} onChange={(v) => set('chat.showReasoning', v)} />
                  </Field>
                  <Field label="Озвучивать ответы" hint="Синтез речи браузера (TTS)">
                    <Switch value={!!config.chat?.autoSpeak} onChange={(v) => set('chat.autoSpeak', v)} />
                  </Field>
                  <Field label="Контекст диалога" hint="Сколько последних сообщений передавать модели">
                    <select className="select" value={config.chat?.contextMessages || 24} onChange={(e) => set('chat.contextMessages', Number(e.target.value))}>
                      {[8, 12, 24, 40, 80].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Максимум шагов агента" hint="Сколько инструментов может вызвать за один ответ">
                    <select className="select" value={config.chat?.maxSteps || 12} onChange={(e) => set('chat.maxSteps', Number(e.target.value))}>
                      {[4, 8, 12, 20, 32].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Field>
                  <Field label="Системный промпт" hint="Дополнительные инструкции для модели" wide>
                    <textarea
                      className="textarea"
                      style={{ minHeight: 84, width: '100%' }}
                      value={config.chat?.systemPrompt || ''}
                      onChange={(e) => set('chat.systemPrompt', e.target.value)}
                      placeholder="Например: отвечай кратко и по делу, используй русский язык…"
                    />
                  </Field>
                </div>

                <div className="section">
                  <div className="section-title"><Icon name="mic" size={13} /> Голос</div>
                  <Field label="Язык распознавания">
                    <select className="select" value={config.voice?.sttLanguage || 'ru-RU'} onChange={(e) => set('voice.sttLanguage', e.target.value)}>
                      <option value="ru-RU">Русский (ru-RU)</option>
                      <option value="en-US">English (en-US)</option>
                      <option value="uk-UA">Українська (uk-UA)</option>
                      <option value="de-DE">Deutsch (de-DE)</option>
                    </select>
                  </Field>
                  <Field label="Отправлять голосовое сразу" hint="Не ждать нажатия кнопки отправки">
                    <Switch value={!!config.voice?.autoSend} onChange={(v) => set('voice.autoSend', v)} />
                  </Field>
                  <Field label="Скорость речи" hint={`Текущая: ${config.voice?.rate || 1}`}>
                    <input
                      type="range" min={0.6} max={1.6} step={0.05}
                      value={config.voice?.rate || 1}
                      onChange={(e) => set('voice.rate', Number(e.target.value))}
                    />
                  </Field>
                </div>

                <div className="section">
                  <div className="section-title"><Icon name="database" size={13} /> Данные</div>
                  <div className="data-actions">
                    <button className="data-action" onClick={async () => {
                      const result = await invoke('config:export').catch((err) => ({ error: err.message }));
                      const exportedPath = typeof result === 'string' ? result : result?.path;
                      if (exportedPath) toast(`Настройки экспортированы: ${exportedPath}`, 'success');
                      else if (result?.error) toast(result.error, 'error');
                    }}>
                      <Icon name="download" size={17} />
                      <span className="data-action-title">Экспорт настроек</span>
                      <span className="data-action-desc">Сохранить config.json</span>
                    </button>
                    <button className="data-action" onClick={async () => {
                      const result = await invoke('config:import').catch((err) => ({ error: err.message }));
                      if (result && !result.error) {
                        await refreshConfig();
                        await refreshProviders();
                        toast('Настройки импортированы', 'success');
                      } else if (result?.error) toast(result.error, 'error');
                    }}>
                      <Icon name="upload" size={17} />
                      <span className="data-action-title">Импорт настроек</span>
                      <span className="data-action-desc">Загрузить config.json</span>
                    </button>
                    <button className="data-action" onClick={() => invoke('config:openFolder')}>
                      <Icon name="folder-open" size={17} />
                      <span className="data-action-title">Открыть папку данных</span>
                      <span className="data-action-desc">Конфиг, чаты, логи</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'appearance' && (
              <>
                <div className="section">
                  <div className="section-title"><Icon name="palette" size={13} /> Тема</div>
                  <div className="theme-grid">
                    {THEMES.map((theme) => {
                      const active = !config.appearance?.customTheme?.colors && config.appearance?.theme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          className={cn('theme-card', active && 'active')}
                          style={{
                            '--theme-bg': theme.colors.bg1,
                            '--theme-accent': theme.colors.accent,
                            '--theme-accent2': theme.colors.accent2,
                          }}
                          onClick={() => {
                            updateConfig('appearance.theme', theme.id);
                            updateConfig('appearance.customTheme', null);
                          }}
                        >
                          <div className="theme-preview" />
                          <div className="theme-meta">
                            <div className="theme-name">{theme.name}</div>
                            <div className="theme-tagline">{theme.tagline}</div>
                          </div>
                          <span className="theme-check"><Icon name="check" size={11} /></span>
                        </button>
                      );
                    })}
                    <CustomThemeCard
                      active={!!config.appearance?.customTheme?.colors}
                      custom={config.appearance?.customTheme}
                      baseId={config.appearance?.theme}
                      onApply={(theme) => {
                        updateConfig('appearance.customTheme', theme);
                        updateConfig('appearance.theme', theme.id);
                      }}
                      onClear={() => updateConfig('appearance.customTheme', null)}
                    />
                  </div>
                </div>

                <div className="section">
                  <div className="section-title"><Icon name="image" size={13} /> Обои</div>
                  <div className="wallpaper-grid">
                    {WALLPAPERS.map(([name, label]) => {
                      const current = config.appearance?.wallpaper || config.appearance?.theme || 'nightcity';
                      const file = name === 'none' ? 'none' : name;
                      const active = file === 'none' ? current === 'none' : String(current).startsWith(name.replace(/\.jpg$/, ''));
                      return (
                        <button
                          key={name}
                          className={cn('wallpaper-btn', active && 'active')}
                          onClick={() => set('appearance.wallpaper', file)}
                          title={label}
                        >
                          {file !== 'none' && (
                            <img src={`psychic://wallpaper/${name}`} alt="" loading="lazy" />
                          )}
                          {file === 'none' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg2)' }}><Icon name="x" size={16} /></div>}
                          <span className="label">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Field label="Прозрачность обоев" hint={`Текущая: ${Math.round((config.appearance?.wallpaperOpacity ?? 0.35) * 100)}%`}>
                    <input
                      type="range" min={0} max={0.9} step={0.05}
                      value={config.appearance?.wallpaperOpacity ?? 0.35}
                      onChange={(e) => set('appearance.wallpaperOpacity', Number(e.target.value))}
                    />
                  </Field>
                </div>

                <div className="section">
                  <div className="section-title"><Icon name="zap" size={13} /> Эффекты</div>
                  <Field label="Визуальные эффекты" hint="Все эффекты: частицы, сетка, сканлайны, свечение">
                    <Switch value={config.appearance?.fx !== false} onChange={(v) => set('appearance.fx', v)} />
                  </Field>
                  <Field label="Частицы" hint="Парящие неоновые частицы на фоне">
                    <Switch value={config.appearance?.particles !== false} onChange={(v) => set('appearance.particles', v)} />
                  </Field>
                  <Field label="Сетка" hint="Киберпанк-сетка на фоне">
                    <Switch value={config.appearance?.grid !== false} onChange={(v) => set('appearance.grid', v)} />
                  </Field>
                  <Field label="Сканлайны" hint="Тонкие горизонтальные линии как на ЭЛТ">
                    <Switch value={config.appearance?.scanlines !== false} onChange={(v) => set('appearance.scanlines', v)} />
                  </Field>
                  <Field label="Свечение" hint="Неоновое свечение акцентов">
                    <Switch value={config.appearance?.glow !== false} onChange={(v) => set('appearance.glow', v)} />
                  </Field>
                  <Field label="Анимации" hint="Плавные переходы интерфейса">
                    <Switch value={config.appearance?.animations !== false} onChange={(v) => set('appearance.animations', v)} />
                  </Field>
                  <Field label="Пузыри сообщений" hint="Выделять ответы цветными блоками">
                    <Switch value={config.appearance?.messageBubbles !== false} onChange={(v) => set('appearance.messageBubbles', v)} />
                  </Field>
                </div>

                <div className="section">
                  <div className="section-title"><Icon name="sliders" size={13} /> Типографика и размер</div>
                  <Field label="Масштаб шрифта" hint={`Текущий: ${Math.round((config.appearance?.fontScale || 1) * 100)}%`}>
                    <input
                      type="range" min={0.85} max={1.25} step={0.05}
                      value={config.appearance?.fontScale || 1}
                      onChange={(e) => set('appearance.fontScale', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Скругление углов" hint={`Текущий: ${config.appearance?.radius ?? 14}px`}>
                    <input
                      type="range" min={0} max={22} step={1}
                      value={config.appearance?.radius ?? 14}
                      onChange={(e) => set('appearance.radius', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Плотность интерфейса">
                    <select className="select" value={config.appearance?.density || 'comfortable'} onChange={(e) => set('appearance.density', e.target.value)}>
                      <option value="compact">Компактная</option>
                      <option value="comfortable">Обычная</option>
                      <option value="spacious">Просторная</option>
                    </select>
                  </Field>
                </div>
              </>
            )}

            {tab === 'providers' && (
              <ProvidersTab
                config={config}
                providers={providers}
                onChange={updateConfig}
                onRefresh={async () => { await refreshProviders(); await refreshConfig(); }}
                toast={toast}
              />
            )}

            {tab === 'skills' && (
              <>
                <div className="section">
                  <div className="section-title"><Icon name="sparkles" size={13} /> Активные скиллы</div>
                  <div className="section-hint">
                    Скиллы добавляют в системный промпт специализированные инструкции и открывают
                    инструменты агенту. Полный список — во вкладке «Скиллы» в сайдбаре.
                  </div>
                  <div className="skill-toggle-list">
                    {(state.skills || []).map((skill) => (
                      <div key={skill.id} className="skill-toggle-row">
                        <div className="skill-mini-icon"><Icon name={skill.icon} size={12} /></div>
                        <span className="skill-mini-name">{skill.name}</span>
                        <span className="skill-mini-desc">{skill.description}</span>
                        <Switch
                          value={!!skill.enabled}
                          onChange={async (v) => {
                            await invoke('skills:toggle', { id: skill.id, enabled: v });
                            refreshSkills();
                          }}
                        />
                      </div>
                    ))}
                    {!state.skills?.length && (
                      <div className="empty" style={{ padding: 20 }}>
                        <Icon name="sparkles" size={26} />
                        <div className="empty-text">Скиллы не найдены</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="section">
                  <div className="section-title"><Icon name="download" size={13} /> Установка</div>
                  <div className="data-actions">
                    <button className="data-action" onClick={async () => {
                      const result = await invoke('skills:importFolder').catch((err) => ({ error: err.message }));
                      if (result?.name) { refreshSkills(); toast(`Скилл «${result.name}» установлен`, 'success'); }
                      else if (result?.error) toast(result.error, 'error');
                    }}>
                      <Icon name="folder-plus" size={17} />
                      <span className="data-action-title">Из папки</span>
                      <span className="data-action-desc">SKILL.md на диске</span>
                    </button>
                    <button className="data-action" onClick={async () => {
                      const url = window.prompt('URL файла SKILL.md:', 'https://raw.githubusercontent.com/');
                      if (!url) return;
                      const result = await invoke('skills:installUrl', { url }).catch((err) => ({ error: err.message }));
                      if (result?.name) { refreshSkills(); toast(`Скилл «${result.name}» установлен`, 'success'); }
                      else if (result?.error) toast(result.error, 'error');
                    }}>
                      <Icon name="link" size={17} />
                      <span className="data-action-title">По ссылке</span>
                      <span className="data-action-desc">Из интернета</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'memory' && (
              <>
                <div className="section">
                  <div className="section-title"><Icon name="brain" size={13} /> Долгосрочная память</div>
                  <div className="section-hint">
                    Ассистент запоминает факты, людей и проекты и использует их в ответах.
                    Память хранится локально в файле memory.json.
                  </div>
                  <Field label="Использовать память" hint="Если выключено — save_memory и search_memory не будут применяться">
                    <Switch
                      value={config.memory?.enabled !== false}
                      onChange={async (v) => {
                        await invoke('memory:setEnabled', { enabled: v }).catch(() => {});
                        set('memory.enabled', v);
                      }}
                    />
                  </Field>
                  <Field label="Записей в памяти">
                    <span className="mono" style={{ fontSize: 12 }}>
                      {Array.isArray(state.memory) ? state.memory.length : (state.memory?.items?.length || 0)}
                    </span>
                  </Field>
                  <div className="data-actions">
                    <button className="data-action" onClick={async () => {
                      const result = await invoke('memory:export').catch((err) => ({ error: err.message }));
                      if (result?.path) toast(`Память экспортирована: ${result.path}`, 'success');
                      else if (result?.error) toast(result.error, 'error');
                    }}>
                      <Icon name="download" size={17} />
                      <span className="data-action-title">Экспорт памяти</span>
                      <span className="data-action-desc">В JSON-файл</span>
                    </button>
                    <button className="data-action" onClick={async () => {
                      if (!window.confirm('Удалить всю память? Действие необратимо.')) return;
                      await invoke('memory:clear');
                      refreshMemory();
                      toast('Память очищена', 'info');
                    }}>
                      <Icon name="trash" size={17} />
                      <span className="data-action-title">Очистить память</span>
                      <span className="data-action-desc">Удалить все записи</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {tab === 'permissions' && (
              <PermissionsTab config={config} onChange={updateConfig} toast={toast} />
            )}

            {tab === 'automation' && (
              <AutomationTab tasks={state.tasks} refresh={refreshTasks} toast={toast} />
            )}

            {tab === 'media' && (
              <MediaTab config={config} onChange={updateConfig} />
            )}

            {tab === 'about' && (
              <>
                <div className="about-hero">
                  <div className="about-logo"><Logo size={38} /></div>
                  <div>
                    <div className="about-name">PSYCHIC</div>
                    <div className="about-tagline">
                      Локальный ИИ-ассистент с полным доступом к компьютеру.
                      Бесплатные модели, скиллы, медиа-генерация и киберпанк-дизайн.
                    </div>
                  </div>
                </div>
                <div className="about-grid">
                  <div className="about-stat"><div className="k">Версия</div><div className="v">{state.appInfo?.version || '1.0.0'}</div></div>
                  <div className="about-stat"><div className="k">Платформа</div><div className="v">{state.appInfo?.platform || window.psychic?.platform}</div></div>
                  <div className="about-stat"><div className="k">Electron</div><div className="v">{window.psychic?.versions?.electron || '—'}</div></div>
                  <div className="about-stat"><div className="k">Chrome</div><div className="v">{window.psychic?.versions?.chrome || '—'}</div></div>
                  <div className="about-stat"><div className="k">Node</div><div className="v">{window.psychic?.versions?.node || '—'}</div></div>
                  <div className="about-stat"><div className="k">Провайдеров</div><div className="v">{providers.length}</div></div>
                </div>
                <div className="section" style={{ marginTop: 20 }}>
                  <div className="section-title"><Icon name="refresh" size={13} /> Обновления</div>
                  <UpdateBlock config={config} onChange={updateConfig} toast={toast} />
                </div>

                <div className="section" style={{ marginTop: 20 }}>
                  <div className="section-title"><Icon name="folder-open" size={13} /> Пути</div>
                  <div className="about-grid">
                    <div className="about-stat"><div className="k">Данные</div><div className="v">{state.appInfo?.paths?.userData}</div></div>
                    <div className="about-stat"><div className="k">Рабочая папка</div><div className="v">{state.appInfo?.paths?.workspace}</div></div>
                    <div className="about-stat"><div className="k">Медиа</div><div className="v">{state.appInfo?.paths?.media}</div></div>
                    <div className="about-stat"><div className="k">Скиллы</div><div className="v">{state.appInfo?.paths?.skills}</div></div>
                  </div>
                </div>
                <div className="section">
                  <div className="section-title"><Icon name="alert-triangle" size={13} /> Сброс</div>
                  <Field
                    label="Полный сброс"
                    hint="Удалит настройки, диалоги, память и медиа. Приложение перезапустится."
                  >
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        if (!window.confirm('Точно сбросить все данные PSYCHIC?')) return;
                        try {
                          await invoke('app:factoryReset');
                          await refreshConfig();
                          await refreshAll();
                          await refreshTasks();
                          await createChat();
                          close();
                          toast('Все настройки и данные сброшены', 'info');
                        } catch (err) {
                          toast(err.message, 'error');
                        }
                      }}
                    >
                      <Icon name="trash" size={13} /> Сбросить всё
                    </button>
                  </Field>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomThemeCard({ active, custom, baseId, onApply, onClear }) {
  const [open, setOpen] = useState(false);
  const base = THEMES.find((t) => t.id === baseId) || THEMES[0];
  const colors = custom?.colors || base.colors;
  const [draft, setDraft] = useState(colors);

  useEffect(() => { setDraft(colors); }, [colors.accent, colors.bg0]);

  const update = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className={cn('theme-card', active && 'active')} style={{ gridColumn: '1 / -1', padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="wand" size={16} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1 }}>
          <div className="theme-name">Свой стиль</div>
          <div className="theme-tagline">Собери палитру вручную поверх темы «{base.name}»</div>
        </div>
        {active && (
          <button className="btn btn-sm btn-ghost" onClick={onClear}>
            <Icon name="rotate-ccw" size={12} /> Вернуть {base.name}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'chevron-down' : 'palette'} size={12} /> {open ? 'Свернуть' : 'Настроить'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
          {[
            ['accent', 'Акцент'],
            ['accent2', 'Второй акцент'],
            ['bg0', 'Фон'],
            ['bg1', 'Панели'],
            ['text', 'Текст'],
            ['success', 'Успех'],
            ['danger', 'Ошибка'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
              <input
                type="color"
                value={draft[key] || '#00f0ff'}
                onChange={(e) => update(key, e.target.value)}
                style={{ width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', padding: 1, cursor: 'pointer' }}
              />
              <span style={{ color: 'var(--text-dim)' }}>{label}</span>
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>{draft[key]}</span>
            </label>
          ))}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onApply(makeCustomTheme(base.id, { name: 'Свой стиль', colors: draft }))}
            >
              <Icon name="check" size={12} /> Применить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProvidersTab({ config, providers, onChange, onRefresh, toast }) {
  const [expanded, setExpanded] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [testing, setTesting] = useState(null);
  const [busy, setBusy] = useState(false);
  const catalog = providers;

  const draftFor = (provider) => drafts[provider.id] || {
    apiKey: provider.apiKey || '',
    baseUrl: provider.baseUrl || '',
    enabled: provider.enabled !== false,
    models: (provider.models || []).join(', '),
  };

  const patchDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { ...draftFor({ id, ...providers.find((p) => p.id === id) }), ...patch } }));

  const save = async (provider) => {
    const draft = draftFor(provider);
    setBusy(true);
    try {
      await invoke('providers:save', {
        provider: {
          ...provider,
          apiKey: draft.apiKey,
          baseUrl: draft.baseUrl || provider.baseUrl,
          enabled: draft.enabled,
          models: String(draft.models || '')
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean),
        },
      });
      await onRefresh();
      toast(`Провайдер «${provider.name}» сохранён`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const test = async (provider) => {
    const draft = draftFor(provider);
    setTesting(provider.id);
    try {
      const result = await invoke('providers:test', {
        provider: { ...provider, apiKey: draft.apiKey, baseUrl: draft.baseUrl || provider.baseUrl },
      });
      const list = await invoke('providers:fetchModels', {
        provider: { ...provider, apiKey: draft.apiKey, baseUrl: draft.baseUrl || provider.baseUrl },
      }).catch(() => []);
      if (list?.length) {
        setDrafts((d) => ({
          ...d,
          [provider.id]: { ...draft, models: Array.from(new Set([...(draft.models ? draft.models.split(',').map((m) => m.trim()).filter(Boolean) : []), ...list])).join(', ') },
        }));
      }
      toast(`Связь есть: ${result.count} моделей, ${result.latency} мс`, 'success');
      await onRefresh();
    } catch (err) {
      toast(err.message, 'error', 'Проверка провайдера');
    } finally {
      setTesting(null);
    }
  };

  return (
    <>
      <div className="section">
        <div className="section-title"><Icon name="plug" size={13} /> Провайдеры</div>
        <div className="section-hint">
          Базовые модели работают бесплатно и без ключа. Добавь ключ от любого сервиса —
          его модели сразу появятся в списке выбора. Ключи хранятся только на этом компьютере.
        </div>
        <div className="provider-list">
          {catalog.map((provider) => {
            const draft = draftFor(provider);
            const isOpen = expanded === provider.id;
            return (
              <div key={provider.id}>
                <div className={cn('provider-row', draft.enabled && 'enabled')}>
                  <div className="provider-logo" style={{ '--provider-color': provider.color }}>
                    {provider.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="provider-info">
                    <div className="provider-name">
                      {provider.name}
                      {provider.badge && <span className="badge" style={{ fontSize: 8 }}>{provider.badge}</span>}
                      {provider.local && <span className="badge" style={{ fontSize: 8 }}>LOCAL</span>}
                    </div>
                    <div className="provider-tagline">{provider.tagline}</div>
                    <div className="provider-url">{provider.baseUrl}</div>
                  </div>
                  <div className="provider-actions">
                    <Switch
                      value={draft.enabled}
                      onChange={(v) => patchDraft(provider.id, { enabled: v })}
                    />
                    <button className="icon-btn sm" onClick={() => setExpanded(isOpen ? null : provider.id)} title="Настроить">
                      <Icon name={isOpen ? 'chevron-down' : 'settings'} size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="provider-detail">
                    <div className="provider-detail-head">
                      <Icon name="key" size={15} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Ключ и параметры</span>
                      {provider.keyUrl && (
                        <button className="btn btn-sm btn-ghost" onClick={() => invoke('app:openExternal', { url: provider.keyUrl })}>
                          <Icon name="external" size={11} /> Получить ключ
                        </button>
                      )}
                    </div>
                    {provider.keyHint && (
                      <div className="section-hint" style={{ margin: '0 0 10px' }}>{provider.keyHint}</div>
                    )}
                    <div className="provider-detail-grid">
                      <div className="field wide">
                        <div>
                          <div className="field-label">API ключ</div>
                          <div className="field-hint">{provider.keyHint}</div>
                        </div>
                        <div className="field-control">
                          <input
                            className="input mono"
                            type="password"
                            value={draft.apiKey}
                            onChange={(e) => patchDraft(provider.id, { apiKey: e.target.value })}
                            placeholder={provider.keyHint?.includes('не нужен') ? 'Ключ не требуется' : 'sk-...'}
                          />
                        </div>
                      </div>
                      <div className="field wide">
                        <div>
                          <div className="field-label">Base URL</div>
                          <div className="field-hint">Адрес API, совместимого с OpenAI / Anthropic / Gemini</div>
                        </div>
                        <div className="field-control">
                          <input
                            className="input mono"
                            value={draft.baseUrl}
                            onChange={(e) => patchDraft(provider.id, { baseUrl: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="field wide">
                        <div>
                          <div className="field-label">Модели</div>
                          <div className="field-hint">Через запятую. Нажми «Проверить», чтобы подтянуть список с сервера.</div>
                        </div>
                        <div className="field-control">
                          <textarea
                            className="textarea mono"
                            style={{ width: '100%', minHeight: 64, fontSize: 11 }}
                            value={draft.models}
                            onChange={(e) => patchDraft(provider.id, { models: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => save(provider)} disabled={busy}>
                        <Icon name="check" size={13} /> Сохранить
                      </button>
                      <button className="btn btn-sm" onClick={() => test(provider)} disabled={testing === provider.id}>
                        {testing === provider.id ? <span className="spinner sm" /> : <Icon name="zap" size={13} />}
                        Проверить связь
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => invoke('app:openExternal', { url: provider.docsUrl })} disabled={!provider.docsUrl}>
                        <Icon name="book-open" size={13} /> Документация
                      </button>
                      {!provider.builtin && (
                        <button className="btn btn-sm btn-danger" onClick={async () => {
                          await invoke('providers:delete', { id: provider.id });
                          await onRefresh();
                          toast('Провайдер удалён', 'info');
                        }}>
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="plus" size={13} /> Добавить провайдера</div>
        <div className="section-hint">
          Любой OpenAI-совместимый сервис, локальная модель (Ollama, LM Studio) или свой endpoint.
        </div>
        <div className="add-provider-grid">
          <button
            className="add-provider-card"
            onClick={async () => {
              const item = {
                id: `custom-${Date.now()}`,
                name: 'Свой провайдер',
                tagline: 'OpenAI-совместимый endpoint',
                type: 'openai',
                baseUrl: 'http://localhost:1234/v1',
                docsUrl: '',
                keyUrl: '',
                keyHint: 'Укажи ключ, если endpoint требует авторизации',
                free: true,
                badge: 'CUSTOM',
                color: '#00f0ff',
                models: [],
                modelFetch: 'openai',
                builtin: false,
                apiKey: '',
                enabled: true,
              };
              await invoke('providers:save', { provider: item });
              await onRefresh();
              setExpanded(item.id);
            }}
          >
            <Icon name="plus" size={15} /> Свой OpenAI-совместимый
          </button>
          <button className="add-provider-card" onClick={async () => {
            await invoke('providers:detectLocal').catch(() => {});
            await onRefresh();
            toast('Поиск локальных моделей завершён', 'info');
          }}>
            <Icon name="cpu" size={15} /> Найти локальные (Ollama, LM Studio)
          </button>
          <button className="add-provider-card" onClick={async () => {
            await invoke('providers:detectLocal').catch(() => {});
            await onRefresh();
          }}>
            <Icon name="refresh" size={15} /> Переподключить провайдеров
          </button>
        </div>
      </div>
    </>
  );
}

const PERMISSION_MODES = [
  ['workspace', 'Рабочая папка', 'Чтение везде, запись только в разрешённых папках', 'var(--accent)'],
  ['full', 'Весь компьютер', 'Полный доступ к диску и системе', 'var(--warning)'],
  ['readonly', 'Только чтение', 'Ассистент ничего не изменяет на диске', 'var(--info)'],
  ['custom', 'Выбранные папки', 'Доступ только к папкам из списка ниже', 'var(--accent-2)'],
];

function PermissionsTab({ config, onChange, toast }) {
  const permissions = config.permissions || {};
  const roots = permissions.roots || [];

  const addRoot = async () => {
    try {
      const picked = await invoke('fs:pickFolder');
      if (!picked) return;
      const next = Array.from(new Set([...roots, picked]));
      onChange('permissions.roots', next);
      toast(`Добавлена папка: ${picked}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeRoot = (root) => onChange('permissions.roots', roots.filter((r) => r !== root));

  return (
    <>
      <div className="section">
        <div className="section-title"><Icon name="shield" size={13} /> Режим доступа</div>
        <div className="permission-cards">
          {PERMISSION_MODES.map(([id, title, desc, color]) => (
            <button
              key={id}
              className={cn('permission-card', (permissions.mode || 'workspace') === id && 'active')}
              style={{ '--perm-color': color }}
              onClick={() => onChange('permissions.mode', id)}
            >
              <div className="permission-card-title">
                <Icon name={id === 'full' ? 'globe' : id === 'readonly' ? 'eye' : id === 'custom' ? 'folder-tree' : 'folder'} size={13} />
                {title}
              </div>
              <div className="permission-card-desc">{desc}</div>
            </button>
          ))}
        </div>
        <div className="section-hint">
          Режим «Рабочая папка» — безопасный по умолчанию: ассистент читает файлы, но записывает
          только в рабочую папку и разрешённые директории. В режиме «Весь компьютер» ограничения
          снимаются — используй его осознанно.
        </div>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="folder-open" size={13} /> Разрешённые папки</div>
        <div className="root-list">
          {roots.map((root) => (
            <div key={root} className="root-item">
              <Icon name="folder" size={12} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{root}</span>
              <button className="remove" onClick={() => removeRoot(root)} title="Убрать">
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          {!roots.length && <div className="section-hint">Список пуст — добавь папку ниже.</div>}
        </div>
        <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={addRoot}>
          <Icon name="folder-plus" size={13} /> Добавить папку
        </button>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="terminal" size={13} /> Терминал и запись</div>
        <Field label="Подтверждать запись файлов" hint="Каждое изменение на диске — с подтверждением">
          <Switch value={permissions.confirmWrites !== false} onChange={(v) => onChange('permissions.confirmWrites', v)} />
        </Field>
        <Field label="Автоматически разрешать чтение" hint="Не спрашивать при чтении файлов">
          <Switch value={permissions.autoApproveReads !== false} onChange={(v) => onChange('permissions.autoApproveReads', v)} />
        </Field>
        <Field label="Команды терминала" hint="Сколько свободы у ассистента в shell">
          <select
            className="select"
            value={permissions.shell?.mode || 'confirm'}
            onChange={(e) => onChange('permissions.shell.mode', e.target.value)}
          >
            <option value="confirm">Спрашивать каждый раз</option>
            <option value="allowlist">Только безопасные команды</option>
            <option value="auto">Разрешить всё</option>
            <option value="off">Запретить терминал</option>
          </select>
        </Field>
        <Field label="Подтверждать переходы в браузере">
          <Switch value={!!permissions.browser?.confirmNavigation} onChange={(v) => onChange('permissions.browser.confirmNavigation', v)} />
        </Field>
        <Field label="Подтверждать генерацию медиа" hint="Картинки, музыка и видео">
          <Switch value={!!permissions.media?.confirmGenerate} onChange={(v) => onChange('permissions.media.confirmGenerate', v)} />
        </Field>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="shield-alert" size={13} /> Запрещённые пути</div>
        <div className="section-hint">Ассистент никогда не будет трогать эти пути, независимо от режима.</div>
        <div className="root-list">
          {(permissions.deniedPaths || []).map((p) => (
            <div key={p} className="root-item">
              <Icon name="shield-off" size={12} />
              <span>{p}</span>
              <button className="remove" onClick={() => onChange('permissions.deniedPaths', (permissions.deniedPaths || []).filter((x) => x !== p))}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          {!(permissions.deniedPaths || []).length && (
            <div className="section-hint">Пусто. Добавь путь, если нужно защитить папку.</div>
          )}
        </div>
        <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={async () => {
          const picked = await invoke('fs:pickFolder').catch(() => null);
          if (picked) onChange('permissions.deniedPaths', Array.from(new Set([...(permissions.deniedPaths || []), picked])));
        }}>
          <Icon name="plus" size={13} /> Добавить запрет
        </button>
      </div>
    </>
  );
}

function MediaTab({ config, onChange }) {
  const media = config.media || {};
  return (
    <>
      <div className="section">
        <div className="section-title"><Icon name="image" size={13} /> Изображения</div>
        <Field label="Провайдер">
          <select className="select" value={media.imageProvider || 'pollinations'} onChange={(e) => onChange('media.imageProvider', e.target.value)}>
            <option value="pollinations">Pollinations.AI (бесплатно, без ключа)</option>
            <option value="stablehorde">Stable Horde (бесплатно, без ключа)</option>
            <option value="huggingface">Hugging Face (нужен токен)</option>
            <option value="openai">OpenAI-совместимый endpoint</option>
          </select>
        </Field>
        <Field label="Модель" hint="Например: flux, turbo, sd3">
          <input className="input mono" value={media.imageModel || ''} onChange={(e) => onChange('media.imageModel', e.target.value)} />
        </Field>
        <Field label="Размер по умолчанию">
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input mono" style={{ width: 90 }} value={media.defaultWidth || 1024} onChange={(e) => onChange('media.defaultWidth', Number(e.target.value) || 1024)} />
            <span style={{ alignSelf: 'center', color: 'var(--text-faint)' }}>×</span>
            <input className="input mono" style={{ width: 90 }} value={media.defaultHeight || 1024} onChange={(e) => onChange('media.defaultHeight', Number(e.target.value) || 1024)} />
          </div>
        </Field>
        {(media.imageProvider === 'openai') && (
          <>
            <Field label="Base URL">
              <input className="input mono" value={media.imageBaseUrl || ''} onChange={(e) => onChange('media.imageBaseUrl', e.target.value)} placeholder="https://api.openai.com/v1" />
            </Field>
            <Field label="API ключ">
              <input className="input mono" type="password" value={media.imageApiKey || ''} onChange={(e) => onChange('media.imageApiKey', e.target.value)} />
            </Field>
          </>
        )}
      </div>

      <div className="section">
        <div className="section-title"><Icon name="music" size={13} /> Музыка</div>
        <Field label="Провайдер">
          <select className="select" value={media.musicProvider || 'procedural'} onChange={(e) => onChange('media.musicProvider', e.target.value)}>
            <option value="procedural">Процедурный синтезатор (офлайн, без ключа)</option>
            <option value="huggingface">Hugging Face (нужен токен)</option>
            <option value="replicate">Replicate (нужен ключ)</option>
          </select>
        </Field>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="film" size={13} /> Видео</div>
        <Field label="Провайдер">
          <select className="select" value={media.videoProvider || 'slideshow'} onChange={(e) => onChange('media.videoProvider', e.target.value)}>
            <option value="slideshow">Слайд-шоу из картинок (офлайн)</option>
            <option value="replicate">Replicate (нужен ключ)</option>
          </select>
        </Field>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="key" size={13} /> Ключи сервисов</div>
        <Field label="Hugging Face токен" hint="Нужен для генерации через HF Inference">
          <input className="input mono" type="password" value={media.hfToken || ''} onChange={(e) => onChange('media.hfToken', e.target.value)} />
        </Field>
        <Field label="Replicate ключ">
          <input className="input mono" type="password" value={media.replicateKey || ''} onChange={(e) => onChange('media.replicateKey', e.target.value)} />
        </Field>
      </div>
    </>
  );
}


function UpdateBlock({ config, onChange, toast }) {
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState(null);

  const check = async () => {
    setBusy(true);
    try {
      const result = await invoke('app:checkUpdates');
      setInfo(result);
      if (result.updateAvailable) {
        toast(`Доступна версия ${result.latest}`, 'info', 'Обновление');
      } else {
        toast('У тебя последняя версия', 'success');
      }
    } catch (err) {
      toast(err.message, 'error', 'Проверка обновлений');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="Проверять обновления при запуске" hint="Сверяет версию с GitHub Releases">
        <Switch
          value={config.updates?.auto !== false}
          onChange={(v) => onChange('updates.auto', v)}
        />
      </Field>
      <Field
        label="Проверить сейчас"
        hint={info ? (info.updateAvailable ? `Доступна ${info.latest}` : `Актуальная версия: ${info.current}`) : 'Версия сравнивается с последним релизом'}
      >
        <button className="btn btn-sm" onClick={check} disabled={busy}>
          {busy ? <span className="spinner sm" /> : <Icon name="refresh" size={13} />}
          Проверить
        </button>
        {info?.updateAvailable && (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => invoke('app:openRelease', { url: info.url }).catch((err) => toast(err.message, 'error'))}
          >
            <Icon name="external" size={13} /> Скачать {info.latest}
          </button>
        )}
      </Field>
    </>
  );
}

function AutomationTab({ tasks, refresh, toast }) {
  const [form, setForm] = useState({ title: '', prompt: '', mode: 'every', everyValue: 30, everyUnit: 'minutes', at: '', runAgent: true, notify: true });
  const [busy, setBusy] = useState(false);

  const toInterval = (value, unit) => {
    const n = Number(value) || 0;
    const mult = unit === 'minutes' ? 60000 : unit === 'hours' ? 3600000 : 86400000;
    return n > 0 ? n * mult : null;
  };

  const add = async () => {
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        prompt: form.prompt.trim(),
        runAgent: form.runAgent,
        notify: form.notify,
      };
      if (form.mode === 'every') {
        payload.every = toInterval(form.everyValue, form.everyUnit);
      } else {
        if (!form.at) throw new Error('Выбери дату и время');
        payload.at = new Date(form.at).getTime();
      }
      await invoke('tasks:add', { task: payload });
      await refresh();
      setForm((f) => ({ ...f, title: '', prompt: '' }));
      toast('Задача добавлена', 'success');
    } catch (err) {
      toast(err.message, 'error', 'Автоматизация');
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn, success) => {
    try {
      await fn();
      await refresh();
      if (success) toast(success, 'success');
    } catch (err) {
      toast(err.message, 'error', 'Автоматизация');
    }
  };

  return (
    <>
      <div className="section">
        <div className="section-title"><Icon name="alarm-clock" size={13} /> Новая задача</div>
        <div className="section-hint">
          Задачи работают, пока PSYCHIC запущен (в трее). Можно просто напомнить
          или сразу запустить агента с промптом — он создаст диалог и выполнит задачу.
        </div>
        <div className="automation-form">
          <div className="field wide">
            <div>
              <div className="field-label">Название</div>
              <div className="field-hint">Например: «Утренняя сводка по ИИ»</div>
            </div>
            <div className="field-control">
              <input
                className="input"
                style={{ width: '100%' }}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Утренняя сводка"
              />
            </div>
          </div>

          <div className="field wide">
            <div>
              <div className="field-label">Промпт для агента</div>
              <div className="field-hint">Можно оставить пустым, если нужно только напоминание</div>
            </div>
            <div className="field-control">
              <textarea
                className="textarea"
                style={{ width: '100%', minHeight: 64 }}
                value={form.prompt}
                onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
                placeholder="Найди в интернете новости ИИ за вчера и сделай короткую выжимку"
              />
            </div>
          </div>

          <div className="field wide">
            <div className="field-label">Тип задачи</div>
            <div className="field-control">
              <div className="segmented">
                <button className={cn('segmented-btn', form.mode === 'every' && 'active')} onClick={() => setForm((f) => ({ ...f, mode: 'every' }))}>
                  Повторяется
                </button>
                <button className={cn('segmented-btn', form.mode === 'once' && 'active')} onClick={() => setForm((f) => ({ ...f, mode: 'once' }))}>
                  Один раз
                </button>
              </div>
            </div>
          </div>

          {form.mode === 'every' ? (
            <div className="field wide">
              <div className="field-label">Как часто</div>
              <div className="field-control">
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  value={form.everyValue}
                  onChange={(e) => setForm((f) => ({ ...f, everyValue: Number(e.target.value) }))}
                  style={{ width: 110 }}
                />
                <select
                  className="select"
                  value={form.everyUnit}
                  onChange={(e) => setForm((f) => ({ ...f, everyUnit: e.target.value }))}
                >
                  <option value="minutes">минут</option>
                  <option value="hours">часов</option>
                  <option value="days">дней</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="field wide">
              <div className="field-label">Когда</div>
              <div className="field-control">
                <input
                  className="input mono"
                  type="datetime-local"
                  value={form.at}
                  onChange={(e) => setForm((f) => ({ ...f, at: e.target.value }))}
                />
              </div>
            </div>
          )}

          <div className="field wide">
            <div className="field-label">Действия</div>
            <div className="field-control">
              <label className="checkbox-row">
                <Switch value={form.notify} onChange={(v) => setForm((f) => ({ ...f, notify: v }))} />
                <span>Показать уведомление</span>
              </label>
              <label className="checkbox-row">
                <Switch value={form.runAgent} onChange={(v) => setForm((f) => ({ ...f, runAgent: v }))} />
                <span>Запустить агента с промптом</span>
              </label>
            </div>
          </div>

          <button className="btn btn-primary" onClick={add} disabled={busy || !form.title.trim()}>
            {busy ? <span className="spinner sm" /> : <Icon name="plus" size={14} />}
            Добавить задачу
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-title"><Icon name="list-checks" size={13} /> Задачи</div>
        <div className="automation-list">
          {(tasks || []).map((task) => (
            <div key={task.id} className={cn('automation-row', task.enabled === false && 'disabled')}>
              <div className="automation-info">
                <div className="automation-name">{task.title}</div>
                <div className="automation-meta">
                  {task.every
                    ? `каждые ${Math.round(task.every / 60000)} мин`
                    : `один раз · ${new Date(task.at).toLocaleString('ru-RU')}`}
                  {' · '}{task.runAgent !== false ? 'запускает агента' : 'только уведомление'}
                  {task.lastRunAt ? ` · последний запуск ${new Date(task.lastRunAt).toLocaleString('ru-RU')}` : ''}
                </div>
                {task.prompt && <div className="automation-prompt truncate">{task.prompt}</div>}
              </div>
              <div className="automation-actions">
                <Switch
                  value={task.enabled !== false}
                  onChange={(v) => act(() => invoke('tasks:toggle', { id: task.id, enabled: v }))}
                />
                <button className="btn btn-sm" onClick={() => act(() => invoke('tasks:runNow', { id: task.id }), 'Задача запущена')}>
                  <Icon name="play" size={12} /> Сейчас
                </button>
                <button className="icon-btn sm danger" onClick={() => act(() => invoke('tasks:delete', { id: task.id }), 'Задача удалена')}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))}
          {!(tasks || []).length && (
            <div className="empty" style={{ padding: 22 }}>
              <Icon name="alarm-clock" size={30} />
              <div className="empty-title">Задач пока нет</div>
              <div className="empty-text">Добавь первую — например, ежедневную сводку новостей.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
