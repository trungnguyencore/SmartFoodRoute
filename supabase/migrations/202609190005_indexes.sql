create unique index saved_places_user_google_place_unique on public.saved_places(user_id, google_place_id) where google_place_id is not null;
create index saved_places_owner_idx on public.saved_places(user_id);
create index cinema_links_owner_idx on public.cinema_provider_links(user_id);
create index saved_tours_owner_idx on public.saved_tours(user_id);
create unique index saved_tours_share_token_idx on public.saved_tours(share_token) where share_token is not null;
create index stops_owner_idx on public.tour_stops(user_id);
create index stops_place_idx on public.tour_stops(saved_place_id);
create index presets_owner_idx on public.cost_presets(user_id);

