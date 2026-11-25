import React, { useEffect, useState } from 'react';
import { useApp } from '../lib/store';
import { invoke } from '../lib/api';
import { cn, formatTime, copyToClipboard, isImageFile, truncate } from '../lib/utils';
import { EFFORT_META, getModelMeta } from '../lib/models';
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

function ReasoningBlock({ text, effort, streaming, open, onToggle, onExpand, onCopy }) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const effortInfo = effort ? EFFORT_META[effort] : null;

  return (
    <div className={cn('reasoning-box', open && 'open', streaming && 'streaming')}>
      <div className="reasoning-head" onClick={onToggle}>
        <span className="reasoning-icon">
          <Icon name="brain" size={13} />
        </span>
        <span className="reasoning-title">
          {streaming ? 'ИИ рассуждает…' : 'Рассуждения ИИ'}
        </span>
        {effortInfo && (
          <span className="reasoning-effort-pill" title={effortInfo.desc}>
            {effortInfo.label}
          </span>
        )}
        <span className="reasoning-stats">
          {words} сл. · {text.length} симв.
        </span>
        <div className="reasoning-head-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn sm" onClick={onCopy} title="Скопировать рассуждения">
            <Icon name="copy" size={11} />
          </button>
          <button className="icon-btn sm" onClick={onExpand} title="Открыть рассуждения в отдельном окне">
            <Icon name="maximize" size={11} />
          </button>
        </div>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={13} style={{ color: 'var(--text-faint)' }} />
      </div>
      {open && <div className="reasoning-body">{text}</div>}
    </div>
  );
}

export default function Message({ message, streaming, isLastAssistant }) {
  const { regenerate, speak, forkChat, refreshMemory, dispatch, toast, state } = useApp();
  const isUser = message.role === 'user';
  const hasContent = !!message.content?.trim();
  const hasReasoning = !!message.reasoning?.trim();
  const toolCalls = message.toolCalls || [];


  const autoShow = state.config?.chat?.showReasoning !== false;
  const [reasoningOpen, setReasoningOpen] = useState(() => Boolean(streaming || autoShow));

  useEffect(() => {
    if (streaming && hasReasoning && !hasContent) {
      setReasoningOpen(true);
    }
  }, [streaming, hasReasoning, hasContent]);

  const modelMeta = !isUser && message.model ? getModelMeta(message.provider, message.model) : null;
  const totalTokens = message.usage?.total_tokens || message.usage?.totalTokenCount || null;

  const onCopy = async () => {
    if (!message.content) return;
    await copyToClipboard(message.content);
    toast('Ответ скопирован', 'success');
  };

  const quoteInComposer = () => {
    const quote = String(message.content || '').slice(0, 6000).split('\n').map(line => `> ${line}`).join('\n');
    window.dispatchEvent(new CustomEvent('psychic:composer-insert', { detail: { text: `${quote}\n\n` } }));
    toast('Цитата добавлена в поле ввода', 'success');
  };

  const onCopyReasoning = async () => {
    if (!message.reasoning) return;
    await copyToClipboard(message.reasoning);
    toast('Рассуждения скопированы', 'success');
  };

  const onOpenReasoningModal = () => {
    dispatch({ type: 'SET_MODAL', modal: 'reasoning', data: { message } });
  };

  const onSaveMemory = async () => {
    if (!message.content) return;
    try {
      await invoke('memory:add', {
        content: truncate(message.content.replace(/\s+/g, ' ').trim(), 500),
        tags: ['из-чата'],
      });
      await refreshMemory();
      toast('Сохранено в Память', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className={cn('msg', isUser && 'user')} data-msg-id={message.id}>
      <div className={cn('msg-avatar', isUser && 'user')}>
        {isUser ? 'ВЫ' : <Logo size={18} />}
      </div>
      <div className="msg-body">
        <div className="msg-head">
          <span className="msg-author">{isUser ? 'ВЫ' : 'PSYCHIC'}</span>
          {!isUser && message.model && (
            <span className="msg-model" title={message.model}>
              {modelMeta?.name || message.model}
            </span>
          )}
          {!isUser && message.reasoningEffort && EFFORT_META[message.reasoningEffort] && (
            <span className="reasoning-effort-pill">
              🧠 {EFFORT_META[message.reasoningEffort].short}
            </span>
          )}
          {totalTokens && (
            <span title="Использовано токенов">{totalTokens} ток.</span>
          )}
          {message.createdAt && <span>{formatTime(message.createdAt)}</span>}
        </div>

        {message.attachments?.length > 0 && <Attachments attachments={message.attachments} />}

        {hasReasoning && (
          <ReasoningBlock
            text={message.reasoning}
            effort={message.reasoningEffort}
            streaming={streaming && !hasContent}
            open={reasoningOpen}
            onToggle={() => setReasoningOpen((v) => !v)}
            onExpand={onOpenReasoningModal}
            onCopy={onCopyReasoning}
          />
        )}

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

        {streaming && !hasContent && !hasReasoning && !toolCalls.length && (
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

        {!streaming && (hasContent || hasReasoning) && (
          <div className={cn('msg-actions', hasReasoning && 'always-visible')}>
            {hasContent && (
              <button className="msg-action" onClick={onCopy} title="Копировать текст">
                <Icon name="copy" size={12} /> Копировать
              </button>
            )}
            {hasContent && <button className="msg-action" onClick={quoteInComposer} title="Цитировать в поле ввода"><Icon name="message-square" size={12} /> Цитировать</button>}
            {hasReasoning && (
              <>
                <button
                  className={cn('msg-action reasoning-btn', reasoningOpen && 'active')}
                  onClick={() => setReasoningOpen((v) => !v)}
                  title="Показать или скрыть ход рассуждений ИИ"
                >
                  <Icon name="brain" size={12} />
                  {reasoningOpen ? 'Скрыть рассуждения' : 'Показать рассуждения'}
                </button>
                <button
                  className="msg-action"
                  onClick={onOpenReasoningModal}
                  title="Открыть рассуждения ИИ в отдельном окне"
                >
                  <Icon name="maximize" size={12} /> В окне
                </button>
              </>
            )}
            {!isUser && hasContent && (
              <button className="msg-action" onClick={() => speak(message.content)} title="Озвучить ответ">
                <Icon name="volume" size={12} /> Озвучить
              </button>
            )}
            {!isUser && hasContent && (
              <button className="msg-action" onClick={onSaveMemory} title="Сохранить в долгосрочную память">
                <Icon name="bookmark" size={12} /> В память
              </button>
            )}
            {!isUser && message.id && (
              <button className="msg-action" onClick={() => forkChat(message.id)} title="Создать новую ветку диалога с этого ответа">
                <Icon name="arrow-left-right" size={12} /> Ветка
              </button>
            )}
            {isLastAssistant && (
              <button className="msg-action" onClick={regenerate} title="Сгенерировать заново">
                <Icon name="refresh" size={12} /> Повторить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
