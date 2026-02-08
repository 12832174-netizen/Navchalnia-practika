import React from 'react';
import { useTranslation } from 'react-i18next';

interface LanguageSwitcherProps {
  className?: string;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '' }) => {
  const { t, i18n } = useTranslation();

  const currentLanguage = i18n.resolvedLanguage?.startsWith('uk') ? 'uk' : 'en';

  const handleLanguageChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    await i18n.changeLanguage(event.target.value);
  };

  return (
    <div className={`flex items-center ${className}`.trim()}>
      <label htmlFor="language-switcher" className="sr-only">
        {t('language.label')}
      </label>
      <select
        id="language-switcher"
        value={currentLanguage}
        onChange={handleLanguageChange}
        aria-label={t('language.label')}
        className="app-select-sm"
      >
        <option value="uk">{t('language.ukrainian')}</option>
        <option value="en">{t('language.english')}</option>
      </select>
    </div>
  );
};

export default LanguageSwitcher;
