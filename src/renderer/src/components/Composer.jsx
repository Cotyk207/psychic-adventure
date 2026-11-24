import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn, isImageFile } from '../lib/utils';
import Icon from './Icon';

export default function Composer() {
  const { state, dispatch, sendMessage, stopGeneration, updateConfig, startListening, savePrompt, toast } = useApp();
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const taRef = useRef(null);
  const fileInputRef = useRef(null);

  const streaming = !!state.streaming && state.streaming.chatId === state.activeChatId;
  const chat = state.chat;
  const provider = (state.providers || []).find((p) => p.id === chat?.provider)
    || (state.providers || []).find((p) => p.id === state.config?.chat?.defaultProvider);
  const model = chat?.model || state.config?.chat?.defaultModel;
  const voice = state.voice || {};
  const listening = voice.listening;

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
    window.addEventListener('psychic:attach', onAttach);
    return () => window.removeEventListener('psychic:attach', onAttach);
  }, []);

  useEffect(() => {
    if (state.config?.appearance?.messageBubbles === false) {
      document.documentElement.dataset.bubbles = 'off';
    } else {
      document.documentElement.dataset.bubbles = 'on';
    }
  }, [state.config?.appearance?.messageBubbles]);

  const submit = () => {
    const value = text.trim();
    if ((!value && !attachments.length) || streaming) return;
    sendMessage(value, attachments.map((a) => ({ path: a.path, name: a.name })));
    setText('');
    setAttachments([]);
    if (taRef.current) taRef.current.style.height = 'auto';
    taRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && state.config?.chat?.sendOnEnter !== false) {
      event.preventDefault();
      submit();
    }
  };

  const addFiles = async () => {
    try {
      const paths = await invoke('fs:pickFile', { multi: true });
      if (!paths?.length) return;
      const items = [];
      for (const p of paths) {
        const name = String(p).split(/[\\/]/).pop();
        let dataUrl = null;
        if (isImageFile(name)) {
          try {
            dataUrl = await invoke('media:dataUrl', { path: p });
          } catch {}
        }
        items.push({ path: p, name, dataUrl });
      }
      setAttachments((prev) => [...prev, ...items].slice(0, 8));
    } catch {}
  };

  const openModelPicker = () => dispatch({ type: 'SET_MODAL', modal: 'modelPicker' });

  return (
    <div className="composer-wrap">
      <div className={cn('composer', streaming && 'streaming')}>
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
          placeholder={
            listening
              ? 'Говори… запись идёт'
              : 'Спроси о чём угодно. Я могу читать файлы, запускать команды, искать в сети и создавать медиа…'
          }
          rows={1}
          spellCheck={false}
        />

        <div className="composer-tools">
          <button className="icon-btn" onClick={addFiles} title="Прикрепить файлы">
            <Icon name="paperclip" size={15} />
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
            onClick={openModelPicker}
            title="Выбрать модель"
          >
            <Icon name="cpu" size={15} />
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

          <span className="spacer" />

          <button className="composer-model" onClick={openModelPicker} title="Выбрать модель">
            <span className="status-dot" style={{ animation: 'none', width: 5, height: 5 }} />
            <span>{model || 'модель'}</span>
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
