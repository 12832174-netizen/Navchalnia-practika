/*
  # Fix reviewer article visibility and profile reads

  1. Profiles
    - Allow authenticated users to read profiles so relational joins
      (`profiles(...)`) can return author/reviewer names in dashboards.

  2. Articles (reviewer access)
    - Allow reviewers to read:
      - open articles (`submitted`, `under_review`) for review queue
      - articles they already reviewed (for history pages)
*/

-- Profiles: replace restrictive select policy used only for self
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;

CREATE POLICY "Authenticated users can read profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Articles: replace reviewer policy to match app behavior
DROP POLICY IF EXISTS "Reviewers can read assigned articles" ON articles;
DROP POLICY IF EXISTS "Reviewers can read reviewable and reviewed articles" ON articles;

CREATE POLICY "Reviewers can read reviewable and reviewed articles"
  ON articles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'reviewer'
    )
    AND (
      status IN ('submitted', 'under_review')
      OR EXISTS (
        SELECT 1
        FROM reviews
        WHERE reviews.article_id = articles.id
          AND reviews.reviewer_id = auth.uid()
      )
    )
  );
