/*
  # Create articles storage bucket

  1. Storage Setup
    - Create 'articles' bucket for storing article files
    - Set bucket to be private (not publicly accessible)
  
  2. Security Policies
    - Authors can upload files to their own articles
    - Authors can read their own article files
    - Reviewers can read files for articles they're assigned to review
    - Organizers can read all article files
    - System can manage files as needed

  3. File Management
    - Files are organized by article ID
    - Proper access control based on user roles
*/

-- Create the articles bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('articles', 'articles', false);

-- Policy: Authors can upload files for their own articles
CREATE POLICY "Authors can upload article files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'articles' AND
  EXISTS (
    SELECT 1 FROM articles 
    WHERE articles.id::text = (storage.foldername(name))[1] 
    AND articles.author_id = auth.uid()
  )
);

-- Policy: Authors can read their own article files
CREATE POLICY "Authors can read own article files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'articles' AND
  EXISTS (
    SELECT 1 FROM articles 
    WHERE articles.id::text = (storage.foldername(name))[1] 
    AND articles.author_id = auth.uid()
  )
);

-- Policy: Reviewers can read files for articles they're assigned to review
CREATE POLICY "Reviewers can read assigned article files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'articles' AND
  EXISTS (
    SELECT 1 FROM reviews 
    JOIN articles ON articles.id = reviews.article_id
    WHERE articles.id::text = (storage.foldername(name))[1] 
    AND reviews.reviewer_id = auth.uid()
  )
);

-- Policy: Organizers can read all article files
CREATE POLICY "Organizers can read all article files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'articles' AND
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'organizer'
  )
);

-- Policy: Authors can update their own article files
CREATE POLICY "Authors can update own article files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'articles' AND
  EXISTS (
    SELECT 1 FROM articles 
    WHERE articles.id::text = (storage.foldername(name))[1] 
    AND articles.author_id = auth.uid()
  )
);

-- Policy: Authors can delete their own article files
CREATE POLICY "Authors can delete own article files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'articles' AND
  EXISTS (
    SELECT 1 FROM articles 
    WHERE articles.id::text = (storage.foldername(name))[1] 
    AND articles.author_id = auth.uid()
  )
);