import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn } from '../lib/utils';
import Icon from './Icon';

const QUICK = [
  { label: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { label: 'YouTube', url: 'https://youtube.com' },
  { label: 'GitHub', url: 'https://github.com' },
  { label: 'Wikipedia', url: 'https://ru.wikipedia.org' },
];

export default function BrowserPanel() {
  const { state, sendMessage, setView, toast } = useApp();
  const viewRef = useRef(null);
  const inputRef = useRef(null);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const browser = state.browser || {};

  useEffect(() => {
    if (!focused) setInput(browser.url || '');
  }, [browser.url, focused]);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    let frame = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      invoke('browser:setBounds', {
        bounds: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      }).catch(() => {});
    };
    measure();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    ro.observe(el);
    window.addEventListener('resize', measure);
    const timer = setTimeout(measure, 350);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener('resize', measure);
      invoke('browser:hide').catch(() => {});
    };
  }, []);

  const navigate = async (target) => {
    const value = String(target ?? input).trim();
    if (!value) return;
    try {
      await invoke('browser:open', { url: value });
      setInput('');
      setFocused(false);
    } catch (err) {
      toast(err.message, 'error', 'Браузер');
    }
  };

  const action = (name) => invoke('browser:action', { action: name }).catch(() => {});

  const readToChat = async () => {
    try {
      const page = await invoke('browser:read');
      const text = String(page?.text || '').slice(0, 12000);
      if (!text.trim()) {
        toast('Страница пуста или ещё не загрузилась', 'warning');
        return;
      }
      sendMessage(`Проанализируй эту страницу и дай краткую выжимку:\n\n${text}`);
      setView('chat');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const screenshot = async () => {
    try {
      const result = await invoke('browser:screenshot');
      const saved = await invoke('media:saveDataUrl', { dataUrl: result.dataUrl, name: 'browser-shot', folder: 'media' });
      toast(`Скриншот сохранён: ${saved.path}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <button className="icon-btn" onClick={() => action('back')} disabled={!browser.canGoBack} title="Назад">
          <Icon name="chevron-left" size={15} />
        </button>
        <button className="icon-btn" onClick={() => action('forward')} disabled={!browser.canGoForward} title="Вперёд">
          <Icon name="chevron-right" size={15} />
        </button>
        <button className="icon-btn" onClick={() => action('reload')} title="Обновить">
          <Icon name="refresh" size={14} />
        </button>
        <form
          className="browser-url"
          onSubmit={(e) => {
            e.preventDefault();
            navigate();
          }}
        >
          <Icon name={browser.url?.startsWith('https') ? 'lock' : 'globe'} size={13} />
          <input
            ref={inputRef}
            value={input}
            onFocus={() => { setFocused(true); setInput(browser.url || ''); }}
            onBlur={() => setFocused(false)}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Введите адрес или поисковый запрос"
            spellCheck={false}
          />
          {browser.loading && <span className="spinner sm" />}
        </form>
        <button className="icon-btn" onClick={() => invoke('browser:open', { url: state.config?.browser?.homePage || 'https://duckduckgo.com' })} title="Домой">
          <Icon name="home" size={14} />
        </button>
        <button className="icon-btn" onClick={screenshot} title="Скриншот страницы">
          <Icon name="camera" size={14} />
        </button>
        <button className="btn btn-sm" onClick={readToChat} title="Отправить текст страницы в чат">
          <Icon name="scan-text" size={13} /> В чат
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex' }}>
        <div ref={viewRef} className="browser-view" />

        {browser.visible && browser.readerMode && (
          <div className="browser-reader scroll-thin">
            <div className="browser-reader-head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="browser-reader-title">{browser.title || browser.url}</div>
                <div className="browser-reader-url">{browser.url}</div>
              </div>
              {browser.url && (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => invoke('app:openExternal', { url: browser.url })}
                >
                  <Icon name="external-link" size={13} /> В браузере телефона
                </button>
              )}
            </div>
            <pre className="browser-reader-body">
              {browser.loading ? 'Загрузка страницы…' : (browser.text || 'Нет текстового содержимого')}
            </pre>
          </div>
        )}

        {!browser.visible && (
          <div className="browser-placeholder">
            <Icon name="globe" size={42} />
            <div>
              <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 6 }}>Встроенный браузер</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-faint)', maxWidth: 380, lineHeight: 1.6 }}>
                Открывай сайты прямо внутри PSYCHIC. Ассистент умеет читать страницы,
                выполнять JavaScript и делать скриншоты.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
              {QUICK.map((item) => (
                <button key={item.label} className="chip clickable" onClick={() => navigate(item.url)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {browser.visible && browser.loading && <div className="browser-loading" />}
      </div>
    </div>
  );
}
