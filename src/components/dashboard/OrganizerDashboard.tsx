import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
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
  Conference,
  ConferenceSection,
  ConferenceStatus,
  Profile,
  Review,
} from '../../types/database.types';
import { useAuth } from '../../contexts/AuthContext';
import { downloadCsv } from '../../utils/csv';
import { paginateItems } from '../../utils/pagination';
import { getStoragePathFromFileUrl } from '../../utils/articleFiles';
import {
  formatDateByPreferences,
  formatDateTimeByPreferences,
  getStoredListSortOption,
  getStoredPageSize,
  setListSortPreference,
} from '../../utils/preferences';

interface OrganizerDashboardProps {
  currentPage?: 'dashboard' | 'conferences' | 'reviews' | 'manage';
  navigationEvent?: number;
}

interface ConferenceArticleSummary {
  id: string;
  title: string;
  status: ArticleStatus;
  submitted_at: string;
  profiles?: Pick<Profile, 'full_name'> | null;
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
const CONFERENCE_SORT_OPTIONS = ['start_desc', 'start_asc', 'title_asc', 'title_desc'] as const;
type ConferenceSortOption = (typeof CONFERENCE_SORT_OPTIONS)[number];
const CONFERENCE_STATUS_OPTIONS: ConferenceStatus[] = [
  'draft',
  'announced',
  'submission_open',
  'reviewing',
  'closed',
  'archived',
];

const OrganizerDashboard: React.FC<OrganizerDashboardProps> = ({
  currentPage = 'dashboard',
  navigationEvent = 0,
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'en';
  const { user } = useAuth();

  const [articles, setArticles] = useState<Article[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [selectedConference, setSelectedConference] = useState<Conference | null>(null);
  const [selectedConferenceSections, setSelectedConferenceSections] = useState<ConferenceSection[]>([]);
  const [selectedConferenceArticles, setSelectedConferenceArticles] = useState<ConferenceArticleSummary[]>([]);
  const [conferenceDetailsLoading, setConferenceDetailsLoading] = useState(false);
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
  const [conferenceFilter, setConferenceFilter] = useState<string>('all');
  const [reviewsSearch, setReviewsSearch] = useState('');
  const [conferenceSearch, setConferenceSearch] = useState('');
  const [conferenceStatusFilter, setConferenceStatusFilter] = useState<'all' | ConferenceStatus>('all');
  const [conferenceVisibilityFilter, setConferenceVisibilityFilter] = useState<
    'all' | 'public' | 'private'
  >('all');
  const [recommendationFilter, setRecommendationFilter] = useState<
    'all' | 'accept' | 'accept_with_comments' | 'reject'
  >('all');
  const [articleSort, setArticleSort] = useState<ArticleSortOption>(() =>
    getStoredListSortOption('organizer.articles', ARTICLE_SORT_OPTIONS, 'date_desc'),
  );
  const [reviewsSort, setReviewsSort] = useState<ReviewSortOption>(() =>
    getStoredListSortOption('organizer.reviews', REVIEW_SORT_OPTIONS, 'date_desc'),
  );
  const [conferenceSort, setConferenceSort] = useState<ConferenceSortOption>(() =>
    getStoredListSortOption('organizer.conferences', CONFERENCE_SORT_OPTIONS, 'start_desc'),
  );
  const [articlePage, setArticlePage] = useState(1);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [conferencePage, setConferencePage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [proceedingsMode, setProceedingsMode] = useState<'conference' | 'all' | 'date' | 'manual'>(
    'conference',
  );
  const [proceedingsConferenceId, setProceedingsConferenceId] = useState('');
  const [proceedingsFromDate, setProceedingsFromDate] = useState('');
  const [proceedingsToDate, setProceedingsToDate] = useState('');
  const [proceedingsDateIncludeAllStatuses, setProceedingsDateIncludeAllStatuses] = useState(false);
  const [selectedProceedingsIds, setSelectedProceedingsIds] = useState<string[]>([]);
  const [generatingProceedings, setGeneratingProceedings] = useState(false);
  const [proceedingsMessage, setProceedingsMessage] = useState('');
  const [proceedingsError, setProceedingsError] = useState('');
  const defaultConferenceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv';
  const [conferenceTitle, setConferenceTitle] = useState('');
  const [conferenceDescription, setConferenceDescription] = useState('');
  const [conferenceThesisRequirements, setConferenceThesisRequirements] = useState('');
  const [conferenceStartDate, setConferenceStartDate] = useState('');
  const [conferenceEndDate, setConferenceEndDate] = useState('');
  const [conferenceSubmissionStartAt, setConferenceSubmissionStartAt] = useState('');
  const [conferenceSubmissionEndAt, setConferenceSubmissionEndAt] = useState('');
  const [conferenceTimezone, setConferenceTimezone] = useState(defaultConferenceTimezone);
  const [conferenceLocation, setConferenceLocation] = useState('');
  const [conferenceStatus, setConferenceStatus] = useState<ConferenceStatus>('draft');
  const [conferenceIsPublic, setConferenceIsPublic] = useState(true);
  const [conferenceCreateExpanded, setConferenceCreateExpanded] = useState(false);
  const [creatingConference, setCreatingConference] = useState(false);
  const [conferenceCreateMessage, setConferenceCreateMessage] = useState('');
  const [conferenceCreateError, setConferenceCreateError] = useState('');

  const [articleFileUrl, setArticleFileUrl] = useState<string | null>(null);
  const [articleFileLoading, setArticleFileLoading] = useState(false);

  const pageSize = getStoredPageSize();
  const formatDate = (date: string) => formatDateByPreferences(date, locale);
  const formatDateTime = (date: string) => formatDateTimeByPreferences(date, locale);
  const getStatusLabel = (status: string) => t(`articleStatus.${status}`);
  const getConferenceStatusLabel = (status: ConferenceStatus) => t(`conferenceStatus.${status}`);
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
  const resetConferenceForm = () => {
    setConferenceTitle('');
    setConferenceDescription('');
    setConferenceThesisRequirements('');
    setConferenceStartDate('');
    setConferenceEndDate('');
    setConferenceSubmissionStartAt('');
    setConferenceSubmissionEndAt('');
    setConferenceTimezone(defaultConferenceTimezone);
    setConferenceLocation('');
    setConferenceStatus('draft');
    setConferenceIsPublic(true);
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

  const getConferenceStatusColor = (status: ConferenceStatus) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-700';
      case 'announced':
        return 'bg-indigo-100 text-indigo-700';
      case 'submission_open':
        return 'bg-blue-100 text-blue-700';
      case 'reviewing':
        return 'bg-amber-100 text-amber-700';
      case 'closed':
        return 'bg-rose-100 text-rose-700';
      case 'archived':
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  useEffect(() => {
    fetchAllArticles();
    fetchAllReviews();
    fetchReviewers();
    fetchConferences();
  }, []);

  useEffect(() => {
    setSelectedArticle(null);
    setSelectedConference(null);
    setSelectedConferenceSections([]);
    setSelectedConferenceArticles([]);
    setConferenceDetailsLoading(false);
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
    if (currentPage === 'conferences') {
      setSelectedConference(null);
      setSelectedConferenceSections([]);
      setSelectedConferenceArticles([]);
      setConferenceDetailsLoading(false);
      return;
    }

    if (currentPage === 'dashboard' || currentPage === 'manage') {
      setSelectedConference(null);
      setSelectedConferenceSections([]);
      setSelectedConferenceArticles([]);
      setConferenceDetailsLoading(false);
      setSelectedArticle(null);
      setArticleReviews([]);
      setStatusHistory([]);
      setAssignments([]);
    }
  }, [navigationEvent, currentPage]);

  useEffect(() => {
    setArticlePage(1);
  }, [articleSearch, articleStatusFilter, conferenceFilter, articleSort]);

  useEffect(() => {
    setReviewsPage(1);
  }, [reviewsSearch, recommendationFilter, conferenceFilter, reviewsSort]);

  useEffect(() => {
    setConferencePage(1);
  }, [conferenceSearch, conferenceStatusFilter, conferenceVisibilityFilter, conferenceSort]);

  useEffect(() => {
    setListSortPreference('organizer.articles', articleSort);
  }, [articleSort]);

  useEffect(() => {
    setListSortPreference('organizer.reviews', reviewsSort);
  }, [reviewsSort]);

  useEffect(() => {
    setListSortPreference('organizer.conferences', conferenceSort);
  }, [conferenceSort]);

  useEffect(() => {
    if (!proceedingsConferenceId && conferences.length > 0) {
      setProceedingsConferenceId(conferences[0].id);
    }
  }, [conferences, proceedingsConferenceId]);

  useEffect(() => {
    if (!proceedingsMessage) return;
    const timeoutId = window.setTimeout(() => setProceedingsMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [proceedingsMessage]);

  useEffect(() => {
    if (!conferenceCreateMessage) return;
    const timeoutId = window.setTimeout(() => setConferenceCreateMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [conferenceCreateMessage]);

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
          profiles!articles_author_id_fkey(full_name, institution),
          conferences:conference_id(id, title)
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
          articles!inner(
            title,
            conference_id,
            conferences:conference_id(id, title)
          ),
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

  const fetchConferences = async () => {
    try {
      const { data, error } = await supabase
        .from('conferences')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      setConferences((data as Conference[]) || []);
    } catch (error) {
      console.error('Error fetching conferences:', error);
    }
  };

  const fetchConferenceDetails = async (conferenceId: string) => {
    try {
      setConferenceDetailsLoading(true);
      const [conferenceResult, sectionsResult, articlesResult] = await Promise.all([
        supabase.from('conferences').select('*').eq('id', conferenceId).single(),
        supabase
          .from('conference_sections')
          .select('*')
          .eq('conference_id', conferenceId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('articles')
          .select(
            `
            id,
            title,
            status,
            submitted_at,
            profiles:author_id(full_name)
          `,
          )
          .eq('conference_id', conferenceId)
          .order('submitted_at', { ascending: false }),
      ]);

      if (conferenceResult.error) throw conferenceResult.error;
      if (sectionsResult.error) throw sectionsResult.error;
      if (articlesResult.error) throw articlesResult.error;

      const normalizedConferenceArticles: ConferenceArticleSummary[] = ((articlesResult.data as Array<{
        id: string;
        title: string;
        status: ArticleStatus;
        submitted_at: string;
        profiles?: { full_name?: string } | Array<{ full_name?: string }> | null;
      }>) || []).map((article) => ({
        id: article.id,
        title: article.title,
        status: article.status,
        submitted_at: article.submitted_at,
        profiles: Array.isArray(article.profiles)
          ? article.profiles[0]
            ? { full_name: article.profiles[0].full_name || '' }
            : null
          : article.profiles
            ? { full_name: article.profiles.full_name || '' }
            : null,
      }));

      setSelectedConference(conferenceResult.data as Conference);
      setSelectedConferenceSections((sectionsResult.data as ConferenceSection[]) || []);
      setSelectedConferenceArticles(normalizedConferenceArticles);
    } catch (error) {
      console.error('Error fetching conference details:', error);
    } finally {
      setConferenceDetailsLoading(false);
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

  const handleCreateConference = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;

    const normalizedTitle = conferenceTitle.trim();
    if (!normalizedTitle) {
      setConferenceCreateExpanded(true);
      setConferenceCreateError(t('organizerDashboard.conferenceValidationTitle'));
      setConferenceCreateMessage('');
      return;
    }

    if (conferenceStartDate && conferenceEndDate && conferenceEndDate < conferenceStartDate) {
      setConferenceCreateExpanded(true);
      setConferenceCreateError(t('organizerDashboard.conferenceValidationDateRange'));
      setConferenceCreateMessage('');
      return;
    }

    if (
      conferenceSubmissionStartAt &&
      conferenceSubmissionEndAt &&
      new Date(conferenceSubmissionEndAt).getTime() < new Date(conferenceSubmissionStartAt).getTime()
    ) {
      setConferenceCreateExpanded(true);
      setConferenceCreateError(t('organizerDashboard.conferenceValidationSubmissionWindow'));
      setConferenceCreateMessage('');
      return;
    }

    setCreatingConference(true);
    setConferenceCreateError('');
    try {
      const { data, error } = await supabase
        .from('conferences')
        .insert([
          {
            title: normalizedTitle,
            description: conferenceDescription.trim() || null,
            thesis_requirements: conferenceThesisRequirements.trim() || null,
            start_date: conferenceStartDate,
            end_date: conferenceEndDate,
            submission_start_at: fromInputDateTime(conferenceSubmissionStartAt),
            submission_end_at: fromInputDateTime(conferenceSubmissionEndAt),
            organizer_id: user.id,
            status: conferenceStatus,
            timezone: conferenceTimezone.trim() || 'Europe/Kyiv',
            location: conferenceLocation.trim() || null,
            is_public: conferenceIsPublic,
          },
        ])
        .select('id, title, start_date, end_date, status, is_public')
        .single();
      if (error) throw error;

      setConferenceCreateMessage(
        t('organizerDashboard.conferenceCreateSuccess', { title: data.title }),
      );
      resetConferenceForm();
      setConferenceCreateExpanded(false);
      await fetchConferences();
      setProceedingsConferenceId(data.id);
    } catch (error) {
      console.error('Error creating conference:', error);
      setConferenceCreateExpanded(true);
      setConferenceCreateError(t('organizerDashboard.conferenceCreateError'));
    } finally {
      setCreatingConference(false);
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

  const handleOpenArticle = (article: Article) => {
    setSelectedArticle(article);
    setArticleReviews([]);
    setStatusHistory([]);
    setAssignments([]);
    fetchArticleDetails(article.id);
  };

  const handleOpenConference = (conference: Conference) => {
    setSelectedConference(conference);
    setSelectedConferenceSections([]);
    setSelectedConferenceArticles([]);
    fetchConferenceDetails(conference.id);
  };

  const handleOpenConferenceFromArticle = async () => {
    if (!selectedArticle?.conference_id) return;
    await fetchConferenceDetails(selectedArticle.conference_id);
  };

  const searchConferenceArticles = useMemo(() => {
    const query = articleSearch.trim().toLowerCase();
    return articles.filter((article) => {
      const matchesConference = conferenceFilter === 'all' || article.conference_id === conferenceFilter;
      const matchesQuery =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.abstract.toLowerCase().includes(query) ||
        (article.profiles?.full_name || '').toLowerCase().includes(query) ||
        (article.conferences?.title || '').toLowerCase().includes(query);
      return matchesConference && matchesQuery;
    });
  }, [articles, articleSearch, conferenceFilter]);

  const filteredArticles = useMemo(() => {
    return searchConferenceArticles.filter((article) => {
      const matchesStatus = articleStatusFilter === 'all' || article.status === articleStatusFilter;
      return matchesStatus;
    });
  }, [searchConferenceArticles, articleStatusFilter]);

  const filteredReviews = useMemo(() => {
    const query = reviewsSearch.trim().toLowerCase();
    return reviews.filter((review) => {
      const matchesRecommendation = recommendationFilter === 'all' || review.recommendation === recommendationFilter;
      const matchesConference =
        conferenceFilter === 'all' || review.articles?.conference_id === conferenceFilter;
      const matchesQuery =
        !query ||
        (review.articles?.title || '').toLowerCase().includes(query) ||
        (review.profiles?.full_name || '').toLowerCase().includes(query) ||
        review.content.toLowerCase().includes(query);
      return matchesRecommendation && matchesConference && matchesQuery;
    });
  }, [reviews, reviewsSearch, recommendationFilter, conferenceFilter]);

  const filteredConferences = useMemo(() => {
    const query = conferenceSearch.trim().toLowerCase();
    return conferences.filter((conference) => {
      const matchesQuery =
        !query ||
        conference.title.toLowerCase().includes(query) ||
        (conference.location || '').toLowerCase().includes(query);
      const matchesStatus =
        conferenceStatusFilter === 'all' || conference.status === conferenceStatusFilter;
      const matchesVisibility =
        conferenceVisibilityFilter === 'all' ||
        (conferenceVisibilityFilter === 'public' && conference.is_public) ||
        (conferenceVisibilityFilter === 'private' && !conference.is_public);
      return matchesQuery && matchesStatus && matchesVisibility;
    });
  }, [conferences, conferenceSearch, conferenceStatusFilter, conferenceVisibilityFilter]);

  const sortedArticles = useMemo(() => {
    const items = [...filteredArticles];
    switch (articleSort) {
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
  }, [filteredArticles, articleSort, locale]);

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

  const sortedConferences = useMemo(() => {
    const items = [...filteredConferences];
    switch (conferenceSort) {
      case 'start_asc':
        return items.sort(
          (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
        );
      case 'title_asc':
        return items.sort((a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base' }));
      case 'title_desc':
        return items.sort((a, b) => b.title.localeCompare(a.title, locale, { sensitivity: 'base' }));
      case 'start_desc':
      default:
        return items.sort(
          (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
        );
    }
  }, [filteredConferences, conferenceSort, locale]);

  const pagedArticles = paginateItems(sortedArticles, articlePage, pageSize);
  const pagedReviews = paginateItems(sortedReviews, reviewsPage, pageSize);
  const pagedConferences = paginateItems(sortedConferences, conferencePage, pageSize);

  useEffect(() => {
    if (pagedArticles.safePage !== articlePage) setArticlePage(pagedArticles.safePage);
  }, [articlePage, pagedArticles.safePage]);

  useEffect(() => {
    if (pagedReviews.safePage !== reviewsPage) setReviewsPage(pagedReviews.safePage);
  }, [reviewsPage, pagedReviews.safePage]);

  useEffect(() => {
    if (pagedConferences.safePage !== conferencePage) setConferencePage(pagedConferences.safePage);
  }, [conferencePage, pagedConferences.safePage]);

  const acceptedArticles = useMemo(
    () =>
      articles.filter(
        (article) => article.status === 'accepted' || article.status === 'accepted_with_comments',
      ),
    [articles],
  );

  const proceedingsPoolCount = useMemo(() => {
    if (proceedingsMode === 'conference') {
      if (!proceedingsConferenceId) return 0;
      return acceptedArticles.filter((article) => article.conference_id === proceedingsConferenceId).length;
    }
    if (proceedingsMode === 'date') {
      const source = proceedingsDateIncludeAllStatuses ? articles : acceptedArticles;
      const fromDate = proceedingsFromDate
        ? new Date(`${proceedingsFromDate}T00:00:00`).getTime()
        : null;
      const toDate = proceedingsToDate ? new Date(`${proceedingsToDate}T23:59:59.999`).getTime() : null;
      return source.filter((article) => {
        const submittedAt = new Date(article.submitted_at).getTime();
        if (fromDate !== null && submittedAt < fromDate) return false;
        if (toDate !== null && submittedAt > toDate) return false;
        return true;
      }).length;
    }
    if (proceedingsMode === 'manual') {
      return articles.length;
    }
    return acceptedArticles.length;
  }, [
    proceedingsMode,
    proceedingsConferenceId,
    proceedingsDateIncludeAllStatuses,
    proceedingsFromDate,
    proceedingsToDate,
    articles,
    acceptedArticles,
  ]);

  useEffect(() => {
    setSelectedProceedingsIds((prev) =>
      prev.filter((id) => articles.some((article) => article.id === id)),
    );
  }, [articles]);

  const exportArticles = (mode: 'accepted' | 'rejected' | 'all') => {
    const source =
      mode === 'all'
        ? filteredArticles
        : searchConferenceArticles.filter((article) =>
            mode === 'accepted'
              ? article.status === 'accepted' || article.status === 'accepted_with_comments'
              : article.status === 'rejected',
          );
    const filename =
      mode === 'accepted' ? 'articles_accepted.csv' : mode === 'rejected' ? 'articles_rejected.csv' : 'articles.csv';

    downloadCsv(
      filename,
      [
        'Id',
        'Title',
        'Author',
        'Institution',
        'Conference',
        'ConferenceId',
        'SectionId',
        'Language',
        'StatusCode',
        'StatusLabel',
        'SubmittedAt',
        'ReviewDueAt',
        'PresentationStartsAt',
        'PresentationLocation',
        'FileName',
      ],
      source.map((article) => [
        article.id,
        article.title,
        article.profiles?.full_name || '',
        article.profiles?.institution || '',
        article.conferences?.title || '',
        article.conference_id || '',
        article.section_id || '',
        article.language || '',
        article.status,
        getStatusLabel(article.status),
        formatDateTime(article.submitted_at),
        article.review_due_at ? formatDateTime(article.review_due_at) : '',
        article.presentation_starts_at ? formatDateTime(article.presentation_starts_at) : '',
        article.presentation_location || '',
        article.file_name || '',
      ]),
    );
  };

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const toFilenameSegment = (value: string, fallback: string) => {
    const cleaned = value
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '');
    return (cleaned || fallback).slice(0, 60);
  };

  const getProceedingsFilename = (selectedCount: number) => {
    const dateSuffix = new Date().toISOString().slice(0, 10);

    if (proceedingsMode === 'conference') {
      const conferenceTitle =
        conferences.find((conference) => conference.id === proceedingsConferenceId)?.title || '';
      const conferencePart = toFilenameSegment(conferenceTitle, 'conference');
      return `proceedings_conference_${conferencePart}_${dateSuffix}.doc`;
    }

    if (proceedingsMode === 'date') {
      const fromPart = proceedingsFromDate || 'start';
      const toPart = proceedingsToDate || 'end';
      const statusPart = proceedingsDateIncludeAllStatuses ? 'all_statuses' : 'accepted';
      return `proceedings_date_${fromPart}_to_${toPart}_${statusPart}_${dateSuffix}.doc`;
    }

    if (proceedingsMode === 'manual') {
      return `proceedings_manual_${selectedCount}_articles_${dateSuffix}.doc`;
    }

    return `proceedings_all_accepted_${dateSuffix}.doc`;
  };

  const getProceedingsArticles = () => {
    const sortByDate = (items: Article[]) =>
      [...items].sort(
        (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime(),
      );

    if (proceedingsMode === 'conference') {
      if (!proceedingsConferenceId) return [];
      return sortByDate(
        acceptedArticles.filter((article) => article.conference_id === proceedingsConferenceId),
      );
    }

    if (proceedingsMode === 'all') {
      return sortByDate(acceptedArticles);
    }

    if (proceedingsMode === 'manual') {
      return sortByDate(articles.filter((article) => selectedProceedingsIds.includes(article.id)));
    }

    const fromDate = proceedingsFromDate
      ? new Date(`${proceedingsFromDate}T00:00:00`).getTime()
      : null;
    const toDate = proceedingsToDate ? new Date(`${proceedingsToDate}T23:59:59.999`).getTime() : null;
    const dateSource = proceedingsDateIncludeAllStatuses ? articles : acceptedArticles;

    return sortByDate(
      dateSource.filter((article) => {
        const submittedAt = new Date(article.submitted_at).getTime();
        if (fromDate !== null && submittedAt < fromDate) return false;
        if (toDate !== null && submittedAt > toDate) return false;
        return true;
      }),
    );
  };

  const buildProceedingsDocHtml = (items: Article[]) => {
    const generatedAt = new Date().toLocaleString(i18n.resolvedLanguage);
    const sections = items
      .map((article, index) => {
        const keywords = Array.isArray(article.keywords) ? article.keywords.join(', ') : '';
        const fileName = article.file_name || '';

        return `
          <div class="article-block ${index > 0 ? 'page-break' : ''}">
            <h2>${index + 1}. ${escapeHtml(article.title)}</h2>
            <p><strong>${escapeHtml(t('app.fullName'))}:</strong> ${escapeHtml(article.profiles?.full_name || t('common.noData'))}</p>
            <p><strong>${escapeHtml(t('app.institution'))}:</strong> ${escapeHtml(article.profiles?.institution || t('common.noData'))}</p>
            <p><strong>${escapeHtml(t('articleStatus.accepted'))}:</strong> ${escapeHtml(getStatusLabel(article.status))}</p>
            <p><strong>${escapeHtml(t('common.submittedOn', { date: '' }).replace(/\s+$/, ''))}:</strong> ${escapeHtml(formatDate(article.submitted_at))}</p>
            <p><strong>${escapeHtml(t('submitArticle.keywordsLabel'))}:</strong> ${escapeHtml(keywords || t('common.noData'))}</p>
            <h3>${escapeHtml(t('submitArticle.abstractLabel'))}</h3>
            <p>${escapeHtml(article.abstract)}</p>
            <p><strong>${escapeHtml(t('common.articleFile'))}:</strong> ${escapeHtml(fileName || t('common.noData'))}</p>
          </div>
        `;
      })
      .join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(t('organizerDashboard.proceedingsDocumentTitle'))}</title>
          <style>
            body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.5; color: #111; }
            h1 { font-size: 22pt; margin: 0 0 8pt; }
            h2 { font-size: 16pt; margin: 16pt 0 8pt; }
            h3 { font-size: 13pt; margin: 12pt 0 6pt; }
            p { margin: 4pt 0; }
            .meta { color: #333; margin-bottom: 16pt; }
            .page-break { page-break-before: always; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(t('organizerDashboard.proceedingsDocumentTitle'))}</h1>
          <p class="meta">${escapeHtml(t('organizerDashboard.proceedingsReadmeGeneratedAt'))}: ${escapeHtml(generatedAt)}</p>
          <p class="meta">${escapeHtml(t('organizerDashboard.proceedingsReadmeIncluded'))}: ${items.length}</p>
          ${sections}
        </body>
      </html>
    `;
  };

  const handleGenerateProceedings = () => {
    if (generatingProceedings) return;

    setProceedingsMessage('');
    setProceedingsError('');
    setGeneratingProceedings(true);

    try {
      const proceedingsArticles = getProceedingsArticles();
      if (proceedingsArticles.length === 0) {
        setProceedingsError(t('organizerDashboard.proceedingsNoSelection'));
        return;
      }

      const html = buildProceedingsDocHtml(proceedingsArticles);
      const docBlob = new Blob(['\ufeff', html], {
        type: 'application/msword;charset=utf-8',
      });
      downloadBlob(getProceedingsFilename(proceedingsArticles.length), docBlob);

      setProceedingsMessage(t('organizerDashboard.proceedingsCreatedDoc', { count: proceedingsArticles.length }));
    } catch (error) {
      console.error('Error generating proceedings:', error);
      setProceedingsError(t('organizerDashboard.proceedingsCreateDocError'));
    } finally {
      setGeneratingProceedings(false);
    }
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
      <div className="dashboard-filters-toolbar">
        <div className="dashboard-search-field dashboard-filters-search-full">
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
          className="app-input dashboard-filters-select dashboard-filters-select-status"
        >
          <option value="all">{t('common.allStatuses')}</option>
          <option value="submitted">{t('articleStatus.submitted')}</option>
          <option value="under_review">{t('articleStatus.under_review')}</option>
          <option value="accepted">{t('articleStatus.accepted')}</option>
          <option value="accepted_with_comments">{t('articleStatus.accepted_with_comments')}</option>
          <option value="rejected">{t('articleStatus.rejected')}</option>
        </select>
        <select
          value={conferenceFilter}
          onChange={(event) => setConferenceFilter(event.target.value)}
          className="app-input dashboard-filters-select dashboard-filters-select-conference"
        >
          <option value="all">{t('common.allConferences')}</option>
          {conferences.map((conference) => (
            <option key={conference.id} value={conference.id}>
              {conference.title}
            </option>
          ))}
        </select>
        <select
          value={articleSort}
          onChange={(event) => setArticleSort(event.target.value as ArticleSortOption)}
          className="app-input dashboard-filters-select dashboard-filters-select-sort"
        >
          <option value="date_desc">{t('common.newestFirst')}</option>
          <option value="date_asc">{t('common.oldestFirst')}</option>
          <option value="title_asc">{t('common.titleAZ')}</option>
          <option value="title_desc">{t('common.titleZA')}</option>
        </select>
      </div>
    </div>
  );

  const renderArticlesList = (withManageAction = false) => (
    <div className="app-card">
      <div className="app-card-header flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-gray-900">{t('organizerDashboard.allArticlesTitle')}</h2>
        <button
          type="button"
          onClick={() => exportArticles('all')}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-gray-700 text-white hover:bg-gray-800"
        >
          <FileDown className="h-4 w-4" />
          <span>{t('organizerDashboard.exportFiltered')}</span>
        </button>
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
              <div
                key={article.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenArticle(article)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleOpenArticle(article);
                  }
                }}
                className="app-list-item hover:bg-gray-50 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex justify-between items-start gap-4">
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
                  <div className="ml-4 flex items-center">
                    <span className="text-xs text-gray-500">
                      {withManageAction ? t('organizerDashboard.manageStatusButton') : t('authorDashboard.viewArticleButton')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {renderPagination(articlePage, pagedArticles.totalPages, setArticlePage)}
        </>
      )}
    </div>
  );

  const renderArticleDetails = () => {
    if (!selectedArticle) return null;

    return (
      <div className="app-page">
        <div className="flex items-center justify-between">
          <h1 className="app-page-title">{t('authorDashboard.articleDetailsTitle')}</h1>
          <button onClick={() => setSelectedArticle(null)} className="app-btn-ghost">
            {t('common.backToArticles')}
          </button>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{selectedArticle.title}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {t('common.by', { name: selectedArticle.profiles?.full_name ?? t('common.noData') })}
                  {' - '}
                  {t('common.submittedOn', { date: formatDate(selectedArticle.submitted_at) })}
                </p>
                {selectedArticle.conferences?.title && (
                  <p className="text-sm text-gray-600 mt-1">{selectedArticle.conferences.title}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {getStatusIcon(selectedArticle.status)}
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedArticle.status)}`}>
                  {getStatusLabel(selectedArticle.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="app-card-body app-page">
            {selectedArticle.conference_id && (
              <button
                type="button"
                onClick={() => {
                  void handleOpenConferenceFromArticle();
                }}
                disabled={conferenceDetailsLoading}
                className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700">
                      {t('authorDashboard.conferenceInfoTitle')}
                    </h3>
                    <p className="text-sm text-gray-900 mt-1">
                      {selectedArticle.conferences?.title ||
                        conferences.find((conference) => conference.id === selectedArticle.conference_id)?.title ||
                        t('common.noData')}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm text-blue-700">
                    <CalendarDays className="h-4 w-4" />
                    {conferenceDetailsLoading ? t('auth.submitLoading') : t('authorDashboard.openConferenceDetails')}
                  </span>
                </div>
              </button>
            )}

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

            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">{t('common.articleFile')}</h3>
              {selectedArticle.file_url ? (
                articleFileUrl ? (
                  <a href={articleFileUrl} target="_blank" rel="noopener noreferrer" className="app-icon-link">
                    <FileText className="h-5 w-5" />
                    <span>{selectedArticle.file_name || t('common.downloadPdf')}</span>
                  </a>
                ) : (
                  <p className="text-sm text-gray-500">
                    {articleFileLoading ? t('auth.submitLoading') : t('common.noData')}
                  </p>
                )
              ) : (
                <p className="text-sm text-gray-500">{t('common.noData')}</p>
              )}
            </div>
          </div>
        </div>

        <div className="app-card">
          <div className="app-card-header">
            <h3 className="text-lg font-medium text-gray-900">{t('organizerDashboard.statusHistoryTitle')}</h3>
          </div>
          {statusHistory.length === 0 ? (
            <p className="app-list-item text-sm text-gray-500">{t('common.noData')}</p>
          ) : (
            <div className="app-list-divider">
              {statusHistory.map((history) => (
                <div key={history.id} className="app-list-item">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{formatDateTime(history.created_at)}</span>
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
            <h3 className="text-lg font-medium text-gray-900">{t('organizerDashboard.reviewsTitle', { count: articleReviews.length })}</h3>
          </div>
          {articleReviews.length === 0 ? (
            <p className="app-list-item text-sm text-gray-500">{t('common.noData')}</p>
          ) : (
            <div className="app-list-divider">
              {articleReviews.map((review) => (
                <div key={review.id} className="app-list-item">
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
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReviewsPage = () => (
    <div className="app-page">
      <h1 className="app-page-title">{t('layout.nav.allReviews')}</h1>
      <div className="app-card p-4">
        <div className="dashboard-search-grid dashboard-search-grid-4">
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
          <select
            value={conferenceFilter}
            onChange={(event) => setConferenceFilter(event.target.value)}
            className="app-input"
          >
            <option value="all">{t('common.allConferences')}</option>
            {conferences.map((conference) => (
              <option key={conference.id} value={conference.id}>
                {conference.title}
              </option>
              ))}
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

          {selectedArticle.conference_id && (
            <button
              type="button"
              onClick={() => {
                void handleOpenConferenceFromArticle();
              }}
              disabled={conferenceDetailsLoading}
              className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-700">
                    {t('authorDashboard.conferenceInfoTitle')}
                  </h3>
                  <p className="text-sm text-gray-900 mt-1">
                    {selectedArticle.conferences?.title ||
                      conferences.find((conference) => conference.id === selectedArticle.conference_id)?.title ||
                      t('common.noData')}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm text-blue-700">
                  <CalendarDays className="h-4 w-4" />
                  {conferenceDetailsLoading ? t('auth.submitLoading') : t('authorDashboard.openConferenceDetails')}
                </span>
              </div>
            </button>
          )}

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

  const renderManagePage = () => (
    <div className="app-page">
      <h1 className="app-page-title">{t('layout.nav.manageStatus')}</h1>
      {renderFilters()}
      {renderArticlesList(true)}
    </div>
  );

  const renderConferenceCreateCard = () => (
    <div className="app-card">
      <button
        type="button"
        onClick={() => setConferenceCreateExpanded((prev) => !prev)}
        className="w-full app-card-header flex items-start justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {t('organizerDashboard.conferenceCreateTitle')}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {t('organizerDashboard.conferenceCreateDescription')}
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-500 mt-1 transition-transform duration-200 ${
            conferenceCreateExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          conferenceCreateExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div
            className={`app-card-body space-y-3 transition-opacity duration-200 ${
              conferenceCreateExpanded ? 'opacity-100' : 'opacity-0'
            }`}
            aria-hidden={!conferenceCreateExpanded}
          >
            <form onSubmit={handleCreateConference} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="app-label">{t('organizerDashboard.conferenceTitleLabel')}</label>
                  <input
                    value={conferenceTitle}
                    onChange={(event) => setConferenceTitle(event.target.value)}
                    placeholder={t('organizerDashboard.conferenceTitlePlaceholder')}
                    className="app-input"
                    required
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.conferenceStartDateLabel')}</label>
                  <input
                    type="date"
                    value={conferenceStartDate}
                    onChange={(event) => setConferenceStartDate(event.target.value)}
                    className="app-input"
                    required
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.conferenceEndDateLabel')}</label>
                  <input
                    type="date"
                    value={conferenceEndDate}
                    onChange={(event) => setConferenceEndDate(event.target.value)}
                    className="app-input"
                    required
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.conferenceSubmissionStartLabel')}</label>
                  <input
                    type="datetime-local"
                    value={conferenceSubmissionStartAt}
                    onChange={(event) => setConferenceSubmissionStartAt(event.target.value)}
                    className="app-input"
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.conferenceSubmissionEndLabel')}</label>
                  <input
                    type="datetime-local"
                    value={conferenceSubmissionEndAt}
                    onChange={(event) => setConferenceSubmissionEndAt(event.target.value)}
                    className="app-input"
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.conferenceTimezoneLabel')}</label>
                  <input
                    value={conferenceTimezone}
                    onChange={(event) => setConferenceTimezone(event.target.value)}
                    className="app-input"
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.conferenceStatusLabel')}</label>
                  <select
                    value={conferenceStatus}
                    onChange={(event) => setConferenceStatus(event.target.value as ConferenceStatus)}
                    className="app-input"
                  >
                    {CONFERENCE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {getConferenceStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="app-label">{t('organizerDashboard.conferenceLocationLabel')}</label>
                  <input
                    value={conferenceLocation}
                    onChange={(event) => setConferenceLocation(event.target.value)}
                    placeholder={t('organizerDashboard.conferenceLocationPlaceholder')}
                    className="app-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="app-label">{t('organizerDashboard.conferenceDescriptionLabel')}</label>
                  <textarea
                    value={conferenceDescription}
                    onChange={(event) => setConferenceDescription(event.target.value)}
                    rows={3}
                    className="app-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="app-label">{t('organizerDashboard.conferenceThesisRequirementsLabel')}</label>
                  <textarea
                    value={conferenceThesisRequirements}
                    onChange={(event) => setConferenceThesisRequirements(event.target.value)}
                    rows={3}
                    className="app-input"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={conferenceIsPublic}
                      onChange={(event) => setConferenceIsPublic(event.target.checked)}
                    />
                    <span>{t('organizerDashboard.conferencePublicLabel')}</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" disabled={creatingConference} className="app-btn-primary">
                  {creatingConference
                    ? t('organizerDashboard.conferenceCreating')
                    : t('organizerDashboard.conferenceCreateButton')}
                </button>
                <button type="button" onClick={resetConferenceForm} className="app-btn-ghost">
                  {t('organizerDashboard.conferenceResetButton')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {(conferenceCreateMessage || conferenceCreateError) && (
        <div className="px-4 pb-4">
          {conferenceCreateMessage && <p className="text-sm text-green-600">{conferenceCreateMessage}</p>}
          {conferenceCreateError && <p className="text-sm text-red-600">{conferenceCreateError}</p>}
        </div>
      )}
    </div>
  );

  const renderConferencesPage = () => (
    <div className="app-page">
      <h1 className="app-page-title">{t('layout.nav.conferences')}</h1>
      {renderConferenceCreateCard()}

      <div className="app-card p-4">
        <div className="dashboard-search-grid dashboard-search-grid-4">
          <div className="dashboard-search-field">
            <Search className="dashboard-search-icon" />
            <input
              value={conferenceSearch}
              onChange={(event) => setConferenceSearch(event.target.value)}
              placeholder={t('common.searchPlaceholder')}
              className="dashboard-search-input"
            />
          </div>
          <select
            value={conferenceStatusFilter}
            onChange={(event) => setConferenceStatusFilter(event.target.value as 'all' | ConferenceStatus)}
            className="app-input"
          >
            <option value="all">{t('common.allStatuses')}</option>
            {CONFERENCE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {getConferenceStatusLabel(status)}
              </option>
            ))}
          </select>
          <select
            value={conferenceVisibilityFilter}
            onChange={(event) =>
              setConferenceVisibilityFilter(event.target.value as 'all' | 'public' | 'private')
            }
            className="app-input"
          >
            <option value="all">{t('common.allConferences')}</option>
            <option value="public">{t('organizerDashboard.conferenceVisibilityPublic')}</option>
            <option value="private">{t('organizerDashboard.conferenceVisibilityPrivate')}</option>
          </select>
          <select
            value={conferenceSort}
            onChange={(event) => setConferenceSort(event.target.value as ConferenceSortOption)}
            className="app-input"
          >
            <option value="start_desc">{t('common.newestFirst')}</option>
            <option value="start_asc">{t('common.oldestFirst')}</option>
            <option value="title_asc">{t('common.titleAZ')}</option>
            <option value="title_desc">{t('common.titleZA')}</option>
          </select>
        </div>
      </div>

      <div className="app-card">
        <div className="app-card-header flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-gray-900">{t('organizerDashboard.conferenceListTitle')}</h2>
          <span className="text-xs text-gray-500">{filteredConferences.length}</span>
        </div>
        {filteredConferences.length === 0 ? (
          <div className="app-empty-state">
            <FileText className="app-empty-icon" />
            <h3 className="app-empty-title">{t('organizerDashboard.conferenceListEmpty')}</h3>
          </div>
        ) : (
          <>
            <div className="app-list-divider">
              {pagedConferences.pageItems.map((conference) => (
                <div
                  key={conference.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenConference(conference)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleOpenConference(conference);
                    }
                  }}
                  className="app-list-item cursor-pointer hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{conference.title}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {formatDate(conference.start_date)} - {formatDate(conference.end_date)}
                      </p>
                      {conference.location && (
                        <p className="text-xs text-gray-500 mt-1">{conference.location}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`app-pill ${
                          conference.is_public
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {conference.is_public
                          ? t('organizerDashboard.conferenceVisibilityPublic')
                          : t('organizerDashboard.conferenceVisibilityPrivate')}
                      </span>
                      <span className={`app-pill ${getConferenceStatusColor(conference.status)}`}>
                        {getConferenceStatusLabel(conference.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {renderPagination(conferencePage, pagedConferences.totalPages, setConferencePage)}
          </>
        )}
      </div>
    </div>
  );

  const renderConferenceDetails = () => {
    if (!selectedConference) return null;

    return (
      <div className="app-page">
        <div className="flex items-center justify-between">
          <h1 className="app-page-title">{t('organizerDashboard.conferenceDetailsTitle')}</h1>
          <button type="button" onClick={() => setSelectedConference(null)} className="app-btn-ghost">
            {selectedArticle ? t('authorDashboard.backToArticleDetails') : t('organizerDashboard.backToConferences')}
          </button>
        </div>

        <div className="app-card">
          <div className="app-card-header flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{selectedConference.title}</h2>
              <p className="text-sm text-gray-600 mt-1">
                {formatDate(selectedConference.start_date)} - {formatDate(selectedConference.end_date)}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`app-pill ${
                  selectedConference.is_public ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {selectedConference.is_public
                  ? t('organizerDashboard.conferenceVisibilityPublic')
                  : t('organizerDashboard.conferenceVisibilityPrivate')}
              </span>
              <span className={`app-pill ${getConferenceStatusColor(selectedConference.status)}`}>
                {getConferenceStatusLabel(selectedConference.status)}
              </span>
            </div>
          </div>
          <div className="app-card-body app-page">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {t('organizerDashboard.conferenceTimezoneLabel')}
                </p>
                <p className="text-sm text-gray-900">{selectedConference.timezone || t('common.noData')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {t('organizerDashboard.conferenceLocationLabel')}
                </p>
                <p className="text-sm text-gray-900">{selectedConference.location || t('common.noData')}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {t('organizerDashboard.conferenceSubmissionStartLabel')}
                </p>
                <p className="text-sm text-gray-900">
                  {selectedConference.submission_start_at
                    ? formatDateTime(selectedConference.submission_start_at)
                    : t('common.noData')}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  {t('organizerDashboard.conferenceSubmissionEndLabel')}
                </p>
                <p className="text-sm text-gray-900">
                  {selectedConference.submission_end_at
                    ? formatDateTime(selectedConference.submission_end_at)
                    : t('common.noData')}
                </p>
              </div>
            </div>

            {selectedConference.description && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {t('organizerDashboard.conferenceDescriptionLabel')}
                </h3>
                <p className="text-sm text-gray-700 mt-1">{selectedConference.description}</p>
              </div>
            )}

            {selectedConference.thesis_requirements && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {t('organizerDashboard.conferenceThesisRequirementsLabel')}
                </h3>
                <p className="text-sm text-gray-700 mt-1">{selectedConference.thesis_requirements}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="app-card">
            <div className="app-card-header">
              <h3 className="text-lg font-medium text-gray-900">{t('organizerDashboard.conferenceSectionsTitle')}</h3>
            </div>
            {conferenceDetailsLoading ? (
              <p className="app-list-item text-sm text-gray-500">{t('auth.submitLoading')}</p>
            ) : selectedConferenceSections.length === 0 ? (
              <p className="app-list-item text-sm text-gray-500">
                {t('organizerDashboard.conferenceSectionsEmpty')}
              </p>
            ) : (
              <div className="app-list-divider">
                {selectedConferenceSections.map((section) => (
                  <div key={section.id} className="app-list-item">
                    <p className="text-sm font-medium text-gray-900">
                      {section.code ? `${section.code} - ` : ''}
                      {section.name}
                    </p>
                    {section.description && <p className="text-xs text-gray-600 mt-1">{section.description}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="app-card">
            <div className="app-card-header">
              <h3 className="text-lg font-medium text-gray-900">
                {t('organizerDashboard.conferenceArticlesTitle', {
                  count: selectedConferenceArticles.length,
                })}
              </h3>
            </div>
            {conferenceDetailsLoading ? (
              <p className="app-list-item text-sm text-gray-500">{t('auth.submitLoading')}</p>
            ) : selectedConferenceArticles.length === 0 ? (
              <p className="app-list-item text-sm text-gray-500">
                {t('organizerDashboard.conferenceArticlesEmpty')}
              </p>
            ) : (
              <div className="app-list-divider">
                {selectedConferenceArticles.map((article) => (
                  <div key={article.id} className="app-list-item">
                    <p className="text-sm font-medium text-gray-900">{article.title}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {t('common.by', { name: article.profiles?.full_name ?? t('common.noData') })}
                      {' - '}
                      {formatDate(article.submitted_at)}
                    </p>
                    <span className={`app-pill mt-2 ${getStatusColor(article.status)}`}>
                      {getStatusLabel(article.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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

      <div className="app-card p-4 space-y-3">
        <div className="space-y-3 border border-gray-200 rounded-lg p-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {t('organizerDashboard.proceedingsTitle')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('organizerDashboard.proceedingsDescription', { count: proceedingsPoolCount })}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="app-label">{t('organizerDashboard.proceedingsModeLabel')}</label>
              <select
                value={proceedingsMode}
                onChange={(event) =>
                  setProceedingsMode(event.target.value as 'conference' | 'all' | 'date' | 'manual')
                }
                className="app-input"
              >
                <option value="conference">{t('organizerDashboard.proceedingsModeConference')}</option>
                <option value="all">{t('organizerDashboard.proceedingsModeAll')}</option>
                <option value="date">{t('organizerDashboard.proceedingsModeDate')}</option>
                <option value="manual">{t('organizerDashboard.proceedingsModeManual')}</option>
              </select>
            </div>

            {proceedingsMode === 'conference' && (
              <div>
                <label className="app-label">{t('organizerDashboard.proceedingsConference')}</label>
                <select
                  value={proceedingsConferenceId}
                  onChange={(event) => setProceedingsConferenceId(event.target.value)}
                  className="app-input"
                >
                  <option value="">{t('submitArticle.conferencePlaceholder')}</option>
                  {conferences.map((conference) => (
                    <option key={conference.id} value={conference.id}>
                      {conference.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {proceedingsMode === 'date' && (
              <>
                <div>
                  <label className="app-label">{t('organizerDashboard.proceedingsFromDate')}</label>
                  <input
                    type="date"
                    value={proceedingsFromDate}
                    onChange={(event) => setProceedingsFromDate(event.target.value)}
                    className="app-input"
                  />
                </div>
                <div>
                  <label className="app-label">{t('organizerDashboard.proceedingsToDate')}</label>
                  <input
                    type="date"
                    value={proceedingsToDate}
                    onChange={(event) => setProceedingsToDate(event.target.value)}
                    className="app-input"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={proceedingsDateIncludeAllStatuses}
                      onChange={(event) => setProceedingsDateIncludeAllStatuses(event.target.checked)}
                    />
                    <span>{t('organizerDashboard.proceedingsIncludeAllStatuses')}</span>
                  </label>
                </div>
              </>
            )}
          </div>

          {proceedingsMode === 'manual' && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-700">{t('organizerDashboard.proceedingsPickArticles')}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedProceedingsIds(articles.map((article) => article.id))}
                    className="text-sm app-link-primary"
                  >
                    {t('organizerDashboard.proceedingsSelectAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProceedingsIds([])}
                    className="text-sm app-link-primary"
                  >
                    {t('organizerDashboard.proceedingsClearSelection')}
                  </button>
                </div>
              </div>

              {articles.length === 0 ? (
                <p className="text-sm text-gray-500">{t('organizerDashboard.proceedingsNoAccepted')}</p>
              ) : (
                <div className="max-h-56 overflow-auto rounded-md border border-gray-200">
                  {articles.map((article) => (
                    <label
                      key={article.id}
                      className="flex items-start gap-3 p-3 border-b border-gray-100 last:border-b-0 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProceedingsIds.includes(article.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedProceedingsIds((prev) => [...prev, article.id]);
                          } else {
                            setSelectedProceedingsIds((prev) => prev.filter((id) => id !== article.id));
                          }
                        }}
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{article.title}</p>
                        <p className="text-xs text-gray-600">
                          {t('common.by', { name: article.profiles?.full_name ?? t('common.noData') })}
                          {' - '}
                          {formatDate(article.submitted_at)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{getStatusLabel(article.status)}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleGenerateProceedings}
            disabled={generatingProceedings}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText className="h-4 w-4" />
            <span>
              {generatingProceedings
                ? t('organizerDashboard.generatingProceedingsDoc')
                : t('organizerDashboard.generateProceedingsDoc')}
            </span>
          </button>
        </div>
        {proceedingsMessage && <p className="text-sm text-green-600">{proceedingsMessage}</p>}
        {proceedingsError && <p className="text-sm text-red-600">{proceedingsError}</p>}
      </div>

      {renderFilters()}
      {renderArticlesList(false)}
    </div>
  );

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-spinner"></div>
      </div>
    );
  }

  if (selectedArticle && currentPage === 'manage') return renderManageDetails();
  if (selectedConference) return renderConferenceDetails();
  if (selectedArticle) return renderArticleDetails();
  if (currentPage === 'conferences') return renderConferencesPage();
  if (currentPage === 'reviews') return renderReviewsPage();
  if (currentPage === 'manage') return renderManagePage();
  return renderDashboardPage();
};

export default OrganizerDashboard;


