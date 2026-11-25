import React, { useEffect, useRef, useState } from 'react';
import { invoke } from '../lib/api';
import { copyToClipboard } from '../lib/utils';
import Icon from './Icon';
import { useApp } from '../lib/store';
import Message from './Message';
import Welcome from './Welcome';
import Composer from './Composer';

export default function ChatView() {
  const { state, toast } = useApp();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);

  const streaming = state.streaming && state.streaming.chatId === state.activeChatId
    ? state.streaming
    : null;

  const streamingMessage = streaming
    ? {
        id: streaming.messageId,
        role: 'assistant',
        content: streaming.text,
        reasoning: streaming.reasoning,
        reasoningEffort: streaming.reasoningEffort,
        toolCalls: streaming.toolCalls,
        model: streaming.model,
        provider: streaming.provider,
        streaming: true,
      }
    : null;

  const messages = [...state.messages, ...(streamingMessage ? [streamingMessage] : [])];

  const normalized = query.trim().toLocaleLowerCase();
  const visibleMessages = normalized ? messages.filter(m => `${m.content || ''} ${m.reasoning || ''}`.toLocaleLowerCase().includes(normalized)) : messages;
  const lastMessage = state.messages[state.messages.length - 1];
  const lastAssistant = lastMessage?.role === 'assistant' ? lastMessage : null;

  const copyConversation = async () => {
    const text = state.messages.filter(m => m.content).map(m => `${m.role === 'user' ? 'Вы' : 'PSYCHIC'}:\n${m.content}`).join('\n\n');
    if (!text) return;
    try {
      if (!await copyToClipboard(text)) throw new Error('Не удалось скопировать диалог');
      toast('Диалог скопирован без вложений и рассуждений', 'success');
    }
    catch (err) { toast(err.message, 'error'); }
  };
  const exportConversation = async () => {
    try {
      const path = await invoke('chats:export', { id: state.activeChatId });
      if (path) toast(`Диалог экспортирован: ${path}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!messages.length) {
      el.scrollTop = 0;
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, streaming?.text?.length, streaming?.toolCalls?.length]);

  useEffect(() => {
    stickRef.current = true;
    setQuery('');
    setSearchOpen(false);
  }, [state.activeChatId]);

  if (!state.chat && state.booted) {
    return (
      <div className="chat-view">
        <div className="chat-scroll">
          <Welcome />
        </div>
        <Composer />
      </div>
    );
  }

  return (
    <div className="chat-view">
      {state.messages.length > 0 && <div className="chat-tools" aria-label="Действия с диалогом">
        <button className="btn btn-sm btn-ghost" onClick={() => { setSearchOpen(v => !v); setQuery(''); }} aria-pressed={searchOpen}><Icon name="search" size={13} /> Поиск</button>
        <button className="btn btn-sm btn-ghost" onClick={copyConversation}><Icon name="copy" size={13} /> Копировать</button>
        <button className="btn btn-sm btn-ghost" onClick={exportConversation}><Icon name="download" size={13} /> Экспорт</button>
        {searchOpen && <label className="chat-find"><input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти в диалоге" aria-label="Найти в диалоге" /><span>{normalized ? `${visibleMessages.length} найдено` : ''}</span></label>}
      </div>}
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner">
          {!state.messages.length && !streaming ? (
            <Welcome />
          ) : (
            visibleMessages.map((message) => (
              <Message
                key={message.id}
                message={message}
                streaming={!!streamingMessage && message.id === streamingMessage.id}
                isLastAssistant={!streaming && message.id === lastAssistant?.id}
              />
            ))
          )}
          {normalized && !visibleMessages.length && <p className="chat-find-empty">Сообщений по запросу не найдено.</p>}
        </div>
      </div>
      <Composer />
    </div>
  );
}
