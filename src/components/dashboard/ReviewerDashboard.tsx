import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, FileText, Search, Star, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Article, Conference, Review } from '../../types/database.types';
import { useAuth } from '../../contexts/AuthContext';
import { paginateItems } from '../../utils/pagination';
import {
  formatDateByPreferences,
  getStoredListSortOption,
  getStoredPageSize,
  setListSortPreference,
} from '../../utils/preferences';

interface ReviewerDashboardProps {
  currentPage?: string;
}

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

const ReviewerDashboard: React.FC<ReviewerDashboardProps> = ({ currentPage = 'reviews' }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const activePage = currentPage === 'articles' ? 'articles' : 'reviews';
  const [articles, setArticles] = useState<Article[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [reviewForm, setReviewForm] = useState({
    content: '',
    rating: 3,
    recommendation: 'accept_with_comments',
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [articleFileUrl, setArticleFileUrl] = useState<string | null>(null);
  const [articleFileLoading, setArticleFileLoading] = useState(false);
  const [assignmentDeadlines, setAssignmentDeadlines] = useState<Record<string, string | undefined>>({});
  const [articlesSearch, setArticlesSearch] = useState('');
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [conferenceFilter, setConferenceFilter] = useState<string>('all');
  const [articlesDeadlineFilter, setArticlesDeadlineFilter] = useState<'all' | 'overdue' | 'upcoming'>('all');
  const [reviewsRecommendationFilter, setReviewsRecommendationFilter] = useState<
    'all' | 'accept' | 'accept_with_comments' | 'reject'
  >('all');
  const [articlesSort, setArticlesSort] = useState<ArticleSortOption>(() =>
    getStoredListSortOption('reviewer.articles', ARTICLE_SORT_OPTIONS, 'date_desc'),
  );
  const [reviewsSort, setReviewsSort] = useState<ReviewSortOption>(() =>
    getStoredListSortOption('reviewer.reviews', REVIEW_SORT_OPTIONS, 'date_desc'),
  );
  const [articlesPage, setArticlesPage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);
  const { user } = useAuth();
  const pageSize = getStoredPageSize();

  const formatDate = (date: string) => formatDateByPreferences(date, locale);
  const getRecommendationLabel = (recommendation: string) => t(`recommendation.${recommendation}`);
  const getAssignmentDueAt = (articleId: string) => assignmentDeadlines[articleId];
  const isAssignmentOverdue = (articleId: string) => {
    const dueAt = getAssignmentDueAt(articleId);
    if (!dueAt) return false;
    return new Date(dueAt).getTime() < Date.now();
  };
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

  const fetchAvailableArticles = useCallback(async () => {
    if (!user) return;

    try {
      const { data: assignmentData, error: assignmentError } = await supabase
        .from('article_review_assignments')
        .select('article_id, due_at')
        .eq('reviewer_id', user.id)
        .is('completed_at', null);

      if (assignmentError) throw assignmentError;

      const assignmentIds = assignmentData?.map((item) => item.article_id) || [];
      const deadlineMap = Object.fromEntries(
        (assignmentData || []).map((item) => [item.article_id, item.due_at || undefined]),
      );
      setAssignmentDeadlines(deadlineMap);

      if (assignmentIds.length === 0) {
        setArticles([]);
        return;
      }

      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          profiles:author_id(full_name, institution),
          conferences:conference_id(id, title)
        `)
        .in('id', assignmentIds)
        .neq('author_id', user.id)
        .in('status', ['submitted', 'under_review'])
        .order('submitted_at', { ascending: true });

      if (error) throw error;

      const { data: existingReviews, error: reviewsError } = await supabase
        .from('reviews')
        .select('article_id')
        .eq('reviewer_id', user.id);

      if (reviewsError) {
        console.error('Error fetching existing reviews:', reviewsError);
        setArticles(data || []);
        return;
      }

      const reviewedArticleIds = new Set(existingReviews?.map((review) => review.article_id) || []);
      const unreviewed = (data || []).filter((article) => !reviewedArticleIds.has(article.id));

      setArticles(unreviewed);
    } catch (error) {
      console.error('Error fetching articles:', error);
    }
  }, [user]);

  const fetchMyReviews = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          articles(
            title,
            conference_id,
            conferences:conference_id(id, title),
            profiles:author_id(full_name)
          )
        `)
        .eq('reviewer_id', user.id)
        .order('created_at', { ascending: false });

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
      fetchAvailableArticles();
      fetchMyReviews();
      fetchConferences();
    }
  }, [user, fetchAvailableArticles, fetchMyReviews, fetchConferences]);

  useEffect(() => {
    setSelectedArticle(null);
  }, [activePage]);

  useEffect(() => {
    setArticlesPage(1);
  }, [articlesSearch, articlesDeadlineFilter, conferenceFilter, articlesSort]);

  useEffect(() => {
    setReviewsPage(1);
  }, [reviewsSearch, reviewsRecommendationFilter, conferenceFilter, reviewsSort]);

  useEffect(() => {
    setListSortPreference('reviewer.articles', articlesSort);
  }, [articlesSort]);

  useEffect(() => {
    setListSortPreference('reviewer.reviews', reviewsSort);
  }, [reviewsSort]);

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

  const handleReviewSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArticle || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('reviews').insert([
        {
          article_id: selectedArticle.id,
          reviewer_id: user.id,
          content: reviewForm.content,
          rating: reviewForm.rating,
          recommendation: reviewForm.recommendation,
          status: 'submitted',
          submitted_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      const { error: statusError } = await supabase
        .from('articles')
        .update({ status: 'under_review' })
        .eq('id', selectedArticle.id);

      if (statusError) throw statusError;

      setSelectedArticle(null);
      setReviewForm({ content: '', rating: 3, recommendation: 'accept_with_comments' });
      await fetchAvailableArticles();
      await fetchMyReviews();
    } catch (error) {
      console.error('Error submitting review:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredArticles = useMemo(() => {
    const query = articlesSearch.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesSearch =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.abstract.toLowerCase().includes(query) ||
        (article.profiles?.full_name || '').toLowerCase().includes(query);
      const dueAt = assignmentDeadlines[article.id];
      const overdue = !!dueAt && new Date(dueAt).getTime() < Date.now();
      const matchesDeadline =
        articlesDeadlineFilter === 'all' ||
        (articlesDeadlineFilter === 'overdue' && overdue) ||
        (articlesDeadlineFilter === 'upcoming' && !overdue);
      const matchesConference = conferenceFilter === 'all' || article.conference_id === conferenceFilter;
      return matchesSearch && matchesDeadline && matchesConference;
    });
  }, [articles, articlesSearch, articlesDeadlineFilter, assignmentDeadlines, conferenceFilter]);

  const filteredReviews = useMemo(() => {
    const query = reviewsSearch.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesSearch =
        !query ||
        review.content.toLowerCase().includes(query) ||
        (review.articles?.title || '').toLowerCase().includes(query) ||
        (review.articles?.profiles?.full_name || '').toLowerCase().includes(query);
      const matchesRecommendation =
        reviewsRecommendationFilter === 'all' || review.recommendation === reviewsRecommendationFilter;
      const matchesConference =
        conferenceFilter === 'all' || review.articles?.conference_id === conferenceFilter;
      return matchesSearch && matchesRecommendation && matchesConference;
    });
  }, [reviews, reviewsSearch, reviewsRecommendationFilter, conferenceFilter]);

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
    if (pagedArticles.safePage !== articlesPage) setArticlesPage(pagedArticles.safePage);
  }, [articlesPage, pagedArticles.safePage]);

  useEffect(() => {
    if (pagedReviews.safePage !== reviewsPage) setReviewsPage(pagedReviews.safePage);
  }, [reviewsPage, pagedReviews.safePage]);

  const renderPagination = (page: number, totalPages: number, onChange: (value: number) => void) => (
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
          <h1 className="app-page-title">{t('reviewerDashboard.reviewArticleTitle')}</h1>
          <button
            onClick={() => setSelectedArticle(null)}
            className="app-btn-ghost"
          >
            {t('common.backToArticles')}
          </button>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <h2 className="text-xl font-semibold text-gray-900">{selectedArticle.title}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('common.by', { name: selectedArticle.profiles?.full_name ?? t('common.noData') })}
              {selectedArticle.profiles?.institution ? ` (${selectedArticle.profiles.institution})` : ''}
              {' - '}
              {t('common.submittedOn', { date: formatDate(selectedArticle.submitted_at) })}
            </p>
            {getAssignmentDueAt(selectedArticle.id) && (
              <p
                className={`mt-2 text-xs inline-flex items-center gap-1 ${
                  isAssignmentOverdue(selectedArticle.id) ? 'text-red-600' : 'text-gray-600'
                }`}
              >
                <AlertCircle className="h-3 w-3" />
                {t('reviewerDashboard.reviewDueAt', {
                  date: formatDate(getAssignmentDueAt(selectedArticle.id) as string),
                })}
              </p>
            )}
          </div>

          <div className="app-list-item">
            <div className="mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('submitArticle.abstractLabel')}</h3>
              <p className="text-gray-700 leading-relaxed">{selectedArticle.abstract}</p>
            </div>

            {selectedArticle.keywords && selectedArticle.keywords.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {t('submitArticle.keywordsLabel')}
                </h3>
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
              <div className="mb-6">
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

        <form onSubmit={handleReviewSubmit} className="app-card app-list-item">
          <h3 className="text-lg font-medium text-gray-900 mb-4">{t('reviewerDashboard.submitReviewTitle')}</h3>

          <div className="space-y-4">
            <div>
              <label className="app-label">
                {t('reviewerDashboard.reviewContentLabel')}
              </label>
              <textarea
                required
                rows={8}
                value={reviewForm.content}
                onChange={(event) => setReviewForm((prev) => ({ ...prev, content: event.target.value }))}
                className="app-input"
                placeholder={t('reviewerDashboard.reviewContentPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="app-label">
                  {t('reviewerDashboard.ratingLabel')}
                </label>
                <div className="flex items-center space-x-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setReviewForm((prev) => ({ ...prev, rating }))}
                      className="p-1"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          rating <= reviewForm.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-sm text-gray-600 ml-2">{reviewForm.rating}/5</span>
                </div>
              </div>

              <div>
                <label className="app-label">
                  {t('reviewerDashboard.recommendationLabel')}
                </label>
                <select
                  value={reviewForm.recommendation}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, recommendation: event.target.value }))
                  }
                  className="app-input"
                >
                  <option value="accept">{t('recommendation.accept')}</option>
                  <option value="accept_with_comments">{t('recommendation.accept_with_comments')}</option>
                  <option value="reject">{t('recommendation.reject')}</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !reviewForm.content.trim()}
              className="app-btn-primary-lg flex items-center space-x-2"
            >
              <Send className="h-4 w-4" />
              <span>
                {submitting
                  ? t('reviewerDashboard.submitReviewLoading')
                  : t('reviewerDashboard.submitReviewButton')}
              </span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="app-page-lg">
      <div className="flex items-center justify-between">
        <h1 className="app-page-title">
          {activePage === 'reviews'
            ? t('reviewerDashboard.myReviewsTitle')
            : t('reviewerDashboard.articlesToReviewTitle')}
        </h1>
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

      {activePage === 'articles' && (
        <div className="app-card">
          <div className="app-card-header">
            <h2 className="text-lg font-medium text-gray-900">
              {t('reviewerDashboard.articlesAvailableTitle')}
            </h2>
          </div>

          <div className="app-card-header border-gray-100">
            <div className="dashboard-search-grid dashboard-search-grid-3">
              <div className="dashboard-search-field">
                <Search className="dashboard-search-icon" />
                <input
                  value={articlesSearch}
                  onChange={(event) => setArticlesSearch(event.target.value)}
                  placeholder={t('common.searchPlaceholder')}
                  className="dashboard-search-input"
                />
              </div>
              <select
                value={articlesDeadlineFilter}
                onChange={(event) =>
                  setArticlesDeadlineFilter(event.target.value as 'all' | 'overdue' | 'upcoming')
                }
                className="app-input"
              >
                <option value="all">{t('reviewerDashboard.allDeadlines')}</option>
                <option value="overdue">{t('reviewerDashboard.overdueOnly')}</option>
                <option value="upcoming">{t('reviewerDashboard.upcomingOnly')}</option>
              </select>
              <select
                value={articlesSort}
                onChange={(event) => setArticlesSort(event.target.value as ArticleSortOption)}
                className="app-input dashboard-search-grid-sort-full"
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
              <h3 className="app-empty-title">
                {t('reviewerDashboard.emptyArticlesTitle')}
              </h3>
              <p className="app-empty-description">{t('reviewerDashboard.emptyArticlesDescription')}</p>
            </div>
          ) : (
            <>
              <div className="app-list-divider">
                {pagedArticles.pageItems.map((article) => (
                  <div key={article.id} className="app-list-item hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900">{article.title}</h3>
                        <p className="mt-1 app-pagination-info">
                          {t('common.by', { name: article.profiles?.full_name ?? t('common.noData') })}
                          {article.profiles?.institution ? ` (${article.profiles.institution})` : ''}
                          {' - '}
                          {t('common.submittedOn', { date: formatDate(article.submitted_at) })}
                        </p>
                        <p className="mt-2 text-sm text-gray-700 line-clamp-2">{article.abstract}</p>
                        {getAssignmentDueAt(article.id) && (
                          <p className={`mt-2 text-xs ${isAssignmentOverdue(article.id) ? 'text-red-600' : 'text-gray-500'}`}>
                            {t('reviewerDashboard.reviewDueAt', {
                              date: formatDate(getAssignmentDueAt(article.id) as string),
                            })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedArticle(article)}
                        className="ml-4 app-btn-primary"
                      >
                        {t('reviewerDashboard.reviewArticleButton')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {renderPagination(articlesPage, pagedArticles.totalPages, setArticlesPage)}
            </>
          )}
        </div>
      )}

      {activePage === 'reviews' && (
        <div className="app-card">
          <div className="app-card-header">
            <h2 className="text-lg font-medium text-gray-900">{t('reviewerDashboard.myReviewsSectionTitle')}</h2>
          </div>

          <div className="app-card-header border-gray-100">
            <div className="dashboard-search-grid dashboard-search-grid-3">
              <div className="dashboard-search-field">
                <Search className="dashboard-search-icon" />
                <input
                  value={reviewsSearch}
                  onChange={(event) => setReviewsSearch(event.target.value)}
                  placeholder={t('common.searchPlaceholder')}
                  className="dashboard-search-input"
                />
              </div>
              <select
                value={reviewsRecommendationFilter}
                onChange={(event) =>
                  setReviewsRecommendationFilter(
                    event.target.value as 'all' | 'accept' | 'accept_with_comments' | 'reject',
                  )
                }
                className="app-input"
              >
                <option value="all">{t('common.allRecommendations')}</option>
                <option value="accept">{t('recommendation.accept')}</option>
                <option value="accept_with_comments">{t('recommendation.accept_with_comments')}</option>
                <option value="reject">{t('recommendation.reject')}</option>
              </select>
              <select
                value={reviewsSort}
                onChange={(event) => setReviewsSort(event.target.value as ReviewSortOption)}
                className="app-input"
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

          {filteredReviews.length === 0 ? (
            <div className="app-empty-state">
              <FileText className="app-empty-icon" />
              <h3 className="app-empty-title">
                {t('reviewerDashboard.emptyReviewsTitle')}
              </h3>
              <p className="app-empty-description">{t('reviewerDashboard.emptyReviewsDescription')}</p>
            </div>
          ) : (
            <>
              <div className="app-list-divider">
                {pagedReviews.pageItems.map((review) => (
                  <div key={review.id} className="app-list-item">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="text-md font-medium text-gray-900">{review.articles?.title}</h4>
                        <p className="mt-1 app-pagination-info">
                          {t('common.by', {
                            name: review.articles?.profiles?.full_name ?? t('common.noData'),
                          })}
                          {' - '}
                          {t('common.reviewedOn', {
                            date: formatDate(review.submitted_at || review.created_at),
                          })}
                        </p>
                        <div className="mt-2 flex items-center space-x-4">
                          <div className="flex items-center space-x-1">
                            {[1, 2, 3, 4, 5].map((rating) => (
                              <Star
                                key={rating}
                                className={`h-4 w-4 ${
                                  rating <= review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
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
              {renderPagination(reviewsPage, pagedReviews.totalPages, setReviewsPage)}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ReviewerDashboard;



