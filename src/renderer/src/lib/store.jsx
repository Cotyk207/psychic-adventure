import React, { createContext, useContext, useEffect, useReducer, useRef, useCallback, useMemo } from 'react';
import { invoke, on } from './api';
import { applyTheme } from './themes';
import { player } from './musicPlayer';

const AppContext = createContext(null);

export const initialState = {
  booted: false,
  bootError: null,
  appInfo: null,
  config: null,
  view: 'chat',
  previousView: 'chat',
  chats: [],
  activeChatId: null,
  chat: null,
  messages: [],
  streaming: null,
  providers: [],
  skills: [],
  memory: [],
  media: { images: [], music: [], video: [], screenshots: [] },
  browser: { url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: false },
  toasts: [],
  modal: null,
  modalData: null,
  permission: null,
  ask: null,
  voice: { listening: false, supported: false, transcript: '', error: null },
  music: { queue: [], current: null, playing: false, volume: 0.7, library: [], position: 0, duration: 0 },
  windowState: { maximized: false, fullscreen: false, focused: true },
  searchQuery: '',
  terminalSessions: [],
  tasks: [],
  update: null,
  splash: true,
  settingsTab: 'general',
};

function reducer(state, action) {
  switch (action.type) {
    case 'MERGE':
      return { ...state, ...action.payload };
    case 'SET_CONFIG':
      return { ...state, config: action.config };
    case 'PATCH_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };
    case 'SET_VIEW':
      return { ...state, previousView: state.view, view: action.view };
    case 'SET_CHATS':
      return { ...state, chats: action.chats };
    case 'SET_CHAT':
      return {
        ...state,
        chat: action.chat,
        messages: action.chat?.messages || [],
        activeChatId: action.chat?.id || state.activeChatId,
      };
    case 'UPDATE_CHAT_META':
      return state.chat ? { ...state, chat: { ...state.chat, ...action.payload } } : state;
    case 'ADD_MESSAGE': {
      if (!state.chat) return state;
      if (state.chat.messages.some((m) => m.id === action.message.id)) return state;
      const messages = [...state.chat.messages, action.message];
      return { ...state, messages, chat: { ...state.chat, messages } };
    }
    case 'TRIM_AFTER_LAST_USER': {
      if (!state.chat) return state;
      const idx = state.chat.messages.map((m) => m.role).lastIndexOf('user');
      if (idx < 0) return state;
      const messages = state.chat.messages.slice(0, idx + 1);
      return { ...state, messages, chat: { ...state.chat, messages } };
    }
    case 'STREAM_START':
      return {
        ...state,
        streaming: {
          chatId: action.chatId,
          messageId: action.messageId,
          provider: action.provider,
          model: action.model,
          text: '',
          reasoning: '',
          toolCalls: [],
          startedAt: Date.now(),
        },
      };
    case 'STREAM_APPEND': {
      if (!state.streaming || state.streaming.chatId !== action.chatId) return state;
      return {
        ...state,
        streaming: {
          ...state.streaming,
          [action.field]: (state.streaming[action.field] || '') + action.delta,
        },
      };
    }
    case 'STREAM_TOOL': {
      if (!state.streaming || state.streaming.chatId !== action.chatId) return state;
      const calls = state.streaming.toolCalls.slice();
      const idx = calls.findIndex((c) => c.id === action.call.id);
      if (idx >= 0) calls[idx] = { ...calls[idx], ...action.call };
      else calls.push(action.call);
      return { ...state, streaming: { ...state.streaming, toolCalls: calls } };
    }
    case 'STREAM_END':
      return { ...state, streaming: null };
    case 'SET_PROVIDERS':
      return { ...state, providers: action.providers };
    case 'SET_SKILLS':
      return { ...state, skills: action.skills };
    case 'SET_MEMORY':
      return { ...state, memory: action.memory };
    case 'SET_MEDIA':
      return { ...state, media: action.media };
    case 'SET_BROWSER':
      return { ...state, browser: { ...state.browser, ...action.browser } };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.toast].slice(-5) };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case 'SET_MODAL':
      return { ...state, modal: action.modal, modalData: action.data || null };
    case 'SET_PERMISSION':
      return { ...state, permission: action.permission };
    case 'SET_ASK':
      return { ...state, ask: action.ask };
    case 'SET_VOICE':
      return { ...state, voice: { ...state.voice, ...action.voice } };
    case 'SET_MUSIC':
      return { ...state, music: action.music };
    case 'SET_WINDOW_STATE':
      return { ...state, windowState: { ...state.windowState, ...action.payload } };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.query };
    case 'SET_SPLASH':
      return { ...state, splash: action.splash };
    case 'SET_SETTINGS_TAB':
      return { ...state, settingsTab: action.tab };
    case 'SET_TASKS':
      return { ...state, tasks: action.tasks };
    case 'SET_UPDATE':
      return { ...state, update: action.update };
    default:
      return state;
  }
}

