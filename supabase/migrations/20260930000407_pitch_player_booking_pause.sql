alter table public.pitches
  add column if not exists player_booking_paused boolean not null default false,
  add column if not exists player_booking_pause_reason text,
  add column if not exists player_booking_paused_at timestamptz;

comment on column public.pitches.player_booking_paused is
  'Owner-controlled pause for MYPitch player bookings. Does not change pitch status or OwnerApp external reservations and parties.';

create or replace function public.set_pitch_player_booking_pause(
  pitch_id_input uuid,
  pause_input boolean,
  reason_input text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in to change this pitch.';
  end if;

  if pause_input is null then
    raise exception 'Choose whether to pause or resume player bookings.';
  end if;

  if pause_input and nullif(btrim(reason_input), '') is null then
    raise exception 'Enter a reason before pausing player bookings.';
  end if;

  if pause_input and char_length(btrim(reason_input)) > 500 then
    raise exception 'The pause reason must be 500 characters or fewer.';
  end if;

  update public.pitches as p
     set player_booking_paused = pause_input,
         player_booking_pause_reason = case
           when pause_input then btrim(reason_input)
           else null
         end,
         player_booking_paused_at = case
           when pause_input then pg_catalog.now()
           else null
         end,
         updated_at = pg_catalog.now()
   where p.id = pitch_id_input
     and exists (
       select 1
         from public.pitch_owners as po
        where po.id = p.pitch_owner_id
          and po.user_id = (select auth.uid())
          and po.status = 'active'
     );

  if not found then
    raise exception 'This pitch is not available to your account.';
  end if;
end;
$function$;

revoke all on function public.set_pitch_player_booking_pause(uuid, boolean, text)
  from public, anon;
grant execute on function public.set_pitch_player_booking_pause(uuid, boolean, text)
  to authenticated;

-- Only pitches that are open for MYPitch reservations are visible to players.
drop policy if exists "Anyone can view active pitches" on public.pitches;
create policy "Anyone can view active pitches"
  on public.pitches
  for select
  to anon, authenticated
  using (status = 'active' and not player_booking_paused);

-- Existing public matches at a paused pitch also disappear from player feeds.
drop policy if exists "Anyone can view public matches" on public.matches;
create policy "Anyone can view public matches"
  on public.matches
  for select
  to anon, authenticated
  using (
    visibility = 'public'
    and exists (
      select 1
        from public.pitches as p
       where p.id = matches.pitch_id
         and p.status = 'active'
         and not p.player_booking_paused
    )
  );

-- A second, authoritative check protects all reservation paths, including
-- checkout sessions created just before a pitch is paused.
create or replace function public.reject_paused_pitch_player_checkout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_pitch_id uuid;
  target_paused boolean;
begin
  if new.status not in ('pending', 'payment_started') then
    return new;
  end if;

  if new.checkout_type not in ('create_match', 'join_match') then
    return new;
  end if;

  target_pitch_id := new.pitch_id;
  if new.checkout_type = 'join_match' and new.match_id is not null then
    select m.pitch_id
      into target_pitch_id
      from public.matches as m
     where m.id = new.match_id;
  end if;

  select p.player_booking_paused
    into target_paused
    from public.pitches as p
   where p.id = target_pitch_id
   for share;

  if coalesce(target_paused, false) then
    raise exception 'This pitch is paused for MYPitch bookings.';
  end if;

  return new;
end;
$function$;

create or replace function public.reject_paused_pitch_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_paused boolean;
begin
  if new.status not in ('open', 'almost_full') then
    return new;
  end if;

  select p.player_booking_paused
    into target_paused
    from public.pitches as p
   where p.id = new.pitch_id
   for share;

  if coalesce(target_paused, false) then
    raise exception 'This pitch is paused for MYPitch bookings.';
  end if;

  return new;
end;
$function$;

create or replace function public.reject_paused_pitch_player_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_pitch_id uuid;
  target_paused boolean;
begin
  if new.status not in ('pending', 'confirmed', 'paid', 'invited') then
    return new;
  end if;

  select m.pitch_id
    into target_pitch_id
    from public.matches as m
   where m.id = new.match_id;

  select p.player_booking_paused
    into target_paused
    from public.pitches as p
   where p.id = target_pitch_id
   for share;

  if coalesce(target_paused, false) then
    raise exception 'This pitch is paused for MYPitch bookings.';
  end if;

  return new;
end;
$function$;

create or replace function public.reject_paused_pitch_block_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_paused boolean;
begin
  if new.block_type <> 'blocked' then
    return new;
  end if;

  select p.player_booking_paused
    into target_paused
    from public.pitches as p
   where p.id = new.pitch_id
   for share;

  if coalesce(target_paused, false) then
    raise exception 'Block slots are unavailable while MYPitch bookings are paused.';
  end if;

  return new;
end;
$function$;

revoke all on function public.reject_paused_pitch_player_checkout() from public, anon, authenticated;
revoke all on function public.reject_paused_pitch_match() from public, anon, authenticated;
revoke all on function public.reject_paused_pitch_player_join() from public, anon, authenticated;
revoke all on function public.reject_paused_pitch_block_slot() from public, anon, authenticated;

drop trigger if exists reject_paused_pitch_player_checkout on public.match_checkout_sessions;
create trigger reject_paused_pitch_player_checkout
  before insert or update on public.match_checkout_sessions
  for each row execute function public.reject_paused_pitch_player_checkout();

drop trigger if exists reject_paused_pitch_match on public.matches;
create trigger reject_paused_pitch_match
  before insert or update on public.matches
  for each row execute function public.reject_paused_pitch_match();

drop trigger if exists reject_paused_pitch_player_join on public.match_players;
create trigger reject_paused_pitch_player_join
  before insert or update on public.match_players
  for each row execute function public.reject_paused_pitch_player_join();

drop trigger if exists reject_paused_pitch_block_slot on public.pitch_blocks;
create trigger reject_paused_pitch_block_slot
  before insert or update on public.pitch_blocks
  for each row execute function public.reject_paused_pitch_block_slot();
