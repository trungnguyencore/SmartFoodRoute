-- Preserve redaction when a linked private place is later edited or deleted.
create function public.inherit_stop_privacy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.saved_place_id is not null then
    new.is_private := new.is_private or coalesce((
      select p.is_private from public.saved_places p
      where p.id = new.saved_place_id and p.user_id = new.user_id
    ), false);
  end if;
  return new;
end;
$$;
revoke all on function public.inherit_stop_privacy() from public, anon, authenticated;
create trigger inherit_stop_privacy before insert or update on public.tour_stops
for each row execute function public.inherit_stop_privacy();

create function public.preserve_linked_stop_privacy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_private or (tg_op = 'UPDATE' and new.is_private) then
    update public.tour_stops set is_private = true
    where saved_place_id = old.id and user_id = old.user_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.preserve_linked_stop_privacy() from public, anon, authenticated;
create trigger preserve_stop_privacy_update after update of is_private on public.saved_places
for each row execute function public.preserve_linked_stop_privacy();
create trigger preserve_stop_privacy_delete before delete on public.saved_places
for each row execute function public.preserve_linked_stop_privacy();
