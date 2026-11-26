-- The match form needs the centre's pitches and whether a time is free. Coaches
-- cannot read the agenda tables directly, so these answer only those questions.
create or replace function academy.venue_pitches(p_pitch_owner_id uuid)
returns table(id uuid, name text, city text, area text, maps_url text)
language plpgsql stable security definer set search_path to '' as $$
begin
  if not academy.can_manage_owner_academies(p_pitch_owner_id) then
    raise exception 'You do not manage this sports centre.';
  end if;
  return query
    select p.id, p.name::text, p.city::text, p.area::text, p.maps_url::text
    from public.pitches p
    where p.pitch_owner_id = p_pitch_owner_id and p.status <> 'archived'
    order by p.name;
end $$;
revoke all on function academy.venue_pitches(uuid) from public, anon;
grant execute on function academy.venue_pitches(uuid) to authenticated;

create or replace function academy.pitch_is_free(
  p_pitch_id uuid, p_start timestamptz, p_end timestamptz, p_exclude_session uuid default null
) returns boolean language plpgsql stable security definer set search_path to '' as $$
begin
  if not exists (
    select 1 from public.pitches p
    where p.id = p_pitch_id and academy.can_manage_owner_academies(p.pitch_owner_id)
  ) then raise exception 'Choose one of your own pitches.'; end if;

  return not exists (
      select 1 from public.matches m where m.pitch_id = p_pitch_id and m.status <> 'cancelled'
        and m.starts_at < p_end and m.ends_at > p_start
    ) and not exists (
      select 1 from public.pitch_blocks b where b.pitch_id = p_pitch_id
        and b.start_time < p_end and b.end_time > p_start
    ) and not public.academy_session_overlaps(p_pitch_id, p_start, p_end, p_exclude_session);
end $$;
revoke all on function academy.pitch_is_free(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function academy.pitch_is_free(uuid, timestamptz, timestamptz, uuid) to authenticated;
