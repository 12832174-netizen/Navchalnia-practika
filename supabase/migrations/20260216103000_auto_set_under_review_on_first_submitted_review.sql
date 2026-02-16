/*
  # Auto-set article status to under_review on first submitted review

  Goals:
  - keep final decisions (accepted/rejected) only for organizers
  - automatically move article from submitted -> under_review when reviewer submits review
  - preserve strict update-guard trigger by allowing only this internal transition
*/

-- Extend column-level guard with one explicit internal transition flag.
CREATE OR REPLACE FUNCTION public.enforce_articles_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_organizer boolean;
  v_internal_transition boolean;
BEGIN
  IF (select auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_internal_transition := COALESCE(current_setting('app.internal_article_status_transition', true), '') = 'on';

  IF v_internal_transition THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.abstract IS DISTINCT FROM OLD.abstract
      OR NEW.keywords IS DISTINCT FROM OLD.keywords
      OR NEW.file_url IS DISTINCT FROM OLD.file_url
      OR NEW.file_name IS DISTINCT FROM OLD.file_name
      OR NEW.author_id IS DISTINCT FROM OLD.author_id
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.review_due_at IS DISTINCT FROM OLD.review_due_at
      OR NEW.presentation_starts_at IS DISTINCT FROM OLD.presentation_starts_at
      OR NEW.presentation_location IS DISTINCT FROM OLD.presentation_location
      OR NEW.conference_id IS DISTINCT FROM OLD.conference_id
      OR NEW.language IS DISTINCT FROM OLD.language
      OR NEW.section_id IS DISTINCT FROM OLD.section_id
    THEN
      RAISE EXCEPTION 'Internal transition can update only article status';
    END IF;

    IF NOT (
      OLD.status = 'submitted'::public.article_status
      AND NEW.status = 'under_review'::public.article_status
    ) THEN
      RAISE EXCEPTION 'Internal transition allows only submitted -> under_review';
    END IF;

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

-- Trigger-driven internal transition from submitted -> under_review.
CREATE OR REPLACE FUNCTION public.auto_set_article_under_review_from_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'submitted'::public.review_status THEN
    RETURN NEW;
  END IF;

  -- Skip no-op updates where status was not actually changed.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('app.internal_article_status_transition', 'on', true);

  UPDATE public.articles
  SET status = 'under_review'::public.article_status
  WHERE id = NEW.article_id
    AND status = 'submitted'::public.article_status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_set_article_under_review_on_review_submit ON public.reviews;
CREATE TRIGGER auto_set_article_under_review_on_review_submit
  AFTER INSERT OR UPDATE OF status ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_article_under_review_from_review();
