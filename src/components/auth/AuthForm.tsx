import React, { useState } from 'react';
import { FileText, Mail, Lock, User, Building } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types/database.types';
import LanguageSwitcher from '../LanguageSwitcher';

const AuthForm: React.FC = () => {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'author' as UserRole,
    institution: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        await signIn(formData.email, formData.password);
      } else {
        await signUp(
          formData.email,
          formData.password,
          formData.fullName,
          formData.role,
          formData.institution
        );
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'role') {
      setFormData((prev) => ({
        ...prev,
        role: value as UserRole,
      }));
      return;
    }

    const field = name as 'email' | 'password' | 'fullName' | 'institution';
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="text-center">
          <FileText className="mx-auto h-12 w-12 text-blue-600" />
          <h2 className="mt-6 text-3xl font-bold">
            {t('auth.title')}
          </h2>
          <p className="mt-2 app-pagination-info">
            {isLogin ? t('auth.signInSubtitle') : t('auth.signUpSubtitle')}
          </p>
        </div>

        <form className="auth-card" onSubmit={handleSubmit}>
          {error && (
            <div className="app-alert-error">
              <p className="app-alert-error-text">{error}</p>
            </div>
          )}

          <div className="auth-field-group">
            <div>
              <label htmlFor="email" className="auth-label">
                {t('auth.emailLabel')}
              </label>
              <div className="auth-field-wrap">
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className="auth-input"
                  placeholder={t('auth.emailPlaceholder')}
                />
                <Mail className="auth-icon" />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="auth-label">
                {t('auth.passwordLabel')}
              </label>
              <div className="auth-field-wrap">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className="auth-input"
                  placeholder={t('auth.passwordPlaceholder')}
                />
                <Lock className="auth-icon" />
              </div>
            </div>

            {!isLogin && (
              <>
                <div>
                  <label htmlFor="fullName" className="auth-label">
                    {t('auth.fullNameLabel')}
                  </label>
                  <div className="auth-field-wrap">
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      required
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="auth-input"
                      placeholder={t('auth.fullNamePlaceholder')}
                    />
                    <User className="auth-icon" />
                  </div>
                </div>

                <div>
                  <label htmlFor="role" className="auth-label">
                    {t('auth.roleLabel')}
                  </label>
                  <select
                    id="role"
                    name="role"
                    value={formData.role}
                    onChange={handleInputChange}
                    className="auth-select"
                  >
                    <option value="author">{t('role.author')}</option>
                    <option value="reviewer">{t('role.reviewer')}</option>
                    <option value="organizer">{t('role.organizer')}</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="institution" className="auth-label">
                    {t('auth.institutionLabel')}
                  </label>
                  <div className="auth-field-wrap">
                    <input
                      id="institution"
                      name="institution"
                      type="text"
                      value={formData.institution}
                      onChange={handleInputChange}
                      className="auth-input"
                      placeholder={t('auth.institutionPlaceholder')}
                    />
                    <Building className="auth-icon" />
                  </div>
                </div>
              </>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="auth-submit"
            >
              {loading ? t('auth.submitLoading') : isLogin ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="auth-switch"
            >
              {isLogin ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthForm;

