import { createMobileBridge } from './mobileBridge';

function resolveBridge() {
  if (typeof window === 'undefined') return null;
  if (window.psychic) return window.psychic;
  const mobile = createMobileBridge();
  window.psychic = mobile;
  return mobile;
}

export function cleanIpcErrorMessage(raw) {
  let msg = String(raw ?? '').trim();
  // Убираем префикс Electron ipcRenderer.invoke: "Error invoking remote method 'channel': Error: ..."
  while (/^Error invoking remote method '[^']+':\s*/i.test(msg)) {
    msg = msg.replace(/^Error invoking remote method '[^']+':\s*/i, '');
  }
  while (/^(?:Error|TypeError|RangeError):\s*/i.test(msg)) {
    msg = msg.replace(/^(?:Error|TypeError|RangeError):\s*/i, '');
  }
  return msg.trim() || 'Неизвестная ошибка';
}

export const bridge = resolveBridge();

export const hasBridge = !!bridge;
export const platform = bridge?.platform || 'android';
export const isAndroid = platform === 'android' || Boolean(bridge?.isAndroid);
export const versions = bridge?.versions || {};

export async function invoke(channel, payload) {
  const b = typeof window !== 'undefined' && window.psychic ? window.psychic : bridge;
  if (!b) {
    throw new Error('PSYCHIC API недоступен');
  }
  try {
    return await b.invoke(channel, payload);
  } catch (err) {
    const cleaned = new Error(cleanIpcErrorMessage(err?.message || err));
    if (err?.code) cleaned.code = err.code;
    if (err?.status) cleaned.status = err.status;
    throw cleaned;
  }
}

export function on(channel, callback) {
  const b = typeof window !== 'undefined' && window.psychic ? window.psychic : bridge;
  if (!b) return () => {};
  return b.on(channel, callback);
}

export function isElectron() {
  const b = typeof window !== 'undefined' && window.psychic ? window.psychic : bridge;
  return Boolean(b?.isElectron);
}
