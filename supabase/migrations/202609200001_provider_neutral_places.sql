-- Forward-only v2 -> v3 upgrade. Never rewrite the six historical migrations.
-- Legacy Google rows lack durable coordinates. Preserve their IDs, ownership,
-- metadata and references, but require the owner to supply a real location.
alter table public.saved_places drop constraint google_place_shape;
alter table public.saved_places drop constraint custom_place_shape;
alter table public.saved_places drop constraint source_data_boundary;
drop index public.saved_places_user_google_place_unique;
alter table public.saved_places rename column google_place_id to legacy_google_place_id;
alter table public.saved_places rename column custom_label to name;
alter table public.saved_places rename column custom_address to address;
alter table public.saved_places rename column custom_lat to lat;
alter table public.saved_places rename column custom_lng to lng;
alter table public.saved_places rename column tags to custom_tags;
alter table public.saved_places add column provider_place_id text;
alter table public.saved_places add column google_maps_url text;
alter table public.saved_places add column source_name text;
alter table public.saved_places add column needs_location boolean not null default false;
update public.saved_places set needs_location = true, source_name = 'Legacy import — owner location required'
where source = 'google';
update public.saved_places set name = 'Địa điểm cũ cần bổ sung' where nullif(trim(name),'') is null;
alter table public.saved_places alter column name set not null;
alter type public.place_source rename to place_source_legacy;
create type public.place_source as enum ('geoapify', 'custom');
alter table public.saved_places alter column source type public.place_source
using (case when source::text = 'google' then 'custom' else source::text end)::public.place_source;
drop type public.place_source_legacy;
alter table public.saved_places add constraint provider_place_shape check (
  (source = 'geoapify' and nullif(trim(provider_place_id),'') is not null)
  or (source = 'custom' and provider_place_id is null)
);
alter table public.saved_places add constraint place_location_shape check (
  (not needs_location and lat is not null and lng is not null)
  or (needs_location and source = 'custom' and legacy_google_place_id is not null and lat is null and lng is null)
);
alter table public.saved_places add constraint place_name_length check (char_length(trim(name)) between 1 and 120) not valid;
alter table public.saved_places add constraint safe_google_maps_url check (
  google_maps_url is null or (length(google_maps_url) <= 2048 and
    google_maps_url ~ '^https://(www\.google\.com/maps/|maps\.google\.com/|maps\.app\.goo\.gl/|goo\.gl/maps/)[^[:space:]\\]*$')
);
create unique index saved_places_user_provider_unique on public.saved_places(user_id, source, provider_place_id)
where provider_place_id is not null;
-- Clients cannot manufacture unresolved imports or rewrite original legacy IDs.
create function public.guard_place_import() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.needs_location or new.legacy_google_place_id is not null then
      raise exception 'Legacy import fields are read only' using errcode = '42501';
    end if;
  else
    if new.legacy_google_place_id is distinct from old.legacy_google_place_id
       or (new.needs_location and not old.needs_location) then
      raise exception 'Legacy import fields are read only' using errcode = '42501';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_place_import() from public, anon, authenticated;
create trigger guard_place_import before insert or update on public.saved_places
for each row execute function public.guard_place_import();
-- RLS, composite ownership FKs and privacy inheritance/deletion triggers survive.
