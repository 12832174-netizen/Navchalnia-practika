/*
  # Add conferences core entities

  1. New enum
    - `conference_status`: draft lifecycle for conference workflow

  2. New tables
    - `conferences`: conference MVP entity
    - `conference_organizers`: many-to-many organizers per conference
    - `conference_sections`: section catalog per conference

  3. Existing table update
    - `articles.conference_id` for binding submissions to a conference

  4. Security
    - RLS for all new tables
    - owner-based management for conferences and organizer mapping
    - owner/co-organizer management for sections
*/

DO $$
BEGIN
  CREATE TYPE public.conference_status AS ENUM (
    'draft',
    'announced',
    'submission_open',
    'reviewing',
    'closed',
    'archived'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.conferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  thesis_requirements text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  submission_start_at timestamptz,
  submission_end_at timestamptz,
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status public.conference_status NOT NULL DEFAULT 'draft',
  timezone text NOT NULL DEFAULT 'Europe/Kyiv',
  location text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conferences_date_range_chk CHECK (end_date >= start_date),
  CONSTRAINT conferences_submission_window_chk CHECK (
    submission_start_at IS NULL
    OR submission_end_at IS NULL
    OR submission_end_at >= submission_start_at
  )
);

CREATE TABLE IF NOT EXISTS public.conference_organizers (
  conference_id uuid NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
  organizer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'co-organizer',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conference_id, organizer_id)
);

CREATE TABLE IF NOT EXISTS public.conference_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id uuid NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
  code text,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS conference_id uuid REFERENCES public.conferences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conferences_status_dates
  ON public.conferences(status, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_conferences_organizer
  ON public.conferences(organizer_id);

CREATE INDEX IF NOT EXISTS idx_conference_organizers_organizer
  ON public.conference_organizers(organizer_id);

CREATE INDEX IF NOT EXISTS idx_conference_sections_conference_sort
  ON public.conference_sections(conference_id, sort_order, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conference_sections_unique_name
  ON public.conference_sections(conference_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_articles_conference_status_submitted
  ON public.articles(conference_id, status, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.ensure_conference_organizer_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_organizer boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = NEW.organizer_id
      AND profiles.role = 'organizer'
  )
  INTO v_is_organizer;

  IF NOT v_is_organizer THEN
    RAISE EXCEPTION 'Organizer must have organizer role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_conference_owner_role ON public.conferences;
CREATE TRIGGER validate_conference_owner_role
  BEFORE INSERT OR UPDATE OF organizer_id ON public.conferences
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_conference_organizer_role();

DROP TRIGGER IF EXISTS validate_conference_organizer_role ON public.conference_organizers;
CREATE TRIGGER validate_conference_organizer_role
  BEFORE INSERT OR UPDATE OF organizer_id ON public.conference_organizers
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_conference_organizer_role();

DROP TRIGGER IF EXISTS update_conferences_updated_at ON public.conferences;
CREATE TRIGGER update_conferences_updated_at
  BEFORE UPDATE ON public.conferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_conference_sections_updated_at ON public.conference_sections;
CREATE TRIGGER update_conference_sections_updated_at
  BEFORE UPDATE ON public.conference_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conference_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read conferences" ON public.conferences;
DROP POLICY IF EXISTS "Organizers can create conferences" ON public.conferences;
DROP POLICY IF EXISTS "Conference owners can update conferences" ON public.conferences;
DROP POLICY IF EXISTS "Conference owners can delete conferences" ON public.conferences;

CREATE POLICY "Authenticated users can read conferences"
  ON public.conferences
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Organizers can create conferences"
  ON public.conferences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organizer_id = (select auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role = 'organizer'
    )
  );

CREATE POLICY "Conference owners can update conferences"
  ON public.conferences
  FOR UPDATE
  TO authenticated
  USING (organizer_id = (select auth.uid()))
  WITH CHECK (organizer_id = (select auth.uid()));

CREATE POLICY "Conference owners can delete conferences"
  ON public.conferences
  FOR DELETE
  TO authenticated
  USING (organizer_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read related conference organizers" ON public.conference_organizers;
DROP POLICY IF EXISTS "Conference owners can add organizers" ON public.conference_organizers;
DROP POLICY IF EXISTS "Conference owners can update organizer mappings" ON public.conference_organizers;
DROP POLICY IF EXISTS "Conference owners can remove organizers" ON public.conference_organizers;

CREATE POLICY "Users can read related conference organizers"
  ON public.conference_organizers
  FOR SELECT
  TO authenticated
  USING (
    organizer_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_organizers.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
  );

CREATE POLICY "Conference owners can add organizers"
  ON public.conference_organizers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_organizers.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
  );

CREATE POLICY "Conference owners can update organizer mappings"
  ON public.conference_organizers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_organizers.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_organizers.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
  );

CREATE POLICY "Conference owners can remove organizers"
  ON public.conference_organizers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_organizers.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read conference sections" ON public.conference_sections;
DROP POLICY IF EXISTS "Conference managers can add sections" ON public.conference_sections;
DROP POLICY IF EXISTS "Conference managers can update sections" ON public.conference_sections;
DROP POLICY IF EXISTS "Conference managers can delete sections" ON public.conference_sections;

CREATE POLICY "Authenticated users can read conference sections"
  ON public.conference_sections
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Conference managers can add sections"
  ON public.conference_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_sections.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conference_organizers
      WHERE conference_organizers.conference_id = conference_sections.conference_id
        AND conference_organizers.organizer_id = (select auth.uid())
    )
  );

CREATE POLICY "Conference managers can update sections"
  ON public.conference_sections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_sections.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conference_organizers
      WHERE conference_organizers.conference_id = conference_sections.conference_id
        AND conference_organizers.organizer_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_sections.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conference_organizers
      WHERE conference_organizers.conference_id = conference_sections.conference_id
        AND conference_organizers.organizer_id = (select auth.uid())
    )
  );

CREATE POLICY "Conference managers can delete sections"
  ON public.conference_sections
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conferences
      WHERE conferences.id = conference_sections.conference_id
        AND conferences.organizer_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.conference_organizers
      WHERE conference_organizers.conference_id = conference_sections.conference_id
        AND conference_organizers.organizer_id = (select auth.uid())
    )
  );
