import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Notification as DbNotification } from '../types/database.types';
import { formatDateTimeByPreferences } from '../utils/preferences';

const NotificationsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  const formatDateTime = (date: string) => formatDateTimeByPreferences(date, locale);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchNotifications();
  }, [fetchNotifications, user]);

  const markAsRead = async (notificationId: string) => {
    if (!user) return;

    setUpdatingId(notificationId);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId ? { ...notification, read: true } : notification,
        ),
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    } finally {
      setUpdatingId(null);
    }
  };

  const markAllAsRead = async () => {
    if (!user || unreadCount === 0) return;

    setMarkingAll(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    } finally {
      setMarkingAll(false);
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
    <div className="notifications-page app-card">
      <div className="notifications-header app-card-header flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{t('app.notifications')}</h2>
          <p className="app-pagination-info mt-1">
            {t('notifications.unreadCount', { count: unreadCount })}
          </p>
        </div>
        <button
          type="button"
          onClick={markAllAsRead}
          disabled={markingAll || unreadCount === 0}
          className="notifications-mark-all app-btn-primary inline-flex items-center gap-2 text-sm"
        >
          <CheckCheck className="h-4 w-4" />
          <span>{markingAll ? t('notifications.markingAll') : t('notifications.markAllAsRead')}</span>
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="app-empty-state">
          <Bell className="app-empty-icon" />
          <h3 className="app-empty-title">{t('app.noNewNotifications')}</h3>
        </div>
      ) : (
        <div className="app-list-divider">
          {notifications.map((notification) => (
            <div key={notification.id} className={`notifications-item p-6 ${notification.read ? '' : 'is-unread'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{notification.title}</h3>
                    {!notification.read && (
                      <span className="notifications-badge app-pill rounded-full bg-blue-100 text-blue-700">
                        {t('notifications.new')}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm">{notification.message}</p>
                  <p className="mt-2 text-xs app-pagination-info">{formatDateTime(notification.created_at)}</p>
                </div>
                {!notification.read && (
                  <button
                    type="button"
                    onClick={() => markAsRead(notification.id)}
                    disabled={updatingId === notification.id}
                    className="notifications-item-action app-link-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updatingId === notification.id
                      ? t('notifications.markingOne')
                      : t('notifications.markAsRead')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
