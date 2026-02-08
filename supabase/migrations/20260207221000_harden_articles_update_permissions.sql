/*
  # Harden articles UPDATE permissions

  Goals:
  1) Split UPDATE access by role.
  2) Authors can edit only own "submitted" content.
  3) Organizers can perform workflow updates.
  4) Enforce column-level restrictions with BEFORE UPDATE trigger.
*/

DROP POLICY IF EXISTS "Authenticated users can update accessible articles" ON public.articles;
DROP POLICY IF EXISTS "Authors can update own submitted articles" ON public.articles;
DROP POLICY IF EXISTS "Organizers can update article workflow" ON public.articles;

CREATE POLICY "Authors can update own submitted articles"
  ON public.articles
  FOR UPDATE
  TO authenticated
  USING (
    author_id = (select auth.uid())
    AND status = 'submitted'
  )
  WITH CHECK (
    author_id = (select auth.uid())
    AND status = 'submitted'
  );

CREATE POLICY "Organizers can update article workflow"
  ON public.articles
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

CREATE OR REPLACE FUNCTION public.enforce_articles_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_organizer boolean;
BEGIN
  IF (select auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'organizer'
  )
  INTO v_is_organizer;

  IF v_is_organizer THEN
    -- Organizer workflow scope:
    -- status + schedule fields + updated_at.
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.abstract IS DISTINCT FROM OLD.abstract
      OR NEW.keywords IS DISTINCT FROM OLD.keywords
      OR NEW.file_url IS DISTINCT FROM OLD.file_url
      OR NEW.file_name IS DISTINCT FROM OLD.file_name
      OR NEW.author_id IS DISTINCT FROM OLD.author_id
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Organizers can update only workflow fields';
    END IF;
  ELSE
    -- Author content scope:
    -- title/abstract/keywords/file metadata only, while article is submitted.
    IF NEW.author_id IS DISTINCT FROM OLD.author_id
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.review_due_at IS DISTINCT FROM OLD.review_due_at
      OR NEW.presentation_starts_at IS DISTINCT FROM OLD.presentation_starts_at
      OR NEW.presentation_location IS DISTINCT FROM OLD.presentation_location
    THEN
      RAISE EXCEPTION 'Authors cannot change workflow fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_articles_update_columns ON public.articles;
CREATE TRIGGER enforce_articles_update_columns
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_articles_update_columns();

