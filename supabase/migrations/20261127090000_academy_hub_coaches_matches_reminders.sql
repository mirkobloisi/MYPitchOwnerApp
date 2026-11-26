-- Academy tab rebuild: coaches by invitation, matches that book the pitch,
-- match reminders, and the directories behind Assignments / Communication.

-- Small helper: patch an existing function by replacing one exact fragment,
-- failing loudly if the fragment is not there.
create or replace function pg_temp.patch_function(target regprocedure, find text, replacement text)
returns void language plpgsql as $patch$
declare def text := pg_get_functiondef(target);
begin
  if position(find in def) = 0 then
    raise exception 'Patch fragment not found in %: %', target, find;
  end if;
  execute replace(def, find, replacement);
end $patch$;

-- ---------------------------------------------------------------------------
-- 1. Coaches
-- A coach is a staff account limited to the Academy tab, with a coach profile
-- inside the Academy.
-- ---------------------------------------------------------------------------
alter table academy.members add column if not exists is_coach boolean not null default false;
alter table academy.members drop constraint if exists members_coach_is_staff;
alter table academy.members add constraint members_coach_is_staff check (not is_coach or member_kind = 'staff');

alter table public.owner_staff_invites
  add column if not exists is_coach boolean not null default false,
  add column if not exists coach_academy_id uuid references academy.academies(id) on delete set null;
alter table public.owner_staff_invites drop constraint if exists owner_staff_invites_coach_academy_only;
alter table public.owner_staff_invites add constraint owner_staff_invites_coach_academy_only
  check (not is_coach or allowed_tabs = array['academy']);

alter table public.owner_staff_memberships add column if not exists is_coach boolean not null default false;
alter table public.owner_staff_memberships drop constraint if exists owner_staff_memberships_coach_academy_only;
alter table public.owner_staff_memberships add constraint owner_staff_memberships_coach_academy_only
  check (not is_coach or allowed_tabs = array['academy']);

-- Nobody can turn their own profile into a staff or coach profile from the
-- app: those are only created by the database functions below. (Runs as the
-- caller, so definer functions pass.)
create or replace function academy.protect_staff_flags()
returns trigger language plpgsql set search_path to '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' and (new.member_kind = 'staff' or new.is_coach) then
      raise exception 'Staff accounts are created by the sports centre.';
    end if;
    if tg_op = 'UPDATE' and (
      (new.member_kind = 'staff' and old.member_kind is distinct from 'staff')
      or new.is_coach is distinct from old.is_coach
    ) then
      raise exception 'Staff accounts are created by the sports centre.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists members_protect_staff_flags on academy.members;
create trigger members_protect_staff_flags before insert or update on academy.members
  for each row execute function academy.protect_staff_flags();

-- A display name nobody else on MYPitch is using (member names are unique).
create or replace function academy.free_member_name(wanted text)
returns text language plpgsql security definer set search_path to '' as $$
declare
  base text := left(coalesce(nullif(regexp_replace(btrim(coalesce(wanted, '')), '\s+', ' ', 'g'), ''), 'Academy'), 110);
  candidate text := base;
  n integer := 1;
begin
  while exists (select 1 from academy.members m where lower(btrim(m.full_name)) = lower(candidate)) loop
    n := n + 1;
    candidate := base || ' (' || n || ')';
  end loop;
  return candidate;
end $$;
revoke all on function academy.free_member_name(text) from public, anon, authenticated;

create or replace function academy.register_coach(
  p_user uuid, p_name text, p_email text, p_academy uuid, p_owner uuid
) returns uuid language plpgsql security definer set search_path to '' as $$
declare v_member uuid;
begin
  insert into academy.members (user_id, full_name, email, is_self_managed, member_kind, is_coach)
  values (p_user, academy.free_member_name(coalesce(nullif(btrim(p_name), ''), 'Coach')), p_email, true, 'staff', true)
  on conflict (user_id) do update
    set member_kind = 'staff', is_coach = true, guardian_id = null, guardian_id_2 = null, is_self_managed = true
  returning id into v_member;

  if p_academy is not null and exists (
    select 1 from academy.academies a where a.id = p_academy and a.pitch_owner_id = p_owner
  ) then
    insert into academy.enrolments (academy_id, member_id, status, responded_at)
    values (p_academy, v_member, 'approved', now())
    on conflict (academy_id, member_id) do update set status = 'approved', responded_at = now();
  end if;
  return v_member;
end $$;
revoke all on function academy.register_coach(uuid, text, text, uuid, uuid) from public, anon, authenticated;

-- Sign-up through a coach invitation creates the staff account AND the coach profile.
select pg_temp.patch_function('public.handle_new_user()'::regprocedure,
  'insert into public.owner_staff_memberships (pitch_owner_id, user_id, full_name, email, allowed_tabs, status)',
  'insert into public.owner_staff_memberships (pitch_owner_id, user_id, full_name, email, allowed_tabs, status, is_coach)');
