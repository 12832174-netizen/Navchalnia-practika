import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import { AppTheme, getStoredTheme, setThemePreference } from '../utils/theme';

const EMAIL_NOTIFICATIONS_KEY = 'app.settings.email_notifications';
const COMPACT_MODE_KEY = 'app.settings.compact_mode';

const ProfileSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [institution, setInstitution] = useState(profile?.institution || '');
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme());
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setInstitution(profile.institution || '');
  }, [profile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEmailNotifications(window.localStorage.getItem(EMAIL_NOTIFICATIONS_KEY) !== 'false');
    setCompactMode(window.localStorage.getItem(COMPACT_MODE_KEY) === 'true');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(EMAIL_NOTIFICATIONS_KEY, String(emailNotifications));
  }, [emailNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COMPACT_MODE_KEY, String(compactMode));
    document.documentElement.dataset.density = compactMode ? 'compact' : 'default';
  }, [compactMode]);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        institution: institution.trim() || undefined,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      console.error('Error saving profile settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    setThemePreference(nextTheme);
  };

  return (
    <div className="profile-settings-page">
      <div className="profile-settings-card rounded-lg shadow-sm p-6">
        <h1 className="app-page-title">{t('profileSettings.pageTitle')}</h1>
        <p className="mt-2 app-pagination-info">{t('profileSettings.pageDescription')}</p>
      </div>

      <form
        onSubmit={handleSaveProfile}
        className="profile-settings-card rounded-lg shadow-sm p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold">{t('profileSettings.accountSection')}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="app-label">{t('app.fullName')}</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="app-input"
              required
            />
          </div>
          <div>
            <label className="app-label">{t('app.institution')}</label>
            <input
              value={institution}
              onChange={(event) => setInstitution(event.target.value)}
              className="app-input"
            />
          </div>
          <div>
            <label className="app-label">{t('app.email')}</label>
            <input
              value={profile?.email || ''}
              disabled
              className="app-input-readonly"
            />
          </div>
          <div>
            <label className="app-label">{t('app.role')}</label>
            <input
              value={profile ? t(`role.${profile.role}`) : ''}
              disabled
              className="app-input-readonly"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="app-btn-primary"
        >
          {saving ? t('profileSettings.saving') : t('profileSettings.saveProfile')}
        </button>
        {saved && <p className="profile-settings-saved text-sm">{t('profileSettings.saved')}</p>}
      </form>

      <div className="profile-settings-card rounded-lg shadow-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t('profileSettings.preferencesSection')}</h2>

        <div>
          <label className="app-label">{t('profileSettings.theme')}</label>
          <div className="w-full md:w-72">
            <select
              value={theme}
              onChange={(event) => handleThemeChange(event.target.value as AppTheme)}
              className="app-select"
            >
              <option value="system">{t('profileSettings.themeSystem')}</option>
              <option value="light">{t('profileSettings.themeLight')}</option>
              <option value="dark">{t('profileSettings.themeDark')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="app-label">{t('language.label')}</label>
          <LanguageSwitcher />
        </div>

        <label className="flex items-center justify-between py-2">
          <span className="text-sm">{t('profileSettings.emailNotifications')}</span>
          <input
            type="checkbox"
            checked={emailNotifications}
            onChange={(event) => setEmailNotifications(event.target.checked)}
            className="profile-settings-toggle h-4 w-4"
          />
        </label>

        <label className="flex items-center justify-between py-2">
          <span className="text-sm">{t('profileSettings.compactMode')}</span>
          <input
            type="checkbox"
            checked={compactMode}
            onChange={(event) => setCompactMode(event.target.checked)}
            className="profile-settings-toggle h-4 w-4"
          />
        </label>
      </div>
    </div>
  );
};

export default ProfileSettingsPage;
