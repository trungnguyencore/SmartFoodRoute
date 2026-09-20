create type public.place_source as enum ('google', 'custom');

create type public.place_category as enum (
  'food',
  'cafe',
  'cinema',
  'entertainment',
  'start_point',
  'other'
);

create type public.transport_mode as enum (
  'DRIVING',
  'TWO_WHEELER',
  'WALKING'
);

create type public.optimization_objective as enum (
  'DURATION',
  'DISTANCE'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  preferred_transport public.transport_mode default 'TWO_WHEELER',
  default_party_size smallint not null default 2 check (default_party_size between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  source public.place_source not null,
  category public.place_category not null,

  google_place_id text,

  custom_label text,
  custom_address text,
  custom_lat double precision,
  custom_lng double precision,

  sub_category text,
  estimated_cost_per_person integer check (estimated_cost_per_person is null or estimated_cost_per_person >= 0),
  average_time_spent_minutes integer not null default 60 check (average_time_spent_minutes between 0 and 1440),
  notes text,
  tags text[] not null default '{}',
  is_favorite boolean not null default false,
  is_private boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint google_place_shape check (
    source <> 'google' or google_place_id is not null
  ),

  constraint custom_place_shape check (
    source <> 'custom' or (
      custom_lat is not null and
      custom_lng is not null
    )
  ),

  constraint custom_lat_range check (
    custom_lat is null or custom_lat between -90 and 90
  ),

  constraint custom_lng_range check (
    custom_lng is null or custom_lng between -180 and 180
  )
);



create table public.cinema_provider_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_place_id uuid not null references public.saved_places(id) on delete cascade,

  provider text not null check (provider in ('moveek')),
  provider_cinema_ref text,
  provider_cinema_url text not null,
  match_confidence numeric(4,3) check (
    match_confidence is null or match_confidence between 0 and 1
  ),
  verified_by_user boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(user_id, saved_place_id, provider)
);

create table public.saved_tours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text not null check (char_length(title) between 1 and 120),
  departure_at timestamptz not null,
  party_size smallint not null default 2 check (party_size between 1 and 20),
  transport_mode public.transport_mode not null default 'TWO_WHEELER',
  optimization_objective public.optimization_objective not null default 'DURATION',

  total_distance_meters integer check (total_distance_meters is null or total_distance_meters >= 0),
  total_travel_duration_seconds integer check (total_travel_duration_seconds is null or total_travel_duration_seconds >= 0),
  total_tour_duration_minutes integer check (total_tour_duration_minutes is null or total_tour_duration_minutes >= 0),
  total_estimated_budget integer check (total_estimated_budget is null or total_estimated_budget >= 0),

  is_share_enabled boolean not null default false,
  share_token uuid,
  shared_at timestamptz,
  share_expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tour_stops (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.saved_tours(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  position smallint not null check (position >= 0),
  category public.place_category not null,

  saved_place_id uuid references public.saved_places(id) on delete set null,
  google_place_id text,

  display_label text not null,

  public_lat double precision,
  public_lng double precision,

  planned_arrival_at timestamptz,
  planned_departure_at timestamptz,

  fixed_start_at timestamptz,
  fixed_end_at timestamptz,
  arrival_buffer_minutes integer not null default 0 check (arrival_buffer_minutes between 0 and 180),

  external_event_provider text,
  external_event_ref text,
  external_event_url text,
  movie_title text,
  movie_runtime_minutes integer check (movie_runtime_minutes is null or movie_runtime_minutes between 1 and 600),
  showtime_fetched_at timestamptz,
  booking_url text,

  estimated_cost_per_person integer,
  duration_minutes integer not null default 60,
  is_private boolean not null default false,

  created_at timestamptz not null default now(),

  unique(tour_id, position)
);

create table public.cost_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category public.place_category not null,
  label text not null,
  amount_per_person integer not null check (amount_per_person >= 0),
  created_at timestamptz not null default now()
);

-- Enforce ownership at the relational boundary, not only in client requests.
alter table public.saved_places add constraint saved_places_id_owner unique(id, user_id);
alter table public.saved_tours add constraint saved_tours_id_owner unique(id, user_id);
alter table public.cinema_provider_links drop constraint cinema_provider_links_saved_place_id_fkey;
alter table public.cinema_provider_links add constraint cinema_owned_place
  foreign key(saved_place_id, user_id) references public.saved_places(id, user_id) on delete cascade;
alter table public.tour_stops drop constraint tour_stops_tour_id_fkey;
alter table public.tour_stops add constraint stop_owned_tour
  foreign key(tour_id, user_id) references public.saved_tours(id, user_id) on delete cascade;
alter table public.tour_stops drop constraint tour_stops_saved_place_id_fkey;
alter table public.tour_stops add constraint stop_owned_place
  foreign key(saved_place_id, user_id) references public.saved_places(id, user_id)
  on delete set null (saved_place_id);
alter table public.saved_places alter column is_private set default true;
alter table public.saved_places add constraint source_data_boundary check (
  (source = 'google' and length(trim(google_place_id)) > 0 and custom_address is null and custom_lat is null and custom_lng is null)
  or (source = 'custom' and google_place_id is null and nullif(trim(custom_label),'') is not null)
);
alter table public.cinema_provider_links add constraint provider_https_host
  check (provider_cinema_url ~ '^https://(www\.)?moveek\.com(/[^[:space:]]*)?$');
alter table public.tour_stops add constraint stop_coordinate_boundary check (
  (public_lat is null or public_lat between -90 and 90)
  and (public_lng is null or public_lng between -180 and 180)
  and ((public_lat is null) = (public_lng is null))
  and (google_place_id is null or (public_lat is null and public_lng is null))
);
alter table public.tour_stops add constraint stop_duration check (duration_minutes between 0 and 1440);
alter table public.tour_stops add constraint stop_cost check (estimated_cost_per_person is null or estimated_cost_per_person >= 0);
alter table public.tour_stops add constraint stop_fixed_window check (fixed_end_at is null or (fixed_start_at is not null and fixed_end_at >= fixed_start_at));
alter table public.saved_tours add constraint share_shape check (is_share_enabled = (share_token is not null));

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_timestamp before update on public.profiles for each row execute function public.set_updated_at();
create trigger places_timestamp before update on public.saved_places for each row execute function public.set_updated_at();
create trigger cinema_links_timestamp before update on public.cinema_provider_links for each row execute function public.set_updated_at();
create trigger tours_timestamp before update on public.saved_tours for each row execute function public.set_updated_at();

create function public.create_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end;
$$;
revoke all on function public.create_user_profile() from public;
create trigger auth_user_created after insert on auth.users for each row execute function public.create_user_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

