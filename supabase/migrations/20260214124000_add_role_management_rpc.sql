/*
  # Add organizer role-management RPC

  Goals:
  1) Let organizers change user roles between author/reviewer from UI.
  2) Keep organizer role protected from self-service assignment.
  3) Preserve existing anti-escalation trigger for regular profile updates.
*/

-- Allow controlled bypass for role-change trigger only from dedicated RPC.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_change_bypass text;
BEGIN
  -- Allow backend/service-role maintenance jobs.
  IF (select auth.role()) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Allow only trusted RPC flow that explicitly sets this local flag.
  v_role_change_bypass := current_setting('app.allow_role_change', true);
  IF v_role_change_bypass = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Role changes are restricted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.organizer_set_user_role(
  p_user_id uuid,
  p_role public.user_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := (select auth.uid());
  v_actor_is_organizer boolean;
  v_target_is_organizer boolean;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_actor_id
      AND role = 'organizer'
  )
  INTO v_actor_is_organizer;

  IF NOT v_actor_is_organizer THEN
    RAISE EXCEPTION 'Only organizers can change roles';
  END IF;

  IF p_user_id = v_actor_id THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;

  IF p_role NOT IN ('author', 'reviewer') THEN
    RAISE EXCEPTION 'Only author/reviewer roles can be assigned from UI';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND role = 'organizer'
  )
  INTO v_target_is_organizer;

  IF v_target_is_organizer THEN
    RAISE EXCEPTION 'Organizer role is managed manually';
  END IF;

  PERFORM set_config('app.allow_role_change', '1', true);

  UPDATE public.profiles
  SET role = p_role,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.organizer_set_user_role(uuid, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organizer_set_user_role(uuid, public.user_role) TO authenticated;

