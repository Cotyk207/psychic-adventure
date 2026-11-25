import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke, isAndroidApp } from '../lib/api';
import { cn, isImageFile, readFromClipboard } from '../lib/utils';
import { EFFORT_META, getModelMeta, resolveEffortForModel } from '../lib/models';
import Icon from './Icon';

const SLASH_COMMANDS = [
  { cmd: '/код', icon: 'code-2', desc: 'Написать чистый рабочий код с примером', template: 'Напиши чистый, готовый к запуску код: ' },
  { cmd: '/объясни', icon: 'lightbulb', desc: 'Объяснить простыми словами по шагам', template: 'Объясни понятно и по шагам: ' },
  { cmd: '/исправь', icon: 'bug', desc: 'Найти причину ошибки и исправить', template: 'Найди причину проблемы и предложи точное исправление:\n\n' },
  { cmd: '/кратко', icon: 'list-checks', desc: 'Сделать сжатую выжимку главного', template: 'Сделай чёткую краткую выжимку по пунктам:\n\n' },
  { cmd: '/переведи', icon: 'languages', desc: 'Перевести с сохранением смысла и стиля', template: 'Переведи естественно и точно на русский язык:\n\n' },
  { cmd: '/поиск', icon: 'globe', desc: 'Найти свежую информацию в интернете', template: 'Найди актуальную информацию в интернете и сделай обзор: ' },
  { cmd: '/картинка', icon: 'image', desc: 'Сгенерировать изображение по описанию', template: 'Сгенерируй детальное изображение: ' },
  { cmd: '/план', icon: 'list-checks', desc: 'Составить пошаговый план', template: 'Составь практичный пошаговый план, укажи приоритеты и первый шаг: ' },
  { cmd: '/проверь', icon: 'check', desc: 'Проверить ошибки и факты', template: 'Проверь ошибки и сомнительные утверждения, объясни исправления:\n\n' },
  { cmd: '/идеи', icon: 'lightbulb', desc: 'Придумать несколько идей', template: 'Предложи несколько разных идей и кратко сравни их: ' },
  { cmd: '/таблица', icon: 'list-checks', desc: 'Сравнить в таблице', template: 'Сравни варианты в таблице, затем сделай краткий вывод:\n\n' },
  { cmd: '/письмо', icon: 'file-text', desc: 'Написать аккуратное письмо', template: 'Помоги написать понятное и вежливое письмо: ' },
  { cmd: '/новый', icon: 'plus', desc: 'Начать новый пустой диалог', action: 'newChat' },
];

