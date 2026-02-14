import React from 'react';
import { User, FileText, Users, Bell, LogOut, Settings, CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';

interface LayoutProps {
  children: React.ReactNode;
  currentPage: string;
  onPageChange: (page: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentPage, onPageChange }) => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();

  type NavItem = { id: string; icon: React.ComponentType<{ className?: string }>; labelKey: string };

  const getNavItems = () => {
    if (!profile) return [] as NavItem[];

    const commonItems: NavItem[] = [
      { id: 'profile', labelKey: 'layout.nav.profile', icon: User },
      { id: 'notifications', labelKey: 'layout.nav.notifications', icon: Bell },
    ];

    switch (profile.role) {
      case 'author':
        return [
          { id: 'dashboard', labelKey: 'layout.nav.myArticles', icon: FileText },
          { id: 'submit', labelKey: 'layout.nav.submitArticle', icon: FileText },
          ...commonItems,
        ];
      case 'reviewer':
        return [
          { id: 'reviews', labelKey: 'layout.nav.reviews', icon: FileText },
          { id: 'articles', labelKey: 'layout.nav.articlesToReview', icon: FileText },
          ...commonItems,
        ];
      case 'organizer':
        return [
          { id: 'dashboard', labelKey: 'layout.nav.allArticles', icon: FileText },
          { id: 'conferences', labelKey: 'layout.nav.conferences', icon: CalendarDays },
          { id: 'reviews', labelKey: 'layout.nav.allReviews', icon: Users },
          { id: 'manage', labelKey: 'layout.nav.manageStatus', icon: Settings },
          { id: 'roles', labelKey: 'layout.nav.roles', icon: User },
          ...commonItems,
        ];
      default:
        return commonItems;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const navItems = getNavItems();

  return (
    <div className="app-shell min-h-screen">
      {/* Header */}
      <header className="app-header shadow-sm border-b border-gray-200">
        <div className="app-container">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-bold">{t('layout.appName')}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="app-pagination-info">
                {profile?.full_name} ({profile ? t(`role.${profile.role}`) : ''})
              </span>
              <button
                onClick={handleSignOut}
                className="app-btn-ghost flex items-center space-x-1"
              >
                <LogOut className="h-4 w-4" />
                <span>{t('layout.signOut')}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="app-container py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          <div className="w-64 flex-shrink-0">
            <nav className="app-sidebar-nav rounded-lg shadow-sm p-4">
              <ul className="space-y-2">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onPageChange(item.id)}
                        className={`app-nav-item w-full flex items-center space-x-3 px-3 py-2 rounded-md text-left transition-colors ${
                          currentPage === item.id
                            ? 'is-active bg-blue-100 text-blue-700 border-blue-200'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{t(item.labelKey)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>

          {/* Main Content */}
          <div className="app-main-content flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Layout;
