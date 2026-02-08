/*
  # Conference Management System Schema

  1. New Tables
    - `profiles` - Extended user profiles with roles
    - `articles` - Submitted articles with metadata
    - `reviews` - Review submissions by reviewers
    - `article_status_history` - Track status changes over time
    - `notifications` - System notifications for users

  2. Security
    - Enable RLS on all tables
    - Add policies for role-based access
    - Ensure users can only access appropriate data based on their role

  3. Enums
    - User roles: author, reviewer, organizer
    - Article statuses: submitted, under_review, accepted, accepted_with_comments, rejected
    - Review statuses: draft, submitted
*/

-- Create custom types
CREATE TYPE user_role AS ENUM ('author', 'reviewer', 'organizer');
CREATE TYPE article_status AS ENUM ('submitted', 'under_review', 'accepted', 'accepted_with_comments', 'rejected');
CREATE TYPE review_status AS ENUM ('draft', 'submitted');

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL,
  role user_role NOT NULL DEFAULT 'author',
  institution text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  abstract text NOT NULL,
  keywords text[] DEFAULT '{}',
  file_url text,
  file_name text,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status article_status DEFAULT 'submitted',
  submitted_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  recommendation text CHECK (recommendation IN ('accept', 'accept_with_comments', 'reject')),
  status review_status DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(article_id, reviewer_id)
);

-- Article status history
CREATE TABLE IF NOT EXISTS article_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  old_status article_status,
  new_status article_status NOT NULL,
  changed_by uuid NOT NULL REFERENCES profiles(id),
  comments text,
  created_at timestamptz DEFAULT now()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL,
  type text DEFAULT 'info',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Articles policies
CREATE POLICY "Authors can read own articles"
  ON articles FOR SELECT
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Reviewers can read assigned articles"
  ON articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reviews 
      WHERE reviews.article_id = articles.id 
      AND reviews.reviewer_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can read all articles"
  ON articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Authors can insert articles"
  ON articles FOR INSERT
  TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can update own articles"
  ON articles FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid());

CREATE POLICY "Organizers can update article status"
  ON articles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'organizer'
    )
  );

-- Reviews policies
CREATE POLICY "Reviewers can read own reviews"
  ON reviews FOR SELECT
  TO authenticated
  USING (reviewer_id = auth.uid());

CREATE POLICY "Authors can read reviews of their articles"
  ON reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM articles 
      WHERE articles.id = reviews.article_id 
      AND articles.author_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can read all reviews"
  ON reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Reviewers can insert reviews"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = auth.uid());

CREATE POLICY "Reviewers can update own reviews"
  ON reviews FOR UPDATE
  TO authenticated
  USING (reviewer_id = auth.uid());

-- Article status history policies
CREATE POLICY "Users can read status history of accessible articles"
  ON article_status_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM articles 
      WHERE articles.id = article_status_history.article_id 
      AND (
        articles.author_id = auth.uid() OR
        EXISTS (SELECT 1 FROM reviews WHERE reviews.article_id = articles.id AND reviews.reviewer_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'organizer')
      )
    )
  );

CREATE POLICY "Organizers can insert status history"
  ON article_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'organizer'
    )
  );

-- Notifications policies
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Functions for automatic notifications
CREATE OR REPLACE FUNCTION notify_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Notify author of status change
  INSERT INTO notifications (user_id, title, message, type)
  SELECT 
    NEW.author_id,
    'Article Status Updated',
    'Your article "' || NEW.title || '" status has been changed to: ' || NEW.status,
    'info'
  FROM articles 
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for article status changes
CREATE TRIGGER article_status_notification
  AFTER UPDATE OF status ON articles
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_status_change();

-- Function to automatically update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();