function setDeep(obj, path, value) {
  const parts = path.split('.');
  const copy = { ...obj };
  let cur = copy;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = cur[parts[i]] ? { ...cur[parts[i]] } : {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return copy;
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const recognitionRef = useRef(null);

  const toast = useCallback((message, type = 'info', title) => {
    const id = Math.random().toString(36).slice(2, 10);
    dispatch({
      type: 'ADD_TOAST',
      toast: { id, message: String(message), type, title, createdAt: Date.now() },
    });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', id }), type === 'error' ? 8000 : 4200);
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const config = await invoke('config:get');
      dispatch({ type: 'SET_CONFIG', config });
      return config;
    } catch (err) {
      toast(err.message, 'error', 'Не удалось загрузить настройки');
      return null;
    }
  }, [toast]);

  const refreshChats = useCallback(async () => {
    try {
      const chats = await invoke('chats:list');
      dispatch({ type: 'SET_CHATS', chats });
      return chats;
    } catch {
      return [];
    }
  }, []);

  const refreshProviders = useCallback(async () => {
    try {
      const providers = await invoke('providers:list');
      dispatch({ type: 'SET_PROVIDERS', providers });
      return providers;
    } catch {
      return [];
    }
  }, []);

  const refreshSkills = useCallback(async () => {
    try {
      const skills = await invoke('skills:list');
      dispatch({ type: 'SET_SKILLS', skills });
      return skills;
    } catch {
      return [];
    }
  }, []);

  const refreshMemory = useCallback(async () => {
    try {
      const memory = await invoke('memory:list');
      dispatch({ type: 'SET_MEMORY', memory });
      return memory;
    } catch {
      return [];
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const tasks = await invoke('tasks:list');
      dispatch({ type: 'SET_TASKS', tasks: Array.isArray(tasks) ? tasks : [] });
      return tasks;
    } catch {
      return [];
    }
  }, []);

  const refreshMedia = useCallback(async () => {
    try {
      const all = await invoke('media:list', { type: 'all' });
      const media = { images: [], music: [], video: [], screenshots: [] };
      for (const item of all) {
        if (media[item.kind]) media[item.kind].push(item);
      }
      dispatch({ type: 'SET_MEDIA', media });
      return media;
    } catch {
      return null;
    }
  }, []);

  const loadChat = useCallback(async (id) => {
    try {
      const chat = await invoke('chats:get', { id });
      if (chat) dispatch({ type: 'SET_CHAT', chat });
      return chat;
    } catch {
      return null;
    }
  }, []);

  const createChat = useCallback(async ({ title, provider, model } = {}) => {
    try {
      const chat = await invoke('chats:create', { title, provider, model });
      dispatch({ type: 'SET_CHAT', chat });
      dispatch({ type: 'SET_VIEW', view: 'chat' });
      await refreshChats();
      return chat;
    } catch (err) {
      toast(err.message, 'error', 'Не удалось создать диалог');
      return null;
    }
  }, [refreshChats, toast]);

  const deleteChat = useCallback(async (id) => {
    try {
      await invoke('chats:delete', { id });
      const chats = await refreshChats();
      if (stateRef.current.activeChatId === id) {
        if (chats.length) await loadChat(chats[0].id);
        else await createChat();
      }
    } catch (err) {
      toast(err.message, 'error', 'Не удалось удалить диалог');
    }
  }, [createChat, loadChat, refreshChats, toast]);

  const renameChat = useCallback(async (id, title) => {
    try {
      const chat = await invoke('chats:rename', { id, title });
      if (stateRef.current.activeChatId === id && chat) dispatch({ type: 'SET_CHAT', chat });
      await refreshChats();
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [refreshChats, toast]);

  const pinChat = useCallback(async (id) => {
    try {
      await invoke('chats:pin', { id });
      await refreshChats();
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [refreshChats, toast]);

  const openSettings = useCallback((tab = 'general') => {
    dispatch({ type: 'SET_SETTINGS_TAB', tab });
    dispatch({ type: 'SET_MODAL', modal: 'settings' });
  }, []);

  const closeModal = useCallback(() => dispatch({ type: 'SET_MODAL', modal: null }), []);

  const setView = useCallback((view) => dispatch({ type: 'SET_VIEW', view }), []);

  const sendMessage = useCallback(async (text, attachments = [], options = {}) => {
    const current = stateRef.current;
    let chatId = current.activeChatId;
    if (!chatId || !current.chat) {
      const chat = await createChat({ provider: options.providerId, model: options.model });
      chatId = chat?.id;
    }
    if (!chatId) return;
    try {
      await invoke('agent:send', {
        chatId,
        text,
        attachments,
        providerId: options.providerId,
        model: options.model,
      });
    } catch (err) {
      toast(err.message, 'error', 'Не удалось отправить сообщение');
    }
  }, [createChat, toast]);

  const stopGeneration = useCallback(async () => {
    const chatId = stateRef.current.activeChatId;
    try {
      if (chatId) await invoke('agent:stop', { chatId });
    } catch {}
    dispatch({ type: 'STREAM_END' });
  }, []);

  const regenerate = useCallback(async () => {
    const chatId = stateRef.current.activeChatId;
    if (!chatId) return;
    dispatch({ type: 'TRIM_AFTER_LAST_USER' });
    try {
      await invoke('agent:regenerate', { chatId });
    } catch (err) {
      toast(err.message, 'error', 'Не удалось повторить генерацию');
    }
  }, [toast]);

  const resolvePermission = useCallback(async (decision) => {
    const req = stateRef.current.permission;
    if (!req) return;
    dispatch({ type: 'SET_PERMISSION', permission: null });
    try {
      await invoke('interactions:resolve', { ...req, decision });
    } catch {}
  }, []);

  const resolveAsk = useCallback(async (answer) => {
    const req = stateRef.current.ask;
    if (!req) return;
    dispatch({ type: 'SET_ASK', ask: null });
    try {
      await invoke('interactions:resolve', { ...req, answer });
    } catch {}
  }, []);

  const updateConfig = useCallback(async (key, value) => {
    const config = setDeep(stateRef.current.config || {}, key, value);
    dispatch({ type: 'SET_CONFIG', config });
    try {
      await invoke('config:set', { key, value });
    } catch (err) {
      toast(err.message, 'error', 'Не удалось сохранить настройку');
    }
  }, [toast]);

  const patchConfig = useCallback(async (partial) => {
    dispatch({ type: 'PATCH_CONFIG', payload: partial });
    try {
      await invoke('config:patch', { value: partial });
    } catch (err) {
      toast(err.message, 'error', 'Не удалось сохранить настройки');
    }
  }, [toast]);

  const savePrompt = useCallback(async (title, text) => {
    const value = String(text || '').trim();
    if (!value) return null;
    const prompts = Array.isArray(stateRef.current.config?.chat?.prompts) ? stateRef.current.config.chat.prompts : [];
    const item = {
      id: `p${Math.random().toString(36).slice(2, 9)}`,
      title: String(title || value.slice(0, 40)).trim(),
      text: value,
      createdAt: Date.now(),
    };
    const next = [item, ...prompts.filter((p) => p.text !== value)].slice(0, 50);
    await updateConfig('chat.prompts', next);
    return item;
  }, [updateConfig]);

  const deletePrompt = useCallback(async (id) => {
    const prompts = Array.isArray(stateRef.current.config?.chat?.prompts) ? stateRef.current.config.chat.prompts : [];
    await updateConfig('chat.prompts', prompts.filter((p) => p.id !== id));
  }, [updateConfig]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshChats(), refreshProviders(), refreshSkills(), refreshMemory(), refreshMedia()]);
  }, [refreshChats, refreshProviders, refreshSkills, refreshMemory, refreshMedia]);

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [config, appInfo, chats, providers, skills, memory, tasks] = await Promise.all([
          invoke('config:get'),
          invoke('app:getInfo'),
          invoke('chats:list'),
          invoke('providers:list'),
          invoke('skills:list'),
          invoke('memory:list'),
          invoke('tasks:list').catch(() => []),
        ]);
        if (cancelled) return;
        dispatch({
          type: 'MERGE',
          payload: {
            config, appInfo, chats, providers, skills, memory,
            tasks: Array.isArray(tasks) ? tasks : [],
            booted: true, splash: false,
          },
        });
        const active = chats.length ? chats[0] : await createChat();
        if (active) await loadChat(active.id);
        refreshMedia();
      } catch (err) {
        dispatch({ type: 'MERGE', payload: { booted: true, splash: false, bootError: err.message } });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Тема ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.config) applyTheme(state.config);
  }, [state.config]);

  // ── Плеер ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = player.subscribe((music) => dispatch({ type: 'SET_MUSIC', music }));
    player.loadLibrary();
    return unsub;
  }, []);

  // ── События main-процесса ────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [];

    unsubs.push(on('agent:event', (evt) => {
      const { type, chatId } = evt;
      const current = stateRef.current;
      if (type === 'start') {
        dispatch({
          type: 'STREAM_START',
          chatId,
          messageId: evt.messageId,
          provider: evt.provider,
          model: evt.model,
        });
      } else if (type === 'token') {
        dispatch({ type: 'STREAM_APPEND', chatId, field: 'text', delta: evt.delta });
      } else if (type === 'reasoning') {
        dispatch({ type: 'STREAM_APPEND', chatId, field: 'reasoning', delta: evt.delta });
      } else if (type === 'tool') {
        dispatch({ type: 'STREAM_TOOL', chatId, call: evt.call });
      } else if (type === 'user_saved') {
        dispatch({ type: 'ADD_MESSAGE', message: evt.message });
        if (evt.title) dispatch({ type: 'UPDATE_CHAT_META', payload: { title: evt.title } });
        refreshChats();
      } else if (type === 'done') {
        dispatch({ type: 'STREAM_END' });
        refreshChats();
        if (current.activeChatId === chatId) loadChat(chatId);
        if (current.config?.chat?.autoSpeak && evt.content) {
          const clean = evt.content.replace(/```[\s\S]*?```/g, '').replace(/[*_#>`]/g, '');
          if (clean.length < 1500) {
            try {
              const u = new SpeechSynthesisUtterance(clean);
              const voice = current.config.voice || {};
              u.lang = voice.sttLanguage || 'ru-RU';
              u.rate = voice.rate || 1;
              u.pitch = voice.pitch || 1;
              window.speechSynthesis?.speak(u);
            } catch {}
          }
        }
        if (document.hidden && window.Notification?.permission === 'granted') {
          new window.Notification('PSYCHIC', { body: 'Ответ готов' });
        }
      } else if (type === 'error') {
        dispatch({ type: 'STREAM_END' });
        toast(evt.message, 'error', 'Ошибка генерации');
        refreshChats();
        if (current.activeChatId === chatId) loadChat(chatId);
      }
    }));

    unsubs.push(on('permission:request', (permission) => dispatch({ type: 'SET_PERMISSION', permission })));
    unsubs.push(on('ask:request', (ask) => dispatch({ type: 'SET_ASK', ask })));
    unsubs.push(on('browser:state', (browser) => dispatch({ type: 'SET_BROWSER', browser })));
    unsubs.push(on('window:state', (payload) => dispatch({ type: 'SET_WINDOW_STATE', payload })));
    unsubs.push(on('window:focus', (focused) => dispatch({ type: 'SET_WINDOW_STATE', payload: { focused } })));
    unsubs.push(on('providers:localDetected', () => refreshProviders()));
    unsubs.push(on('app:updateAvailable', (info) => {
      dispatch({ type: 'SET_UPDATE', update: info });
      toast(`Доступна версия ${info.latest} — обновление на GitHub`, 'info', 'Обновление');
    }));
    unsubs.push(on('app:scheduled', (payload) => {
      toast(payload?.title || 'Сработала задача', 'info', 'Автоматизация');
      refreshTasks();
    }));
    unsubs.push(on('app:action', ({ action, chatId }) => {
      if (action === 'new-chat') createChat();
      if (action === 'settings') openSettings();
      if (action === 'open-chat' && chatId) {
        dispatch({ type: 'SET_VIEW', view: 'chat' });
        loadChat(chatId);
      }
    }));

    unsubs.push(on('music:play', async ({ id, query, action }) => {
      try {
        let result;
        if (action === 'play') {
          const track = await player.playQuery(query || '');
          result = { ok: true, text: `🎵 Играет: ${track.title || track.name}${track.artist ? ` — ${track.artist}` : ''}`, track };
        } else if (action === 'pause') {
          player.pause();
          result = { ok: true, text: '⏸ Воспроизведение на паузе' };
        } else if (action === 'resume') {
          player.resume();
          result = { ok: true, text: '▶ Продолжаю' };
        } else if (action === 'stop') {
          player.stop();
          result = { ok: true, text: '⏹ Остановлено' };
        } else if (action === 'next') {
          player.next();
          result = { ok: true, text: '⏭ Следующий трек' };
        } else {
          const s = player.getState();
          result = { ok: true, text: s.current ? `▶ ${s.current.title} (${s.playing ? 'играет' : 'пауза'})` : 'Плеер пуст' };
        }
        await invoke('interactions:resolve', { id, ...result });
      } catch (err) {
        await invoke('interactions:resolve', { id, ok: false, error: err.message }).catch(() => {});
      }
    }));

    return () => unsubs.forEach((fn) => { try { fn(); } catch {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Голос ───────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Распознавание речи недоступно в этой сборке Chromium. Используй клавиатуру.', 'error', 'Голосовой ввод');
      return;
    }
    if (stateRef.current.voice.listening) {
      stopListening();
      return;
    }
    try {
      const recognition = new SR();
      recognition.lang = stateRef.current.config?.voice?.sttLanguage || 'ru-RU';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          text += event.results[i][0].transcript;
        }
        dispatch({ type: 'SET_VOICE', voice: { listening: true, transcript: text } });
      };
      recognition.onerror = (event) => {
        dispatch({ type: 'SET_VOICE', voice: { listening: false, transcript: '', error: event.error } });
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          toast(`Ошибка распознавания: ${event.error}`, 'error', 'Голосовой ввод');
        }
      };
      recognition.onend = () => {
        const transcript = stateRef.current.voice.transcript;
        dispatch({ type: 'SET_VOICE', voice: { listening: false, transcript: '' } });
        if (transcript && stateRef.current.config?.voice?.autoSend) {
          sendMessage(transcript.trim());
        }
      };
      recognitionRef.current = recognition;
      recognition.start();
      dispatch({ type: 'SET_VOICE', voice: { listening: true, transcript: '' } });
    } catch (err) {
      toast(err.message, 'error', 'Голосовой ввод');
    }
  }, [sendMessage, stopListening, toast]);

  const speak = useCallback((text) => {
    try {
      window.speechSynthesis?.cancel();
      const clean = String(text || '').replace(/```[\s\S]*?```/g, '').replace(/[*_#>`]/g, '');
      if (!clean.trim()) return;
      const utterance = new SpeechSynthesisUtterance(clean.slice(0, 1500));
      const voice = stateRef.current.config?.voice || {};
      utterance.lang = voice.sttLanguage || 'ru-RU';
      utterance.rate = voice.rate || 1;
      utterance.pitch = voice.pitch || 1;
      if (voice.ttsVoice) {
        const match = window.speechSynthesis?.getVoices()?.find((v) => v.name === voice.ttsVoice);
        if (match) utterance.voice = match;
      }
      window.speechSynthesis?.speak(utterance);
    } catch {}
  }, []);

  const stopSpeaking = useCallback(() => {
    try { window.speechSynthesis?.cancel(); } catch {}
  }, []);

  const value = useMemo(() => ({
    state,
    dispatch,
    toast,
    refreshConfig,
    refreshChats,
    refreshProviders,
    refreshSkills,
    refreshMemory,
    refreshMedia,
    refreshTasks,
    refreshAll,
    loadChat,
    createChat,
    deleteChat,
    renameChat,
    pinChat,
    openSettings,
    closeModal,
    setView,
    sendMessage,
    stopGeneration,
    regenerate,
    resolvePermission,
    resolveAsk,
    updateConfig,
    patchConfig,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    player,
    savePrompt,
    deletePrompt,
  }), [
    state, toast, refreshConfig, refreshChats, refreshProviders, refreshSkills, refreshMemory,
    refreshMedia, refreshTasks, refreshAll, loadChat, createChat, deleteChat, renameChat, pinChat,
    openSettings, closeModal, setView, sendMessage, stopGeneration, regenerate,
    resolvePermission, resolveAsk, updateConfig, patchConfig, startListening,
    stopListening, speak, stopSpeaking, savePrompt, deletePrompt,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
