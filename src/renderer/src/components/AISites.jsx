import React, { useMemo, useState } from 'react';
import SITES from '@shared/ai-sites.json';
import { invoke } from '../lib/api';
import { useApp } from '../lib/store';
import Icon from './Icon';

const KEY = 'psychic:ai-sites:favorites:v1';
const FILTERS = [['all', 'Все'], ['chat', 'Чат'], ['search', 'Поиск'], ['favorites', 'Избранное']];
function initialFavorites() {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value.filter(x => typeof x === 'string') : []; }
  catch { return []; }
}
export default function AISites() {
  const { toast, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [favorites, setFavorites] = useState(initialFavorites);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SITES.filter(site => (filter === 'all' || (filter === 'favorites' ? favorites.includes(site.id) : site.category === filter))
      && `${site.name} ${site.description} ${site.access}`.toLowerCase().includes(q));
  }, [query, filter, favorites]);
  const favorite = id => {
    const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    setFavorites(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { toast('Не удалось сохранить избранное', 'warning'); }
  };
  const open = async url => {
    try { await invoke('app:openExternal', { url }); }
    catch (err) { toast(err.message, 'error', 'Не удалось открыть сайт'); }
  };
  return (
    <section className="ai-sites scroll-thin" aria-label="Каталог ИИ-сайтов">
      <div className="ai-sites-hero">
        <div className="ai-sites-eyebrow"><Icon name="globe" size={14} /> КАТАЛОГ ИИ</div>
        <h2>Больше возможностей для идей</h2>
        <p>Бесплатные сайты без API-ключей. Откроются в обычном браузере; вход и лимиты зависят от сервиса.</p>
        <button className="btn btn-sm" onClick={() => dispatch({ type: 'SET_MODAL', modal: 'modelPicker' })}><Icon name="cpu" size={13} /> Выбрать модель внутри PSYCHIC</button>
      </div>
      <div className="ai-sites-controls">
        <label className="ai-sites-search"><Icon name="search" size={15} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск сайтов" aria-label="Поиск сайтов" /></label>
        <div className="ai-sites-filters" aria-label="Категория">{FILTERS.map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)} aria-pressed={filter === id}>{label}</button>)}</div>
      </div>
      <p className="ai-sites-note">Сервисы независимы от PSYCHIC: не отправляй им пароли и конфиденциальные данные. Условия и доступность могут измениться.</p>
      <div className="ai-sites-grid">
        {filtered.map(site => <article className="ai-site-card" key={site.id}>
          <div className="ai-site-top"><span className="ai-site-mark">{site.name.charAt(0)}</span><div><h3>{site.name}</h3><span className="ai-site-domain">{new URL(site.url).hostname}</span></div><button className="icon-btn ai-site-favorite" onClick={() => favorite(site.id)} aria-label={`${favorites.includes(site.id) ? 'Убрать из избранного' : 'В избранное'}: ${site.name}`} aria-pressed={favorites.includes(site.id)}>{favorites.includes(site.id) ? '★' : '☆'}</button></div>
          <p>{site.description}</p><div className="ai-site-badge">{site.access}</div>
          <div className="ai-site-actions"><button className="btn btn-sm" onClick={() => open(site.url)}><Icon name="external-link" size={13} /> Открыть</button><button className="btn btn-sm btn-ghost" onClick={() => open(site.source)}>Об условиях</button></div>
        </article>)}
      </div>
      {!filtered.length && <p className="ai-sites-empty">Ничего не найдено. Попробуй другой поиск или фильтр.</p>}
    </section>
  );
}
