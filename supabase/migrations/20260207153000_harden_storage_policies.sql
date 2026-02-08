/*
  # Harden article storage policies

  1. Security
    - Restrict write operations to owner's folder only (`{auth.uid()}/...`)
    - Allow reads for:
      - file owner
      - organizers
      - reviewers

  2. Notes
    - Keeps bucket private and relies on signed URLs for file access
*/

-- Drop previously created storage policies (across earlier migrations)
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can read all files" ON storage.objects;
DROP POLICY IF EXISTS "Users can read article files they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Authors can upload files for their articles" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read own article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update own article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete own article files" ON storage.objects;
DROP POLICY IF EXISTS "Reviewers can read assigned article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can upload article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete article files" ON storage.objects;

-- Owner writes only
CREATE POLICY "Users can upload own article files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own article files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own article files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Controlled reads for application roles
CREATE POLICY "Users can read article files by role"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'articles'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('organizer', 'reviewer')
      )
    )
  );
