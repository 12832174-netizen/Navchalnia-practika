const COMPACT_MODE_KEY = 'app.settings.compact_mode';

export const initializeDensity = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const compactMode = window.localStorage.getItem(COMPACT_MODE_KEY) === 'true';
  document.documentElement.dataset.density = compactMode ? 'compact' : 'default';
};
