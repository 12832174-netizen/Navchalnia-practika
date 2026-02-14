import { DEFAULT_PAGE_SIZE } from './pagination';

export const EMAIL_NOTIFICATIONS_KEY = 'app.settings.email_notifications';
export const TIMEZONE_KEY = 'app.settings.timezone';
export const PAGE_SIZE_KEY = 'app.settings.page_size';
export const LIST_SORT_KEY_PREFIX = 'app.settings.list_sort.';
export const PREFERENCES_CHANGED_EVENT = 'app.preferences.changed';

export const PAGE_SIZE_OPTIONS = [8, 12, 20, 50] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export const TIMEZONE_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'Europe/Kyiv', label: 'Europe/Kyiv' },
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Warsaw', label: 'Europe/Warsaw' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
] as const;

const isValidIanaTimeZone = (value: string) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

const emitPreferencesChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PREFERENCES_CHANGED_EVENT));
};

export const getStoredEmailNotifications = () => {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(EMAIL_NOTIFICATIONS_KEY) !== 'false';
};

export const setEmailNotificationsPreference = (enabled: boolean) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(EMAIL_NOTIFICATIONS_KEY, String(enabled));
  emitPreferencesChanged();
};

export const getStoredTimeZone = () => {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(TIMEZONE_KEY) || 'system';
  if (raw === 'system') return raw;
  return isValidIanaTimeZone(raw) ? raw : 'system';
};

export const setTimeZonePreference = (timeZone: string) => {
  if (typeof window === 'undefined') return;
  const value =
    timeZone === 'system' || isValidIanaTimeZone(timeZone) ? timeZone : 'system';
  window.localStorage.setItem(TIMEZONE_KEY, value);
  emitPreferencesChanged();
};

export const getStoredPageSize = () => {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
  const raw = Number(window.localStorage.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZE_OPTIONS.includes(raw as PageSizeOption) ? raw : DEFAULT_PAGE_SIZE;
};

export const setPageSizePreference = (pageSize: number) => {
  if (typeof window === 'undefined') return;
  const value = PAGE_SIZE_OPTIONS.includes(pageSize as PageSizeOption)
    ? pageSize
    : DEFAULT_PAGE_SIZE;
  window.localStorage.setItem(PAGE_SIZE_KEY, String(value));
  emitPreferencesChanged();
};

export const getStoredListSortOption = <T extends string>(
  listKey: string,
  allowedValues: readonly T[],
  fallback: T,
) => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(`${LIST_SORT_KEY_PREFIX}${listKey}`);
  if (!raw) return fallback;
  return allowedValues.includes(raw as T) ? (raw as T) : fallback;
};

export const setListSortPreference = (listKey: string, value: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(`${LIST_SORT_KEY_PREFIX}${listKey}`, value);
};

const getTimeZoneForFormatter = () => {
  const stored = getStoredTimeZone();
  return stored === 'system' ? undefined : stored;
};

export const formatDateByPreferences = (value: string, locale: string) => {
  const date = new Date(value);
  const timeZone = getTimeZoneForFormatter();
  return date.toLocaleDateString(locale, timeZone ? { timeZone } : undefined);
};

export const formatDateTimeByPreferences = (value: string, locale: string) => {
  const date = new Date(value);
  const timeZone = getTimeZoneForFormatter();
  return date.toLocaleString(locale, timeZone ? { timeZone } : undefined);
};
