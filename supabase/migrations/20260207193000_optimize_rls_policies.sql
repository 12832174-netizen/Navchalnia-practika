/*
  # Optimize RLS policies for performance

  Goals:
  1) Replace direct auth.uid() calls with (select auth.uid()) to avoid per-row re-evaluation.
  2) Remove multiple permissive policies for same table/action by consolidating rules.
*/

-- ----------------------------------------
-- profiles
-- ----------------------------------------
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

-- ----------------------------------------
-- articles
-- ----------------------------------------
DROP POLICY IF EXISTS "Authors can read own articles" ON public.articles;
DROP POLICY IF EXISTS "Organizers can read all articles" ON public.articles;
DROP POLICY IF EXISTS "Reviewers can read assigned articles" ON public.articles;
DROP POLICY IF EXISTS "Reviewers can read articles for review" ON public.articles;
DROP POLICY IF EXISTS "Reviewers can read reviewable and reviewed articles" ON public.articles;
DROP POLICY IF EXISTS "Authenticated users can select accessible articles" ON public.articles;

DROP POLICY IF EXISTS "Authors can insert articles" ON public.articles;
DROP POLICY IF EXISTS "Authors can update own articles" ON public.articles;
DROP POLICY IF EXISTS "Organizers can update article status" ON public.articles;
DROP POLICY IF EXISTS "Authenticated users can update accessible articles" ON public.articles;

CREATE POLICY "Authenticated users can select accessible articles"
  ON public.articles
  FOR SELECT
  TO authenticated
  USING (
    author_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = (select auth.uid())
          AND profiles.role = 'reviewer'
      )
      AND (
        status IN ('submitted', 'under_review')
        OR EXISTS (
          SELECT 1
          FROM public.reviews
          WHERE reviews.article_id = articles.id
            AND reviews.reviewer_id = (select auth.uid())
        )
      )
    )
  );

CREATE POLICY "Authors can insert articles"
  ON public.articles
  FOR INSERT
  TO authenticated
  WITH CHECK (author_id = (select auth.uid()));

CREATE POLICY "Authenticated users can update accessible articles"
  ON public.articles
  FOR UPDATE
  TO authenticated
  USING (
    author_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  )
  WITH CHECK (
    author_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

-- ----------------------------------------
-- reviews
-- ----------------------------------------
DROP POLICY IF EXISTS "Reviewers can read own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authors can read reviews of their articles" ON public.reviews;
DROP POLICY IF EXISTS "Organizers can read all reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated users can select accessible reviews" ON public.reviews;

DROP POLICY IF EXISTS "Reviewers can insert reviews" ON public.reviews;
DROP POLICY IF EXISTS "Reviewers can update own reviews" ON public.reviews;

CREATE POLICY "Authenticated users can select accessible reviews"
  ON public.reviews
  FOR SELECT
  TO authenticated
  USING (
    reviewer_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.articles
      WHERE articles.id = reviews.article_id
        AND articles.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Reviewers can insert reviews"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (reviewer_id = (select auth.uid()));

CREATE POLICY "Reviewers can update own reviews"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (reviewer_id = (select auth.uid()))
  WITH CHECK (reviewer_id = (select auth.uid()));

-- ----------------------------------------
-- article_status_history
-- ----------------------------------------
DROP POLICY IF EXISTS "Users can read status history of accessible articles" ON public.article_status_history;
DROP POLICY IF EXISTS "Organizers can insert status history" ON public.article_status_history;

CREATE POLICY "Users can read status history of accessible articles"
  ON public.article_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles
      WHERE articles.id = article_status_history.article_id
        AND (
          articles.author_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.reviews
            WHERE reviews.article_id = articles.id
              AND reviews.reviewer_id = (select auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE profiles.id = (select auth.uid())
              AND profiles.role = 'organizer'
          )
        )
    )
  );

CREATE POLICY "Organizers can insert status history"
  ON public.article_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

-- ----------------------------------------
-- notifications
-- ----------------------------------------
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Organizers can insert notifications" ON public.notifications;

CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Organizers can insert notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );
