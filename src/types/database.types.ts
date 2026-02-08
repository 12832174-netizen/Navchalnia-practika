export type UserRole = 'author' | 'reviewer' | 'organizer';
export type ArticleStatus = 'submitted' | 'under_review' | 'accepted' | 'accepted_with_comments' | 'rejected';
export type ReviewStatus = 'draft' | 'submitted';

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
  status: ArticleStatus;
  review_due_at?: string;
  presentation_starts_at?: string;
  presentation_location?: string;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
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
