/*
  # Add automatic notifications on article submission

  1. Security
    - Recreate notification trigger functions as SECURITY DEFINER
    - Set fixed search_path for safer execution

  2. Automation
    - On article INSERT:
      - notify author that submission was received
      - notify organizers about new submission
    - On article status UPDATE:
      - notify author about status change
*/

-- Keep status-change notifications reliable even with strict RLS policies.
CREATE OR REPLACE FUNCTION public.notify_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    NEW.author_id,
    'Article Status Updated',
    'Your article "' || NEW.title || '" status has been changed to: ' || NEW.status,
    'info'
  );

  RETURN NEW;
END;
$$;

-- New notifications when an article is submitted.
CREATE OR REPLACE FUNCTION public.notify_article_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_name text;
BEGIN
  SELECT full_name INTO v_author_name
  FROM public.profiles
  WHERE id = NEW.author_id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (
    NEW.author_id,
    'Article Submitted',
    'Your article "' || NEW.title || '" has been successfully submitted.',
    'info'
  );

  INSERT INTO public.notifications (user_id, title, message, type)
  SELECT
    p.id,
    'New Article Submission',
    'A new article "' || NEW.title || '" was submitted'
      || COALESCE(' by ' || v_author_name, '')
      || '.',
    'info'
  FROM public.profiles p
  WHERE p.role = 'organizer'
    AND p.id <> NEW.author_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS article_status_notification ON public.articles;
CREATE TRIGGER article_status_notification
  AFTER UPDATE OF status ON public.articles
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_status_change();

DROP TRIGGER IF EXISTS article_submitted_notification ON public.articles;
CREATE TRIGGER article_submitted_notification
  AFTER INSERT ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_article_submitted();
