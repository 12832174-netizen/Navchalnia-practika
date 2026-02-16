/*
  # Add notifications when review is submitted

  Goal:
  - notify article author when a reviewer submits a review
  - include reviewer name and recommendation in the notification message
*/

CREATE OR REPLACE FUNCTION public.notify_review_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_article_title text;
  v_article_author_id uuid;
  v_reviewer_name text;
BEGIN
  SELECT a.title, a.author_id
  INTO v_article_title, v_article_author_id
  FROM public.articles a
  WHERE a.id = NEW.article_id;

  IF v_article_author_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.full_name
  INTO v_reviewer_name
  FROM public.profiles p
  WHERE p.id = NEW.reviewer_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    v_article_author_id,
    'Review Submitted',
    'A review for "' || COALESCE(v_article_title, 'your article') || '" has been submitted by '
      || COALESCE(v_reviewer_name, 'reviewer')
      || ' with recommendation: ' || NEW.recommendation || '.',
    'info'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_submitted_notification_on_insert ON public.reviews;
CREATE TRIGGER review_submitted_notification_on_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  WHEN (NEW.status = 'submitted')
  EXECUTE FUNCTION public.notify_review_submitted();

DROP TRIGGER IF EXISTS review_submitted_notification_on_update ON public.reviews;
CREATE TRIGGER review_submitted_notification_on_update
  AFTER UPDATE OF status, recommendation ON public.reviews
  FOR EACH ROW
  WHEN (
    NEW.status = 'submitted'
    AND (
      OLD.status IS DISTINCT FROM NEW.status
      OR OLD.recommendation IS DISTINCT FROM NEW.recommendation
    )
  )
  EXECUTE FUNCTION public.notify_review_submitted();
