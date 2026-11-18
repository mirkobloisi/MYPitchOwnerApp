-- Applied to production (project ijefdacnlctrlqmuhuhl) on 2026-11-18.

-- 1) Creating an academy failed with "new row violates row-level security policy".
--    INSERT ... RETURNING also has to pass the SELECT policy, and that policy
--    asked owns_academy(id), which re-queries academy.academies and so cannot
--    see the row being inserted by the same statement. Decide from the row's
--    own pitch_owner_id instead.
create or replace function academy.can_manage_owner_academies(target_pitch_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1 from public.pitch_owners po
        where po.id = target_pitch_owner_id
          and po.user_id = (select auth.uid())
          and po.status = 'active'
      )
      or public.staff_can_access_owner(target_pitch_owner_id, 'academy')
      or academy.coach_can_access_owner(target_pitch_owner_id)
    );
$$;

revoke all on function academy.can_manage_owner_academies(uuid) from public, anon;
grant execute on function academy.can_manage_owner_academies(uuid) to authenticated;

-- 2) A still-pending or rejected owner must not own or manage academies.
create or replace function academy.owns_academy(target_academy_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'academy', 'public'
as $$
  select exists (
    select 1
    from academy.academies a
    join public.pitch_owners po on po.id = a.pitch_owner_id
    where a.id = target_academy_id
      and (
        (po.user_id = (select auth.uid()) and po.status = 'active')
        or public.staff_can_access_owner(po.id, 'academy')
        or academy.coach_can_access_owner(po.id)
      )
  );
$$;

drop policy if exists "Members and workspace users view permitted academies" on academy.academies;
create policy "Members and workspace users view permitted academies"
  on academy.academies for select to authenticated
  using (
    (is_active and not (select public.current_user_is_workspace_account()))
    or academy.can_manage_owner_academies(pitch_owner_id)
  );

drop policy if exists "Owners and coaches create academies in their workspace" on academy.academies;
create policy "Owners and coaches create academies in their workspace"
  on academy.academies for insert to authenticated
  with check (
    exists (
      select 1 from public.pitch_owners po
      where po.id = academies.pitch_owner_id
        and po.user_id = (select auth.uid())
        and po.status = 'active'
    )
    or academy.coach_can_access_owner(pitch_owner_id)
  );

-- 3) Blocked spots carry private details (reason, external booking reference,
--    notes, creator). Signed-out visitors and players could read them for every
--    owner's pitch. Players get free/busy through get_pitch_busy_ranges()
--    (security definer), so the direct read is not needed.
drop policy if exists "Guests can view active pitch blocks" on public.pitch_blocks;
drop policy if exists "Non-workspace users can view active pitch blocks" on public.pitch_blocks;
revoke select on public.pitch_blocks from anon;
