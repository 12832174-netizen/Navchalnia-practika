/*
  # Add reviewer assignments, deadlines, and overdue automation helpers

  1. New table
    - article_review_assignments:
      - binds reviewer to article
      - stores assignment deadline
      - tracks completion/overdue notifications

  2. Article scheduling/deadline fields
    - review_due_at
    - presentation_starts_at
    - presentation_location

  3. RLS and policy updates
    - reviewers can access only assigned articles
    - reviewers can insert reviews only for assigned articles
    - organizers manage assignments

  4. Automation
    - notify reviewer when assignment is created
    - mark assignment completed when submitted review is created
    - helper function to notify overdue assignments (for pg_cron/manual run)
*/

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS review_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS presentation_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS presentation_location text;

CREATE TABLE IF NOT EXISTS public.article_review_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL REFERENCES public.profiles(id),
  due_at timestamptz,
  completed_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_reviewer ON public.article_review_assignments(reviewer_id, due_at);
CREATE INDEX IF NOT EXISTS idx_assignments_article ON public.article_review_assignments(article_id);
CREATE INDEX IF NOT EXISTS idx_articles_status_submitted ON public.articles(status, submitted_at DESC);

ALTER TABLE public.article_review_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organizers can manage assignments" ON public.article_review_assignments;
DROP POLICY IF EXISTS "Organizers can read assignments" ON public.article_review_assignments;
DROP POLICY IF EXISTS "Organizers can insert assignments" ON public.article_review_assignments;
DROP POLICY IF EXISTS "Organizers can update assignments" ON public.article_review_assignments;
DROP POLICY IF EXISTS "Organizers can delete assignments" ON public.article_review_assignments;
DROP POLICY IF EXISTS "Reviewers can read own assignments" ON public.article_review_assignments;

CREATE POLICY "Organizers can read assignments"
  ON public.article_review_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Organizers can insert assignments"
  ON public.article_review_assignments
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

CREATE POLICY "Organizers can update assignments"
  ON public.article_review_assignments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Organizers can delete assignments"
  ON public.article_review_assignments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Reviewers can read own assignments"
  ON public.article_review_assignments
  FOR SELECT
  TO authenticated
  USING (reviewer_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can select accessible articles" ON public.articles;

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
    OR EXISTS (
      SELECT 1
      FROM public.article_review_assignments ara
      WHERE ara.article_id = articles.id
        AND ara.reviewer_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Reviewers can insert reviews" ON public.reviews;

CREATE POLICY "Reviewers can insert reviews"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewer_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.article_review_assignments ara
      WHERE ara.article_id = reviews.article_id
        AND ara.reviewer_id = (select auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.notify_reviewer_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    NEW.reviewer_id,
    'New Review Assignment',
    'You have been assigned to review an article.'
      || CASE
           WHEN NEW.due_at IS NULL THEN ''
           ELSE ' Deadline: ' || to_char(NEW.due_at, 'YYYY-MM-DD HH24:MI')
         END,
    'info'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviewer_assignment_notification ON public.article_review_assignments;
CREATE TRIGGER reviewer_assignment_notification
  AFTER INSERT ON public.article_review_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_reviewer_assignment();

CREATE OR REPLACE FUNCTION public.mark_assignment_completed_from_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submitted' THEN
    UPDATE public.article_review_assignments
    SET completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE article_id = NEW.article_id
      AND reviewer_id = NEW.reviewer_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_assignment_completed_on_review ON public.reviews;
CREATE TRIGGER mark_assignment_completed_on_review
  AFTER INSERT OR UPDATE OF status ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_assignment_completed_from_review();

CREATE OR REPLACE FUNCTION public.notify_overdue_assignments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH overdue AS (
    SELECT id, reviewer_id
    FROM public.article_review_assignments
    WHERE due_at IS NOT NULL
      AND due_at < now()
      AND completed_at IS NULL
      AND overdue_notified_at IS NULL
    FOR UPDATE
  ),
  updated AS (
    UPDATE public.article_review_assignments ara
    SET overdue_notified_at = now(),
        updated_at = now()
    FROM overdue o
    WHERE ara.id = o.id
    RETURNING ara.id, ara.reviewer_id
  )
  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT
    u.reviewer_id,
    'Review Deadline Missed',
    'One of your assigned reviews is overdue. Please submit your review as soon as possible.',
    'warning'
  FROM updated u;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
