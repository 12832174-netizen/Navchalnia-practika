import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { FileText, Eye, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Article, Conference, Review, ArticleStatusHistory } from '../../types/database.types';
import { useAuth } from '../../contexts/AuthContext';
import { paginateItems } from '../../utils/pagination';
import {
  formatDateByPreferences,
  formatDateTimeByPreferences,
  getStoredListSortOption,
  getStoredPageSize,
  setListSortPreference,
} from '../../utils/preferences';

const ARTICLE_SORT_OPTIONS = ['date_desc', 'date_asc', 'title_asc', 'title_desc'] as const;
type ArticleSortOption = (typeof ARTICLE_SORT_OPTIONS)[number];

const REVIEW_SORT_OPTIONS = [
  'date_desc',
  'date_asc',
  'title_asc',
  'title_desc',
  'rating_desc',
  'rating_asc',
] as const;
type ReviewSortOption = (typeof REVIEW_SORT_OPTIONS)[number];

const AuthorDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const [articles, setArticles] = useState<Article[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleReviews, setArticleReviews] = useState<Review[]>([]);
  const [statusHistory, setStatusHistory] = useState<ArticleStatusHistory[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [conferenceFilter, setConferenceFilter] = useState<string>('all');
  const [articlesSort, setArticlesSort] = useState<ArticleSortOption>(() =>
    getStoredListSortOption('author.articles', ARTICLE_SORT_OPTIONS, 'date_desc'),
  );
  const [reviewsSort, setReviewsSort] = useState<ReviewSortOption>(() =>
    getStoredListSortOption('author.reviews', REVIEW_SORT_OPTIONS, 'date_desc'),
  );
  const [articlesPage, setArticlesPage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [articleFileUrl, setArticleFileUrl] = useState<string | null>(null);
  const [articleFileLoading, setArticleFileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const pageSize = getStoredPageSize();

  const formatDate = (date: string) => formatDateByPreferences(date, locale);
  const formatDateTime = (date: string) => formatDateTimeByPreferences(date, locale);
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
        .select(`
          *,
          conferences:conference_id(id, title)
        `)
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
          articles!inner(
            id,
            title,
            author_id,
            conference_id,
            conferences:conference_id(id, title)
          ),
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

  const fetchConferences = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('conferences')
        .select('id, title, start_date, end_date, status, is_public')
        .order('start_date', { ascending: false });
      if (error) throw error;
      setConferences((data as Conference[]) || []);
    } catch (fetchError) {
      console.error('Error fetching conferences:', fetchError);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchArticles();
      fetchReviews();
      fetchConferences();
    }
  }, [user, fetchArticles, fetchReviews, fetchConferences]);

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

  const filteredArticles = useMemo(
    () =>
      articles.filter((article) => {
        if (conferenceFilter === 'all') return true;
        return article.conference_id === conferenceFilter;
      }),
    [articles, conferenceFilter],
  );

  const filteredReviews = useMemo(
    () =>
      reviews.filter((review) => {
        if (conferenceFilter === 'all') return true;
        return review.articles?.conference_id === conferenceFilter;
      }),
    [reviews, conferenceFilter],
  );

  const sortedArticles = useMemo(() => {
    const items = [...filteredArticles];
    switch (articlesSort) {
      case 'date_asc':
        return items.sort(
          (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime(),
        );
      case 'title_asc':
        return items.sort((a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base' }));
      case 'title_desc':
        return items.sort((a, b) => b.title.localeCompare(a.title, locale, { sensitivity: 'base' }));
      case 'date_desc':
      default:
        return items.sort(
          (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
        );
    }
  }, [filteredArticles, articlesSort, locale]);

  const sortedReviews = useMemo(() => {
    const items = [...filteredReviews];
    switch (reviewsSort) {
      case 'date_asc':
        return items.sort(
          (a, b) =>
            new Date(a.submitted_at || a.created_at).getTime() -
            new Date(b.submitted_at || b.created_at).getTime(),
        );
      case 'title_asc':
        return items.sort((a, b) =>
          (a.articles?.title || '').localeCompare(b.articles?.title || '', locale, {
            sensitivity: 'base',
          }),
        );
      case 'title_desc':
        return items.sort((a, b) =>
          (b.articles?.title || '').localeCompare(a.articles?.title || '', locale, {
            sensitivity: 'base',
          }),
        );
      case 'rating_asc':
        return items.sort((a, b) => a.rating - b.rating);
      case 'rating_desc':
        return items.sort((a, b) => b.rating - a.rating);
      case 'date_desc':
      default:
        return items.sort(
          (a, b) =>
            new Date(b.submitted_at || b.created_at).getTime() -
            new Date(a.submitted_at || a.created_at).getTime(),
        );
    }
  }, [filteredReviews, reviewsSort, locale]);

  const pagedArticles = paginateItems(sortedArticles, articlesPage, pageSize);
  const pagedReviews = paginateItems(sortedReviews, reviewsPage, pageSize);

  useEffect(() => {
    setArticlesPage(1);
  }, [conferenceFilter, articlesSort]);

  useEffect(() => {
    setReviewsPage(1);
  }, [conferenceFilter, reviewsSort]);

  useEffect(() => {
    setListSortPreference('author.articles', articlesSort);
  }, [articlesSort]);

  useEffect(() => {
    setListSortPreference('author.reviews', reviewsSort);
  }, [reviewsSort]);

  useEffect(() => {
    if (pagedArticles.safePage !== articlesPage) setArticlesPage(pagedArticles.safePage);
  }, [articlesPage, pagedArticles.safePage]);

  useEffect(() => {
    if (pagedReviews.safePage !== reviewsPage) setReviewsPage(pagedReviews.safePage);
  }, [reviewsPage, pagedReviews.safePage]);

  const renderPagination = (page: number, totalPages: number, onChange: (next: number) => void) => (
    <div className="app-pagination">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="app-pagination-btn"
      >
        {t('common.previous')}
      </button>
      <span className="app-pagination-info">{t('common.pageOf', { page, total: totalPages })}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="app-pagination-btn"
      >
        {t('common.next')}
      </button>
    </div>
  );

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
        <select
          value={conferenceFilter}
          onChange={(event) => setConferenceFilter(event.target.value)}
          className="app-input max-w-xs"
        >
          <option value="all">{t('common.allConferences')}</option>
          {conferences.map((conference) => (
            <option key={conference.id} value={conference.id}>
              {conference.title}
            </option>
          ))}
        </select>
      </div>

      {/* Articles List */}
      <div className="app-card">
        <div className="app-card-header">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-medium text-gray-900">{t('authorDashboard.submittedArticles')}</h2>
            <select
              value={articlesSort}
              onChange={(event) => setArticlesSort(event.target.value as ArticleSortOption)}
              className="app-input w-full"
            >
              <option value="date_desc">{t('common.newestFirst')}</option>
              <option value="date_asc">{t('common.oldestFirst')}</option>
              <option value="title_asc">{t('common.titleAZ')}</option>
              <option value="title_desc">{t('common.titleZA')}</option>
            </select>
          </div>
        </div>
        
        {filteredArticles.length === 0 ? (
          <div className="app-empty-state">
            <FileText className="app-empty-icon" />
            <h3 className="app-empty-title">{t('authorDashboard.emptyTitle')}</h3>
            <p className="app-empty-description">{t('authorDashboard.emptyDescription')}</p>
          </div>
        ) : (
          <>
            <div className="app-list-divider">
              {pagedArticles.pageItems.map((article) => (
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
            {renderPagination(articlesPage, pagedArticles.totalPages, setArticlesPage)}
          </>
        )}
      </div>

      {/* Reviews Section */}
      {filteredReviews.length > 0 && (
        <div className="app-card">
          <div className="app-card-header">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <h2 className="text-lg font-medium text-gray-900">{t('authorDashboard.reviewsReceived')}</h2>
              <select
                value={reviewsSort}
                onChange={(event) => setReviewsSort(event.target.value as ReviewSortOption)}
                className="app-input w-full md:w-auto"
              >
                <option value="date_desc">{t('common.newestFirst')}</option>
                <option value="date_asc">{t('common.oldestFirst')}</option>
                <option value="title_asc">{t('common.titleAZ')}</option>
                <option value="title_desc">{t('common.titleZA')}</option>
                <option value="rating_desc">{t('common.ratingHighToLow')}</option>
                <option value="rating_asc">{t('common.ratingLowToHigh')}</option>
              </select>
            </div>
          </div>
          <>
            <div className="app-list-divider">
              {pagedReviews.pageItems.map((review) => (
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
            {renderPagination(reviewsPage, pagedReviews.totalPages, setReviewsPage)}
          </>
        </div>
      )}
    </div>
  );
};

export default AuthorDashboard;

