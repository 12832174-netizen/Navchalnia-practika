import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Eye, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Article, Review, ArticleStatusHistory } from '../../types/database.types';
import { useAuth } from '../../contexts/AuthContext';

const AuthorDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [articles, setArticles] = useState<Article[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleReviews, setArticleReviews] = useState<Review[]>([]);
  const [statusHistory, setStatusHistory] = useState<ArticleStatusHistory[]>([]);
  const [articleFileUrl, setArticleFileUrl] = useState<string | null>(null);
  const [articleFileLoading, setArticleFileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const formatDate = (date: string) => new Date(date).toLocaleDateString(i18n.resolvedLanguage);
  const formatDateTime = (date: string) => new Date(date).toLocaleString(i18n.resolvedLanguage);
  const getStatusLabel = (status: string) => t(`articleStatus.${status}`);
  const getRecommendationLabel = (recommendation: string) => t(`recommendation.${recommendation}`);

  const getStoragePathFromFileUrl = (fileUrl: string): string | null => {
    if (!fileUrl) return null;

    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) {
      return fileUrl;
    }

    try {
      const parsed = new URL(fileUrl);
      const markers = [
        '/storage/v1/object/public/articles/',
        '/storage/v1/object/sign/articles/',
        '/storage/v1/object/authenticated/articles/',
      ];

      const marker = markers.find((item) => parsed.pathname.includes(item));
      if (!marker) return null;

      const pathIndex = parsed.pathname.indexOf(marker) + marker.length;
      return decodeURIComponent(parsed.pathname.slice(pathIndex));
    } catch {
      return null;
    }
  };

  const fetchArticles = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('articles')
        .select('*')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
    }
  }, [user]);

  const fetchReviews = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          articles!inner(id, title, author_id),
          profiles!reviews_reviewer_id_fkey(full_name)
        `)
        .eq('articles.author_id', user.id)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchArticles();
      fetchReviews();
    }
  }, [user, fetchArticles, fetchReviews]);

  useEffect(() => {
    let cancelled = false;

    const loadFileUrl = async () => {
      setArticleFileUrl(null);

      if (!selectedArticle?.file_url) {
        setArticleFileLoading(false);
        return;
      }

      const storagePath = getStoragePathFromFileUrl(selectedArticle.file_url);

      if (!storagePath) {
        setArticleFileUrl(selectedArticle.file_url);
        setArticleFileLoading(false);
        return;
      }

      try {
        setArticleFileLoading(true);
        const { data, error } = await supabase.storage
          .from('articles')
          .createSignedUrl(storagePath, 60 * 60);

        if (error) throw error;
        if (!cancelled) {
          setArticleFileUrl(data.signedUrl);
        }
      } catch (error) {
        console.error('Error creating signed URL:', error);
      } finally {
        if (!cancelled) {
          setArticleFileLoading(false);
        }
      }
    };

    loadFileUrl();

    return () => {
      cancelled = true;
    };
  }, [selectedArticle]);

  const fetchArticleDetails = async (articleId: string) => {
    try {
      const { data: articleReviewsData, error: articleReviewsError } = await supabase
        .from('reviews')
        .select(`
          *,
          profiles!reviews_reviewer_id_fkey(full_name)
        `)
        .eq('article_id', articleId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false });

      if (articleReviewsError) throw articleReviewsError;
      setArticleReviews(articleReviewsData || []);

      const { data: historyData, error: historyError } = await supabase
        .from('article_status_history')
        .select(`
          *,
          profiles!article_status_history_changed_by_fkey(full_name)
        `)
        .eq('article_id', articleId)
        .order('created_at', { ascending: false });

      if (historyError) throw historyError;
      setStatusHistory(historyData || []);
    } catch (error) {
      console.error('Error fetching article details:', error);
      setArticleReviews([]);
      setStatusHistory([]);
    }
  };

  const handleOpenArticle = (article: Article) => {
    setSelectedArticle(article);
    fetchArticleDetails(article.id);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'under_review':
        return <Eye className="h-5 w-5 text-yellow-600" />;
      case 'accepted':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'accepted_with_comments':
        return <AlertCircle className="h-5 w-5 text-amber-600" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-blue-100 text-blue-800';
      case 'under_review':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-green-100 text-green-800';
      case 'accepted_with_comments':
        return 'bg-amber-100 text-amber-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-spinner"></div>
      </div>
    );
  }

  if (selectedArticle) {
    return (
      <div className="app-page">
        <div className="flex items-center justify-between">
          <h1 className="app-page-title">{t('authorDashboard.articleDetailsTitle')}</h1>
          <button
            onClick={() => setSelectedArticle(null)}
            className="app-btn-ghost"
          >
            {t('common.backToArticles')}
          </button>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedArticle.title}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {t('common.submittedOn', { date: formatDate(selectedArticle.submitted_at) })}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(selectedArticle.status)}
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                    selectedArticle.status,
                  )}`}
                >
                  {getStatusLabel(selectedArticle.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="app-card-body app-page">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('submitArticle.abstractLabel')}</h3>
              <p className="text-gray-700 leading-relaxed">{selectedArticle.abstract}</p>
            </div>

            {selectedArticle.keywords && selectedArticle.keywords.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('submitArticle.keywordsLabel')}</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedArticle.keywords.map((keyword, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded-md">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedArticle.file_url && (
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('common.articleFile')}</h3>
                {articleFileUrl ? (
                  <a
                    href={articleFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app-icon-link"
                  >
                    <FileText className="h-5 w-5" />
                    <span>{selectedArticle.file_name || t('common.downloadPdf')}</span>
                  </a>
                ) : (
                  <p className="text-sm text-gray-500">
                    {articleFileLoading ? t('auth.submitLoading') : t('common.noData')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <h3 className="text-lg font-medium text-gray-900">{t('authorDashboard.statusHistoryTitle')}</h3>
          </div>
          {statusHistory.length === 0 ? (
            <p className="app-list-item text-sm text-gray-500">{t('authorDashboard.emptyStatusHistory')}</p>
          ) : (
            <div className="app-list-divider">
              {statusHistory.map((history) => (
                <div key={history.id} className="app-list-item">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-600">{formatDateTime(history.created_at)}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {history.profiles?.full_name ?? t('common.noData')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {history.old_status && (
                        <>
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(history.old_status)}`}>
                            {getStatusLabel(history.old_status)}
                          </span>
                          <span className="text-gray-400">{'->'}</span>
                        </>
                      )}
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(history.new_status)}`}>
                        {getStatusLabel(history.new_status)}
                      </span>
                    </div>
                  </div>
                  {history.comments && <p className="mt-2 text-sm text-gray-700">{history.comments}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <h3 className="text-lg font-medium text-gray-900">
              {t('authorDashboard.reviewsForArticle', { count: articleReviews.length })}
            </h3>
          </div>
          {articleReviews.length === 0 ? (
            <p className="app-list-item text-sm text-gray-500">{t('authorDashboard.noReviewsForArticle')}</p>
          ) : (
            <div className="app-list-divider">
              {articleReviews.map((review) => (
                <div key={review.id} className="app-list-item">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">
                        {t('common.by', { name: review.profiles?.full_name ?? t('common.noData') })}
                        {' - '}
                        {t('common.reviewedOn', { date: formatDate(review.submitted_at || review.created_at) })}
                      </p>
                      <div className="mt-2 flex items-center space-x-4">
                        <span className="text-sm text-gray-500">{t('common.rating', { rating: review.rating })}</span>
                        <span
                          className={`app-pill ${
                            review.recommendation === 'accept'
                              ? 'bg-green-100 text-green-800'
                              : review.recommendation === 'accept_with_comments'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {getRecommendationLabel(review.recommendation)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-gray-700">{review.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-lg">
      <div className="flex justify-between items-center">
        <h1 className="app-page-title">{t('authorDashboard.pageTitle')}</h1>
      </div>

      {/* Articles List */}
      <div className="app-card">
        <div className="app-card-header">
          <h2 className="text-lg font-medium text-gray-900">{t('authorDashboard.submittedArticles')}</h2>
        </div>
        
        {articles.length === 0 ? (
          <div className="app-empty-state">
            <FileText className="app-empty-icon" />
            <h3 className="app-empty-title">{t('authorDashboard.emptyTitle')}</h3>
            <p className="app-empty-description">{t('authorDashboard.emptyDescription')}</p>
          </div>
        ) : (
          <div className="app-list-divider">
            {articles.map((article) => (
              <div key={article.id} className="app-list-item hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">{article.title}</h3>
                      {getStatusIcon(article.status)}
                    </div>
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{article.abstract}</p>
                    <div className="mt-3 flex items-center space-x-4">
                      <span className={`app-pill ${getStatusColor(article.status)}`}>
                        {getStatusLabel(article.status)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {t('common.submittedOn', { date: formatDate(article.submitted_at) })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenArticle(article)}
                    className="ml-4 app-btn-primary"
                  >
                    {t('authorDashboard.viewArticleButton')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reviews Section */}
      {reviews.length > 0 && (
        <div className="app-card">
          <div className="app-card-header">
            <h2 className="text-lg font-medium text-gray-900">{t('authorDashboard.reviewsReceived')}</h2>
          </div>
          <div className="app-list-divider">
            {reviews.map((review) => (
              <div key={review.id} className="app-list-item">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="text-md font-medium text-gray-900">
                      {t('authorDashboard.reviewFor', {
                        title: review.articles?.title ?? t('common.noData'),
                      })}
                    </h4>
                    <p className="mt-1 text-sm text-gray-600">
                      {t('common.by', { name: review.profiles?.full_name ?? t('common.noData') })}
                      {' - '}
                      {t('common.reviewedOn', { date: formatDate(review.submitted_at || review.created_at) })}
                    </p>
                    <div className="mt-2 flex items-center space-x-4">
                      <span className="text-sm text-gray-500">
                        {t('common.rating', { rating: review.rating })}
                      </span>
                      <span className={`app-pill ${
                        review.recommendation === 'accept' ? 'bg-green-100 text-green-800' :
                        review.recommendation === 'accept_with_comments' ? 'bg-amber-100 text-amber-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {getRecommendationLabel(review.recommendation)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-gray-700">{review.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AuthorDashboard;

