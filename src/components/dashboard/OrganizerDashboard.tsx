import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  FileDown,
  FileText,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import {
  Article,
  ArticleReviewAssignment,
  ArticleStatus,
  ArticleStatusHistory,
  Profile,
  Review,
} from '../../types/database.types';
import { useAuth } from '../../contexts/AuthContext';
import { downloadCsv } from '../../utils/csv';
import { DEFAULT_PAGE_SIZE, paginateItems } from '../../utils/pagination';

interface OrganizerDashboardProps {
  currentPage?: 'dashboard' | 'reviews' | 'manage';
}

const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({ currentPage = 'dashboard' }) => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [articles, setArticles] = useState<Article[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewers, setReviewers] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<ArticleReviewAssignment[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [articleReviews, setArticleReviews] = useState<Review[]>([]);
  const [statusHistory, setStatusHistory] = useState<ArticleStatusHistory[]>([]);

  const [newStatus, setNewStatus] = useState<ArticleStatus | ''>('');
  const [statusComments, setStatusComments] = useState('');
  const [selectedReviewerId, setSelectedReviewerId] = useState('');
  const [assignmentDueAt, setAssignmentDueAt] = useState('');
  const [reviewDueAt, setReviewDueAt] = useState('');
  const [presentationStartsAt, setPresentationStartsAt] = useState('');
  const [presentationLocation, setPresentationLocation] = useState('');

  const [articleSearch, setArticleSearch] = useState('');
  const [articleStatusFilter, setArticleStatusFilter] = useState<'all' | ArticleStatus>('all');
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [recommendationFilter, setRecommendationFilter] = useState<
    'all' | 'accept' | 'accept_with_comments' | 'reject'
  >('all');
  const [articlePage, setArticlePage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [articleFileUrl, setArticleFileUrl] = useState<string | null>(null);
  const [articleFileLoading, setArticleFileLoading] = useState(false);

  const pageSize = DEFAULT_PAGE_SIZE;
  const formatDate = (date: string) => new Date(date).toLocaleDateString(i18n.resolvedLanguage);
  const formatDateTime = (date: string) => new Date(date).toLocaleString(i18n.resolvedLanguage);
  const getStatusLabel = (status: string) => t(`articleStatus.${status}`);
  const getRecommendationLabel = (recommendation: string) => t(`recommendation.${recommendation}`);

  const toInputDateTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const fromInputDateTime = (value: string) => (value ? new Date(value).toISOString() : null);

  const getStoragePathFromFileUrl = (fileUrl: string): string | null => {
    if (!fileUrl) return null;
    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) return fileUrl;

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

  useEffect(() => {
    fetchAllArticles();
    fetchAllReviews();
    fetchReviewers();
  }, []);

  useEffect(() => {
    setSelectedArticle(null);
    setArticleReviews([]);
    setStatusHistory([]);
    setAssignments([]);
    setNewStatus('');
    setStatusComments('');
    setSelectedReviewerId('');
    setAssignmentDueAt('');
    setReviewDueAt('');
    setPresentationStartsAt('');
    setPresentationLocation('');
  }, [currentPage]);

  useEffect(() => {
    setArticlePage(1);
  }, [articleSearch, articleStatusFilter]);

  useEffect(() => {
    setReviewsPage(1);
  }, [reviewsSearch, recommendationFilter]);

  useEffect(() => {
    if (!selectedArticle) return;
    setReviewDueAt(toInputDateTime(selectedArticle.review_due_at));
    setPresentationStartsAt(toInputDateTime(selectedArticle.presentation_starts_at));
    setPresentationLocation(selectedArticle.presentation_location || '');
  }, [selectedArticle]);

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
        const { data, error } = await supabase.storage.from('articles').createSignedUrl(storagePath, 60 * 60);
        if (error) throw error;
        if (!cancelled) setArticleFileUrl(data.signedUrl);
      } catch (error) {
        console.error('Error creating signed URL:', error);
      } finally {
        if (!cancelled) setArticleFileLoading(false);
      }
    };

    loadFileUrl();
    return () => {
      cancelled = true;
    };
  }, [selectedArticle]);

  const fetchAllArticles = async () => {
    try {
      const { data, error } = await supabase
        .from('articles')
        .select(`
          *,
          profiles!articles_author_id_fkey(full_name, institution)
        `)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error('Error fetching articles:', error);
    }
  };

  const fetchAllReviews = async () => {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select(`
          *,
          articles!inner(title),
          profiles!reviews_reviewer_id_fkey(full_name)
        `)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      setReviews(data || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReviewers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'reviewer')
        .order('full_name', { ascending: true });
      if (error) throw error;
      setReviewers(data || []);
    } catch (error) {
      console.error('Error fetching reviewers:', error);
    }
  };

  const fetchArticleDetails = async (articleId: string) => {
    try {
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          *,
          profiles!reviews_reviewer_id_fkey(full_name)
        `)
        .eq('article_id', articleId)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: false });
      if (reviewsError) throw reviewsError;
      setArticleReviews(reviewsData || []);

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

      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('article_review_assignments')
        .select(`
          *,
          profiles:reviewer_id(full_name, email, institution)
        `)
        .eq('article_id', articleId)
        .order('created_at', { ascending: false });
      if (assignmentsError) throw assignmentsError;
      setAssignments(assignmentsData || []);
    } catch (error) {
      console.error('Error fetching article details:', error);
    }
  };

  const handleStatusUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArticle || !newStatus || !user) return;

    setUpdating(true);
    try {
      const { error: historyError } = await supabase.from('article_status_history').insert([
        {
          article_id: selectedArticle.id,
          old_status: selectedArticle.status,
          new_status: newStatus,
          changed_by: user.id,
          comments: statusComments,
        },
      ]);
      if (historyError) throw historyError;

      const { error: statusError } = await supabase
        .from('articles')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', selectedArticle.id);
      if (statusError) throw statusError;

      setSelectedArticle(null);
      setNewStatus('');
      setStatusComments('');
      await fetchAllArticles();
    } catch (error) {
      console.error('Error updating status:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignReviewer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArticle || !selectedReviewerId || !user) return;

    setAssigning(true);
    try {
      const { error } = await supabase.from('article_review_assignments').upsert(
        [
          {
            article_id: selectedArticle.id,
            reviewer_id: selectedReviewerId,
            assigned_by: user.id,
            due_at: fromInputDateTime(assignmentDueAt),
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'article_id,reviewer_id' },
      );
      if (error) throw error;

      setSelectedReviewerId('');
      setAssignmentDueAt('');
      await fetchArticleDetails(selectedArticle.id);
    } catch (error) {
      console.error('Error assigning reviewer:', error);
    } finally {
      setAssigning(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!selectedArticle) return;
    try {
      const { error } = await supabase.from('article_review_assignments').delete().eq('id', assignmentId);
      if (error) throw error;
      await fetchArticleDetails(selectedArticle.id);
    } catch (error) {
      console.error('Error deleting assignment:', error);
    }
  };

  const handleSaveSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedArticle) return;

    setSavingSchedule(true);
    try {
      const { error } = await supabase
        .from('articles')
        .update({
          review_due_at: fromInputDateTime(reviewDueAt),
          presentation_starts_at: fromInputDateTime(presentationStartsAt),
          presentation_location: presentationLocation.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedArticle.id);
      if (error) throw error;

      await fetchAllArticles();
      const { data, error: oneError } = await supabase
        .from('articles')
        .select(`
          *,
          profiles!articles_author_id_fkey(full_name, institution)
        `)
        .eq('id', selectedArticle.id)
        .single();
      if (oneError) throw oneError;
      setSelectedArticle(data);
    } catch (error) {
      console.error('Error saving schedule:', error);
    } finally {
      setSavingSchedule(false);
    }
  };

  const filteredArticles = useMemo(() => {
    const query = articleSearch.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesStatus = articleStatusFilter === 'all' || article.status === articleStatusFilter;
      const matchesQuery =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.abstract.toLowerCase().includes(query) ||
        (article.profiles?.full_name || '').toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [articles, articleSearch, articleStatusFilter]);

  const filteredReviews = useMemo(() => {
    const query = reviewsSearch.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesRecommendation = recommendationFilter === 'all' || review.recommendation === recommendationFilter;
      const matchesQuery =
        !query ||
        (review.articles?.title || '').toLowerCase().includes(query) ||
        (review.profiles?.full_name || '').toLowerCase().includes(query) ||
        review.content.toLowerCase().includes(query);
      return matchesRecommendation && matchesQuery;
    });
  }, [reviews, reviewsSearch, recommendationFilter]);

  const pagedArticles = paginateItems(filteredArticles, articlePage, pageSize);
  const pagedReviews = paginateItems(filteredReviews, reviewsPage, pageSize);

  useEffect(() => {
    if (pagedArticles.safePage !== articlePage) setArticlePage(pagedArticles.safePage);
  }, [articlePage, pagedArticles.safePage]);

  useEffect(() => {
    if (pagedReviews.safePage !== reviewsPage) setReviewsPage(pagedReviews.safePage);
  }, [reviewsPage, pagedReviews.safePage]);

  const exportArticles = (mode: 'accepted' | 'rejected' | 'all') => {
    const source =
      mode === 'all' ? filteredArticles : filteredArticles.filter((article) => article.status === mode);
    const filename =
      mode === 'accepted' ? 'articles_accepted.csv' : mode === 'rejected' ? 'articles_rejected.csv' : 'articles.csv';

    downloadCsv(
      filename,
      ['Title', 'Author', 'Status', 'SubmittedAt', 'ReviewDueAt', 'PresentationStartsAt', 'PresentationLocation'],
      source.map((article) => [
        article.title,
        article.profiles?.full_name || '',
        getStatusLabel(article.status),
        formatDateTime(article.submitted_at),
        article.review_due_at ? formatDateTime(article.review_due_at) : '',
        article.presentation_starts_at ? formatDateTime(article.presentation_starts_at) : '',
        article.presentation_location || '',
      ]),
    );
  };

  const getAssignmentState = (assignment: ArticleReviewAssignment) => {
    if (assignment.completed_at) return 'completed';
    if (assignment.due_at && new Date(assignment.due_at).getTime() < Date.now()) return 'overdue';
    return 'active';
  };

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

  const renderFilters = () => (
    <div className="app-card p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="dashboard-search-field">
          <Search className="dashboard-search-icon" />
          <input
            value={articleSearch}
            onChange={(event) => setArticleSearch(event.target.value)}
            placeholder={t('common.searchPlaceholder')}
            className="dashboard-search-input"
          />
        </div>
        <select
          value={articleStatusFilter}
          onChange={(event) => setArticleStatusFilter(event.target.value as 'all' | ArticleStatus)}
          className="app-input"
        >
          <option value="all">{t('common.allStatuses')}</option>
          <option value="submitted">{t('articleStatus.submitted')}</option>
          <option value="under_review">{t('articleStatus.under_review')}</option>
          <option value="accepted">{t('articleStatus.accepted')}</option>
          <option value="accepted_with_comments">{t('articleStatus.accepted_with_comments')}</option>
          <option value="rejected">{t('articleStatus.rejected')}</option>
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => exportArticles('accepted')}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            <FileDown className="h-4 w-4" />
            <span>{t('organizerDashboard.exportAccepted')}</span>
          </button>
          <button
            type="button"
            onClick={() => exportArticles('rejected')}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
          >
            <FileDown className="h-4 w-4" />
            <span>{t('organizerDashboard.exportRejected')}</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderArticlesList = () => (
    <div className="app-card">
      <div className="app-card-header">
        <h2 className="text-lg font-medium text-gray-900">{t('organizerDashboard.allArticlesTitle')}</h2>
      </div>
      {filteredArticles.length === 0 ? (
        <div className="app-empty-state">
          <FileText className="app-empty-icon" />
          <h3 className="app-empty-title">{t('organizerDashboard.emptyArticlesTitle')}</h3>
          <p className="app-empty-description">{t('organizerDashboard.emptyArticlesDescription')}</p>
        </div>
      ) : (
        <>
          <div className="app-list-divider">
            {pagedArticles.pageItems.map((article) => (
              <div key={article.id} className="app-list-item hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-medium text-gray-900">{article.title}</h3>
                      {getStatusIcon(article.status)}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {t('common.by', { name: article.profiles?.full_name ?? t('common.noData') })}
                      {' - '}
                      {t('common.submittedOn', { date: formatDate(article.submitted_at) })}
                    </p>
                    <p className="mt-2 text-sm text-gray-700 line-clamp-2">{article.abstract}</p>
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <span className={`app-pill ${getStatusColor(article.status)}`}>
                        {getStatusLabel(article.status)}
                      </span>
                      {article.review_due_at && (
                        <span className="text-xs text-gray-600">
                          {t('organizerDashboard.reviewDeadlineShort', { date: formatDateTime(article.review_due_at) })}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedArticle(article);
                      fetchArticleDetails(article.id);
                    }}
                    className="ml-4 app-btn-primary"
                  >
                    {t('organizerDashboard.manageStatusButton')}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {renderPagination(articlePage, pagedArticles.totalPages, setArticlePage)}
        </>
      )}
    </div>
  );

  const renderReviewsPage = () => (
    <div className="app-page">
      <h1 className="app-page-title">{t('layout.nav.allReviews')}</h1>
      <div className="app-card p-4">
        <div className="dashboard-search-grid">
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
            value={recommendationFilter}
            onChange={(event) =>
              setRecommendationFilter(event.target.value as 'all' | 'accept' | 'accept_with_comments' | 'reject')
            }
            className="app-input"
          >
            <option value="all">{t('common.allRecommendations')}</option>
            <option value="accept">{t('recommendation.accept')}</option>
            <option value="accept_with_comments">{t('recommendation.accept_with_comments')}</option>
            <option value="reject">{t('recommendation.reject')}</option>
          </select>
        </div>
      </div>
      <div className="app-card">
        <div className="app-card-header">
          <h2 className="text-lg font-medium text-gray-900">{t('layout.nav.allReviews')}</h2>
        </div>
        {filteredReviews.length === 0 ? (
          <div className="app-empty-state">
            <FileText className="app-empty-icon" />
            <h3 className="app-empty-title">{t('reviewerDashboard.emptyReviewsTitle')}</h3>
            <p className="app-empty-description">{t('reviewerDashboard.emptyReviewsDescription')}</p>
          </div>
        ) : (
          <>
            <div className="app-list-divider">
              {pagedReviews.pageItems.map((review) => (
                <div key={review.id} className="app-list-item">
                  <h4 className="text-md font-medium text-gray-900">{review.articles?.title}</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    {t('common.by', { name: review.profiles?.full_name ?? t('common.noData') })}
                    {' - '}
                    {t('common.reviewedOn', { date: formatDate(review.submitted_at || review.created_at) })}
                  </p>
                  <div className="mt-2 flex items-center space-x-4">
                    <span className="text-sm text-gray-600">{t('common.rating', { rating: review.rating })}</span>
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
              ))}
            </div>
            {renderPagination(reviewsPage, pagedReviews.totalPages, setReviewsPage)}
          </>
        )}
      </div>
    </div>
  );

  const renderManageDetails = () => {
    if (!selectedArticle) return null;

    return (
      <div className="app-page">
        <div className="flex items-center justify-between">
          <h1 className="app-page-title">{t('organizerDashboard.manageArticleStatusTitle')}</h1>
          <button onClick={() => setSelectedArticle(null)} className="app-btn-ghost">
            {t('common.backToArticles')}
          </button>
        </div>

        <div className="app-card app-list-item app-page">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">{selectedArticle.title}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('common.by', { name: selectedArticle.profiles?.full_name ?? t('common.noData') })}
              {' - '}
              {t('common.submittedOn', { date: formatDate(selectedArticle.submitted_at) })}
            </p>
          </div>

          <p className="text-gray-700 leading-relaxed">{selectedArticle.abstract}</p>

          {selectedArticle.file_url && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-1">{t('common.articleFile')}</h3>
              {articleFileUrl ? (
                <a href={articleFileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                  {selectedArticle.file_name || t('common.downloadPdf')}
                </a>
              ) : (
                <p className="text-sm text-gray-500">
                  {articleFileLoading ? t('auth.submitLoading') : t('common.noData')}
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSaveSchedule} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="datetime-local"
              value={reviewDueAt}
              onChange={(event) => setReviewDueAt(event.target.value)}
              className="app-input"
            />
            <input
              type="datetime-local"
              value={presentationStartsAt}
              onChange={(event) => setPresentationStartsAt(event.target.value)}
              className="app-input"
            />
            <input
              value={presentationLocation}
              onChange={(event) => setPresentationLocation(event.target.value)}
              placeholder={t('organizerDashboard.presentationLocationPlaceholder')}
              className="app-input"
            />
            <button type="submit" disabled={savingSchedule} className="app-btn-primary">
              {savingSchedule ? t('organizerDashboard.savingSchedule') : t('organizerDashboard.saveSchedule')}
            </button>
          </form>

          <form onSubmit={handleAssignReviewer} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select
              value={selectedReviewerId}
              onChange={(event) => setSelectedReviewerId(event.target.value)}
              className="app-input"
              required
            >
              <option value="">{t('organizerDashboard.selectReviewerPlaceholder')}</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {reviewer.full_name}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={assignmentDueAt}
              onChange={(event) => setAssignmentDueAt(event.target.value)}
              className="app-input"
            />
            <button type="submit" disabled={assigning || !selectedReviewerId} className="bg-indigo-600 text-white px-4 py-2 rounded-md">
              {assigning ? t('organizerDashboard.assigningReviewer') : t('organizerDashboard.assignReviewerButton')}
            </button>
          </form>

          {assignments.length > 0 && (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="flex items-center justify-between border border-gray-200 rounded-md p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{assignment.profiles?.full_name}</p>
                    <p className="text-xs text-gray-500">
                      {assignment.due_at
                        ? t('organizerDashboard.assignmentDueAt', { date: formatDateTime(assignment.due_at) })
                        : t('organizerDashboard.noDeadline')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{t(`organizerDashboard.assignmentState.${getAssignmentState(assignment)}`)}</span>
                    <button type="button" onClick={() => handleDeleteAssignment(assignment.id)} className="text-sm text-red-600">
                      {t('common.remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {articleReviews.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-gray-900">
                {t('organizerDashboard.reviewsTitle', { count: articleReviews.length })}
              </h3>
              {articleReviews.map((review) => (
                <div key={review.id} className="border border-gray-200 rounded-md p-3">
                  <p className="text-sm font-medium text-gray-900">{review.profiles?.full_name}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-xs text-gray-600">{t('common.rating', { rating: review.rating })}</span>
                    <span className="text-xs text-gray-600">{getRecommendationLabel(review.recommendation)}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{review.content}</p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleStatusUpdate} className="space-y-3">
            <h3 className="text-lg font-medium text-gray-900">{t('organizerDashboard.updateStatusTitle')}</h3>
            <select
              value={newStatus}
              onChange={(event) => setNewStatus(event.target.value as ArticleStatus | '')}
              className="app-input"
            >
              <option value="">{t('organizerDashboard.selectStatusPlaceholder')}</option>
              <option value="under_review">{t('articleStatus.under_review')}</option>
              <option value="accepted">{t('articleStatus.accepted')}</option>
              <option value="accepted_with_comments">{t('articleStatus.accepted_with_comments')}</option>
              <option value="rejected">{t('articleStatus.rejected')}</option>
            </select>
            <textarea
              rows={3}
              value={statusComments}
              onChange={(event) => setStatusComments(event.target.value)}
              placeholder={t('organizerDashboard.commentsPlaceholder')}
              className="app-input"
            />
            <button type="submit" disabled={updating || !newStatus} className="app-btn-primary">
              {updating ? t('organizerDashboard.updateStatusLoading') : t('organizerDashboard.updateStatusButton')}
            </button>
          </form>

          {statusHistory.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-medium text-gray-900">{t('organizerDashboard.statusHistoryTitle')}</h3>
              {statusHistory.map((history) => (
                <div key={history.id} className="border border-gray-200 rounded-md p-3">
                  <p className="text-xs text-gray-500">{formatDateTime(history.created_at)}</p>
                  <p className="text-sm text-gray-700">
                    {history.old_status ? `${getStatusLabel(history.old_status)} -> ` : ''}
                    {getStatusLabel(history.new_status)}
                  </p>
                  {history.comments && <p className="text-sm text-gray-600 mt-1">{history.comments}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderManagePage = () => {
    if (selectedArticle) return renderManageDetails();
    return (
      <div className="app-page">
        <h1 className="app-page-title">{t('layout.nav.manageStatus')}</h1>
        {renderFilters()}
        {renderArticlesList()}
      </div>
    );
  };

  const renderDashboardPage = () => (
    <div className="app-page">
      <h1 className="app-page-title">{t('organizerDashboard.pageTitle')}</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="dashboard-stat-card">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">{t('organizerDashboard.totalArticles')}</p>
              <p className="text-2xl font-bold text-gray-900">{articles.length}</p>
            </div>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">{t('organizerDashboard.underReview')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {articles.filter((article) => article.status === 'under_review').length}
              </p>
            </div>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">{t('organizerDashboard.accepted')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {articles.filter((article) => article.status === 'accepted' || article.status === 'accepted_with_comments').length}
              </p>
            </div>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-purple-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">{t('organizerDashboard.reviewsCount')}</p>
              <p className="text-2xl font-bold text-gray-900">{reviews.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="app-card p-4">
        <button
          type="button"
          onClick={() => exportArticles('all')}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800"
        >
          <FileDown className="h-4 w-4" />
          <span>{t('organizerDashboard.exportFiltered')}</span>
        </button>
      </div>

      {renderFilters()}
      {renderArticlesList()}
    </div>
  );

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-spinner"></div>
      </div>
    );
  }

  if (currentPage === 'reviews') return renderReviewsPage();
  if (currentPage === 'manage') return renderManagePage();
  return renderDashboardPage();
};

export default OrganizerDashboard;


