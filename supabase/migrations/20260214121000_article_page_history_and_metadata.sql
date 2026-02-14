/*
  # Article page readiness: status history reliability + article metadata

  Goals:
  1) Make status history robust: auto-log every article status change.
  2) Improve history read access for reviewers by assignment (not only submitted reviews).
  3) Add article metadata needed for richer article pages:
     - language (uk/en)
     - section_id (conference section binding)
  4) Add integrity checks and indexes for article page performance.
*/

-- ----------------------------------------
-- Articles metadata for richer article page
-- ----------------------------------------
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS section_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'articles_language_chk'
      AND conrelid = 'public.articles'::regclass
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_language_chk
      CHECK (language IS NULL OR language IN ('uk', 'en'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'articles_section_id_fkey'
      AND conrelid = 'public.articles'::regclass
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT articles_section_id_fkey
      FOREIGN KEY (section_id)
      REFERENCES public.conference_sections(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_articles_section_id
  ON public.articles(section_id);

CREATE INDEX IF NOT EXISTS idx_articles_language
  ON public.articles(language);

-- Backfill language for existing rows where possible.
UPDATE public.articles
SET language = CASE
  WHEN title ~ '[^ -~]' THEN 'uk'
  ELSE 'en'
END
WHERE language IS NULL;

-- Validate that selected section belongs to selected conference.
CREATE OR REPLACE FUNCTION public.validate_article_section_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section_conference_id uuid;
BEGIN
  IF NEW.section_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT conference_id
  INTO v_section_conference_id
  FROM public.conference_sections
  WHERE id = NEW.section_id;

  IF v_section_conference_id IS NULL THEN
    RAISE EXCEPTION 'Selected section does not exist';
  END IF;

  IF NEW.conference_id IS NULL THEN
    NEW.conference_id := v_section_conference_id;
    RETURN NEW;
  END IF;

  IF NEW.conference_id <> v_section_conference_id THEN
    RAISE EXCEPTION 'Article section must belong to the selected conference';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_article_section_link ON public.articles;
CREATE TRIGGER validate_article_section_link
  BEFORE INSERT OR UPDATE OF conference_id, section_id ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_article_section_link();

-- ----------------------------------------
-- Status history reliability and performance
-- ----------------------------------------
CREATE INDEX IF NOT EXISTS idx_article_status_history_article_created
  ON public.article_status_history(article_id, created_at DESC);

-- Auto-log status changes to avoid missing history from non-UI flows.
CREATE OR REPLACE FUNCTION public.log_article_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid;
  v_recent_exists boolean;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_actor_id := (select auth.uid());
  IF v_actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.article_status_history h
    WHERE h.article_id = NEW.id
      AND h.old_status IS NOT DISTINCT FROM OLD.status
      AND h.new_status = NEW.status
      AND h.changed_by = v_actor_id
      AND h.created_at > now() - interval '15 seconds'
  )
  INTO v_recent_exists;

  IF NOT v_recent_exists THEN
    INSERT INTO public.article_status_history (
      article_id,
      old_status,
      new_status,
      changed_by,
      comments,
      created_at
    )
    VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      v_actor_id,
      NULL,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS article_status_history_auto_log ON public.articles;
CREATE TRIGGER article_status_history_auto_log
  AFTER UPDATE OF status ON public.articles
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_article_status_change();

-- ----------------------------------------
-- RLS: history visibility by assignment
-- ----------------------------------------
DROP POLICY IF EXISTS "Users can read status history of accessible articles" ON public.article_status_history;

CREATE POLICY "Users can read status history of accessible articles"
  ON public.article_status_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles a
      WHERE a.id = article_status_history.article_id
        AND (
          a.author_id = (select auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (select auth.uid())
              AND p.role = 'organizer'
          )
          OR EXISTS (
            SELECT 1
            FROM public.article_review_assignments ara
            WHERE ara.article_id = a.id
              AND ara.reviewer_id = (select auth.uid())
          )
        )
    )
  );
