import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/store';
import {
  copyToClipboard,
  readFromClipboard,
  insertIntoInput,
  setNativeInputValue,
  truncate,
} from '../lib/utils';
import Icon from './Icon';

export default function ContextMenu() {
  const { state, dispatch, setView, sendMessage, toast } = useApp();
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const close = () => setMenu(null);

    const onContextMenu = (event) => {
      const target = event.target;
      const isInput = target && (
        target.tagName === 'TEXTAREA' ||
        (target.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit'].includes(target.type))
      );
      const selection = String(window.getSelection?.()?.toString() || '');
      const msgEl = target?.closest?.('[data-msg-id]');
      const msgId = msgEl?.getAttribute?.('data-msg-id') || null;

      let inputSelected = '';
      let inputHasValue = false;
      if (isInput) {
        const start = typeof target.selectionStart === 'number' ? target.selectionStart : 0;
        const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : 0;
        if (end > start) inputSelected = String(target.value || '').slice(start, end);
        inputHasValue = Boolean(target.value && target.value.length > 0);
      }

      event.preventDefault();

      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const x = Math.min(event.clientX, Math.max(12, vw - 252));
      const y = Math.min(event.clientY, Math.max(12, vh - 290));

      setMenu({
        x,
        y,
        isInput,
        inputEl: isInput ? target : null,
        inputSelected,
        inputHasValue,
        selection: inputSelected || selection,
        msgId,
      });
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousedown', (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      close();
    });
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (!menu) return null;

  const targetMessage = menu.msgId
    ? (state.messages || []).find((m) => m.id === menu.msgId)
      || (state.streaming?.messageId === menu.msgId
        ? { id: menu.msgId, content: state.streaming.text, reasoning: state.streaming.reasoning, model: state.streaming.model }
        : null)
    : null;

  const close = () => setMenu(null);

  const handleCopy = async () => {
    const text = menu.selection || (menu.isInput ? menu.inputEl?.value : '') || targetMessage?.content || '';
    close();
    if (!text) return;
    await copyToClipboard(text);
    toast('Скопировано в буфер обмена', 'success');
  };

  const handleCut = async () => {
    const el = menu.inputEl;
    if (!el || !menu.inputSelected) return;
    const val = String(el.value || '');
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    await copyToClipboard(menu.inputSelected);
    setNativeInputValue(el, val.slice(0, start) + val.slice(end));
    try {
      el.focus();
      el.setSelectionRange?.(start, start);
    } catch {}
    close();
    toast('Вырезано в буфер обмена', 'info');
  };

  const handlePaste = async () => {
    const clip = await readFromClipboard();
    const el = menu.inputEl;
    close();
    if (!clip) {
      toast('Буфер обмена пуст', 'warning');
      return;
    }
    if (el) {
      insertIntoInput(el, clip);
      return;
    }
    setView('chat');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('psychic:composer-insert', { detail: { text: clip } }));
    }, 30);
  };

  const handleSelectAll = () => {
    const el = menu.inputEl;
    close();
    if (el) {
      try {
        el.focus();
        el.select?.();
      } catch {}
    }
  };

  const handleClearInput = () => {
    const el = menu.inputEl;
    close();
    if (el) {
      setNativeInputValue(el, '');
      try { el.focus(); } catch {}
    }
  };

  const handleInsertSelectionToChat = (asQuote = false) => {
    const raw = menu.selection.trim();
    close();
    if (!raw) return;
    const formatted = asQuote
      ? `${raw.split('\n').map((l) => `> ${l}`).join('\n')}\n\n`
      : raw;
    setView('chat');
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('psychic:composer-insert', { detail: { text: formatted } }));
    }, 30);
  };

  const handleExplainSelection = () => {
    const raw = menu.selection.trim();
    close();
    if (!raw) return;
    setView('chat');
    sendMessage(`Объясни понятно и по делу:\n\n> ${truncate(raw, 4000).split('\n').join('\n> ')}`);
  };

  const handleCopyWholeMessage = async () => {
    close();
    if (!targetMessage?.content) return;
    await copyToClipboard(targetMessage.content);
    toast('Сообщение скопировано', 'success');
  };

  const handleViewReasoning = () => {
    close();
    if (!targetMessage?.reasoning) return;
    dispatch({ type: 'SET_MODAL', modal: 'reasoning', data: { message: targetMessage } });
  };

  return (
    <div
      ref={menuRef}
      className="ctx-menu"
      style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
      role="menu"
      aria-label="Контекстное меню"
    >
      {menu.isInput ? (
        <>
          <button
            className="ctx-item"
            onClick={handleCopy}
            disabled={!menu.inputSelected && !menu.inputHasValue}
          >
            <Icon name="copy" size={13} />
            <span>{menu.inputSelected ? 'Копировать' : 'Копировать всё поле'}</span>
            <kbd>Ctrl+C</kbd>
          </button>
          {menu.inputSelected && (
            <button className="ctx-item" onClick={handleCut}>
              <Icon name="file-pen" size={13} />
              <span>Вырезать</span>
              <kbd>Ctrl+X</kbd>
            </button>
          )}
          <button className="ctx-item" onClick={handlePaste}>
            <Icon name="clipboard" size={13} />
            <span>Вставить</span>
            <kbd>Ctrl+V</kbd>
          </button>
          <div className="ctx-sep" />
          <button className="ctx-item" onClick={handleSelectAll} disabled={!menu.inputHasValue}>
            <Icon name="scan-text" size={13} />
            <span>Выделить всё</span>
            <kbd>Ctrl+A</kbd>
          </button>
          {menu.inputHasValue && (
            <button className="ctx-item danger" onClick={handleClearInput}>
              <Icon name="trash-2" size={13} />
              <span>Очистить поле</span>
            </button>
          )}
        </>
      ) : (
        <>
          {menu.selection ? (
            <>
              <button className="ctx-item" onClick={handleCopy}>
                <Icon name="copy" size={13} />
                <span>Копировать выделенное</span>
                <kbd>Ctrl+C</kbd>
              </button>
              <button className="ctx-item" onClick={() => handleInsertSelectionToChat(false)}>
                <Icon name="corner-down-left" size={13} />
                <span>Вставить в поле чата</span>
              </button>
              <button className="ctx-item" onClick={() => handleInsertSelectionToChat(true)}>
                <Icon name="message-square" size={13} />
                <span>Цитировать в чат</span>
              </button>
              <button className="ctx-item accent" onClick={handleExplainSelection}>
                <Icon name="sparkles" size={13} />
                <span>Объяснить с помощью ИИ</span>
              </button>
              <div className="ctx-sep" />
            </>
          ) : null}

          <button className="ctx-item" onClick={handlePaste}>
            <Icon name="clipboard" size={13} />
            <span>Вставить из буфера в чат</span>
            <kbd>Ctrl+V</kbd>
          </button>

          {targetMessage?.content && (
            <button className="ctx-item" onClick={handleCopyWholeMessage}>
              <Icon name="file-text" size={13} />
              <span>Копировать всё сообщение</span>
            </button>
          )}

          {targetMessage?.reasoning && (
            <button className="ctx-item accent" onClick={handleViewReasoning}>
              <Icon name="brain" size={13} />
              <span>Посмотреть рассуждения ИИ</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
