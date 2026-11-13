-- Keep unlimited weekly external bookings and block slots rolling six months ahead.
-- The initial occurrences are still created by create_recurring_pitch_blocks.
create table if not exists public.unlimited_pitch_block_series (
  group_id uuid primary key,
  pitch_id uuid not null references public.pitches(id) on delete cascade,
  first_start timestamptz not null,
  first_end timestamptz not null,
  block_type text not null check (block_type in ('blocked', 'external_booking')),
  reason text not null,
  reference text,
  notes text,
  created_by uuid not null,
  next_week integer not null default 27 check (next_week >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists unlimited_pitch_block_series_active_idx
  on public.unlimited_pitch_block_series (active) where active;

alter table public.unlimited_pitch_block_series enable row level security;
revoke all on public.unlimited_pitch_block_series from public, anon, authenticated;

create or replace function public.create_unlimited_pitch_blocks(
  pitch_id_input uuid,
  first_start timestamptz,
  first_end timestamptz,
  block_type_input text,
  reason_input text,
  repeat_until_input date default null,
  open_ended_input boolean default true,
  reference_input text default null,
  notes_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not open_ended_input or repeat_until_input is not null then
    raise exception 'Unlimited bookings cannot have an end date.';
  end if;

  -- The existing function validates the owner and creates weeks 0 through 26.
  v_result := public.create_recurring_pitch_blocks(
    pitch_id_input, first_start, first_end, block_type_input, reason_input,
    null, true, reference_input, notes_input
  );

  insert into public.unlimited_pitch_block_series (
    group_id, pitch_id, first_start, first_end, block_type, reason,
    reference, notes, created_by, next_week
  ) values (
    (v_result ->> 'group_id')::uuid, pitch_id_input, first_start, first_end,
    block_type_input, reason_input, reference_input, notes_input,
    (select auth.uid()), 27
  );

  return v_result;
end;
$$;

revoke all on function public.create_unlimited_pitch_blocks(
  uuid, timestamptz, timestamptz, text, text, date, boolean, text, text
) from public, anon;
grant execute on function public.create_unlimited_pitch_blocks(
  uuid, timestamptz, timestamptz, text, text, date, boolean, text, text
) to authenticated;

create or replace function public.extend_unlimited_pitch_block_series()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series record;
  v_tz constant text := 'Asia/Nicosia';
  v_local_start timestamp;
  v_local_end timestamp;
  v_start timestamptz;
  v_end timestamptz;
  v_target date := (now() at time zone 'Asia/Nicosia')::date + 182;
  v_week integer;
  v_processed integer;
begin
  for v_series in
    select * from public.unlimited_pitch_block_series where active for update skip locked
  loop
    v_local_start := v_series.first_start at time zone v_tz;
    v_local_end := v_series.first_end at time zone v_tz;
    v_week := v_series.next_week;
    v_processed := 0;

    loop
      v_start := (v_local_start + v_week * interval '7 days') at time zone v_tz;
      exit when (v_start at time zone v_tz)::date > v_target or v_processed >= 104;
      v_end := (v_local_end + v_week * interval '7 days') at time zone v_tz;

      -- A conflicting match or block reserves that week. Advance the cursor
      -- even when skipped, so a deliberately removed occurrence stays removed.
      if not exists (
        select 1 from public.matches m
        where m.pitch_id = v_series.pitch_id and m.status <> 'cancelled'
          and tstzrange(m.starts_at, m.ends_at) && tstzrange(v_start, v_end)
      ) and not exists (
        select 1 from public.pitch_blocks b
        where b.pitch_id = v_series.pitch_id
          and tstzrange(b.start_time, b.end_time) && tstzrange(v_start, v_end)
      ) then
        insert into public.pitch_blocks (
          pitch_id, start_time, end_time, reason, created_by,
          block_type, reference, notes, recurrence_group_id, recurrence_open_ended
        ) values (
          v_series.pitch_id, v_start, v_end, v_series.reason, v_series.created_by,
          v_series.block_type, v_series.reference, v_series.notes, v_series.group_id, true
        );
      end if;

      v_week := v_week + 1;
      v_processed := v_processed + 1;
    end loop;

    update public.unlimited_pitch_block_series
    set next_week = v_week
    where group_id = v_series.group_id;
  end loop;
end;
$$;

revoke all on function public.extend_unlimited_pitch_block_series() from public, anon, authenticated;

create or replace function public.end_recurring_pitch_blocks(
  group_id_input uuid,
  from_time_input timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pitch_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to end this series.';
  end if;

  select s.pitch_id into v_pitch_id
  from public.unlimited_pitch_block_series s
  where s.group_id = group_id_input
  for update;

  if v_pitch_id is null then
    select b.pitch_id into v_pitch_id
    from public.pitch_blocks b
    where b.recurrence_group_id = group_id_input
    limit 1;
  end if;

  if v_pitch_id is null or not exists (
    select 1 from public.pitches p
    join public.pitch_owners po on po.id = p.pitch_owner_id
    where p.id = v_pitch_id and po.user_id = (select auth.uid())
      and po.status = 'active'
  ) then
    raise exception 'You do not have access to this series.';
  end if;

  update public.unlimited_pitch_block_series
  set active = false
  where group_id = group_id_input;

  delete from public.pitch_blocks
  where recurrence_group_id = group_id_input
    and pitch_id = v_pitch_id
    and start_time >= from_time_input;
end;
$$;

revoke all on function public.end_recurring_pitch_blocks(uuid, timestamptz)
  from public, anon;
grant execute on function public.end_recurring_pitch_blocks(uuid, timestamptz)
  to authenticated;

select cron.schedule(
  'extend-unlimited-pitch-block-series',
  '15 2 * * *',
  'select public.extend_unlimited_pitch_block_series();'
);
