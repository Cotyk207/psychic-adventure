import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { copyToClipboard, formatRelative, uid } from '../lib/utils';
import Icon from './Icon';
import Markdown from './Markdown';

const TEMPLATES = [
  { id: 'plan', title: 'План действий', description: 'Цель, этапы и первый шаг', prompt: 'Составь практичный пошаговый план для задачи ниже. Выдели приоритеты, риски и конкретный первый шаг.\n\nЗадача:\n' },
  { id: 'explain', title: 'Объяснение', description: 'Просто, с примером', prompt: 'Объясни простыми словами и по шагам, приведи понятный пример и проверь распространённые ошибки.\n\nТема:\n' },
  { id: 'summary', title: 'Краткая выжимка', description: 'Главные мысли и вывод', prompt: 'Сделай краткую выжимку текста: основные мысли, важные детали и итог. Не добавляй факты, которых нет в тексте.\n\nТекст:\n' },
  { id: 'compare', title: 'Сравнение', description: 'Критерии, таблица и вывод', prompt: 'Сравни варианты по важным критериям в таблице. Отметь неопределённости и помоги выбрать подходящий вариант.\n\nВарианты и условия:\n' },
  { id: 'code', title: 'Помощь с кодом', description: 'Причина, исправление, проверка', prompt: 'Разбери задачу по программированию. Объясни решение, предложи рабочий код и способ проверки. Если данных не хватает — уточни.\n\nЗадача:\n' },
  { id: 'ideas', title: 'Генератор идей', description: 'Несколько разных подходов', prompt: 'Предложи несколько разных идей, кратко сравни преимущества и ограничения каждой, затем выдели самую практичную.\n\nТема:\n' },
];
const blank = () => ({ id: uid(12), title: '', content: '', tags: '', pinned: false, createdAt: Date.now(), updatedAt: Date.now() });
function getNotes(config) {
  const list = Array.isArray(config?.workbench?.notes) ? config.workbench.notes : [];
  return list.filter(n => n && typeof n.id === 'string').map(n => ({
    ...n, title: String(n.title || ''), content: String(n.content || ''),
    tags: Array.isArray(n.tags) ? n.tags.join(', ') : String(n.tags || ''), pinned: Boolean(n.pinned),
  }));
}

function FocusTimer() {
  const { toast } = useApp();
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [deadline, setDeadline] = useState(null);
  const reported = useRef(false);
  useEffect(() => {
    if (!deadline) return undefined;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !reported.current) {
        reported.current = true;
        setDeadline(null);
        toast('Время вышло. Сделай небольшой перерыв.', 'success', 'Фокус');
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, toast]);
  const choose = value => { setMinutes(value); setRemaining(value * 60); setDeadline(null); reported.current = false; };
  const toggle = () => {
    if (deadline) { setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))); setDeadline(null); }
    else { reported.current = false; setDeadline(Date.now() + (remaining || minutes * 60) * 1000); }
  };
  const time = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  return <section className="workbench-focus" aria-label="Таймер фокуса">
    <div><div className="workbench-kicker"><Icon name="timer" size={13} /> РЕЖИМ ФОКУСА</div><h3>Время для важного</h3><p>Работает, пока открыто приложение. Без фоновых уведомлений после закрытия.</p></div>
    <div className="focus-clock" role="timer" aria-live="off">{time}</div>
    <div className="focus-controls"><div className="focus-presets">{[5, 15, 25, 50].map(n => <button key={n} onClick={() => choose(n)} aria-pressed={minutes === n}>{n} мин</button>)}</div><button className="btn btn-primary btn-sm" onClick={toggle}><Icon name={deadline ? 'pause' : 'play'} size={13} /> {deadline ? 'Пауза' : 'Старт'}</button><button className="btn btn-sm" onClick={() => choose(minutes)}>Сброс</button></div>
  </section>;
}

