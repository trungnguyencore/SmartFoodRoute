create function public.create_or_rotate_share_token(p_tour_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare token uuid;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  update public.saved_tours set share_token = gen_random_uuid(), is_share_enabled = true,
    shared_at = now(), share_expires_at = now() + interval '7 days'
  where id = p_tour_id and user_id = auth.uid() returning share_token into token;
  if token is null then raise exception 'Tour unavailable' using errcode = '42501'; end if;
  return token;
end;
$$;

create function public.revoke_share_token(p_tour_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  update public.saved_tours set is_share_enabled = false, share_token = null,
    share_expires_at = null, shared_at = null
  where id = p_tour_id and user_id = auth.uid();
  if not found then raise exception 'Tour unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.get_shared_tour(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', t.title,
    'departureAt', t.departure_at,
    'transportMode', t.transport_mode,
    'partySize', t.party_size,
    'stops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position,
        'category', s.category,
        'label', case when s.redact then
          case when s.category = 'start_point' then 'Điểm bắt đầu' else 'Địa điểm riêng tư' end
          else s.display_label end,
        'isPrivate', s.redact,
        'lat', case when s.redact then null else s.public_lat end,
        'lng', case when s.redact then null else s.public_lng end,
        'googlePlaceId', case when s.redact then null else s.google_place_id end,
        'arrivalAt', s.planned_arrival_at,
        'departureAt', s.planned_departure_at,
        'fixedStartAt', s.fixed_start_at,
        'fixedEndAt', s.fixed_end_at,
        'movieTitle', case when s.redact then null else s.movie_title end
      ) order by s.position)
      from (
        select st.*, (st.is_private or coalesce(p.is_private, false) or st.category = 'start_point') as redact
        from public.tour_stops st
        left join public.saved_places p on p.id = st.saved_place_id and p.user_id = st.user_id
        where st.tour_id = t.id and st.user_id = t.user_id
      ) s
    ), '[]'::jsonb)
  )
  from public.saved_tours t
  where t.share_token = p_token and t.is_share_enabled
    and (t.share_expires_at is null or t.share_expires_at > now());
$$;

-- Scope is app data only; never delete the Auth identity using a browser admin key.
create function public.delete_my_app_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'AAL2 required' using errcode = '42501';
  end if;
  delete from public.saved_tours where user_id = auth.uid();
  delete from public.saved_places where user_id = auth.uid();
  delete from public.cost_presets where user_id = auth.uid();
  update public.profiles set full_name = null, avatar_url = null,
    preferred_transport = 'TWO_WHEELER', default_party_size = 2 where id = auth.uid();
end;
$$;

revoke all on function public.create_or_rotate_share_token(uuid) from public, anon;
revoke all on function public.revoke_share_token(uuid) from public, anon;
revoke all on function public.delete_my_app_data() from public, anon;
revoke all on function public.get_shared_tour(uuid) from public;
grant execute on function public.create_or_rotate_share_token(uuid) to authenticated;
grant execute on function public.revoke_share_token(uuid) to authenticated;
grant execute on function public.delete_my_app_data() to authenticated;
grant execute on function public.get_shared_tour(uuid) to anon, authenticated;
