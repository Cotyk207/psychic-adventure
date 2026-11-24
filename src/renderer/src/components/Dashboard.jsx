import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn, formatBytes } from '../lib/utils';
import Icon from './Icon';

const TIPS = [
  'Ctrl+K открывает палитру команд — там всё: разделы, темы, диалоги.',
  'Скажи «включи синтвейв» — ассистент сам запустит плеер.',
  'Скиллы можно создавать голосом: опиши навык, ИИ напишет SKILL.md.',
  'Ctrl+B прячет сайдбар — больше места для кода.',
  'В настройках → Доступ можно разрешить запись только в выбранные папки.',
  'Прикрепи картинку к сообщению — модель с vision её увидит.',
  'Задачи в разделе «Автоматизация» умеют сами запускать агента по расписанию.',
  'Клик по модели в статус-баре открывает её карточку.',
];

const QUICK_ACTIONS = [
  { label: 'Новый диалог', icon: 'plus', action: 'new-chat', accent: true },
  { label: 'Картинка', icon: 'image', action: 'image' },
  { label: 'Музыка', icon: 'music', action: 'music' },
  { label: 'Терминал', icon: 'terminal', action: 'terminal' },
  { label: 'Браузер', icon: 'globe', action: 'browser' },
  { label: 'Настройки', icon: 'settings', action: 'settings' },
];