select pg_temp.patch_function('public.handle_new_user()'::regprocedure,
  'invite_row.allowed_tabs, ''active'');',
  'invite_row.allowed_tabs, ''active'', invite_row.is_coach);
    if invite_row.is_coach then
      perform academy.register_coach(new.id, coalesce(new.raw_user_meta_data->>''full_name'', ''''), new.email,
        invite_row.coach_academy_id, invite_row.pitch_owner_id);
    end if;');

-- The older coach-invite flow marks its coaches too.
select pg_temp.patch_function('academy.handle_coach_signup()'::regprocedure,
  'is_self_managed, member_kind)', 'is_self_managed, member_kind, is_coach)');
select pg_temp.patch_function('academy.handle_coach_signup()'::regprocedure,
  'true, ''staff'')', 'true, ''staff'', true)');
select pg_temp.patch_function('academy.handle_coach_signup()'::regprocedure,
  'is_self_managed = true,', 'is_self_managed = true, is_coach = true,');

-- Lasting workspace access from an enrolment is only for those older coaches.
-- Staff accounts (including new coaches) get their access from their staff
-- membership, so removing or deactivating them really removes it.
create or replace function academy.link_approved_coach_to_owner()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status <> 'approved' then
    return new;
  end if;

  insert into academy.coach_owner_access (pitch_owner_id, user_id, member_id, source_academy_id)
  select a.pitch_owner_id, m.user_id, m.id, a.id
  from academy.members m
  join academy.academies a on a.id = new.academy_id
  where m.id = new.member_id
    and m.member_kind = 'staff'
    and m.is_coach
    and m.user_id is not null
    and not exists (select 1 from public.owner_staff_memberships s where s.user_id = m.user_id)
  on conflict (pitch_owner_id, user_id) do update
    set member_id = excluded.member_id,
        source_academy_id = excluded.source_academy_id,
        is_active = true;

  return new;
end $$;

delete from academy.coach_owner_access c
where exists (select 1 from public.owner_staff_memberships s where s.user_id = c.user_id)
   or exists (select 1 from public.pitch_owners po where po.user_id = c.user_id and po.id = c.pitch_owner_id);

-- Staff with the Academy tab can see the people in the sports centre's academies.
create or replace function academy.member_in_my_academy(target_member_id uuid)
returns boolean language sql stable security definer set search_path to 'academy', 'public' as $$
  select exists (
    select 1
    from academy.enrolments e
    join academy.academies a on a.id = e.academy_id
    join public.pitch_owners po on po.id = a.pitch_owner_id
    where e.member_id = target_member_id
      and (
        po.user_id = (select auth.uid())
        or public.staff_can_access_owner(po.id, 'academy')
        or academy.coach_can_access_owner(po.id)
      )
  );
$$;

-- The owner (or staff) member profile used for chat: staff get their own name.
create or replace function academy.ensure_staff_member(target_academy_id uuid)
returns uuid language plpgsql security definer set search_path to 'academy', 'public' as $$
declare
  staff_id uuid;
  display_name text;
begin
  if not academy.owns_academy(target_academy_id) then
    return null;
  end if;

  select m.id into staff_id
  from academy.members m
  where m.user_id = auth.uid() and m.member_kind = 'staff'
  limit 1;

  if staff_id is null then
    select coalesce(
             (select nullif(btrim(s.full_name), '') from public.owner_staff_memberships s
               where s.user_id = auth.uid() and s.pitch_owner_id = a.pitch_owner_id limit 1),
             nullif(btrim(po.business_name), ''),
             nullif(btrim(a.name), ''),
             'Academy'
           )
      into display_name
      from academy.academies a
      left join public.pitch_owners po on po.id = a.pitch_owner_id
     where a.id = target_academy_id;

    insert into academy.members (user_id, full_name, member_kind, is_self_managed)
    values (auth.uid(), academy.free_member_name(display_name), 'staff', true)
    returning id into staff_id;
  end if;

  -- A coach keeps the academies they were assigned to; everyone else is
  -- enrolled where they are about to write.
  if not exists (select 1 from academy.members m where m.id = staff_id and m.is_coach) then
    insert into academy.enrolments (academy_id, member_id, status, responded_at)
    values (target_academy_id, staff_id, 'approved', now())
    on conflict do nothing;
  end if;

  return staff_id;
end $$;

-- Coach invitation link (owner only, like staff invitations).
create or replace function public.create_coach_invite_link(p_academy_id uuid default null, p_email text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare
  owner_id uuid;
  owner_business text;
  invite_token text := encode(extensions.gen_random_bytes(32), 'hex');
  clean_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  -- Live site by default. The test project replaces this with test-owner.
  site_url text := coalesce(nullif(current_setting('app.owner_site_url', true), ''), 'https://owner.mypitchbookings.com');
begin
  select po.id, po.business_name into owner_id, owner_business
  from public.pitch_owners po
  where po.user_id = (select auth.uid()) and po.status = 'active';
  if owner_id is null then raise exception 'Only the owner account can invite coaches'; end if;
  if p_academy_id is not null and not exists (
    select 1 from academy.academies a where a.id = p_academy_id and a.pitch_owner_id = owner_id
  ) then raise exception 'Choose one of your own academies'; end if;
  if clean_email is not null and clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if (select count(*) from public.owner_staff_invites i
      where i.pitch_owner_id = owner_id and i.created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many invitations today. Try again tomorrow.';
  end if;

  insert into public.owner_staff_invites(pitch_owner_id, token_hash, allowed_tabs, invited_email, is_coach, coach_academy_id)
  values (owner_id, encode(extensions.digest(invite_token, 'sha256'), 'hex'), array['academy'], clean_email, true, p_academy_id);

  if clean_email is not null then
    perform public.enqueue_email(clean_email, 'staff_invite', jsonb_build_object(
      'business', owner_business,
      'link', site_url || '/join-staff?token=' || invite_token,
      'tabs', to_jsonb(array['academy'])
    ));
  end if;

  return invite_token;
end $$;
revoke all on function public.create_coach_invite_link(uuid, text) from public, anon;
grant execute on function public.create_coach_invite_link(uuid, text) to authenticated;

drop function if exists public.staff_invite_preview(text);
create function public.staff_invite_preview(p_token text)
returns table(business_name text, invited_email text, is_coach boolean, academy_name text)
language sql stable security definer set search_path to '' as $$
  select po.business_name, i.invited_email, i.is_coach, a.name
  from public.owner_staff_invites i
  join public.pitch_owners po on po.id = i.pitch_owner_id
  left join academy.academies a on a.id = i.coach_academy_id
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and i.accepted_at is null
    and i.expires_at > now()
    and po.status = 'active';
$$;
revoke all on function public.staff_invite_preview(text) from public;
grant execute on function public.staff_invite_preview(text) to anon, authenticated;

-- Owners may also place their coaches into academies.
create or replace function academy.owner_add_enrolment(target_member_id uuid, target_academy_id uuid)
returns void language plpgsql security definer set search_path to 'academy', 'public' as $$
begin
  if not academy.owns_academy(target_academy_id) then
    raise exception 'You can only enrol people into an academy you own.';
  end if;

  if not exists (
    select 1
    from academy.enrolments e
    where e.status = 'approved'
      and academy.owns_academy(e.academy_id)
      and (
        e.member_id = target_member_id
        or exists (
          select 1
          from academy.members guardian
          join academy.members player
            on player.member_kind = 'player'
           and target_member_id in (player.guardian_id, player.guardian_id_2)
          where guardian.id = target_member_id
            and guardian.member_kind = 'guardian'
            and e.member_id = player.id
        )
      )
  ) and not exists (
    select 1
    from academy.academies a
    join public.owner_staff_memberships s on s.pitch_owner_id = a.pitch_owner_id and s.is_coach and s.status = 'active'
    join academy.members m on m.user_id = s.user_id and m.is_coach
    where a.id = target_academy_id and m.id = target_member_id
  ) then
    raise exception 'This person is not part of any academy you run, nor a parent of a player in one.';
  end if;

  insert into academy.enrolments (academy_id, member_id, status, responded_at)
  values (target_academy_id, target_member_id, 'approved', now())
  on conflict (academy_id, member_id) do update
    set status = 'approved', responded_at = now()
    where academy.enrolments.status <> 'approved';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Directories for Assignments, Matches and Communication
-- ---------------------------------------------------------------------------
create or replace function academy.team_directory(p_pitch_owner_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare result jsonb;
begin
  if not academy.can_manage_owner_academies(p_pitch_owner_id) then
    raise exception 'You do not manage this sports centre.';
  end if;

  with owned as (
    select a.id from academy.academies a where a.pitch_owner_id = p_pitch_owner_id
  ), pool as (
    select e.id as enrolment_id, e.academy_id, e.member_id, e.status
    from academy.enrolments e join owned o on o.id = e.academy_id
    where e.status in ('approved', 'pending')
  ), players as (
    select m.* from academy.members m
    where m.member_kind = 'player' and m.id in (select member_id from pool)
  ), parent_ids as (
    select guardian_id as id from players where guardian_id is not null
    union select guardian_id_2 from players where guardian_id_2 is not null
    union select p.member_id from pool p join academy.members m on m.id = p.member_id and m.member_kind = 'guardian'
  )
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'full_name', m.full_name, 'date_of_birth', m.date_of_birth,
        'academy_ids', coalesce((select jsonb_agg(p.academy_id) from pool p where p.member_id = m.id and p.status = 'approved'), '[]'::jsonb),
        'pending', coalesce((select jsonb_agg(jsonb_build_object('enrolment_id', p.enrolment_id, 'academy_id', p.academy_id)) from pool p where p.member_id = m.id and p.status = 'pending'), '[]'::jsonb),
        'parent_ids', to_jsonb(array_remove(array[m.guardian_id, m.guardian_id_2], null))
      ) order by lower(m.full_name)) from players m), '[]'::jsonb),
    'parents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'full_name', g.full_name, 'email', g.email, 'phone', g.phone,
        'has_account', g.user_id is not null,
        'child_ids', coalesce((select jsonb_agg(k.id) from players k where g.id in (k.guardian_id, k.guardian_id_2)), '[]'::jsonb),
        'academy_ids', coalesce((
          select jsonb_agg(distinct p.academy_id) from pool p
          where p.status = 'approved' and (
            p.member_id = g.id
            or p.member_id in (select k.id from players k where g.id in (k.guardian_id, k.guardian_id_2))
          )), '[]'::jsonb),
        'pending', coalesce((select jsonb_agg(jsonb_build_object('enrolment_id', p.enrolment_id, 'academy_id', p.academy_id)) from pool p where p.member_id = g.id and p.status = 'pending'), '[]'::jsonb)
      ) order by lower(g.full_name))
      from academy.members g where g.id in (select id from parent_ids)), '[]'::jsonb),
    'coaches', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'full_name', m.full_name, 'email', s.email, 'status', s.status,
        'academy_ids', coalesce((
          select jsonb_agg(e.academy_id) from academy.enrolments e join owned o on o.id = e.academy_id
          where e.member_id = m.id and e.status = 'approved'), '[]'::jsonb)
      ) order by lower(m.full_name))
      from public.owner_staff_memberships s
      join academy.members m on m.user_id = s.user_id and m.is_coach
      where s.pitch_owner_id = p_pitch_owner_id and s.is_coach), '[]'::jsonb)
  ) into result;

  return result;
end $$;
revoke all on function academy.team_directory(uuid) from public, anon;
grant execute on function academy.team_directory(uuid) to authenticated;

-- Announcements may go to a player's parent even when only the child is enrolled.
create or replace function academy.recipients_allowed(p_academies uuid[], p_people uuid[])
returns boolean language sql stable security definer set search_path to '' as $$
  select not exists (
    select 1 from unnest(p_people) as person(id)
    where not exists (
      select 1 from academy.enrolments e
      join academy.members m on m.id = e.member_id
      where e.academy_id = any(p_academies) and e.status = 'approved'
        and (
          (e.member_id = person.id and m.member_kind in ('guardian', 'staff', 'player'))
          or (m.member_kind = 'player' and person.id in (m.guardian_id, m.guardian_id_2))
        )
    )
  );
$$;
revoke all on function academy.recipients_allowed(uuid[], uuid[]) from public, anon, authenticated;

select pg_temp.patch_function(
  'academy.create_communication(uuid,uuid[],text,text,text,uuid[],timestamptz,uuid[],text,timestamptz,timestamptz)'::regprocedure,
  '<> cardinality(selected_people) then',
  '<> cardinality(selected_people) and not academy.recipients_allowed(selected_academies, selected_people) then');

-- Chat between the sports centre office and its coaches.
create or replace function academy.workspace_member(p_pitch_owner_id uuid, p_user uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_member uuid; v_name text; v_academy uuid;
begin
  select m.id into v_member from academy.members m where m.user_id = p_user and m.member_kind = 'staff';
  if v_member is not null then return v_member; end if;
  if exists (select 1 from academy.members m where m.user_id = p_user) then
    raise exception 'This account is registered as a parent, so it cannot use the staff chat.';
  end if;

  select coalesce(
    (select nullif(btrim(s.full_name), '') from public.owner_staff_memberships s where s.user_id = p_user and s.pitch_owner_id = p_pitch_owner_id limit 1),
    (select nullif(btrim(po.business_name), '') from public.pitch_owners po where po.id = p_pitch_owner_id),
    'Academy') into v_name;

  insert into academy.members (user_id, full_name, member_kind, is_self_managed)
  values (p_user, academy.free_member_name(v_name), 'staff', true)
  returning id into v_member;

  select a.id into v_academy from academy.academies a where a.pitch_owner_id = p_pitch_owner_id
  order by a.is_main desc, a.created_at limit 1;
  if v_academy is not null then
    insert into academy.enrolments (academy_id, member_id, status, responded_at)
    values (v_academy, v_member, 'approved', now()) on conflict do nothing;
  end if;
  return v_member;
end $$;
revoke all on function academy.workspace_member(uuid, uuid) from public, anon, authenticated;

create or replace function academy.team_chat_contacts(p_pitch_owner_id uuid)
returns table(member_id uuid, full_name text, role text, my_member_id uuid, conversation_id uuid,
  last_body text, last_at timestamptz, unread_count integer)
language plpgsql security definer set search_path to '' as $$
#variable_conflict use_column
declare me uuid; owner_user uuid; office uuid;
begin
  if not academy.can_manage_owner_academies(p_pitch_owner_id) then
    raise exception 'You do not manage this sports centre.';
  end if;
  me := academy.workspace_member(p_pitch_owner_id, auth.uid());
  select po.user_id into owner_user from public.pitch_owners po where po.id = p_pitch_owner_id;
  if owner_user is not null and owner_user <> auth.uid()
     and exists (select 1 from public.owner_staff_memberships s where s.user_id = auth.uid() and s.pitch_owner_id = p_pitch_owner_id and s.is_coach) then
    office := academy.workspace_member(p_pitch_owner_id, owner_user);
  end if;

  return query
  with people as (
    select office as id, 'office'::text as role where office is not null
    union all
    select m.id, 'coach'
    from public.owner_staff_memberships s
    join academy.members m on m.user_id = s.user_id and m.is_coach
    where s.pitch_owner_id = p_pitch_owner_id and s.is_coach and s.status = 'active' and m.id <> me
  )
  select m.id, m.full_name, p.role, me, c.id, lm.body, lm.created_at,
    coalesce((
      select count(*)::int from academy.messages x
      join academy.conversation_members mine on mine.conversation_id = x.conversation_id and mine.member_id = me
      where x.conversation_id = c.id and x.sender_id <> me
        and (mine.last_read_at is null or x.created_at > mine.last_read_at)
    ), 0)
  from people p
  join academy.members m on m.id = p.id
  left join lateral (
    select conv.id from academy.conversations conv
    where conv.kind = 'direct'
      and (select count(*) from academy.conversation_members cm where cm.conversation_id = conv.id) = 2
      and exists (select 1 from academy.conversation_members cm where cm.conversation_id = conv.id and cm.member_id = me)
      and exists (select 1 from academy.conversation_members cm where cm.conversation_id = conv.id and cm.member_id = m.id)
    order by conv.created_at limit 1
  ) c on true
  left join lateral (
    select x.body, x.created_at from academy.messages x where x.conversation_id = c.id order by x.created_at desc limit 1
  ) lm on true
  order by (p.role <> 'office'), lm.created_at desc nulls last, lower(m.full_name);
end $$;
revoke all on function academy.team_chat_contacts(uuid) from public, anon;
grant execute on function academy.team_chat_contacts(uuid) to authenticated;

create or replace function academy.start_team_chat(p_pitch_owner_id uuid, p_other_member_id uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare me uuid; found_id uuid; v_academy uuid;
begin
  if not academy.can_manage_owner_academies(p_pitch_owner_id) then
    raise exception 'You do not manage this sports centre.';
  end if;
  me := academy.workspace_member(p_pitch_owner_id, auth.uid());
  if me = p_other_member_id then raise exception 'You cannot start a chat with yourself.'; end if;
  if not exists (
    select 1 from academy.members m
    where m.id = p_other_member_id and m.member_kind = 'staff' and (
      exists (select 1 from public.owner_staff_memberships s where s.user_id = m.user_id and s.pitch_owner_id = p_pitch_owner_id and s.is_coach and s.status = 'active')
      or exists (select 1 from public.pitch_owners po where po.id = p_pitch_owner_id and po.user_id = m.user_id)
    )
  ) then raise exception 'You can only message your own coaches.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(least(me, p_other_member_id)::text || greatest(me, p_other_member_id)::text, 2));
  select c.id into found_id from academy.conversations c
  where c.kind = 'direct'
    and (select count(*) from academy.conversation_members cm where cm.conversation_id = c.id) = 2
    and exists (select 1 from academy.conversation_members cm where cm.conversation_id = c.id and cm.member_id = me)
    and exists (select 1 from academy.conversation_members cm where cm.conversation_id = c.id and cm.member_id = p_other_member_id)
  order by c.created_at limit 1;
  if found_id is not null then return found_id; end if;

  select a.id into v_academy from academy.academies a where a.pitch_owner_id = p_pitch_owner_id
  order by a.is_main desc, a.created_at limit 1;
  insert into academy.conversations (academy_id, kind, created_by) values (v_academy, 'direct', me) returning id into found_id;
  insert into academy.conversation_members (conversation_id, member_id) values (found_id, me), (found_id, p_other_member_id);
  return found_id;
end $$;
revoke all on function academy.start_team_chat(uuid, uuid) from public, anon;
grant execute on function academy.start_team_chat(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. An academy match on an own pitch books that pitch
-- ---------------------------------------------------------------------------
create or replace function public.academy_session_overlaps(
  p_pitch uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null
) returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from academy.sessions s
    where s.pitch_id = p_pitch and not s.is_cancelled and s.id is distinct from p_exclude and (
      (s.recurrence = 'none' and s.starts_at < p_end and s.ends_at > p_start)
      or (s.recurrence = 'weekly' and exists (
        select 1 from generate_series(
          greatest(0, floor(extract(epoch from (p_start - s.ends_at)) / 604800))::int,
          greatest(0, ceil(extract(epoch from (p_end - s.starts_at)) / 604800))::int
        ) as w
        where s.starts_at + w * interval '7 days' < p_end
          and s.ends_at + w * interval '7 days' > p_start
          and (s.recurrence_until is null or (s.starts_at + w * interval '7 days')::date <= s.recurrence_until)
      ))
    )
  );
$$;
revoke all on function public.academy_session_overlaps(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.academy_session_overlaps(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;

create or replace function academy.check_session_pitch()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.pitch_id is null or new.is_cancelled then return new; end if;
  if tg_op = 'UPDATE' and new.pitch_id is not distinct from old.pitch_id
     and new.starts_at = old.starts_at and new.ends_at = old.ends_at
     and new.is_cancelled = old.is_cancelled then
    return new;
  end if;

  if not exists (
    select 1 from public.pitches p join academy.academies a on a.pitch_owner_id = p.pitch_owner_id
    where p.id = new.pitch_id and a.id = new.academy_id
  ) then raise exception 'Choose one of your own pitches.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.pitch_id::text, 1));

  if exists (
    select 1 from public.matches m where m.pitch_id = new.pitch_id and m.status <> 'cancelled'
      and m.starts_at < new.ends_at and m.ends_at > new.starts_at
  ) then raise exception 'This pitch already has a MYPitch match at that time.'; end if;
  if exists (
    select 1 from public.pitch_blocks b where b.pitch_id = new.pitch_id
      and b.start_time < new.ends_at and b.end_time > new.starts_at
  ) then raise exception 'This pitch is already blocked or booked at that time.'; end if;
  if public.academy_session_overlaps(new.pitch_id, new.starts_at, new.ends_at, new.id) then
    raise exception 'Another academy match is on this pitch at that time.';
  end if;
  return new;
end $$;

drop trigger if exists sessions_check_pitch on academy.sessions;
create trigger sessions_check_pitch before insert or update on academy.sessions
  for each row execute function academy.check_session_pitch();

create or replace function public.check_pitch_block_conflicts()
returns trigger language plpgsql set search_path to '' as $function$
BEGIN
  -- Blocking a slot only makes sense for the future. External bookings and
  -- parties may be entered after the fact (a phone booking that already
  -- happened), so the past rule applies to blocks alone.
  IF TG_OP = 'INSERT' AND NEW.block_type = 'blocked' AND NEW.start_time < now() THEN
    RAISE EXCEPTION 'A booking cannot start in the past.';
  END IF;

  -- On update, only complain when the time actually moved; leaving a past
  -- booking where it is and fixing its notes stays possible.
  IF TG_OP = 'UPDATE'
     AND NEW.block_type = 'blocked'
     AND NEW.start_time IS DISTINCT FROM OLD.start_time
     AND NEW.start_time < now() THEN
    RAISE EXCEPTION 'A booking cannot be moved into the past.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.pitch_id = NEW.pitch_id
      AND m.status <> 'cancelled'
      AND tstzrange(m.starts_at, m.ends_at) && tstzrange(NEW.start_time, NEW.end_time)
  ) THEN
    RAISE EXCEPTION 'This slot overlaps an existing CYPitch match and cannot be blocked.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.academy_session_overlaps(NEW.pitch_id, NEW.start_time, NEW.end_time) THEN
      RAISE EXCEPTION 'This slot overlaps an academy match on this pitch.';
    END IF;
  ELSIF NEW.start_time IS DISTINCT FROM OLD.start_time
     OR NEW.end_time IS DISTINCT FROM OLD.end_time
     OR NEW.pitch_id IS DISTINCT FROM OLD.pitch_id THEN
    IF public.academy_session_overlaps(NEW.pitch_id, NEW.start_time, NEW.end_time) THEN
      RAISE EXCEPTION 'This slot overlaps an academy match on this pitch.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

create or replace function public.reject_match_on_academy_session()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status <> 'cancelled' and public.academy_session_overlaps(new.pitch_id, new.starts_at, new.ends_at) then
    raise exception 'This slot is already booked.';
  end if;
  return new;
end $$;
revoke all on function public.reject_match_on_academy_session() from public, anon, authenticated;
drop trigger if exists reject_match_on_academy_session on public.matches;
create trigger reject_match_on_academy_session before insert on public.matches
  for each row execute function public.reject_match_on_academy_session();

-- Weekly bookings skip the weeks an academy match already takes.
select pg_temp.patch_function(
  'public.create_recurring_pitch_blocks(uuid,timestamptz,timestamptz,text,text,date,boolean,text,text)'::regprocedure,
  'IF EXISTS (', 'IF public.academy_session_overlaps(pitch_id_input, v_start, v_end) OR EXISTS (');
select pg_temp.patch_function('public.repeat_pitch_block_weekly(uuid,date,boolean)'::regprocedure,
  'if exists (', 'if public.academy_session_overlaps(b.pitch_id, v_start, v_end) or exists (');
select pg_temp.patch_function('public.extend_unlimited_pitch_block_series()'::regprocedure,
  'if not exists (', 'if not public.academy_session_overlaps(v_series.pitch_id, v_start, v_end) and not exists (');
select pg_temp.patch_function('public.extend_open_ended_block_series()'::regprocedure,
  'IF NOT EXISTS (', 'IF NOT public.academy_session_overlaps(v_template.pitch_id, v_start, v_end) AND NOT EXISTS (');

-- A relocated MYPitch match never lands on top of an academy match.
select pg_temp.patch_function(
  (select p.oid::regprocedure from pg_proc p where p.proname = 'owner_cancel_pending_match' and p.pronamespace = 'public'::regnamespace),
  'found_new_pitch_id := candidate.id;',
  'if public.academy_session_overlaps(candidate.id, match_record.starts_at, match_record.ends_at) then continue; end if;
      found_new_pitch_id := candidate.id;');

-- ---------------------------------------------------------------------------
-- 4. Matches: one function creates and edits them
-- ---------------------------------------------------------------------------
create table if not exists academy.match_reminders (
  session_id uuid not null references academy.sessions(id) on delete cascade,
  offset_minutes integer not null check (offset_minutes in (2880, 1440, 300, 240, 180, 120, 60, 30, 20, 10, 0)),
  sent_at timestamptz,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (session_id, offset_minutes)
);
alter table academy.match_reminders enable row level security;
drop policy if exists "Academy managers read match reminders" on academy.match_reminders;
create policy "Academy managers read match reminders" on academy.match_reminders for select to authenticated
  using (exists (select 1 from academy.sessions s where s.id = session_id and academy.owns_academy(s.academy_id)));
revoke all on academy.match_reminders from anon, authenticated;
grant select on academy.match_reminders to authenticated;
grant all on academy.match_reminders to service_role;

create or replace function academy.match_notice_body(p_session uuid)
returns text language sql stable security definer set search_path to '' as $$
  select a.name || ' vs ' || coalesce(s.opponent, 'TBC')
    || E'\nDate: ' || to_char(s.starts_at at time zone 'Asia/Nicosia', 'Dy DD Mon YYYY, HH24:MI')
    || coalesce(E'\nPlace: ' || nullif(btrim(s.location_name), ''), '')
    || coalesce(E'\n' || nullif(btrim(s.maps_url), ''), '')
    || coalesce(E'\nKit colour: ' || nullif(btrim(s.kit_color), ''), '')
    || coalesce(E'\nNotes: ' || nullif(btrim(s.notes), ''), '')
  from academy.sessions s join academy.academies a on a.id = s.academy_id
  where s.id = p_session;
$$;
revoke all on function academy.match_notice_body(uuid) from public, anon, authenticated;

-- Writes one notice per person: the selected players, their parents, and the coaches.
create or replace function academy.notify_match_people(p_session uuid, p_members uuid[], p_type text, p_title text, p_body text)
returns integer language plpgsql security definer set search_path to '' as $$
declare sent integer;
begin
  insert into academy.notifications (member_id, academy_id, session_id, type, title, body)
  select r.id, s.academy_id, s.id, p_type, p_title, p_body
  from academy.sessions s
  cross join (
    select m.id from academy.members m where m.id = any(p_members)
    union select m.guardian_id from academy.members m where m.id = any(p_members) and m.member_kind = 'player' and m.guardian_id is not null
    union select m.guardian_id_2 from academy.members m where m.id = any(p_members) and m.member_kind = 'player' and m.guardian_id_2 is not null
  ) r
  where s.id = p_session and academy.wants_notice(r.id, 'matches');
  get diagnostics sent = row_count;
  return sent;
end $$;
revoke all on function academy.notify_match_people(uuid, uuid[], text, text, text) from public, anon, authenticated;

create or replace function academy.save_match(
  p_session_id uuid,
  p_academy_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_pitch_id uuid default null,
  p_location_name text default null,
  p_maps_url text default null,
  p_opponent text default null,
  p_opponent_academy_id uuid default null,
  p_kit_color text default null,
  p_notes text default null,
  p_player_ids uuid[] default '{}',
  p_coach_ids uuid[] default '{}',
  p_reminder_offsets integer[] default '{}'
) returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  existing academy.sessions%rowtype;
  v_is_new boolean := p_session_id is null;
  v_id uuid := p_session_id;
  v_academy uuid := p_academy_id;
  v_owner uuid;
  v_time_changed boolean;
  v_details_changed boolean := false;
  v_opponent text := nullif(btrim(coalesce(p_opponent, '')), '');
  v_location text := nullif(btrim(coalesce(p_location_name, '')), '');
  v_maps text := nullif(btrim(coalesce(p_maps_url, '')), '');
  v_kit text := nullif(btrim(coalesce(p_kit_color, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_players uuid[];
  v_coaches uuid[];
  v_all uuid[];
  v_before uuid[] := '{}';
  v_added uuid[];
  v_offsets integer[];
  v_offset integer;
  v_notified integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to schedule a match.'; end if;

  if not v_is_new then
    select s.* into existing from academy.sessions s where s.id = p_session_id for update;
    if not found or existing.kind <> 'match' or not academy.owns_academy(existing.academy_id) then
      raise exception 'Match not found.';
    end if;
    if existing.is_cancelled then raise exception 'This match was cancelled. Restore it before editing.'; end if;
    v_academy := existing.academy_id;
  elsif v_academy is null or not academy.owns_academy(v_academy) then
    raise exception 'You can only schedule matches for your own academy.';
  end if;

  select a.pitch_owner_id into v_owner from academy.academies a where a.id = v_academy;

  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '12 hours' then
    raise exception 'The end time must be after the start time.';
  end if;
  v_time_changed := v_is_new or p_starts_at <> existing.starts_at or p_ends_at <> existing.ends_at;
  if v_time_changed and p_starts_at <= now() then raise exception 'The match has to start in the future.'; end if;

  if p_opponent_academy_id is not null then
    if p_opponent_academy_id = v_academy then raise exception 'Choose a different academy as the opponent.'; end if;
    if v_opponent is null then
      select a.name into v_opponent from academy.academies a where a.id = p_opponent_academy_id;
    end if;
  end if;
  if v_opponent is null then raise exception 'Enter the opponent team.'; end if;
  if char_length(v_opponent) > 120 or char_length(coalesce(v_kit, '')) > 60 or char_length(coalesce(v_notes, '')) > 1000 then
    raise exception 'One of the texts is too long.';
  end if;

  if p_pitch_id is not null then
    select p.name, nullif(btrim(p.maps_url), '') into v_location, v_maps
    from public.pitches p where p.id = p_pitch_id and p.pitch_owner_id = v_owner;
    if not found then raise exception 'Choose one of your own pitches.'; end if;
  elsif v_maps is not null and v_maps !~* '^https?://(maps\.app\.goo\.gl|goo\.gl/maps|maps\.google\.[a-z.]+|([a-z0-9-]+\.)?google\.[a-z.]+/maps)(/|\?|$)' then
    raise exception 'Enter a valid Google Maps link.';
  end if;

  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_players from unnest(coalesce(p_player_ids, '{}'::uuid[])) as x(id);
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_coaches from unnest(coalesce(p_coach_ids, '{}'::uuid[])) as x(id);
  if (
    select count(*) from academy.enrolments e join academy.members m on m.id = e.member_id
    where e.academy_id = v_academy and e.status = 'approved' and m.member_kind = 'player' and e.member_id = any(v_players)
  ) <> cardinality(v_players) then
    raise exception 'Every selected player must belong to this academy.';
  end if;
  if (
    select count(*) from academy.members m
    where m.id = any(v_coaches) and m.is_coach and (
      exists (select 1 from public.owner_staff_memberships s where s.user_id = m.user_id and s.pitch_owner_id = v_owner and s.is_coach and s.status = 'active')
      or exists (select 1 from academy.enrolments e where e.member_id = m.id and e.academy_id = v_academy and e.status = 'approved')
    )
  ) <> cardinality(v_coaches) then
    raise exception 'Every selected coach must be one of your active coaches.';
  end if;
  v_all := v_players || v_coaches;

  select coalesce(array_agg(distinct x.v order by x.v desc), '{}'::integer[]) into v_offsets
  from unnest(coalesce(p_reminder_offsets, '{}'::integer[])) as x(v);
  if cardinality(v_offsets) > 2 then raise exception 'A match can have up to two reminders.'; end if;
  foreach v_offset in array v_offsets loop
    if v_offset is null or v_offset not in (2880, 1440, 300, 240, 180, 120, 60, 30, 20, 10, 0) then
      raise exception 'Choose one of the listed reminder times.';
    end if;
    if p_starts_at - make_interval(mins => v_offset) <= now() and (
      v_is_new or not exists (select 1 from academy.match_reminders r where r.session_id = v_id and r.offset_minutes = v_offset)
    ) then
      raise exception 'A reminder time you chose has already passed.';
    end if;
  end loop;

  -- Only the people picked for this match are told about it.
  perform pg_catalog.set_config('academy.suppress_session_notifications', 'on', true);

  if v_is_new then
    insert into academy.sessions (academy_id, kind, starts_at, ends_at, pitch_id, location_name, maps_url,
      opponent, opponent_academy_id, notes, kit_color, recurrence)
    values (v_academy, 'match', p_starts_at, p_ends_at, p_pitch_id, v_location, v_maps,
      v_opponent, p_opponent_academy_id, v_notes, v_kit, 'none')
    returning id into v_id;
  else
    select coalesce(array_agg(a.member_id), '{}'::uuid[]) into v_before
    from academy.session_attendees a where a.session_id = v_id;

    v_details_changed := v_time_changed
      or p_pitch_id is distinct from existing.pitch_id
      or v_location is distinct from existing.location_name
      or v_maps is distinct from existing.maps_url
      or v_opponent is distinct from existing.opponent
      or v_kit is distinct from existing.kit_color
      or v_notes is distinct from existing.notes;

    update academy.sessions
    set starts_at = p_starts_at, ends_at = p_ends_at, pitch_id = p_pitch_id, location_name = v_location,
        maps_url = v_maps, opponent = v_opponent, opponent_academy_id = p_opponent_academy_id,
        notes = v_notes, kit_color = v_kit, updated_at = now()
    where id = v_id;

    delete from academy.session_attendees a where a.session_id = v_id and a.member_id <> all(v_all);
    if v_time_changed then
      update academy.session_attendees set response = 'invited', responded_at = null where session_id = v_id;
    end if;
  end if;

  insert into academy.session_attendees (session_id, member_id, response)
  select v_id, x.id, 'invited' from unnest(v_all) as x(id)
  on conflict (session_id, member_id) do nothing;

  delete from academy.match_reminders r where r.session_id = v_id and r.offset_minutes <> all(v_offsets);
  insert into academy.match_reminders (session_id, offset_minutes)
  select v_id, x.v from unnest(v_offsets) as x(v)
  on conflict (session_id, offset_minutes) do nothing;
  if v_time_changed and not v_is_new then
    -- A moved match sends its reminders again, unless their new time has passed.
    update academy.match_reminders r
    set sent_at = case when p_starts_at - make_interval(mins => r.offset_minutes) > now() then null else now() end,
        skipped = (p_starts_at - make_interval(mins => r.offset_minutes) <= now())
    where r.session_id = v_id;
  end if;

  if p_starts_at > now() then
    if v_is_new then
      v_notified := academy.notify_match_people(v_id, v_all, 'session', 'New match scheduled', academy.match_notice_body(v_id));
    elsif v_details_changed then
      v_notified := academy.notify_match_people(v_id, v_all, 'session', 'Match details updated', academy.match_notice_body(v_id));
    else
      select coalesce(array_agg(x.id), '{}'::uuid[]) into v_added from unnest(v_all) as x(id) where x.id <> all(v_before);
      if cardinality(v_added) > 0 then
        v_notified := academy.notify_match_people(v_id, v_added, 'session', 'New match scheduled', academy.match_notice_body(v_id));
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'notified', v_notified);
end $$;
revoke all on function academy.save_match(uuid, uuid, timestamptz, timestamptz, uuid, text, text, text, uuid, text, text, uuid[], uuid[], integer[]) from public, anon;
grant execute on function academy.save_match(uuid, uuid, timestamptz, timestamptz, uuid, text, text, text, uuid, text, text, uuid[], uuid[], integer[]) to authenticated;

create or replace function academy.set_match_cancelled(p_session_id uuid, p_cancelled boolean)
returns integer language plpgsql security definer set search_path to '' as $$
declare fixture academy.sessions%rowtype; people uuid[]; sent integer := 0;
begin
  select s.* into fixture from academy.sessions s where s.id = p_session_id for update;
  if not found or fixture.kind <> 'match' or not academy.owns_academy(fixture.academy_id) then
    raise exception 'Match not found.';
  end if;
  if fixture.is_cancelled = p_cancelled then return 0; end if;

  perform pg_catalog.set_config('academy.suppress_session_notifications', 'on', true);
  update academy.sessions set is_cancelled = p_cancelled, updated_at = now() where id = p_session_id;

  if fixture.starts_at > now() then
    select coalesce(array_agg(a.member_id), '{}'::uuid[]) into people
    from academy.session_attendees a where a.session_id = p_session_id;
    sent := academy.notify_match_people(p_session_id, people, 'session',
      case when p_cancelled then 'Match cancelled' else 'Match is back on' end,
      academy.match_notice_body(p_session_id));
  end if;
  return sent;
end $$;
revoke all on function academy.set_match_cancelled(uuid, boolean) from public, anon;
grant execute on function academy.set_match_cancelled(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reminders, sent every minute to parents and coaches
-- ---------------------------------------------------------------------------
create or replace function academy.deliver_due_match_reminders()
returns integer language plpgsql security definer set search_path to '' as $$
declare due record; people uuid[]; total integer := 0; lead text;
begin
  for due in
    select r.session_id, r.offset_minutes, s.starts_at
    from academy.match_reminders r
    join academy.sessions s on s.id = r.session_id
    where r.sent_at is null and not s.is_cancelled
      and s.starts_at - make_interval(mins => r.offset_minutes) <= now()
    for update of r skip locked
  loop
    -- Far too late to be useful (for instance after an outage): drop it.
    if now() > due.starts_at - make_interval(mins => due.offset_minutes) + interval '15 minutes' then
      update academy.match_reminders set sent_at = now(), skipped = true
      where session_id = due.session_id and offset_minutes = due.offset_minutes;
      continue;
    end if;

    lead := case due.offset_minutes
      when 2880 then 'in 2 days' when 1440 then 'tomorrow' when 300 then 'in 5 hours'
      when 240 then 'in 4 hours' when 180 then 'in 3 hours' when 120 then 'in 2 hours'
      when 60 then 'in 1 hour' when 30 then 'in 30 minutes' when 20 then 'in 20 minutes'
      when 10 then 'in 10 minutes' else 'now' end;

    select coalesce(array_agg(a.member_id), '{}'::uuid[]) into people
    from academy.session_attendees a
    where a.session_id = due.session_id and a.response <> 'not_going';

    total := total + academy.notify_match_people(due.session_id, people, 'match_reminder',
      case when due.offset_minutes = 0 then 'Match starting now' else 'Match reminder: ' || lead end,
      academy.match_notice_body(due.session_id));

    update academy.match_reminders set sent_at = now()
    where session_id = due.session_id and offset_minutes = due.offset_minutes;
  end loop;
  return total;
end $$;
revoke all on function academy.deliver_due_match_reminders() from public, anon, authenticated;

select cron.schedule('academy-match-reminders', '* * * * *', 'select academy.deliver_due_match_reminders();');