export default function Workspace() {
  const { state, refreshConfig, setView, toast } = useApp();
  const notes = getNotes(state.config);
  const [tab, setTab] = useState('notes');
  const [resetEpoch, setResetEpoch] = useState(0);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [template, setTemplate] = useState(TEMPLATES[0].id);
  const [context, setContext] = useState('');
  const activeTemplate = TEMPLATES.find(t => t.id === template) || TEMPLATES[0];
  const prompt = activeTemplate.prompt + context.trim();
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return notes.filter(n => `${n.title || ''} ${n.content || ''} ${n.tags || ''}`.toLocaleLowerCase().includes(q))
      .slice().sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [notes, query]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const reset = () => {
      setDraft(null); setDirty(false); setQuery(''); setContext(''); setPreview(false);
      setTab('notes'); setResetEpoch(value => value + 1);
    };
    window.addEventListener('psychic:factory-reset', reset);
    return () => window.removeEventListener('psychic:factory-reset', reset);
  }, []);
  useEffect(() => {
    if (!draft || dirty || saving) return;
    const fresh = getNotes(state.config).find(note => note.id === draft.id);
    if (!fresh) setDraft(null);
    else if (JSON.stringify(fresh) !== JSON.stringify(draft)) setDraft(fresh);
  }, [state.config?.workbench?.notes, draft, dirty, saving]);

  const switchDraft = note => {
    if (saving) return;
    if (dirty && !window.confirm('Изменения не сохранены. Отбросить их?')) return;
    setDraft(note ? { ...note } : blank()); setDirty(!note); setPreview(false);
  };
  const edit = patch => { setDraft(current => ({ ...current, ...patch })); setDirty(true); };
  const save = async () => {
    if (!draft || saving) return;
    if (!draft.title.trim() && !draft.content.trim()) { toast('Добавь заголовок или текст заметки', 'warning'); return; }
    setSaving(true);
    try {
      const latest = await invoke('config:get');
      const current = getNotes(latest);
      if (!current.some(n => n.id === draft.id) && current.length >= 200) throw new Error('Достигнут лимит 200 заметок');
      const item = { ...draft, title: draft.title.trim() || 'Без названия', tags: String(draft.tags || '').trim(), updatedAt: Date.now() };
      const next = [item, ...current.filter(n => n.id !== item.id)];
      await invoke('config:set', { key: 'workbench.notes', value: next });
      const updated = await refreshConfig();
      if (!updated) throw new Error('Заметка сохранена, но не удалось обновить список');
      setDraft(item); setDirty(false); toast('Заметка сохранена на устройстве', 'success');
    } catch (err) { toast(err.message, 'error', 'Заметки'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!draft || saving || !window.confirm(`Удалить заметку «${draft.title || 'Без названия'}»?`)) return;
    setSaving(true);
    try {
      const latest = await invoke('config:get');
      await invoke('config:set', { key: 'workbench.notes', value: getNotes(latest).filter(n => n.id !== draft.id) });
      await refreshConfig(); setDraft(null); setDirty(false); toast('Заметка удалена', 'info');
    } catch (err) { toast(err.message, 'error', 'Заметки'); }
    finally { setSaving(false); }
  };
  const copy = async text => {
    try { if (!await copyToClipboard(text)) throw new Error('Буфер обмена недоступен'); toast('Скопировано', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };
  const insert = text => {
    if (!text.trim()) { toast('Текст пуст', 'warning'); return; }
    setView('chat');
    setTimeout(() => window.dispatchEvent(new CustomEvent('psychic:composer-insert', { detail: { text } })), 100);
    toast('Текст добавлен в поле ввода — проверь его перед отправкой', 'info');
  };

  return <div className="workbench scroll-thin">
    <header className="workbench-header"><div><div className="workbench-kicker"><Icon name="sparkles" size={13} /> ЛИЧНОЕ ПРОСТРАНСТВО</div><h2>Мастерская</h2><p>Заметки, шаблоны и фокус — в одном месте.</p></div><span className="workbench-local"><Icon name="shield" size={13} /> Локально</span></header>
    <nav className="workbench-tabs" aria-label="Разделы мастерской">{[['notes','Заметки'],['prompts','Шаблоны'],['focus','Фокус']].map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={tab === id ? 'active' : ''} aria-pressed={tab === id}>{label}</button>)}</nav>
    <div hidden={tab !== 'notes'}>
      <p className="workbench-note">Заметки хранятся в настройках устройства без шифрования и входят в экспорт настроек. Не отправляются ИИ автоматически. Сохраняй изменения кнопкой.</p>
      <div className="workbench-notes">
        <aside className="workbench-list"><div className="workbench-list-head"><strong>Заметки · {notes.length}</strong><button className="btn btn-sm" onClick={() => switchDraft(null)} disabled={saving}><Icon name="plus" size={13} /> Создать</button></div>
          <label className="workbench-search"><Icon name="search" size={13} /><input aria-label="Поиск заметок" placeholder="Поиск по заметкам" value={query} onChange={e => setQuery(e.target.value)} /></label>
          <div className="workbench-list-scroll">{filtered.map(note => <button key={note.id} className={`workbench-note-item ${draft?.id === note.id ? 'active' : ''}`} onClick={() => switchDraft(note)}><span>{note.pinned ? '★ ' : ''}{note.title || 'Без названия'}</span><small>{note.tags || 'Без тегов'} · {formatRelative(note.updatedAt)}</small></button>)}{!filtered.length && <p className="workbench-empty">{notes.length ? 'Ничего не найдено' : 'Создай первую заметку'}</p>}</div>
        </aside>
        <section className="workbench-editor">{draft ? <>
          <div className="workbench-editor-head"><span className={dirty ? 'unsaved' : 'saved'}>{dirty ? '● Не сохранено' : '✓ Сохранено'}</span><div className="workbench-editor-actions"><button className="btn btn-sm" onClick={() => setPreview(v => !v)}>{preview ? 'Редактор' : 'Просмотр'}</button><button className="btn btn-sm" onClick={() => edit({ pinned: !draft.pinned })} disabled={saving} aria-pressed={Boolean(draft.pinned)}>{draft.pinned ? '★ Закреплено' : '☆ Закрепить'}</button><button className="btn btn-primary btn-sm" disabled={saving || !dirty} onClick={save}><Icon name="save" size={13} /> Сохранить</button></div></div>
          <input disabled={saving} className="workbench-title-input" aria-label="Заголовок заметки" placeholder="Название заметки" maxLength={120} value={draft.title || ''} onChange={e => edit({ title: e.target.value })} />
          <input disabled={saving} className="workbench-tags-input" aria-label="Теги заметки" placeholder="Теги через запятую" maxLength={200} value={draft.tags || ''} onChange={e => edit({ tags: e.target.value })} />
          {preview ? <div className="workbench-preview scroll-thin"><Markdown text={draft.content || 'Пока нет текста'} /></div> : <textarea disabled={saving} className="workbench-textarea" aria-label="Текст заметки" placeholder="Запиши мысль, план или список… Поддерживается Markdown." maxLength={30000} value={draft.content || ''} onChange={e => edit({ content: e.target.value })} />}
          <div className="workbench-editor-foot"><span>{(draft.content || '').length} / 30000</span><div><button className="btn btn-sm btn-ghost" onClick={() => copy(draft.content || '')}>Копировать</button><button className="btn btn-sm" onClick={() => insert(draft.content || '')}>В чат</button><button className="btn btn-sm btn-ghost danger" disabled={saving} onClick={remove}>Удалить</button></div></div>
        </> : <div className="workbench-editor-empty"><Icon name="sticky-note" size={30} /><strong>Идеи заслуживают места</strong><span>Создай заметку или выбери её в списке.</span><button className="btn btn-sm" onClick={() => switchDraft(null)}>Новая заметка</button></div>}</section>
      </div>
    </div>
    <div hidden={tab !== 'prompts'} className="workbench-prompts"><div className="workbench-template-list">{TEMPLATES.map(item => <button key={item.id} className={template === item.id ? 'active' : ''} onClick={() => setTemplate(item.id)}><strong>{item.title}</strong><span>{item.description}</span></button>)}</div><section className="workbench-prompt-editor"><div className="workbench-kicker">ШАБЛОН ЗАПРОСА</div><h3>{activeTemplate.title}</h3><p>Добавь контекст, затем вставь запрос в чат. Он не будет отправлен автоматически.</p><textarea aria-label="Контекст для шаблона" placeholder="Напиши здесь свою задачу или текст…" maxLength={20000} value={context} onChange={e => setContext(e.target.value)} /><div className="workbench-prompt-preview"><strong>Предпросмотр</strong><pre>{prompt}</pre></div><div className="workbench-prompt-actions"><button className="btn btn-sm" onClick={() => copy(prompt)}>Копировать</button><button className="btn btn-primary btn-sm" onClick={() => insert(prompt)}>Вставить в чат</button></div></section></div>
    <div hidden={tab !== 'focus'}><FocusTimer key={resetEpoch} /></div>
  </div>;
}
