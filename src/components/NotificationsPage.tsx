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

  const localizeNotification = (notification: DbNotification) => {
    const statusUpdatedPattern = /^Your article "(.+)" status has been changed to: ([a-z_]+)$/i;
    const submittedPattern = /^Your article "(.+)" has been successfully submitted\.$/i;
    const newSubmissionPattern = /^A new article "(.+)" was submitted(?: by (.+))?\.$/i;
    const assignmentPattern =
      /^You have been assigned to review an article\.(?: Deadline:\s(.+))?$/i;
    const reviewSubmittedPattern =
      /^A review for "(.+)" has been submitted by (.+) with recommendation: ([a-z_]+)\.$/i;

    const statusMatch = notification.message.match(statusUpdatedPattern);
    if (notification.title === 'Article Status Updated' && statusMatch) {
      const [, articleTitle, statusRaw] = statusMatch;
      const localizedStatus = t(`articleStatus.${statusRaw}`, { defaultValue: statusRaw });
      return {
        title: t('notifications.templates.articleStatusUpdatedTitle'),
        message: t('notifications.templates.articleStatusUpdatedMessage', {
          title: articleTitle,
          status: localizedStatus,
        }),
      };
    }

    const submittedMatch = notification.message.match(submittedPattern);
    if (notification.title === 'Article Submitted' && submittedMatch) {
      const [, articleTitle] = submittedMatch;
      return {
        title: t('notifications.templates.articleSubmittedTitle'),
        message: t('notifications.templates.articleSubmittedMessage', { title: articleTitle }),
      };
    }

    const newSubmissionMatch = notification.message.match(newSubmissionPattern);
    if (notification.title === 'New Article Submission' && newSubmissionMatch) {
      const [, articleTitle, authorName] = newSubmissionMatch;
      return {
        title: t('notifications.templates.newArticleSubmissionTitle'),
        message: t('notifications.templates.newArticleSubmissionMessage', {
          title: articleTitle,
          author: authorName || t('common.noData'),
        }),
      };
    }

    const assignmentMatch = notification.message.match(assignmentPattern);
    if (notification.title === 'New Review Assignment' && assignmentMatch) {
      const [, deadline] = assignmentMatch;
      return {
        title: t('notifications.templates.newReviewAssignmentTitle'),
        message: deadline
          ? t('notifications.templates.newReviewAssignmentMessageWithDeadline', { deadline })
          : t('notifications.templates.newReviewAssignmentMessage'),
      };
    }

    if (notification.title === 'Review Deadline Missed') {
      return {
        title: t('notifications.templates.reviewDeadlineMissedTitle'),
        message: t('notifications.templates.reviewDeadlineMissedMessage'),
      };
    }

    const reviewSubmittedMatch = notification.message.match(reviewSubmittedPattern);
    if (notification.title === 'Review Submitted' && reviewSubmittedMatch) {
      const [, articleTitle, reviewerName, recommendationRaw] = reviewSubmittedMatch;
      const localizedRecommendation = t(`recommendation.${recommendationRaw}`, {
        defaultValue: recommendationRaw,
      });
      return {
        title: t('notifications.templates.reviewSubmittedTitle'),
        message: t('notifications.templates.reviewSubmittedMessage', {
          title: articleTitle,
          reviewer: reviewerName,
          recommendation: localizedRecommendation,
        }),
      };
    }

    return { title: notification.title, message: notification.message };
  };

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
                  {(() => {
                    const localized = localizeNotification(notification);
                    return (
                      <>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold">{localized.title}</h3>
                          {!notification.read && (
                            <span className="notifications-badge app-pill rounded-full bg-blue-100 text-blue-700">
                              {t('notifications.new')}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm">{localized.message}</p>
                      </>
                    );
                  })()}
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
