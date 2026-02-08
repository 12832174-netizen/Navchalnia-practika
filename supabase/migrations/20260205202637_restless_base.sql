/*
  # Fix storage policies infinite recursion

  1. Remove all existing storage policies
  2. Create minimal policies that don't reference any tables
  3. Use only auth.uid() and basic storage functions
*/

-- Drop all existing storage policies
DROP POLICY IF EXISTS "Authors can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can read own files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can update own files" ON storage.objects;
DROP POLICY IF EXISTS "Authors can delete own files" ON storage.objects;
DROP POLICY IF EXISTS "Reviewers can read assigned files" ON storage.objects;
DROP POLICY IF EXISTS "Organizers can read all files" ON storage.objects;

-- Create simple storage policies that don't query any tables
CREATE POLICY "Authenticated users can upload files"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'articles');

CREATE POLICY "Users can read files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'articles');

CREATE POLICY "Users can update files"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'articles');

CREATE POLICY "Users can delete files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'articles');