export type UserRole = 'author' | 'reviewer' | 'organizer';
export type ArticleStatus = 'submitted' | 'under_review' | 'accepted' | 'accepted_with_comments' | 'rejected';
export type ReviewStatus = 'draft' | 'submitted';
export type ConferenceStatus =
  | 'draft'
  | 'announced'
  | 'submission_open'
  | 'reviewing'
  | 'closed'
  | 'archived';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  institution?: string;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  title: string;
  abstract: string;
  keywords: string[];
  file_url?: string;
  file_name?: string;
  author_id: string;
  conference_id?: string | null;
  status: ArticleStatus;
  review_due_at?: string;
  presentation_starts_at?: string;
  presentation_location?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  conferences?: Conference;
}

export interface Review {
  id: string;
  article_id: string;
  reviewer_id: string;
  content: string;
  rating: number;
  recommendation: 'accept' | 'accept_with_comments' | 'reject';
  status: ReviewStatus;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
  articles?: Article;
  profiles?: Profile;
}

export interface ArticleStatusHistory {
  id: string;
  article_id: string;
  old_status?: ArticleStatus;
  new_status: ArticleStatus;
  changed_by: string;
  comments?: string;
  created_at: string;
  profiles?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export interface ArticleReviewAssignment {
  id: string;
  article_id: string;
  reviewer_id: string;
  assigned_by: string;
  due_at?: string;
  completed_at?: string;
  overdue_notified_at?: string;
  created_at: string;
  updated_at: string;
  articles?: Article;
  profiles?: Profile;
}

export interface Conference {
  id: string;
  title: string;
  description?: string | null;
  thesis_requirements?: string | null;
  start_date: string;
  end_date: string;
  submission_start_at?: string | null;
  submission_end_at?: string | null;
  organizer_id: string;
  status: ConferenceStatus;
  timezone: string;
  location?: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  organizer_profile?: Profile;
}

export interface ConferenceOrganizer {
  conference_id: string;
  organizer_id: string;
  role: string;
  created_at: string;
  conference?: Conference;
  organizer_profile?: Profile;
}

export interface ConferenceSection {
  id: string;
  conference_id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  conference?: Conference;
}
