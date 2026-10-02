create or replace function academy.notify_session_change()
returns trigger
language plpgsql
security definer
set search_path to 'academy', 'public'
as $function$
declare
  notice_title text;
  notice_body text;
  category text := case when new.kind = 'match' then 'matches' else 'trainings' end;
begin
  -- Match edits use a single owner-checked RPC which writes one targeted
  -- notification batch after syncing the selected attendees.
  if coalesce(current_setting('academy.suppress_session_notifications', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    notice_title := case when new.kind = 'match' then 'New match scheduled' else 'New training scheduled' end;
  elsif new.is_cancelled and not old.is_cancelled then
    notice_title := case when new.kind = 'match' then 'Match cancelled' else 'Training cancelled' end;
  elsif new.starts_at <> old.starts_at then
    notice_title := case when new.kind = 'match' then 'Match moved' else 'Training moved' end;
  else
    return new;
  end if;

  notice_body := new.title || ' · ' || to_char(new.starts_at, 'DD Mon HH24:MI') ||
                 coalesce(' · ' || new.location_name, '');

  insert into academy.notifications (member_id, academy_id, session_id, type, title, body)
  select distinct recipient, new.academy_id, new.id, 'session', notice_title, notice_body
  from (
    select e.member_id as recipient
    from academy.enrolments e
    join academy.members m on m.id = e.member_id
    where e.academy_id = new.academy_id and e.status = 'approved' and m.member_kind <> 'staff'

    union

    select m.guardian_id
    from academy.enrolments e
    join academy.members m on m.id = e.member_id
    where e.academy_id = new.academy_id and e.status = 'approved' and m.guardian_id is not null

    union

    select m.guardian_id_2
    from academy.enrolments e
    join academy.members m on m.id = e.member_id
    where e.academy_id = new.academy_id and e.status = 'approved' and m.guardian_id_2 is not null
  ) as recipients
  where recipient is not null
    and academy.wants_notice(recipient, category);

  return new;
end;
$function$;

create or replace function academy.update_match_and_resend_notifications(
  target_session_id uuid,
  target_title text,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_location_name text,
  target_maps_url text,
  target_opponent text,
  target_opponent_academy_id uuid,
  target_member_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_session academy.sessions%rowtype;
  selected_member_ids uuid[];
  notification_title text;
  notification_body text;
  notifications_sent integer := 0;
begin
  select s.*
    into current_session
  from academy.sessions s
  where s.id = target_session_id
  for update;

  if not found or not academy.owns_academy(current_session.academy_id) then
    raise exception 'Match not found or not owned by current user';
  end if;

  if current_session.kind <> 'match' then
    raise exception 'Only matches can be edited with this operation';
  end if;

  if target_starts_at is null or target_ends_at is null or target_ends_at <= target_starts_at then
    raise exception 'Match end time must be after its start time';
  end if;

  select coalesce(array_agg(distinct selected.member_id), '{}'::uuid[])
    into selected_member_ids
  from unnest(coalesce(target_member_ids, '{}'::uuid[])) as selected(member_id);

  if cardinality(selected_member_ids) > 0 and (
    select count(distinct e.member_id)
    from academy.enrolments e
    join academy.members m on m.id = e.member_id
    where e.academy_id = current_session.academy_id
      and e.status = 'approved'
      and m.member_kind in ('player', 'staff')
      and e.member_id = any(selected_member_ids)
  ) <> cardinality(selected_member_ids) then
    raise exception 'Selected attendees must be approved players or coaches in this academy';
  end if;

  perform pg_catalog.set_config('academy.suppress_session_notifications', 'on', true);

  update academy.sessions
  set title = target_title,
      starts_at = target_starts_at,
      ends_at = target_ends_at,
      location_name = nullif(btrim(target_location_name), ''),
      maps_url = nullif(btrim(target_maps_url), ''),
      opponent = nullif(btrim(target_opponent), ''),
      opponent_academy_id = target_opponent_academy_id,
      updated_at = now()
  where id = target_session_id;

  delete from academy.session_attendees attendee
  where attendee.session_id = target_session_id
    and attendee.member_id <> all(selected_member_ids);

  insert into academy.session_attendees (session_id, member_id, response)
  select target_session_id, selected.member_id, 'invited'
  from unnest(selected_member_ids) as selected(member_id)
  on conflict (session_id, member_id)
  do update set response = 'invited', responded_at = null;

  notification_title := 'Match details updated';
  notification_body := coalesce(nullif(btrim(target_title), ''), nullif(btrim(target_opponent), ''), 'Match')
    || ' · ' || to_char(target_starts_at, 'DD Mon HH24:MI')
    || coalesce(' · ' || nullif(btrim(target_location_name), ''), '');

  insert into academy.notifications (member_id, academy_id, session_id, type, title, body)
  select distinct recipients.member_id, current_session.academy_id, target_session_id,
         'session', notification_title, notification_body
  from (
    select selected.member_id
    from unnest(selected_member_ids) as selected(member_id)

    union

    select m.guardian_id as member_id
    from academy.members m
    where m.id = any(selected_member_ids)
      and m.member_kind = 'player'
      and m.guardian_id is not null

    union

    select m.guardian_id_2 as member_id
    from academy.members m
    where m.id = any(selected_member_ids)
      and m.member_kind = 'player'
      and m.guardian_id_2 is not null
  ) recipients
  where recipients.member_id is not null
    and academy.wants_notice(recipients.member_id, 'matches');

  get diagnostics notifications_sent = row_count;
  return notifications_sent;
end;
$function$;

revoke all on function academy.update_match_and_resend_notifications(
  uuid, text, timestamptz, timestamptz, text, text, text, uuid, uuid[]
) from public, anon;
grant execute on function academy.update_match_and_resend_notifications(
  uuid, text, timestamptz, timestamptz, text, text, text, uuid, uuid[]
) to authenticated;
