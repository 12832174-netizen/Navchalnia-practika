import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth, AuthProvider } from './contexts/AuthContext';
import AuthForm from './components/auth/AuthForm';
import Layout from './components/Layout';
import AuthorDashboard from './components/dashboard/AuthorDashboard';
import SubmitArticle from './components/dashboard/SubmitArticle';
import ReviewerDashboard from './components/dashboard/ReviewerDashboard';
import OrganizerDashboard from './components/dashboard/OrganizerDashboard';
import NotificationsPage from './components/NotificationsPage';
import ProfileSettingsPage from './components/ProfileSettingsPage';
import { UserRole } from './types/database.types';

const allowedPagesByRole: Record<UserRole, string[]> = {
  author: ['dashboard', 'submit', 'profile', 'notifications'],
  reviewer: ['reviews', 'articles', 'profile', 'notifications'],
  organizer: ['dashboard', 'reviews', 'manage', 'profile', 'notifications'],
};

const getDefaultPageForRole = (role: UserRole) => (role === 'reviewer' ? 'reviews' : 'dashboard');

const AppContent: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { user, profile, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  const normalizedCurrentPage =
    profile && !allowedPagesByRole[profile.role].includes(currentPage)
      ? getDefaultPageForRole(profile.role)
      : currentPage;

  useEffect(() => {
    document.title = t('meta.title');
  }, [i18n.resolvedLanguage, t]);

  useEffect(() => {
    if (!profile) return;
    if (currentPage !== normalizedCurrentPage) {
      setCurrentPage(normalizedCurrentPage);
    }
  }, [profile, currentPage, normalizedCurrentPage]);

  if (loading) {
    return (
      <div className="app-shell min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="app-spinner"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return <AuthForm />;
  }

  const renderContent = () => {
    switch (normalizedCurrentPage) {
      case 'dashboard':
        if (profile.role === 'author') return <AuthorDashboard />;
        if (profile.role === 'reviewer') return <ReviewerDashboard currentPage="reviews" />;
        if (profile.role === 'organizer') return <OrganizerDashboard currentPage="dashboard" />;
        break;
      case 'submit':
        if (profile.role === 'author') return <SubmitArticle />;
        break;
      case 'articles':
        if (profile.role === 'reviewer') return <ReviewerDashboard currentPage="articles" />;
        break;
      case 'reviews':
        if (profile.role === 'reviewer') return <ReviewerDashboard currentPage="reviews" />;
        if (profile.role === 'organizer') return <OrganizerDashboard currentPage="reviews" />;
        break;
      case 'manage':
        if (profile.role === 'organizer') return <OrganizerDashboard currentPage="manage" />;
        break;
      case 'profile':
        return <ProfileSettingsPage />;
      case 'notifications':
        return <NotificationsPage />;
      default:
        break;
    }

    if (profile.role === 'reviewer') return <ReviewerDashboard currentPage="reviews" />;
    if (profile.role === 'organizer') return <OrganizerDashboard currentPage="dashboard" />;
    return <AuthorDashboard />;
  };

  return <Layout currentPage={normalizedCurrentPage} onPageChange={setCurrentPage}>{renderContent()}</Layout>;
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
