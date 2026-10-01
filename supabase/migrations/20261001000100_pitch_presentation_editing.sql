create or replace function public.update_pitch_presentation(
  pitch_id_input uuid,
  facilities_input text[],
  image_url_input text default null
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

  if facilities_input is null or pg_catalog.cardinality(facilities_input) > 30 then
    raise exception 'Choose no more than 30 facilities.';
  end if;

  update public.pitches as p
     set facilities = facilities_input,
         image_urls = case
           when image_url_input is null then p.image_urls
           else pg_catalog.array_prepend(image_url_input, coalesce(p.image_urls[2:], '{}'::text[]))
         end,
         updated_at = pg_catalog.now()
   where p.id = pitch_id_input
     and exists (
       select 1 from public.pitch_owners as po
        where po.id = p.pitch_owner_id
          and po.user_id = (select auth.uid())
          and po.status = 'active'
     );

  if not found then
    raise exception 'This pitch is not available to your account.';
  end if;
end;
$function$;

revoke all on function public.update_pitch_presentation(uuid, text[], text)
  from public, anon;
grant execute on function public.update_pitch_presentation(uuid, text[], text)
  to authenticated;

insert into storage.buckets (id, name, public)
values ('pitch-images', 'pitch-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Pitch owners upload pitch images" on storage.objects;
create policy "Pitch owners upload pitch images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pitch-images'
    and exists (
      select 1 from public.pitches p
      join public.pitch_owners po on po.id = p.pitch_owner_id
      where p.id::text = (storage.foldername(name))[2]
        and po.id::text = (storage.foldername(name))[1]
        and po.user_id = (select auth.uid())
        and po.status = 'active'
    )
  );
