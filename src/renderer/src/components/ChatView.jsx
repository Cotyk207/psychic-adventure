import React, { useEffect, useRef } from 'react';
import { useApp } from '../lib/store';
import Message from './Message';
import Welcome from './Welcome';
import Composer from './Composer';

export default function ChatView() {
  const { state } = useApp();
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
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="chat-inner">
          {!state.messages.length && !streaming ? (
            <Welcome />
          ) : (
            messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                streaming={!!streamingMessage && message.id === streamingMessage.id}
              />
            ))
          )}
        </div>
      </div>
      <Composer />
    </div>
  );
}
