/*
  # Fix RLS infinite recursion between articles and reviews

  Problem:
  - `articles` SELECT policy references `reviews`
  - `reviews` SELECT policy references `articles`
  This creates a recursive policy evaluation loop.

  Fix:
  - Make `articles` SELECT independent from `reviews`.
  - Keep `reviews` SELECT policy unchanged (it can safely reference `articles` now).
*/

DROP POLICY IF EXISTS "Authenticated users can select accessible articles" ON public.articles;

CREATE POLICY "Authenticated users can select accessible articles"
  ON public.articles
  FOR SELECT
  TO authenticated
  USING (
    author_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.role IN ('organizer', 'reviewer')
    )
  );
