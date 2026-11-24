import React from 'react';
import { useApp } from '../lib/store';
import { cn, formatTime, copyToClipboard, isImageFile } from '../lib/utils';
import Icon from './Icon';
import Logo from './Logo';
import Markdown from './Markdown';
import ToolCall from './ToolCall';

function Attachments({ attachments }) {
  return (
    <div className="msg-attachments">
      {attachments.map((att, i) => (
        <div key={i} className="msg-attachment" title={att.path}>
          {att.dataUrl ? (
            <img src={att.dataUrl} alt="" />
          ) : (
            <Icon name={isImageFile(att.name) ? 'image' : 'file-text'} size={13} />
          )}
          <span className="name">{att.name}</span>
        </div>
      ))}
    </div>
  );
}

function Reasoning({ text }) {
  return (
    <details className="reasoning">
      <summary>
        <Icon name="brain" size={12} />
        Рассуждения · {text.length} симв.
      </summary>
      <div className="reasoning-body">{text}</div>
    </details>
  );
}

export default function Message({ message, streaming }) {
  const { regenerate, speak, state } = useApp();
  const isUser = message.role === 'user';
  const hasContent = !!message.content?.trim();
  const toolCalls = message.toolCalls || [];
  const isLastAssistant = !isUser && !streaming;

  const onCopy = async () => {
    if (message.content) await copyToClipboard(message.content);
  };

  return (
    <div className={cn('msg', isUser && 'user')}>
      <div className={cn('msg-avatar', isUser && 'user')}>
        {isUser ? 'PS' : <Logo size={18} />}
      </div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-author">{isUser ? 'ВЫ' : 'PSYCHIC'}</span>
          {!isUser && message.model && (
            <span className="msg-model" title={message.model}>{message.model}</span>
          )}
          {message.createdAt && <span>{formatTime(message.createdAt)}</span>}
        </div>

        {message.attachments?.length > 0 && <Attachments attachments={message.attachments} />}

        {message.reasoning && <Reasoning text={message.reasoning} />}

        {toolCalls.map((call) => (
          <ToolCall key={call.id} call={call} />
        ))}

        {hasContent && (
          isUser ? (
            <div className="msg-bubble">
              <Markdown text={message.content} />
            </div>
          ) : (
            <Markdown text={message.content} />
          )
        )}

        {streaming && !hasContent && !toolCalls.length && (
          <div className="stream-thinking">
            <span>Анализирую запрос</span>
            <span className="dots"><span /><span /><span /></span>
          </div>
        )}

        {streaming && hasContent && <span className="typing-cursor" />}

        {message.error && (
          <div className="msg-error">
            <Icon name="alert-triangle" size={14} />
            <span>{message.error}</span>
          </div>
        )}

        {!streaming && hasContent && (
          <div className="msg-actions">
            <button className="msg-action" onClick={onCopy} title="Копировать">
              <Icon name="copy" size={12} /> Копировать
            </button>
            {!isUser && (
              <button className="msg-action" onClick={() => speak(message.content)} title="Озвучить">
                <Icon name="volume" size={12} /> Озвучить
              </button>
            )}
            {isLastAssistant && (
              <button className="msg-action" onClick={regenerate} title="Повторить">
                <Icon name="refresh" size={12} /> Повторить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
