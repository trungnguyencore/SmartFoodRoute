revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;
create policy profile_owner on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

alter table public.saved_places enable row level security;
grant select, insert, update, delete on public.saved_places to authenticated;
create policy saved_places_owner on public.saved_places for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_places_aal2 on public.saved_places as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');

alter table public.cinema_provider_links enable row level security;
grant select, insert, update, delete on public.cinema_provider_links to authenticated;
create policy cinema_provider_links_owner on public.cinema_provider_links for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cinema_provider_links_aal2 on public.cinema_provider_links as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');

alter table public.saved_tours enable row level security;
grant select, insert, update, delete on public.saved_tours to authenticated;
create policy saved_tours_owner on public.saved_tours for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy saved_tours_aal2 on public.saved_tours as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');

alter table public.tour_stops enable row level security;
grant select, insert, update, delete on public.tour_stops to authenticated;
create policy tour_stops_owner on public.tour_stops for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tour_stops_aal2 on public.tour_stops as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');

alter table public.cost_presets enable row level security;
grant select, insert, update, delete on public.cost_presets to authenticated;
create policy cost_presets_owner on public.cost_presets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy cost_presets_aal2 on public.cost_presets as restrictive for all to authenticated
  using ((select auth.jwt()->>'aal') = 'aal2') with check ((select auth.jwt()->>'aal') = 'aal2');

-- Sharing flags are managed only by owner/AAL2 RPCs.
revoke insert, update on public.saved_tours from authenticated;
grant insert (id, user_id, title, departure_at, party_size, transport_mode, optimization_objective,
  total_distance_meters, total_travel_duration_seconds, total_tour_duration_minutes, total_estimated_budget)
  on public.saved_tours to authenticated;
grant update (title, departure_at, party_size, transport_mode, optimization_objective,
  total_distance_meters, total_travel_duration_seconds, total_tour_duration_minutes, total_estimated_budget)
  on public.saved_tours to authenticated;

