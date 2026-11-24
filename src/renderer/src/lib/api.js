export const bridge = typeof window !== 'undefined' ? window.psychic : null;

export const hasBridge = !!bridge;
export const platform = bridge?.platform || 'web';
export const versions = bridge?.versions || {};

export async function invoke(channel, payload) {
  if (!bridge) {
    throw new Error('PSYCHIC API недоступен: приложение запущено вне Electron');
  }
  return bridge.invoke(channel, payload);
}

export function on(channel, callback) {
  if (!bridge) return () => {};
  return bridge.on(channel, callback);
}

export function isElectron() {
  return !!bridge;
}