const STARTERS = [
  'Что умеет PSYCHIC и с чего начать?',
  'Покажи, какие файлы лежат в рабочей папке, и наведи порядок.',
  'Сгенерируй киберпанк-обои для рабочего стола.',
  'Найди в интернете свежие новости про ИИ и сделай выжимку.',
];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function useBattery() {
  const [battery, setBattery] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let bat = null;
    const read = () => {
      if (!bat || cancelled) return;
      setBattery({
        level: Math.round((bat.level ?? 1) * 100),
        charging: !!bat.charging,
        chargingTime: bat.chargingTime,
        dischargingTime: bat.dischargingTime,
      });
    };
    (async () => {
      try {
        if (navigator.getBattery) {
          bat = await navigator.getBattery();
          read();
          bat.addEventListener?.('levelchange', read);
          bat.addEventListener?.('chargingchange', read);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
      try {
        bat?.removeEventListener?.('levelchange', read);
        bat?.removeEventListener?.('chargingchange', read);
      } catch {}
    };
  }, []);
  return battery;
}

function StatTile({ icon, label, value, sub, accent, footer, onClick, children }) {
  return (
    <button className={cn('dash-tile', accent && 'accent')} onClick={onClick} type="button">
      <div className="dash-tile-head">
        <span className="dash-tile-icon"><Icon name={icon} size={15} /></span>
        <span className="dash-tile-label">{label}</span>
      </div>
      <div className="dash-tile-value">{value}</div>
      {sub && <div className="dash-tile-sub">{sub}</div>}
      {children}
      {footer && <div className="dash-tile-foot">{footer}</div>}
    </button>
  );
}

function Meter({ value, danger }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="dash-meter">
      <div
        className={cn('dash-meter-fill', danger && pct > 80 && 'danger')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const { state, setView, dispatch, createChat, sendMessage, openSettings, player, toast, refreshTasks } = useApp();
  const [stats, setStats] = useState(null);
  const [history, setHistory] = useState([]);
  const [tip, setTip] = useState(() => TIPS[new Date().getDate() % TIPS.length]);
  const battery = useBattery();

  const loadStats = async () => {
    try {
      const data = await invoke('system:stats');
      setStats(data);
      setHistory((prev) => [...prev, data.cpu?.percent ?? 0].slice(-28));
    } catch {}
  };

  useEffect(() => {
    loadStats();
    const timer = setInterval(loadStats, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshTasks();
  }, [refreshTasks]);

  const enabledSkills = (state.skills || []).filter((s) => s.enabled).length;
  const chatCount = (state.chats || []).length;
  const mediaCount = Object.values(state.media || {}).reduce((sum, list) => sum + (list?.length || 0), 0);
  const provider = (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);
  const model = state.config?.chat?.defaultModel;

  const tasks = state.tasks || [];
  const upcoming = useMemo(
    () => tasks.filter((t) => t.enabled !== false && t.nextRunAt).slice(0, 4),
    [tasks]
  );

  const act = (action) => {
    switch (action) {
      case 'new-chat': createChat(); break;
      case 'image': setView('media'); break;
      case 'music': setView('music'); break;
      case 'terminal': setView('terminal'); break;
      case 'browser': setView('browser'); break;
      case 'settings': openSettings('general'); break;
      default: break;
    }
  };

  const runTask = async (task) => {
    try {
      await invoke('tasks:runNow', { id: task.id });
      await refreshTasks();
      toast(`Задача «${task.title}» запущена`, 'success');
    } catch (err) {
      toast(err.message, 'error', 'Автоматизация');
    }
  };

  const mem = stats?.memory;
  const disk = stats?.disks?.[0];
  const cpu = stats?.cpu;

  return (
    <div className="dash">
      <header className="dash-hero">
        <div>
          <div className="dash-hello">
            {greeting()}
            <span className="dash-wave">⚡</span>
          </div>
          <h1 className="dash-title">Всё под контролем</h1>
          <p className="dash-sub">
            {provider?.name || 'Провайдер не выбран'} · {model || 'модель не выбрана'} ·{' '}
            {enabledSkills} скиллов · {chatCount} диалогов
          </p>
        </div>
        <div className="dash-hero-actions">
          <button className="btn btn-primary" onClick={() => createChat()}>
            <Icon name="plus" size={15} /> Новый диалог
          </button>
          <button className="btn" onClick={() => dispatch({ type: 'SET_MODAL', modal: 'shortcuts' })}>
            <Icon name="keyboard" size={14} /> Горячие клавиши
          </button>
        </div>
      </header>

      <div className="dash-scroll">
        <section className="dash-section">
          <div className="dash-section-title"><Icon name="activity" size={13} /> Система</div>
          <div className="dash-grid">
            <StatTile
              icon="cpu"
              label="Процессор"
              value={stats ? `${cpu?.percent ?? 0}%` : '—'}
              sub={cpu ? `${cpu.cores} ядер · ${cpu.speed ? `${cpu.speed} ГГц` : cpu.model?.slice(0, 28)}` : 'измеряю…'}
            >
              {history.length > 1 && (
                <div className="dash-spark">
                  {history.map((v, i) => (
                    <i key={i} style={{ height: `${Math.max(6, v)}%` }} title={`${v}%`} />
                  ))}
                </div>
              )}
            </StatTile>

            <StatTile
              icon="database"
              label="Память"
              value={mem ? `${mem.percent}%` : '—'}
              sub={mem ? `${formatBytes(mem.used)} из ${formatBytes(mem.total)}` : '—'}
            >
              <Meter value={mem?.percent} />
            </StatTile>

            <StatTile
              icon="hard-drive"
              label="Диск"
              value={disk ? `${disk.percent}%` : '—'}
              sub={disk ? `${formatBytes(disk.free)} свободно` : '—'}
              onClick={() => setView('files')}
            >
              <Meter value={disk?.percent} danger />
            </StatTile>

            <StatTile
              icon={battery?.charging ? 'zap' : 'activity'}
              label="Батарея"
              value={battery ? `${battery.level}%` : '—'}
              sub={battery ? (battery.charging ? 'заряжается' : 'от батареи') : 'нет данных'}
              accent={battery?.charging}
            >
              <Meter value={battery?.level} />
            </StatTile>

            <StatTile
              icon="clock"
              label="Аптайм"
              value={stats?.uptimeText || '—'}
              sub="система работает"
              onClick={() => setView('terminal')}
            />

            <StatTile
              icon="wifi"
              label="Сеть"
              value={stats?.network?.length ? `${stats.network.length}` : '—'}
              sub={stats?.network?.[0]?.address || 'нет интерфейсов'}
              onClick={() => setView('browser')}
            />
          </div>
        </section>

        <div className="dash-columns">
          <section className="dash-card">
            <div className="dash-section-title">
              <Icon name="zap" size={13} /> Быстрые действия
            </div>
            <div className="dash-actions">
              {QUICK_ACTIONS.map((item) => (
                <button key={item.label} className="dash-action" onClick={() => act(item.action)}>
                  <Icon name={item.icon} size={17} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <div className="dash-section-title" style={{ marginTop: 18 }}>
              <Icon name="message-square" size={13} /> Начни с этого
            </div>
            <div className="dash-starters">
              {STARTERS.map((text) => (
                <button key={text} className="dash-starter" onClick={() => sendMessage(text)}>
                  <Icon name="corner-down-left" size={11} />
                  {text}
                </button>
              ))}
            </div>
          </section>

          <section className="dash-card">
            <div className="dash-section-title">
              <Icon name="alarm-clock" size={13} /> Ближайшие задачи
              <span className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => openSettings('automation')}>
                <Icon name="plus" size={12} /> Добавить
              </button>
            </div>
            {upcoming.length ? (
              <div className="dash-tasks">
                {upcoming.map((task) => (
                  <div key={task.id} className="dash-task">
                    <div className="dash-task-title truncate">{task.title}</div>
                    <div className="dash-task-time">
                      {new Date(task.nextRunAt).toLocaleString('ru-RU', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                      {task.every ? ' · повторяется' : ''}
                    </div>
                    <button className="icon-btn sm" onClick={() => runTask(task)} title="Запустить сейчас">
                      <Icon name="play" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty">
                <Icon name="alarm-clock" size={26} />
                <div className="empty-text">
                  Настрой напоминания и автоматические запуски агента — например, «каждое утро
                  присылай новости по ИИ».
                </div>
                <button className="btn btn-sm" onClick={() => openSettings('automation')}>
                  <Icon name="settings" size={12} /> Открыть автоматизацию
                </button>
              </div>
            )}

            <div className="dash-section-title" style={{ marginTop: 18 }}>
              <Icon name="history" size={13} /> Последние диалоги
            </div>
            <div className="dash-chats">
              {(state.chats || []).slice(0, 4).map((chat) => (
                <button key={chat.id} className="dash-chat" onClick={() => setView('chat')}>
                  <Icon name="message-square" size={12} />
                  <span className="truncate">{chat.title}</span>
                  <span className="mono">{chat.messageCount}</span>
                </button>
              ))}
              {!chatCount && (
                <div className="empty-text">Пока пусто — начни первый диалог.</div>
              )}
            </div>
          </section>
        </div>

        <div className="dash-columns">
          <section className="dash-card dash-tip">
            <div className="dash-section-title"><Icon name="lightbulb" size={13} /> Совет</div>
            <div className="dash-tip-text">{tip}</div>
            <button className="btn btn-sm btn-ghost" onClick={() => setTip((t) => TIPS[(TIPS.indexOf(t) + 1) % TIPS.length])}>
              <Icon name="refresh" size={12} /> Ещё совет
            </button>
          </section>

          <section className="dash-card">
            <div className="dash-section-title"><Icon name="cpu" size={13} /> Среда</div>
            <div className="dash-kv">
              <div><span>Платформа</span><b className="mono">{stats?.platform} / {stats?.arch}</b></div>
              <div><span>Версия</span><b className="mono">v{stats?.version || state.appInfo?.version}</b></div>
              <div><span>Хост</span><b className="mono truncate">{stats?.hostname || '—'}</b></div>
              <div><span>Скиллов</span><b className="mono">{enabledSkills} активно</b></div>
              <div><span>Медиа</span><b className="mono">{mediaCount} файлов</b></div>
              <div><span>Память</span><b className="mono">{state.memory?.length ?? 0} записей</b></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
