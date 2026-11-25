import { createMobileBridge } from './mobileBridge';

function resolveBridge() {
  if (typeof window === 'undefined') return null;
  if (window.psychic) return window.psychic;
  const mobile = createMobileBridge();
  window.psychic = mobile;
  return mobile;
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
  return b.invoke(channel, payload);
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
