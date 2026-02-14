/*
  # Lock self-signup role to author

  Goal:
  - Enforce that self-registered users can only create profile with role = 'author'.
*/

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (select auth.uid())
    AND role = 'author'
  );

