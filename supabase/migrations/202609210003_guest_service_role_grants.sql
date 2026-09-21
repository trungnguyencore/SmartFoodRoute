-- Edge guest-access uses the server-only service role to mediate all guest/admin data.
-- PGlite security tests do not define Supabase's service_role, so keep this migration portable.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.guest_access_codes to service_role;
    grant select, insert, update, delete on public.guest_sessions to service_role;
    grant select, insert, update, delete on public.guest_suggestions to service_role;
    grant select, insert, update, delete on public.guest_access_attempts to service_role;
  end if;
end $$;
