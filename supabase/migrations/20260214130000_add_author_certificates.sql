/*
  # Author participation certificates

  Goals:
  1) Keep participation source-of-truth in articles + conferences.
  2) Persist issued certificates as immutable artifacts.
  3) Let authors issue/download certificate only for eligible finished conferences.
*/

CREATE TABLE IF NOT EXISTS public.author_conference_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conference_id uuid NOT NULL REFERENCES public.conferences(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  certificate_number text NOT NULL UNIQUE,
  snapshot_author_name text NOT NULL,
  snapshot_institution text,
  snapshot_conference_title text NOT NULL,
  snapshot_conference_start_date date NOT NULL,
  snapshot_conference_end_date date NOT NULL,
  snapshot_article_title text NOT NULL,
  snapshot_article_status public.article_status NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id, conference_id)
);

CREATE INDEX IF NOT EXISTS idx_author_certificates_author_issued
  ON public.author_conference_certificates(author_id, issued_at DESC);

ALTER TABLE public.author_conference_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors can read own certificates" ON public.author_conference_certificates;
DROP POLICY IF EXISTS "Organizers can read all certificates" ON public.author_conference_certificates;

CREATE POLICY "Authors can read own certificates"
  ON public.author_conference_certificates
  FOR SELECT
  TO authenticated
  USING (author_id = (select auth.uid()));

CREATE POLICY "Organizers can read all certificates"
  ON public.author_conference_certificates
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.role = 'organizer'
    )
  );

DROP TRIGGER IF EXISTS update_author_certificates_updated_at ON public.author_conference_certificates;
CREATE TRIGGER update_author_certificates_updated_at
  BEFORE UPDATE ON public.author_conference_certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.issue_own_conference_certificate(
  p_conference_id uuid
)
RETURNS public.author_conference_certificates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid := (select auth.uid());
  v_existing public.author_conference_certificates%ROWTYPE;
  v_article_id uuid;
  v_article_title text;
  v_article_status public.article_status;
  v_conference_title text;
  v_conference_start_date date;
  v_conference_end_date date;
  v_author_name text;
  v_institution text;
  v_certificate_number text;
  v_inserted public.author_conference_certificates%ROWTYPE;
BEGIN
  IF v_author_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.author_conference_certificates
  WHERE author_id = v_author_id
    AND conference_id = p_conference_id;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  SELECT
    a.id,
    a.title,
    a.status,
    c.title,
    c.start_date,
    c.end_date,
    p.full_name,
    p.institution
  INTO
    v_article_id,
    v_article_title,
    v_article_status,
    v_conference_title,
    v_conference_start_date,
    v_conference_end_date,
    v_author_name,
    v_institution
  FROM public.articles a
  JOIN public.conferences c ON c.id = a.conference_id
  JOIN public.profiles p ON p.id = a.author_id
  WHERE a.author_id = v_author_id
    AND a.conference_id = p_conference_id
    AND a.status IN ('accepted', 'accepted_with_comments')
    AND c.end_date <= current_date
  ORDER BY a.submitted_at DESC, a.created_at DESC
  LIMIT 1;

  IF v_article_id IS NULL THEN
    RAISE EXCEPTION 'No eligible finished conference participation found';
  END IF;

  v_certificate_number := 'CERT-'
    || to_char(current_date, 'YYYY')
    || '-'
    || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 10));

  INSERT INTO public.author_conference_certificates (
    author_id,
    conference_id,
    article_id,
    certificate_number,
    snapshot_author_name,
    snapshot_institution,
    snapshot_conference_title,
    snapshot_conference_start_date,
    snapshot_conference_end_date,
    snapshot_article_title,
    snapshot_article_status,
    issued_at
  )
  VALUES (
    v_author_id,
    p_conference_id,
    v_article_id,
    v_certificate_number,
    v_author_name,
    v_institution,
    v_conference_title,
    v_conference_start_date,
    v_conference_end_date,
    v_article_title,
    v_article_status,
    now()
  )
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_own_conference_certificate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_own_conference_certificate(uuid) TO authenticated;

