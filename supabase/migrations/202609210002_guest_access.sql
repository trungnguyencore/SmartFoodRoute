-- Family/guest read-only access and suggestion inbox.
create table if not exists public.guest_access_codes (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  code_hint text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  access_code_id uuid not null references public.guest_access_codes(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.guest_suggestions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  access_code_id uuid references public.guest_access_codes(id) on delete set null,
  name text not null check (char_length(name) between 1 and 120),
  address text check (address is null or char_length(address) <= 500),
  google_maps_url text check (google_maps_url is null or char_length(google_maps_url) <= 2048),
  tiktok_url text check (tiktok_url is null or char_length(tiktok_url) <= 2048),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.guest_access_attempts (
  fingerprint_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

create index if not exists guest_access_codes_owner_idx
  on public.guest_access_codes(owner_user_id, created_at desc);
create index if not exists guest_sessions_code_idx
  on public.guest_sessions(access_code_id, expires_at);
create index if not exists guest_suggestions_owner_idx
  on public.guest_suggestions(owner_user_id, created_at desc);

alter table public.guest_access_codes enable row level security;
alter table public.guest_sessions enable row level security;
alter table public.guest_suggestions enable row level security;
alter table public.guest_access_attempts enable row level security;

revoke all on public.guest_access_codes from anon, authenticated;
revoke all on public.guest_sessions from anon, authenticated;
revoke all on public.guest_suggestions from anon, authenticated;
revoke all on public.guest_access_attempts from anon, authenticated;
