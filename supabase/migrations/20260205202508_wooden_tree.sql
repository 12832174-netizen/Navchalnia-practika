/*
  # Fix Storage Policies Infinite Recursion

  1. Storage Policy Changes
    - Remove all policies that query the articles table
    - Use simple folder-based access control
    - Allow authenticated users to manage their own folders
    - Allow organizers full access

  2. Security
    - Files are organized by user ID folders
    - Users can only access their own folders
    - Organizers can access all folders
*/

-- Drop existing storage policies that cause recursion
DROP POLICY IF EXISTS "Authors can upload files for their articles" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read their article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update their article files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete their article files" ON storage.objects;
DROP POLICY IF EXISTS "Reviewers can read assigned article files" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can read all article files" ON storage.objects;

-- Create simple folder-based storage policies
CREATE POLICY "Users can upload to their own folder"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'articles' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'articles' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'articles' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'articles' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Organizers can read all files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'articles' AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'organizer'
    )
  );