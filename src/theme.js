export const THEME_STORAGE_KEY = 'plotterfun-theme';

const isThemeValue = (value) => value === 'light' || value === 'dark' || value === 'system';

export const getStoredTheme = () => {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeValue(stored)) return stored;
  } catch (err) {
    return 'system';
  }
  return 'system';
};

export const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const resolveTheme = (mode) => (mode === 'system' ? getSystemTheme() : mode);

export const applyTheme = (mode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(mode);
};

export const watchSystemTheme = (onChange) => {
  if (typeof window === 'undefined') return () => {};
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => onChange(media.matches ? 'dark' : 'light');

  if (media.addEventListener) {
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }
  media.addListener(handler);
  return () => media.removeListener(handler);
};
