/*
  # Cleanup legacy storage policies for articles bucket

  Problem:
  - multiple old permissive policies still exist on `storage.objects`
  - some of them grant broad access to all authenticated users

  Goal:
  - drop all known legacy policies for bucket `articles`
  - keep only strict, role-aware policies:
    1) upload/update/delete only in own folder (`{auth.uid()}/...`)
    2) read only:
       - own folder
       - organizers
       - reviewers assigned to the article
*/

-- Drop legacy/duplicate policies (safe: IF EXISTS).
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can read all files" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can read all article files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read article files they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Users can read article files by role" ON storage.objects;
DROP POLICY IF EXISTS "Users can read article files by assignment" ON storage.objects;

DROP POLICY IF EXISTS "Users can upload own article files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own article files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own article files" ON storage.objects;

DROP POLICY IF EXISTS "Authors can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read own files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete own files" ON storage.objects;

DROP POLICY IF EXISTS "Authors can upload files for their articles" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read their article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update their article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete their article files" ON storage.objects;

DROP POLICY IF EXISTS "Authors can upload article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read own article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update own article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete own article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete article files" ON storage.objects;

DROP POLICY IF EXISTS "Reviewers can read assigned files" ON storage.objects;
DROP POLICY IF EXISTS "Reviewers can read assigned article files" ON storage.objects;

-- Write access: only owner folder.
CREATE POLICY "Users can upload own article files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

CREATE POLICY "Users can update own article files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = ((select auth.uid()))::text
  )
  WITH CHECK (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

CREATE POLICY "Users can delete own article files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

-- Read access:
-- - author: own folder
-- - organizer: all article files
-- - reviewer: only files of assigned articles
CREATE POLICY "Users can read article files by assignment"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (
      (storage.foldername(name))[1] = ((select auth.uid()))::text
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = (select auth.uid())
          AND p.role = 'organizer'
      )
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

