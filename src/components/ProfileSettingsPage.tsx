import React, { useEffect, useState } from 'react';
import { Award, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import LanguageSwitcher from './LanguageSwitcher';
import { AppTheme, getStoredTheme, setThemePreference } from '../utils/theme';
import {
  PAGE_SIZE_OPTIONS,
  TIMEZONE_OPTIONS,
  formatDateByPreferences,
  getStoredEmailNotifications,
  getStoredPageSize,
  getStoredTimeZone,
  setEmailNotificationsPreference,
  setPageSizePreference,
  setTimeZonePreference,
} from '../utils/preferences';

interface ParticipationConference {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
}

interface ParticipationArticleRow {
  id: string;
  title: string;
  status: 'accepted' | 'accepted_with_comments';
  conference_id: string;
  submitted_at: string;
  conferences?: ParticipationConference | ParticipationConference[];
}

interface AuthorParticipation {
  conference_id: string;
  conference_title: string;
  conference_start_date: string;
  conference_end_date: string;
  article_id: string;
  article_title: string;
  article_status: 'accepted' | 'accepted_with_comments';
}

interface AuthorCertificate {
  id: string;
  author_id: string;
  conference_id: string;
  article_id: string;
  certificate_number: string;
  snapshot_author_name: string;
  snapshot_institution?: string | null;
  snapshot_conference_title: string;
  snapshot_conference_start_date: string;
  snapshot_conference_end_date: string;
  snapshot_article_title: string;
  snapshot_article_status: 'accepted' | 'accepted_with_comments';
  issued_at: string;
  created_at: string;
  updated_at: string;
}

interface ParticipationCacheValue {
  participations: AuthorParticipation[];
  certificatesByConference: Record<string, AuthorCertificate>;
  fetchedAt: number;
}

const PARTICIPATION_CACHE_TTL_MS = 5 * 60 * 1000;
const participationCache = new Map<string, ParticipationCacheValue>();

const ProfileSettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [institution, setInstitution] = useState(profile?.institution || '');
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme());
  const [timeZone, setTimeZone] = useState(getStoredTimeZone());
  const [pageSize, setPageSize] = useState(getStoredPageSize());
  const [emailNotifications, setEmailNotifications] = useState(getStoredEmailNotifications());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [participationLoading, setParticipationLoading] = useState(false);
  const [participationError, setParticipationError] = useState('');
  const [participations, setParticipations] = useState<AuthorParticipation[]>([]);
  const [certificatesByConference, setCertificatesByConference] = useState<Record<string, AuthorCertificate>>({});
  const [certificateBusyConferenceId, setCertificateBusyConferenceId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name);
    setInstitution(profile.institution || '');
  }, [profile]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setEmailNotifications(getStoredEmailNotifications());
    setTimeZone(getStoredTimeZone());
    setPageSize(getStoredPageSize());
  }, []);

  useEffect(() => {
    const fetchAuthorParticipation = async () => {
      if (!profile || profile.role !== 'author') return;

      const cached = participationCache.get(profile.id);
      const now = Date.now();
      const hasFreshCache = Boolean(cached && now - cached.fetchedAt < PARTICIPATION_CACHE_TTL_MS);

      if (cached) {
        setParticipations(cached.participations);
        setCertificatesByConference(cached.certificatesByConference);
      }

      if (hasFreshCache) {
        setParticipationLoading(false);
        setParticipationError('');
        return;
      }

      try {
        if (!cached) {
          setParticipationLoading(true);
        }
        setParticipationError('');

        const { data: articleRows, error: articleError } = await supabase
          .from('articles')
          .select(`
            id,
            title,
            status,
            conference_id,
            submitted_at,
            conferences:conference_id(id, title, start_date, end_date)
          `)
          .eq('author_id', profile.id)
          .in('status', ['accepted', 'accepted_with_comments'])
          .not('conference_id', 'is', null)
          .order('submitted_at', { ascending: false });

        if (articleError) throw articleError;

        const rows = (articleRows as ParticipationArticleRow[]) || [];

        const grouped = new Map<string, AuthorParticipation>();
        rows.forEach((row) => {
          const conference = Array.isArray(row.conferences) ? row.conferences[0] : row.conferences;
          if (!conference) return;
          const conferenceEndAt = new Date(`${conference.end_date}T23:59:59`).getTime();
          if (Number.isNaN(conferenceEndAt) || conferenceEndAt > now) return;
          if (grouped.has(row.conference_id)) return;

          grouped.set(row.conference_id, {
            conference_id: row.conference_id,
            conference_title: conference.title,
            conference_start_date: conference.start_date,
            conference_end_date: conference.end_date,
            article_id: row.id,
            article_title: row.title,
            article_status: row.status,
          });
        });

        const participationList = Array.from(grouped.values());
        setParticipations(participationList);

        if (participationList.length === 0) {
          setCertificatesByConference({});
          participationCache.set(profile.id, {
            participations: [],
            certificatesByConference: {},
            fetchedAt: Date.now(),
          });
          return;
        }

        const { data: certRows, error: certError } = await supabase
          .from('author_conference_certificates')
          .select('*')
          .eq('author_id', profile.id);

        if (certError) {
          if (certError.code !== '42P01') throw certError;
          setCertificatesByConference({});
          participationCache.set(profile.id, {
            participations: participationList,
            certificatesByConference: {},
            fetchedAt: Date.now(),
          });
          return;
        }

        const certMap: Record<string, AuthorCertificate> = {};
        ((certRows as AuthorCertificate[]) || []).forEach((cert) => {
          certMap[cert.conference_id] = cert;
        });
        setCertificatesByConference(certMap);
        participationCache.set(profile.id, {
          participations: participationList,
          certificatesByConference: certMap,
          fetchedAt: Date.now(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (!cached) {
          setParticipationError(message);
        } else {
          console.error('Background refresh failed for participation/certificates:', message);
        }
      } finally {
        if (!cached) {
          setParticipationLoading(false);
        }
      }
    };

    fetchAuthorParticipation();
  }, [profile]);

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

  const handleTimeZoneChange = (nextTimeZone: string) => {
    setTimeZone(nextTimeZone);
    setTimeZonePreference(nextTimeZone);
  };

  const handlePageSizeChange = (nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPageSizePreference(nextPageSize);
  };

  const handleEmailNotificationsChange = (enabled: boolean) => {
    setEmailNotifications(enabled);
    setEmailNotificationsPreference(enabled);
  };

  const formatDate = (value: string) => formatDateByPreferences(value, locale);

  const sanitizeFilePart = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60);

  const downloadCertificatePdf = async (certificate: AuthorCertificate) => {
    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfFontsModule = await import('pdfmake/build/vfs_fonts');
    const pdfMake = (pdfMakeModule as unknown as { default?: { vfs?: Record<string, string>; createPdf: (doc: unknown) => { download: (filename: string) => void } } }).default
      || (pdfMakeModule as unknown as { vfs?: Record<string, string>; createPdf: (doc: unknown) => { download: (filename: string) => void } });
    const pdfFonts = (pdfFontsModule as unknown as { default?: { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> } }).default
      || (pdfFontsModule as unknown as { pdfMake?: { vfs?: Record<string, string> }; vfs?: Record<string, string> });

    const vfs = pdfFonts.pdfMake?.vfs || pdfFonts.vfs;
    if (vfs) {
      pdfMake.vfs = vfs;
    }

    const issueDate = formatDate(certificate.issued_at);
    const conferencePeriod = `${formatDate(certificate.snapshot_conference_start_date)} - ${formatDate(
      certificate.snapshot_conference_end_date,
    )}`;
    const filename = `certificate_${sanitizeFilePart(certificate.snapshot_conference_title)}_${certificate.certificate_number}.pdf`;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [48, 60, 48, 60],
      content: [
        { text: t('profileSettings.certificates.documentTitle'), style: 'header', alignment: 'center' },
        { text: t('profileSettings.certificates.documentSubtitle'), style: 'subheader', alignment: 'center' },
        { text: certificate.snapshot_author_name, style: 'recipient', alignment: 'center' },
        {
          text: t('profileSettings.certificates.documentBody', {
            conference: certificate.snapshot_conference_title,
          }),
          alignment: 'center',
          margin: [0, 12, 0, 0],
        },
        {
          text: t('profileSettings.certificates.documentArticle', {
            title: certificate.snapshot_article_title,
          }),
          alignment: 'center',
          margin: [0, 8, 0, 0],
        },
        {
          text: t('profileSettings.certificates.documentStatus', {
            status: t(`articleStatus.${certificate.snapshot_article_status}`),
          }),
          alignment: 'center',
          margin: [0, 8, 0, 0],
        },
        {
          text: t('profileSettings.certificates.documentPeriod', {
            period: conferencePeriod,
          }),
          alignment: 'center',
          margin: [0, 8, 0, 0],
        },
        {
          text: t('profileSettings.certificates.documentNumber', {
            number: certificate.certificate_number,
          }),
          alignment: 'center',
          margin: [0, 30, 0, 0],
        },
        {
          text: t('profileSettings.certificates.documentIssuedAt', {
            date: issueDate,
          }),
          alignment: 'center',
          margin: [0, 8, 0, 0],
        },
      ],
      styles: {
        header: { fontSize: 24, bold: true, margin: [0, 0, 0, 10] },
        subheader: { fontSize: 14, margin: [0, 0, 0, 26], color: '#334155' },
        recipient: { fontSize: 20, bold: true, margin: [0, 10, 0, 10], color: '#0f172a' },
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 12,
        color: '#0f172a',
      },
    };

    pdfMake.createPdf(docDefinition).download(filename);
  };

  const handleDownloadCertificate = async (participation: AuthorParticipation) => {
    if (!profile) return;

    try {
      setParticipationError('');
      setCertificateBusyConferenceId(participation.conference_id);

      let certificate = certificatesByConference[participation.conference_id];

      if (!certificate) {
        const { data, error } = await supabase.rpc('issue_own_conference_certificate', {
          p_conference_id: participation.conference_id,
        });
        if (error) throw error;
        certificate = data as AuthorCertificate;
        setCertificatesByConference((prev) => {
          const next = {
            ...prev,
            [participation.conference_id]: certificate,
          };
          participationCache.set(profile.id, {
            participations,
            certificatesByConference: next,
            fetchedAt: Date.now(),
          });
          return next;
        });
      }

      await downloadCertificatePdf(certificate);
    } catch (error: unknown) {
      setParticipationError(error instanceof Error ? error.message : String(error));
    } finally {
      setCertificateBusyConferenceId(null);
    }
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

      {profile?.role === 'author' && (
        <div className="profile-settings-card rounded-lg shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold">{t('profileSettings.certificates.title')}</h2>
          <p className="text-sm app-pagination-info">{t('profileSettings.certificates.description')}</p>

          {participationLoading && (
            <div className="app-loading">
              <div className="app-spinner"></div>
            </div>
          )}

          {!participationLoading && participationError && (
            <p className="text-sm text-red-600">{participationError}</p>
          )}

          {!participationLoading && !participationError && participations.length === 0 && (
            <p className="text-sm text-gray-500">{t('profileSettings.certificates.empty')}</p>
          )}

          {!participationLoading && !participationError && participations.length > 0 && (
            <div className="app-list-divider">
              {participations.map((participation) => {
                const certificate = certificatesByConference[participation.conference_id];
                return (
                  <div key={participation.conference_id} className="app-list-item">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-amber-600" />
                          <p className="text-sm font-medium text-gray-900">{participation.conference_title}</p>
                        </div>
                        <p className="mt-1 text-xs text-gray-600">
                          {t('profileSettings.certificates.articleTitle', { title: participation.article_title })}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                          {t('profileSettings.certificates.conferencePeriod', {
                            start: formatDate(participation.conference_start_date),
                            end: formatDate(participation.conference_end_date),
                          })}
                        </p>
                        <p className="mt-1 text-xs text-gray-600">
                          {t('profileSettings.certificates.status', {
                            status: t(`articleStatus.${participation.article_status}`),
                          })}
                        </p>
                        {certificate && (
                          <p className="mt-1 text-xs text-gray-500">
                            {t('profileSettings.certificates.issued', {
                              number: certificate.certificate_number,
                              date: formatDate(certificate.issued_at),
                            })}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDownloadCertificate(participation)}
                        disabled={certificateBusyConferenceId === participation.conference_id}
                        className="app-btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Download className="h-4 w-4" />
                        <span>
                          {certificateBusyConferenceId === participation.conference_id
                            ? t('auth.submitLoading')
                            : t('profileSettings.certificates.download')}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
          <label className="app-label">{t('profileSettings.timeZone')}</label>
          <div className="w-full md:w-72">
            <select
              value={timeZone}
              onChange={(event) => handleTimeZoneChange(event.target.value)}
              className="app-select"
            >
              {TIMEZONE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value === 'system'
                    ? t('profileSettings.timeZoneSystem')
                    : option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="app-label">{t('profileSettings.pageSize')}</label>
          <div className="w-full md:w-72">
            <select
              value={String(pageSize)}
              onChange={(event) => handlePageSizeChange(Number(event.target.value))}
              className="app-select"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={String(option)}>
                  {t('profileSettings.pageSizeOption', { count: option })}
                </option>
              ))}
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
            onChange={(event) => handleEmailNotificationsChange(event.target.checked)}
            className="profile-settings-toggle h-4 w-4"
          />
        </label>
        <p className="text-xs app-pagination-info">{t('profileSettings.emailNotificationsHint')}</p>
      </div>
    </div>
  );
};

export default ProfileSettingsPage;
