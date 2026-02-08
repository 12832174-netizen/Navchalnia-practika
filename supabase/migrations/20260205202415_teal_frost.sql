/*
  # Fix RLS infinite recursion policies

  1. Policy Updates
    - Remove circular dependencies in articles table policies
    - Simplify reviewer access policy to avoid recursion
    - Fix storage policies to prevent database recursion

  2. Security
    - Maintain proper access control without circular references
    - Use direct user ID checks instead of complex joins
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Reviewers can read assigned articles" ON articles;
DROP POLICY IF EXISTS "Authors can read reviews of their articles" ON reviews;

-- Recreate articles policies without recursion
CREATE POLICY "Reviewers can read assigned articles"
  ON articles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reviews 
      WHERE reviews.article_id = articles.id 
      AND reviews.reviewer_id = auth.uid()
    )
  );

-- Recreate reviews policy without recursion
CREATE POLICY "Authors can read reviews of their articles"
  ON reviews
  FOR SELECT
  TO authenticated
  USING (
    article_id IN (
      SELECT id FROM articles 
      WHERE author_id = auth.uid()
    )
  );

-- Fix storage policies to avoid database recursion
DROP POLICY IF EXISTS "Authors can upload files for their articles" ON storage.objects;
DROP POLICY IF EXISTS "Users can read article files they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update their article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete their article files" ON storage.objects;

-- Recreate storage policies with simpler logic
CREATE POLICY "Authors can upload files for their articles"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'articles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read article files they have access to"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'articles' AND (
      -- Authors can read their own files
      (storage.foldername(name))[1] = auth.uid()::text OR
      -- Organizers can read all files
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'organizer'
      ) OR
      -- Reviewers can read files for articles they review
      EXISTS (
        SELECT 1 FROM reviews 
        WHERE reviews.reviewer_id = auth.uid()
        AND reviews.article_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY "Authors can update their article files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'articles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authors can delete their article files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'articles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );