import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useApp } from '../lib/store';
import { invoke, on, isAndroidApp } from '../lib/api';
import { cn } from '../lib/utils';
import Icon from './Icon';

export default function TerminalPanel() {
  const { state, toast, setView } = useApp();
  const androidApp = isAndroidApp();
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const buffers = useRef(new Map());
  const activeRef = useRef(null);
  const createRef = useRef(null);
  const sessionsRef = useRef([]);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const createSession = async (cwd) => {
    try {
      const result = await invoke('terminal:create', { cwd });
      if (!result?.id) throw new Error(result?.error || 'Не удалось запустить терминал');
      setSessions((prev) => [...prev, result]);
      setActiveId(result.id);
      buffers.current.set(result.id, '');
    } catch (err) {
      toast(err.message, 'error', 'Терминал');
    }
  };
  createRef.current = createSession;

  useEffect(() => {
    if (androidApp || !containerRef.current) return undefined;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: state.config?.terminal?.fontSize || 13,
      lineHeight: 1.25,
      theme: {
        background: '#05060d',
        foreground: '#c9d2ea',
        cursor: '#00f0ff',
        cursorAccent: '#05060d',
        selectionBackground: 'rgba(0, 240, 255, 0.24)',
        black: '#171a2e',
        red: '#ff3860',
        green: '#3dffb0',
        yellow: '#ffcc4d',
        blue: '#5aa8ff',
        magenta: '#ff2d95',
        cyan: '#00f0ff',
        white: '#e9edff',
        brightBlack: '#4b5273',
        brightRed: '#ff7a92',
        brightGreen: '#86ffd0',
        brightYellow: '#ffe08a',
        brightBlue: '#93c9ff',
        brightMagenta: '#ff85bd',
        brightCyan: '#8dfbff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    try {
      term.open(containerRef.current);
    } catch (err) {
      // Окно может быть ещё не размечено или GPU-контекст недоступен —
      // терминал просто не отрисуется, остальное приложение продолжает работать.
      console.warn('terminal open failed', err);
      try { term.dispose(); } catch {}
      return undefined;
    }
    try { fit.fit(); } catch {}
    termRef.current = term;
    fitRef.current = fit;

    term.onData((data) => {
      if (activeRef.current) {
        invoke('terminal:write', { id: activeRef.current, data }).catch(() => {});
      }
    });

    const ro = new ResizeObserver(() => {
      try { fit.fit(); } catch {}
    });
    ro.observe(containerRef.current);

    const u1 = on('terminal:data', ({ id, data }) => {
      const prev = buffers.current.get(id) || '';
      buffers.current.set(id, (prev + data).slice(-60000));
      if (id === activeRef.current && termRef.current) {
        termRef.current.write(data);
      }
    });
    const u2 = on('terminal:exit', ({ id, code }) => {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      buffers.current.delete(id);
      if (activeRef.current === id) setActiveId((prev) => prev);
      toast(`Терминал завершился (код ${code ?? '—'})`, code === 0 ? 'info' : 'warning');
    });

    const timer = setTimeout(() => {
      createRef.current?.(state.appInfo?.paths?.workspace);
    }, 250);

    return () => {
      clearTimeout(timer);
      ro.disconnect();
      u1?.();
      u2?.();
      for (const s of sessionsRef.current) {
        invoke('terminal:close', { id: s.id }).catch(() => {});
      }
      try { term.dispose(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    try {
      term.reset();
      const buffer = buffers.current.get(activeId) || '';
      if (buffer) term.write(buffer.slice(-20000));
      term.focus();
    } catch {}
  }, [activeId]);

  const closeSession = async (id) => {
    await invoke('terminal:close', { id }).catch(() => {});
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeRef.current === id) setActiveId(next[0]?.id || null);
      return next;
    });
    buffers.current.delete(id);
  };

  if (androidApp) {
    return (
      <div className="terminal-panel">
        <div className="terminal-empty" style={{ padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, maxWidth: 320 }}>
            <div className="about-logo" style={{ width: 52, height: 52, borderRadius: 14 }}>
              <Icon name="terminal" size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Системный терминал ПК</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-dim)' }}>
              Интерактивная оболочка CMD / PowerShell / Bash работает в десктопной версии PSYCHIC. На Android используй Диалог или Файлы — ИИ сам умеет создавать файлы, писать код и искать в сети.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
              <button className="btn btn-primary" onClick={() => setView('chat')}>
                <Icon name="message-square" size={14} /> Открыть чат
              </button>
              <button className="btn" onClick={() => setView('files')}>
                <Icon name="folder" size={14} /> Файлы
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-tabs">
        {sessions.map((session, index) => (
          <div
            key={session.id}
            className={cn('terminal-tab', session.id === activeId && 'active')}
            onClick={() => setActiveId(session.id)}
          >
            <Icon name="terminal" size={11} />
            {session.shell} {index + 1}
            <button onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}>
              <Icon name="x" size={10} />
            </button>
          </div>
        ))}
        <button className="icon-btn sm" onClick={() => createSession(state.appInfo?.paths?.workspace)} title="Новый терминал">
          <Icon name="plus" size={14} />
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
          {window.psychic?.platform === 'win32' ? 'CMD / UTF-8' : 'BASH'}
        </span>
      </div>
      <div className="terminal-body">
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
}
