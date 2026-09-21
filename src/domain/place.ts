import { z } from "zod";
import { safeGoogleMapsUrl } from "../utils/externalUrls";
export const categories = {
  food: { label: "Ăn", icon: "🍜", color: "#bc381c" },
  drink: { label: "Uống", icon: "🥤", color: "#31708f" },
  cafe: { label: "Cà phê", icon: "☕", color: "#8b572a" },
  cinema: { label: "Rạp phim", icon: "🎬", color: "#7042b6" },
  entertainment: { label: "Vui chơi", icon: "🎡", color: "#936500" },
  start_point: { label: "Điểm đón", icon: "🏠", color: "#ae3657" },
  other: { label: "Khác", icon: "📍", color: "#236d64" },
} as const;
export type PlaceCategory = keyof typeof categories;
export interface MapPlace {
  id: string;
  title: string;
  category: PlaceCategory;
  subCategory?: string | null;
  location: { lat: number; lng: number };
}
export const categorySchema = z.enum([
  "food",
  "drink",
  "cafe",
  "cinema",
  "entertainment",
  "start_point",
  "other",
]);
const fields = {
  source: z.enum(["geoapify", "custom"]),
  category: categorySchema,
  providerPlaceId: z.string().trim().min(1).max(1024).nullable(),
  name: z.string().trim().min(1, "Nhập tên địa điểm").max(120),
  address: z.string().trim().max(500).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  subCategory: z.string().trim().max(80).nullable(),
  estimatedCostPerPerson: z.number().int().min(0).max(2147483647).nullable(),
  averageTimeSpentMinutes: z.number().int().min(0).max(1440),
  notes: z.string().trim().max(3000).nullable(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20),
  isFavorite: z.boolean(),
  isPrivate: z.boolean(),
  googleMapsUrl: z
    .string()
    .nullable()
    .refine(
      (v) => v === null || !!safeGoogleMapsUrl(v),
      "Chỉ chấp nhận liên kết Google Maps HTTPS hợp lệ",
    ),
  sourceName: z.string().max(120).nullable(),
};
export const placeDraftSchema = z.object(fields).superRefine((p, ctx) => {
  if (
    (p.source === "geoapify" && !p.providerPlaceId) ||
    (p.source === "custom" && p.providerPlaceId !== null)
  )
    ctx.addIssue({
      code: "custom",
      path: ["providerPlaceId"],
      message: "Mã nhà cung cấp không phù hợp",
    });
  if (p.category === "other" && !p.subCategory)
    ctx.addIssue({
      code: "custom",
      path: ["subCategory"],
      message: "Nhập tên loại cụ thể khi chọn Khác",
    });
});
export type PlaceDraft = z.infer<typeof placeDraftSchema>;
export interface SavedPlace extends Omit<PlaceDraft, "lat" | "lng"> {
  id: string;
  userId: string;
  lat: number | null;
  lng: number | null;
  needsLocation: boolean;
}
export const savedPlaceRowSchema = z
  .object({
    id: z.uuid(),
    user_id: z.uuid(),
    source: fields.source,
    category: categorySchema,
    provider_place_id: fields.providerPlaceId,
    name: z.string(),
    address: fields.address,
    lat: fields.lat.nullable(),
    lng: fields.lng.nullable(),
    sub_category: fields.subCategory,
    estimated_cost_per_person: fields.estimatedCostPerPerson,
    average_time_spent_minutes: fields.averageTimeSpentMinutes,
    notes: fields.notes,
    custom_tags: fields.tags,
    is_favorite: fields.isFavorite,
    is_private: fields.isPrivate,
    google_maps_url: z.string().nullable(),
    source_name: fields.sourceName,
    needs_location: z.boolean(),
  })
  .transform((row): SavedPlace => ({
    id: row.id,
    userId: row.user_id,
    source: row.source,
    category: row.category,
    providerPlaceId: row.provider_place_id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    subCategory: row.sub_category,
    estimatedCostPerPerson: row.estimated_cost_per_person,
    averageTimeSpentMinutes: row.average_time_spent_minutes,
    notes: row.notes,
    tags: row.custom_tags,
    isFavorite: row.is_favorite,
    isPrivate: row.is_private,
    googleMapsUrl: row.google_maps_url,
    sourceName: row.source_name,
    needsLocation: row.needs_location,
  }));
export function inferCategory(values: string[]): PlaceCategory {
  if (values.some((c) => c.startsWith("catering.cafe"))) return "cafe";
  if (
    values.some(
      (c) =>
        c.startsWith("catering.bar") ||
        c.startsWith("catering.pub") ||
        c.startsWith("catering.biergarten"),
    )
  )
    return "drink";
  if (values.some((c) => c.startsWith("catering"))) return "food";
  if (values.some((c) => c.startsWith("entertainment.cinema"))) return "cinema";
  if (
    values.some((c) => c.startsWith("entertainment") || c.startsWith("leisure"))
  )
    return "entertainment";
  return "other";
}