export default function Composer() {
  const { state, dispatch, sendMessage, stopGeneration, createChat, updateConfig, startListening, savePrompt, toast } = useApp();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [effortOpen, setEffortOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef(null);
  const effortRef = useRef(null);

  const streaming = !!state.streaming && state.streaming.chatId === state.activeChatId;
  const chat = state.chat;
  const provider = (state.providers || []).find((p) => p.id === chat?.provider)
    || (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);
  const model = chat?.model || state.config?.chat?.defaultModel;
  const modelMeta = useMemo(() => getModelMeta(provider?.id, model), [provider?.id, model]);
  const preferredEffort = state.config?.chat?.reasoningEffort || 'medium';
  const activeEffort = useMemo(
    () => resolveEffortForModel(modelMeta, preferredEffort),
    [modelMeta, preferredEffort]
  );

  const voice = state.voice || {};
  const listening = voice.listening;

  const slashMatches = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ') || text.includes('\n')) return [];
    const q = text.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(q));
  }, [text]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashMatches.length]);

  const resize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  useEffect(() => {
    resize();
  }, [text]);

  useEffect(() => {
    const onAttach = () => addFiles();
    const onInsert = (ev) => {
      const incoming = String(ev.detail?.text || '');
      if (!incoming) return;
      setText((prev) => {
        const el = taRef.current;
        if (!el) return prev ? `${prev}\n${incoming}` : incoming;
        const start = typeof el.selectionStart === 'number' ? el.selectionStart : prev.length;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : prev.length;
        return prev.slice(0, start) + incoming + prev.slice(end);
      });
      setTimeout(() => taRef.current?.focus(), 20);
    };
    window.addEventListener('psychic:attach', onAttach);
    window.addEventListener('psychic:composer-insert', onInsert);
    return () => {
      window.removeEventListener('psychic:attach', onAttach);
      window.removeEventListener('psychic:composer-insert', onInsert);
    };
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (effortRef.current && !effortRef.current.contains(e.target)) {
        setEffortOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (state.config?.appearance?.messageBubbles === false) {
      document.documentElement.dataset.bubbles = 'off';
    } else {
      document.documentElement.dataset.bubbles = 'on';
    }
  }, [state.config?.appearance?.messageBubbles]);

  const applySlash = (item) => {
    if (!item) return;
    if (item.action === 'newChat') {
      setText('');
      createChat();
      return;
    }
    setText(item.template || '');
    setTimeout(() => taRef.current?.focus(), 10);
  };

  const submit = () => {
    const value = text.trim();
    if ((!value && !attachments.length) || streaming) return;
    sendMessage(
      value,
      attachments.map((a) => ({ path: a.path, name: a.name })),
      { reasoningEffort: activeEffort }
    );
    setText('');
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = 'auto';
    taRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (slashMatches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSlashIndex((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSlashIndex((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        applySlash(slashMatches[slashIndex] || slashMatches[0]);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && state.config?.chat?.sendOnEnter !== false) {
      event.preventDefault();
      submit();
    }
  };

  const attachPaths = async (paths) => {
    if (!paths?.length) return;
    const items = [];
    for (const p of paths) {
      if (!p) continue;
      const name = String(p).split(/[\\/]/).pop();
      let dataUrl = null;
      if (isImageFile(name)) {
        try {
          dataUrl = await invoke('media:dataUrl', { path: p });
        } catch {}
      }
      items.push({ path: p, name, dataUrl });
    }
    if (items.length) setAttachments((prev) => [...prev, ...items].slice(0, 8));
  };

  const addFiles = async () => {
    try {
      const paths = await invoke('fs:pickFile', { multi: true });
      await attachPaths(paths);
    } catch {}
  };

  const onPaste = async (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const dataUrl = String(reader.result || '');
            const saved = await invoke('media:saveDataUrl', {
              dataUrl,
              kind: 'screenshots',
              prefix: 'clipboard',
            });
            const p = typeof saved === 'string' ? saved : saved?.path;
            if (p) {
              setAttachments((prev) => [
                ...prev,
                { path: p, name: p.split(/[\\/]/).pop(), dataUrl },
              ].slice(0, 8));
              toast('Изображение вставлено из буфера', 'success');
            }
          } catch (err) {
            toast(err.message, 'error');
          }
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragOver(false);
    const files = [...(event.dataTransfer?.files || [])];
    const paths = files.map((f) => f.path).filter(Boolean);
    if (paths.length) {
      await attachPaths(paths);
      toast(`Прикреплено файлов: ${paths.length}`, 'success');
    }
  };

  const pasteTextQuick = async () => {
    const clip = await readFromClipboard();
    if (!clip) {
      toast('Буфер обмена пуст', 'warning');
      return;
    }
    setText((prev) => (prev ? `${prev}${clip}` : clip));
    taRef.current?.focus();
  };

  const openModelPicker = () => dispatch({ type: 'SET_MODAL', modal: 'modelPicker' });

  const approxTokens = text.length ? Math.max(1, Math.round(text.length / 3.6)) : 0;

  return (
    <div className="composer-wrap">
      {slashMatches.length > 0 && (
        <div className="slash-menu">
          <div className="slash-menu-head">Быстрые команды · Tab или Enter</div>
          {slashMatches.map((item, idx) => (
            <button
              key={item.cmd}
              className={cn('slash-item', idx === slashIndex && 'active')}
              onMouseDown={(e) => {
                e.preventDefault();
                applySlash(item);
              }}
            >
              <Icon name={item.icon} size={13} />
              <span className="slash-cmd">{item.cmd}</span>
              <span className="slash-desc">{item.desc}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={cn('composer', streaming && 'streaming', dragOver && 'drag-over')}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((att, i) => (
              <div key={i} className="attach-chip">
                {att.dataUrl ? <img src={att.dataUrl} alt="" /> : <Icon name="file-text" size={13} />}
                <span className="name">{att.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  title="Убрать"
                >
                  <Icon name="x" size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {listening && voice.transcript && (
          <div className="voice-transcript">{voice.transcript}</div>
        )}

        <textarea
          ref={taRef}
          className="composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            listening
              ? 'Говори… запись идёт'
              : isAndroidApp()
                ? 'Сообщение или / для быстрых команд…'
                : 'Напиши запрос или начни с / для команд · ПКМ — копировать и вставить…'
          }
          rows={1}
          spellCheck={false}
        />

        <div className="composer-tools">
          <button className="icon-btn" onClick={addFiles} title="Прикрепить файлы (или перетащи мышкой)">
            <Icon name="paperclip" size={15} />
          </button>
          <button className="icon-btn" onClick={pasteTextQuick} title="Вставить текст из буфера обмена">
            <Icon name="clipboard" size={15} />
          </button>
          <button
            className={cn('icon-btn', listening && 'listening mic-btn')}
            onClick={startListening}
            title={listening ? 'Остановить запись' : 'Голосовой ввод'}
          >
            <Icon name={listening ? 'mic-off' : 'mic'} size={15} />
          </button>
          <button
            className="icon-btn"
            onClick={async () => {
              const value = text.trim();
              if (!value) {
                toast('Сначала напиши текст промпта', 'warning');
                return;
              }
              await savePrompt(value.slice(0, 40), value);
              toast('Промпт сохранён — доступен в «Мои промпты» и Ctrl+K', 'success');
            }}
            title="Сохранить текст как промпт"
          >
            <Icon name="bookmark" size={15} />
          </button>

          {modelMeta.efforts.length > 0 && activeEffort && (
            <div className="effort-wrap" ref={effortRef}>
              <button
                type="button"
                className={cn('effort-btn', activeEffort !== 'none' && 'enabled')}
                onClick={() => setEffortOpen((v) => !v)}
                title="Настроить глубину рассуждений ИИ для этой модели"
              >
                <Icon name="brain" size={13} />
                <span><span className="hide-xs">Рассуждение: </span>{EFFORT_META[activeEffort]?.short || activeEffort}</span>
                <Icon name="chevron-down" size={11} />
              </button>

              {effortOpen && (
                <div className="effort-popover">
                  <div className="effort-popover-title">Глубина рассуждений · {modelMeta.name}</div>
                  {modelMeta.efforts.map((level) => {
                    const info = EFFORT_META[level] || { label: level, desc: '' };
                    const selected = level === activeEffort;
                    return (
                      <button
                        key={level}
                        type="button"
                        className={cn('effort-option', selected && 'active')}
                        onClick={() => {
                          updateConfig('chat.reasoningEffort', level);
                          setEffortOpen(false);
                        }}
                      >
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div className="effort-option-label">{info.label}</div>
                          <div className="effort-option-desc">{info.desc}</div>
                        </div>
                        {selected && <Icon name="check" size={13} style={{ color: 'var(--accent)' }} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <span className="spacer" />

          {approxTokens > 0 && (
            <span className="composer-tokens" title={`${text.length} символов`}>
              ~{approxTokens} ток.
            </span>
          )}

          <button className="composer-model" onClick={openModelPicker} title="Выбрать бесплатную модель">
            <span className="status-dot" style={{ animation: 'none', width: 5, height: 5 }} />
            {modelMeta.reasoning && <Icon name="brain" size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />}
            <span>{modelMeta.name || model || 'модель'}</span>
          </button>

          <span className="composer-hint">
            Enter ↵
          </span>

          {streaming ? (
            <button className="send-btn stop" onClick={stopGeneration} title="Остановить (Esc)">
              <Icon name="square" size={14} />
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={submit}
              disabled={!text.trim() && !attachments.length}
              title="Отправить"
            >
              <Icon name="arrow-up" size={16} />
            </button>
          )}
        </div>
      </div>
      {state.streaming && (
        <div className="composer-banner success">
          <Icon name="zap" size={12} />
          <span>PSYCHIC работает — можно остановить в любой момент</span>
          <span style={{ marginLeft: 'auto' }}>ESC</span>
        </div>
      )}
    </div>
  );
}
