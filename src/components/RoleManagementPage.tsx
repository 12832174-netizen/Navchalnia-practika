import React, { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/database.types';
import { useAuth } from '../contexts/AuthContext';
import { getStoredListSortOption, setListSortPreference } from '../utils/preferences';

type ManageableRole = 'author' | 'reviewer';
type ProfileForRoles = Pick<Profile, 'id' | 'full_name' | 'email' | 'institution' | 'role' | 'created_at'>;
const ROLE_LIST_SORT_OPTIONS = ['date_desc', 'date_asc', 'name_asc', 'name_desc'] as const;
type RoleListSortOption = (typeof ROLE_LIST_SORT_OPTIONS)[number];

const RoleManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<ProfileForRoles[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, ManageableRole>>({});
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RoleListSortOption>(() =>
    getStoredListSortOption('role_management.users', ROLE_LIST_SORT_OPTIONS, 'date_desc'),
  );
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        setLoading(true);
        setError('');
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('id, full_name, email, institution, role, created_at')
          .order('created_at', { ascending: false });

        if (fetchError) throw fetchError;
        const rows = (data as ProfileForRoles[]) || [];
        setProfiles(rows);

        const initialDrafts = rows.reduce<Record<string, ManageableRole>>((acc, profile) => {
          acc[profile.id] = profile.role === 'reviewer' ? 'reviewer' : 'author';
          return acc;
        }, {});
        setDraftRoles(initialDrafts);
      } catch (fetchErr: unknown) {
        setError(fetchErr instanceof Error ? fetchErr.message : String(fetchErr));
      } finally {
        setLoading(false);
      }
    };

    fetchProfiles();
  }, []);

  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return profiles;

    return profiles.filter((profile) => {
      return (
        profile.full_name.toLowerCase().includes(query) ||
        profile.email.toLowerCase().includes(query) ||
        (profile.institution || '').toLowerCase().includes(query)
      );
    });
  }, [profiles, search]);

  const sortedProfiles = useMemo(() => {
    const items = [...filteredProfiles];
    switch (sort) {
      case 'date_asc':
        return items.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      case 'name_asc':
        return items.sort((a, b) => a.full_name.localeCompare(b.full_name, undefined, { sensitivity: 'base' }));
      case 'name_desc':
        return items.sort((a, b) => b.full_name.localeCompare(a.full_name, undefined, { sensitivity: 'base' }));
      case 'date_desc':
      default:
        return items.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    }
  }, [filteredProfiles, sort]);

  useEffect(() => {
    setListSortPreference('role_management.users', sort);
  }, [sort]);

  const handleSaveRole = async (profile: ProfileForRoles) => {
    if (!user) return;
    if (profile.role === 'organizer' || profile.id === user.id) return;

    const nextRole = draftRoles[profile.id];
    if (!nextRole || nextRole === profile.role) return;

    try {
      setSavingUserId(profile.id);
      setError('');

      const { error: rpcError } = await supabase.rpc('organizer_set_user_role', {
        p_user_id: profile.id,
        p_role: nextRole,
      });
      if (rpcError) throw rpcError;

      setProfiles((prev) =>
        prev.map((item) => (item.id === profile.id ? { ...item, role: nextRole } : item)),
      );
    } catch (saveErr: unknown) {
      setError(saveErr instanceof Error ? saveErr.message : String(saveErr));
    } finally {
      setSavingUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-spinner"></div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <h1 className="app-page-title">{t('roleManagement.title')}</h1>

      <div className="app-card p-4">
        <div className="dashboard-search-grid dashboard-search-grid-2">
          <div className="dashboard-search-field">
            <Search className="dashboard-search-icon" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('roleManagement.searchPlaceholder')}
              className="dashboard-search-input"
            />
          </div>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as RoleListSortOption)}
            className="app-input"
          >
            <option value="date_desc">{t('common.newestFirst')}</option>
            <option value="date_asc">{t('common.oldestFirst')}</option>
            <option value="name_asc">{t('common.nameAZ')}</option>
            <option value="name_desc">{t('common.nameZA')}</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="app-card p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="app-card">
        <div className="app-card-header">
          <h2 className="text-lg font-medium text-gray-900">{t('roleManagement.usersTitle')}</h2>
        </div>
        {sortedProfiles.length === 0 ? (
          <p className="app-list-item text-sm text-gray-500">{t('roleManagement.empty')}</p>
        ) : (
          <div className="app-list-divider">
            {sortedProfiles.map((profile) => {
              const isSelf = profile.id === user?.id;
              const isOrganizer = profile.role === 'organizer';
              const isLocked = isSelf || isOrganizer;
              const draftRole = draftRoles[profile.id] || (profile.role === 'reviewer' ? 'reviewer' : 'author');
              const roleChanged = draftRole !== profile.role;

              return (
                <div key={profile.id} className="app-list-item">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{profile.full_name}</p>
                      <p className="text-xs text-gray-600">{profile.email}</p>
                      {profile.institution && <p className="text-xs text-gray-500">{profile.institution}</p>}
                      <p className="text-xs text-gray-500">
                        {t('roleManagement.currentRole')}: {t(`role.${profile.role}`)}
                      </p>
                    </div>

                    {isLocked ? (
                      <div className="inline-flex items-center gap-2 text-xs text-gray-600">
                        <ShieldCheck className="h-4 w-4" />
                        <span>{isOrganizer ? t('roleManagement.organizerLocked') : t('roleManagement.selfLocked')}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={draftRole}
                          onChange={(event) =>
                            setDraftRoles((prev) => ({
                              ...prev,
                              [profile.id]: event.target.value as ManageableRole,
                            }))
                          }
                          className="app-input min-w-[160px]"
                        >
                          <option value="author">{t('role.author')}</option>
                          <option value="reviewer">{t('role.reviewer')}</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleSaveRole(profile)}
                          disabled={!roleChanged || savingUserId === profile.id}
                          className="app-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingUserId === profile.id ? t('auth.submitLoading') : t('roleManagement.save')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleManagementPage;
