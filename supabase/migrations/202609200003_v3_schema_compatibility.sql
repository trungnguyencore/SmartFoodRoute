-- Phase 1 schema compatibility only, not Phase 5+ product implementation.
alter type public.transport_mode rename value 'TWO_WHEELER' to 'MOTORCYCLE';
alter type public.transport_mode add value 'SCOOTER';
create type public.stop_timing_type as enum ('FLEXIBLE', 'FIXED');
alter table public.saved_places alter column source set default 'custom';
alter table public.profiles add column email text not null default '';
update public.profiles p set email = coalesce(u.email, '') from auth.users u where u.id = p.id;
create or replace function public.create_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email) values(new.id,coalesce(new.email,''))
  on conflict(id) do update set email = excluded.email;
  return new;
end; $$;
create trigger auth_user_email_updated after update of email on auth.users
for each row execute function public.create_user_profile();

alter table public.cinema_provider_links rename column provider_cinema_ref to provider_cinema_id;
alter table public.cinema_provider_links rename column match_confidence to confidence;
alter table public.cinema_provider_links add column provider_cinema_name text;
-- Preserve legacy unresolved mappings. Enforce nonempty ID on every new/updated mapping.
alter table public.cinema_provider_links add constraint cinema_provider_id_required
  check (nullif(trim(provider_cinema_id),'') is not null) not valid;
alter table public.saved_tours rename column is_share_enabled to is_shared;
alter table public.saved_tours rename column total_tour_duration_minutes to total_duration_minutes;
alter table public.saved_tours alter column departure_at drop not null;
alter table public.saved_tours alter column optimization_objective drop default;
alter table public.saved_tours alter column optimization_objective type text
  using case when optimization_objective::text = 'DURATION' then 'TRAVEL_DURATION' else optimization_objective::text end;
alter table public.saved_tours alter column optimization_objective set default 'TRAVEL_DURATION';
-- Legacy DISTANCE choices are retained as owner metadata; no optimizer is implemented.
alter table public.tour_stops rename column display_label to name_snapshot;
alter table public.tour_stops rename column public_lat to lat_snapshot;
alter table public.tour_stops rename column public_lng to lng_snapshot;
alter table public.tour_stops rename column google_place_id to legacy_google_place_id;
alter table public.tour_stops rename column external_event_provider to showtime_provider;
alter table public.tour_stops rename column external_event_ref to provider_showtime_id;
alter table public.tour_stops add column provider_place_id text;
alter table public.tour_stops add column address_snapshot text;
alter table public.tour_stops add column sub_category text;
alter table public.tour_stops add column timing_type public.stop_timing_type not null default 'FLEXIBLE';
alter table public.tour_stops add column estimated_cost integer check (estimated_cost is null or estimated_cost >= 0);
alter table public.tour_stops add column provider_cinema_id text;
alter table public.tour_stops add column provider_movie_id text;
update public.tour_stops set timing_type = 'FIXED' where fixed_start_at is not null;
-- Keep legacy per-person cost, transport preferences, event URL and Google ID as
-- owner-only compatibility data. Never expose them through public share DTO.

create or replace function public.create_or_rotate_share_token(p_tour_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare token uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  update public.saved_tours set share_token = gen_random_uuid(), is_shared = true,
    shared_at = now(), share_expires_at = now() + interval '7 days'
  where id = p_tour_id and user_id = auth.uid() returning share_token into token;
  if token is null then raise exception 'Tour unavailable' using errcode = '42501'; end if;
  return token;
end; $$;
create or replace function public.revoke_share_token(p_tour_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  update public.saved_tours set is_shared = false, share_token = null, share_expires_at = null, shared_at = null
  where id = p_tour_id and user_id = auth.uid();
  if not found then raise exception 'Tour unavailable' using errcode = '42501'; end if;
end; $$;
create or replace function public.get_shared_tour(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', t.title, 'departureAt', t.departure_at, 'transportMode', t.transport_mode, 'partySize', t.party_size,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position, 'category', s.category,
        'label', case when s.redact then case when s.category = 'start_point' then 'Điểm bắt đầu riêng tư' else 'Địa điểm riêng tư' end else s.name_snapshot end,
        'isPrivate', s.redact,
        'lat', case when s.redact then null else s.lat_snapshot end,
        'lng', case when s.redact then null else s.lng_snapshot end,
        'address', case when s.redact then null else s.address_snapshot end,
        'providerPlaceId', case when s.redact then null else s.provider_place_id end,
        'arrivalAt', s.planned_arrival_at, 'departureAt', s.planned_departure_at,
        'fixedStartAt', s.fixed_start_at, 'fixedEndAt', s.fixed_end_at,
        'movieTitle', case when s.redact then null else s.movie_title end
      ) order by s.position)
      from (
        select st.*, (st.is_private or coalesce(p.is_private, false) or st.category = 'start_point') as redact
        from public.tour_stops st left join public.saved_places p on p.id = st.saved_place_id and p.user_id = st.user_id
        where st.tour_id = t.id and st.user_id = t.user_id
      ) s
    ), '[]'::jsonb)
  )
  from public.saved_tours t
  where t.share_token = p_token and t.is_shared and (t.share_expires_at is null or t.share_expires_at > now());
$$;
create or replace function public.delete_my_app_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  delete from public.saved_tours where user_id = auth.uid();
  delete from public.saved_places where user_id = auth.uid();
  delete from public.cost_presets where user_id = auth.uid();
  update public.profiles set full_name = null, avatar_url = null,
    preferred_transport = 'MOTORCYCLE', default_party_size = 2 where id = auth.uid();
  -- Rate counters retained until Auth user deletion: data deletion cannot reset quota.
end; $$;
-- CREATE OR REPLACE preserves prior RPC grants; all search paths remain fixed.
