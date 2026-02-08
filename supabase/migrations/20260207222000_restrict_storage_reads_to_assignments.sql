/*
  # Restrict reviewer storage reads to assignment scope

  Replaces broad reviewer read access with assignment-based access:
  - author can read own folder files
  - organizer can read all article files
  - reviewer can read only files of assigned articles
*/

DROP POLICY IF EXISTS "Users can read article files by role" ON storage.objects;
DROP POLICY IF EXISTS "Users can read article files by assignment" ON storage.objects;

CREATE POLICY "Users can read article files by assignment"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (
      -- Author: own folder only.
      (storage.foldername(name))[1] = (select auth.uid())::text

      -- Organizer: full read access.
      OR EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.id = (select auth.uid())
          AND profiles.role = 'organizer'
      )

      -- Reviewer: only assigned articles.
      OR EXISTS (
        SELECT 1
        FROM public.article_review_assignments ara
        JOIN public.articles a
          ON a.id = ara.article_id
        WHERE ara.reviewer_id = (select auth.uid())
          AND (
            CASE
              WHEN a.file_url IS NULL THEN NULL
              WHEN a.file_url LIKE 'http%' THEN
                regexp_replace(
                  split_part(a.file_url, '?', 1),
                  '^https?://[^/]+/storage/v1/object/(public|authenticated|sign)/articles/',
                  ''
                )
              ELSE a.file_url
            END
          ) = storage.objects.name
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_articles_file_url ON public.articles(file_url);

