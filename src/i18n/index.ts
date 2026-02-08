import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './translations/en';
import uk from './translations/uk';

const SUPPORTED_LANGUAGES = ['en', 'uk'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'app.language';

const isSupportedLanguage = (value: string): value is SupportedLanguage =>
  SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);

const getSavedLanguage = (): SupportedLanguage | null => {
  if (typeof window === 'undefined') return null;

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (!stored || !isSupportedLanguage(stored)) return null;

  return stored;
};

const getBrowserLanguage = (): SupportedLanguage => {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language.toLowerCase().startsWith('uk') ? 'uk' : 'en';
};

const initialLanguage = getSavedLanguage() ?? getBrowserLanguage();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    uk: { translation: uk },
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: {
    escapeValue: false,
  },
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLanguage;
}

i18n.on('languageChanged', (language) => {
  if (typeof window !== 'undefined' && isSupportedLanguage(language)) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }

  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
});

export default i18n;
