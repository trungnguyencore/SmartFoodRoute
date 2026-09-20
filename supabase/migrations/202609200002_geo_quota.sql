-- Atomic quota shared by all Edge workers; no client-readable usage/location log.
create table public.geo_quota (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null,
  minute_count integer not null,
  day_start date not null,
  day_count integer not null
);
alter table public.geo_quota enable row level security;
revoke all on public.geo_quota from public, anon, authenticated;
create function public.consume_geo_quota() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); allowed boolean;
begin
  if uid is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  insert into public.geo_quota(user_id, minute_start, minute_count, day_start, day_count)
  values(uid, date_trunc('minute', now()), 1, (now() at time zone 'UTC')::date, 1)
  on conflict(user_id) do update set
    minute_start = excluded.minute_start,
    minute_count = case when geo_quota.minute_start = excluded.minute_start then geo_quota.minute_count + 1 else 1 end,
    day_start = excluded.day_start,
    day_count = case when geo_quota.day_start = excluded.day_start then geo_quota.day_count + 1 else 1 end
  where (geo_quota.minute_start <> excluded.minute_start or geo_quota.minute_count < 30)
    and (geo_quota.day_start <> excluded.day_start or geo_quota.day_count < 300)
  returning true into allowed;
  return coalesce(allowed, false);
end; $$;
revoke all on function public.consume_geo_quota() from public, anon;
grant execute on function public.consume_geo_quota() to authenticated;
