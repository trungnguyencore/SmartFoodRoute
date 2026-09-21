import { z } from "zod";
import { getSupabase } from "../lib/supabase";
import { placeDraftSchema, savedPlaceRowSchema } from "../domain/place";
export const PAGE_SIZE = 20;
export function buildPlacePayload(userId: string, input: unknown) {
  const p = placeDraftSchema.parse(input);
  return {
    user_id: z.uuid().parse(userId),
    source: p.source,
    category: p.category,
    provider_place_id: p.providerPlaceId,
    name: p.name,
    address: p.address || null,
    lat: p.lat,
    lng: p.lng,
    needs_location: false,
    google_maps_url: p.googleMapsUrl,
    source_name: p.sourceName,
    sub_category: p.subCategory || null,
    estimated_cost_per_person: p.estimatedCostPerPerson,
    average_time_spent_minutes: p.averageTimeSpentMinutes,
    notes: p.notes || null,
    custom_tags: p.tags,
    is_favorite: p.isFavorite,
    is_private: p.isPrivate,
  };
}
function failure(code?: string): Error {
  return new Error(
    code === "23505"
      ? "Địa điểm này đã được lưu."
      : code === "42501"
        ? "Phiên chưa đủ quyền. Hãy xác thực hai bước lại."
        : "Không cập nhật được địa điểm. Kiểm tra kết nối và thử lại.",
  );
}
export async function listSavedPlaces(
  userId: string,
  page: number,
  signal?: AbortSignal,
) {
  let query = getSupabase()
    .from("saved_places")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw failure(error.code);
  const rows = z.array(savedPlaceRowSchema).parse(data);
  return { places: rows.slice(0, PAGE_SIZE), hasNext: rows.length > PAGE_SIZE };
}
export async function listAllSavedPlaces(
  userId: string,
  signal?: AbortSignal,
) {
  const owner = z.uuid().parse(userId);
  const all: ReturnType<typeof savedPlaceRowSchema.parse>[] = [];
  const batchSize = 200;
  for (let from = 0; ; from += batchSize) {
    let query = getSupabase()
      .from("saved_places")
      .select("*")
      .eq("user_id", owner)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + batchSize - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw failure(error.code);
    const rows = z.array(savedPlaceRowSchema).parse(data);
    all.push(...rows);
    if (rows.length < batchSize) break;
  }
  return all;
}

export async function listSavedPlacesByIds(
  userId: string,
  ids: string[],
  signal?: AbortSignal,
) {
  if (!ids.length) return [];
  const parsedIds = z.array(z.uuid()).parse(ids);
  const wanted = new Set(parsedIds);
  const all = await listAllSavedPlaces(userId, signal);
  return all.filter((place) => wanted.has(place.id));
}

export async function listPlannerPlaces(
  userId: string,
  signal?: AbortSignal,
) {
  let query = getSupabase()
    .from("saved_places")
    .select("*")
    .eq("user_id", userId)
    .eq("needs_location", false)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("is_favorite", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw failure(error.code);
  return z.array(savedPlaceRowSchema).parse(data);
}

export async function savePlace(userId: string, input: unknown, id?: string) {
  const payload = buildPlacePayload(userId, input);
  const table = getSupabase().from("saved_places");
  const query = id
    ? table.update(payload).eq("id", z.uuid().parse(id)).eq("user_id", userId)
    : table.insert(payload);
  const { data, error } = await query.select().single();
  if (error) throw failure(error.code);
  return savedPlaceRowSchema.parse(data);
}
export async function deletePlace(userId: string, id: string) {
  const { data, error } = await getSupabase()
    .from("saved_places")
    .delete()
    .eq("id", z.uuid().parse(id))
    .eq("user_id", userId)
    .select("id");
  if (error || !data?.length) throw failure(error?.code);
}
