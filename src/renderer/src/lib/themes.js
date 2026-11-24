import THEMES_JSON from '@shared/themes.json';

export const THEMES = THEMES_JSON.themes;

export function getTheme(config) {
  const appearance = config?.appearance || {};
  if (appearance.customTheme?.colors) return appearance.customTheme;
  const theme = THEMES.find((t) => t.id === appearance.theme) || THEMES[0];
  return theme;
}

export function wallpaperUrl(config, theme) {
  const appearance = config?.appearance || {};
  if (appearance.wallpaper === 'none') return null;
  let name = appearance.wallpaper;
  if (!name || name === 'auto' || name === 'theme') {
    name = `${theme.id}.jpg`;
  }
  if (!/\.[a-z0-9]+$/i.test(name)) name += '.jpg';
  return `psychic://wallpaper/${encodeURIComponent(name)}`;
}

export function applyTheme(config) {
  const theme = getTheme(config);
  const colors = theme.colors || {};
  const appearance = config?.appearance || {};
  const root = document.documentElement;
  const set = (k, v) => {
    if (v === undefined || v === null) return;
    root.style.setProperty(k, String(v));
  };

  const map = {
    '--bg0': colors.bg0,
    '--bg1': colors.bg1,
    '--bg2': colors.bg2,
    '--surface': colors.surface,
    '--surface-2': colors.surface2,
    '--surface-3': colors.surface3,
    '--border': colors.border,
    '--border-strong': colors.borderStrong,
    '--text': colors.text,
    '--text-dim': colors.dim,
    '--text-faint': colors.faint,
    '--accent': colors.accent,
    '--accent-2': colors.accent2,
    '--accent-3': colors.accent3,
    '--success': colors.success,
    '--warning': colors.warning,
    '--danger': colors.danger,
    '--info': colors.info,
    '--glow': colors.glow,
    '--glow-2': colors.glow2,
    '--grid': colors.grid,
    '--font-scale': appearance.fontScale || 1,
    '--radius': `${appearance.radius ?? 14}px`,
    '--fx-on': appearance.fx ? 1 : 0,
    '--particles-on': appearance.fx && appearance.particles ? 1 : 0,
    '--grid-on': appearance.fx && appearance.grid ? 1 : 0,
    '--scan-on': appearance.fx && appearance.scanlines ? 0.055 : 0,
    '--glow-on': appearance.glow ? 1 : 0.35,
    '--wallpaper-opacity': appearance.wallpaperOpacity ?? 0.35,
  };
  for (const [k, v] of Object.entries(map)) set(k, v);

  const wp = wallpaperUrl(config, theme);
  root.style.setProperty('--wallpaper', wp ? `url("${wp}")` : 'none');
  root.dataset.theme = theme.id || 'custom';
  root.dataset.density = appearance.density || 'comfortable';
  root.dataset.animations = appearance.animations === false ? 'off' : 'on';
  document.title = 'PSYCHIC // Neural Interface';
  return theme;
}

export function themeVariables(theme) {
  return theme?.colors || {};
}

export function hexToRgba(hex, alpha = 1) {
  const m = String(hex || '').replace('#', '');
  if (m.length !== 6) return `rgba(0,240,255,${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeCustomTheme(baseId, overrides) {
  const base = THEMES.find((t) => t.id === baseId) || THEMES[0];
  return {
    id: 'custom',
    name: overrides.name || 'Свой стиль',
    tagline: 'Твоя собственная палитра',
    colors: { ...base.colors, ...(overrides.colors || {}) },
    wallpaper: base.wallpaper,
  };
}
