export type AppTheme = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'app.theme';

const getSystemTheme = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export const getStoredTheme = (): AppTheme => {
  if (typeof window === 'undefined') return 'system';
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
};

export const resolveTheme = (theme: AppTheme): 'light' | 'dark' =>
  theme === 'system' ? getSystemTheme() : theme;

export const applyTheme = (theme: AppTheme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = resolveTheme(theme);
};

export const setThemePreference = (theme: AppTheme) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
  applyTheme(theme);
};

export const initializeTheme = () => {
  if (typeof window === 'undefined') return;
  const initialTheme = getStoredTheme();
  applyTheme(initialTheme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') {
      applyTheme('system');
    }
  });
};
