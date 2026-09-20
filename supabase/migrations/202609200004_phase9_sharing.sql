-- Phase 9 sharing. Forward-only: preserve all historical migrations.
create or replace function public.save_tour_snapshot(
  p_title text,
  p_departure_at timestamptz,
  p_party_size integer,
  p_transport_mode text,
  p_total_distance_meters integer,
  p_total_travel_duration_seconds integer,
  p_total_duration_minutes integer,
  p_total_estimated_budget integer,
  p_stops jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tour_id uuid;
  v_stop jsonb;
  v_position integer := 0;
  v_category public.place_category;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  if nullif(trim(p_title),'') is null or char_length(trim(p_title)) > 120 then
    raise exception 'Invalid tour title' using errcode = '22023';
  end if;
  if p_party_size is null or p_party_size not between 1 and 20 then
    raise exception 'Invalid party size' using errcode = '22023';
  end if;
  if p_transport_mode is null or p_transport_mode not in ('MOTORCYCLE','SCOOTER','DRIVING','WALKING') then
    raise exception 'Invalid transport mode' using errcode = '22023';
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array'
     or jsonb_array_length(p_stops) < 1 or jsonb_array_length(p_stops) > 30 then
    raise exception 'Invalid tour stops' using errcode = '22023';
  end if;

  insert into public.saved_tours(
    user_id, title, departure_at, party_size, transport_mode, optimization_objective,
    total_distance_meters, total_travel_duration_seconds, total_duration_minutes,
    total_estimated_budget
  ) values (
    auth.uid(), trim(p_title), p_departure_at, p_party_size,
    p_transport_mode::public.transport_mode, 'TRAVEL_DURATION',
    p_total_distance_meters, p_total_travel_duration_seconds, p_total_duration_minutes,
    p_total_estimated_budget
  ) returning id into v_tour_id;

  for v_stop in select value from jsonb_array_elements(p_stops)
  loop
    if coalesce((v_stop->>'position')::integer, -1) <> v_position then
      raise exception 'Tour stop positions must be contiguous' using errcode = '22023';
    end if;
    if nullif(trim(v_stop->>'nameSnapshot'),'') is null then
      raise exception 'Tour stop name required' using errcode = '22023';
    end if;
    v_category := (v_stop->>'category')::public.place_category;
    if v_position = 0 and v_category <> 'start_point' then
      raise exception 'First stop must be start point' using errcode = '22023';
    end if;

    insert into public.tour_stops(
      tour_id, user_id, position, saved_place_id, name_snapshot,
      lat_snapshot, lng_snapshot, address_snapshot, category, sub_category,
      timing_type, planned_arrival_at, planned_departure_at,
      fixed_start_at, fixed_end_at, duration_minutes, estimated_cost,
      is_private, showtime_provider, provider_place_id, provider_cinema_id,
      provider_movie_id, provider_showtime_id, movie_title, movie_runtime_minutes,
      showtime_fetched_at, booking_url
    ) values (
      v_tour_id, auth.uid(), v_position,
      nullif(v_stop->>'savedPlaceId','')::uuid,
      trim(v_stop->>'nameSnapshot'),
      nullif(v_stop->>'latSnapshot','')::double precision,
      nullif(v_stop->>'lngSnapshot','')::double precision,
      nullif(v_stop->>'addressSnapshot',''),
      v_category, nullif(v_stop->>'subCategory',''),
      coalesce(nullif(v_stop->>'timingType',''),'FLEXIBLE')::public.stop_timing_type,
      nullif(v_stop->>'plannedArrivalAt','')::timestamptz,
      nullif(v_stop->>'plannedDepartureAt','')::timestamptz,
      nullif(v_stop->>'fixedStartAt','')::timestamptz,
      nullif(v_stop->>'fixedEndAt','')::timestamptz,
      coalesce(nullif(v_stop->>'durationMinutes','')::integer, 0),
      nullif(v_stop->>'estimatedCost','')::integer,
      case when v_category = 'start_point' then true
        else coalesce(nullif(v_stop->>'isPrivate','')::boolean, false) end,
      nullif(v_stop->>'showtimeProvider',''),
      nullif(v_stop->>'providerPlaceId',''),
      nullif(v_stop->>'providerCinemaId',''),
      nullif(v_stop->>'providerMovieId',''),
      nullif(v_stop->>'providerShowtimeId',''),
      nullif(v_stop->>'movieTitle',''),
      nullif(v_stop->>'movieRuntimeMinutes','')::integer,
      nullif(v_stop->>'showtimeFetchedAt','')::timestamptz,
      nullif(v_stop->>'bookingUrl','')
    );
    v_position := v_position + 1;
  end loop;
  return v_tour_id;
end;
$$;

revoke all on function public.save_tour_snapshot(
  text,timestamptz,integer,text,integer,integer,integer,integer,jsonb
) from public, anon;
grant execute on function public.save_tour_snapshot(
  text,timestamptz,integer,text,integer,integer,integer,integer,jsonb
) to authenticated;

create or replace function public.get_shared_tour(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'departureAt', t.departure_at,
    'transportMode', t.transport_mode,
    'partySize', t.party_size,
    'totalDurationMinutes', t.total_duration_minutes,
    'totalBudget', t.total_estimated_budget,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position,
        'category', s.category,
        'name', case when s.redact then
          case when s.category = 'start_point' then 'Điểm bắt đầu riêng tư' else 'Địa điểm riêng tư' end
          else s.name_snapshot end,
        'label', case when s.redact then
          case when s.category = 'start_point' then 'Điểm bắt đầu riêng tư' else 'Địa điểm riêng tư' end
          else s.name_snapshot end,
        'isPrivate', s.redact,
        'lat', case when s.redact then null else s.lat_snapshot end,
        'lng', case when s.redact then null else s.lng_snapshot end,
        'address', case when s.redact then null else s.address_snapshot end,
        'providerPlaceId', case when s.redact then null else s.provider_place_id end,
        'arrivalAt', s.planned_arrival_at,
        'departureAt', s.planned_departure_at,
        'fixedStartAt', s.fixed_start_at,
        'fixedEndAt', s.fixed_end_at,
        'movieTitle', case when s.redact then null else s.movie_title end
      ) order by s.position)

      from (
        select st.*,
          (st.is_private or coalesce(p.is_private, false) or st.category = 'start_point') as redact
        from public.tour_stops st
        left join public.saved_places p
          on p.id = st.saved_place_id and p.user_id = st.user_id
        where st.tour_id = t.id and st.user_id = t.user_id
      ) s
    ), '[]'::jsonb)
  )
  from public.saved_tours t
  where t.share_token = p_token
    and t.is_shared
    and (t.share_expires_at is null or t.share_expires_at > now());
$$;

revoke all on function public.get_shared_tour(uuid) from public;
grant execute on function public.get_shared_tour(uuid) to anon, authenticated;
