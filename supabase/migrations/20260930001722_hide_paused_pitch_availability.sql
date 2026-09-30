drop policy if exists "Anyone can view active pitch availability"
  on public.pitch_availability;

create policy "Anyone can view active pitch availability"
  on public.pitch_availability
  for select
  to anon, authenticated
  using (
    exists (
      select 1
        from public.pitches as p
       where p.id = pitch_availability.pitch_id
         and p.status = 'active'
         and not p.player_booking_paused
    )
  );
