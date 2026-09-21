import { z } from "zod";
import {
  routeMatrixRequestSchema,
  routeRequestSchema,
} from "./routing.ts";
import { isGoogleMapsUrl } from "./googleMaps.ts";
export const latLngSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();
export const poiCategories = [
  "catering.restaurant",
  "catering.fast_food",
  "catering.food_court",
  "catering.cafe",
  "entertainment.cinema",
  "entertainment",
  "leisure",
] as const;
const language = z.enum(["vi", "en"]).default("vi");
export const geoRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("autocomplete"),
      text: z.string().trim().min(3).max(200),
      bias: latLngSchema.optional(),
      limit: z.number().int().min(1).max(10).default(5),
      language,
    })
    .strict(),
  z
    .object({
      action: z.literal("places"),
      categories: z.array(z.enum(poiCategories)).min(1).max(3),
      center: latLngSchema,
      radiusMeters: z.number().int().min(100).max(10000),
      limit: z.number().int().min(1).max(20).default(10),
      language,
    })
    .strict(),
  z
    .object({
      action: z.literal("placeDetails"),
      providerPlaceId: z
        .string()
        .min(1)
        .max(1024)
        .regex(/^[a-zA-Z0-9_-]+$/),
      language,
    })
    .strict(),
  z
    .object({
      action: z.literal("reverseGeocode"),
      ...latLngSchema.shape,
      language,
    })
    .strict(),
  z
    .object({
      action: z.literal("resolveGoogleMapsUrl"),
      url: z.string().trim().max(2048).refine(isGoogleMapsUrl),
      language,
    })
    .strict(),
  routeMatrixRequestSchema,
  routeRequestSchema,
]);
export type GeoRequest = z.input<typeof geoRequestSchema>;
export const geoPlaceSchema = z.object({
  provider: z.literal("geoapify"),
  providerPlaceId: z.string().min(1),
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  categories: z.array(z.string()),
  rawCategory: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  openingHoursText: z.string().nullable(),
  sourceAttribution: z.array(z.string()),
});
export type GeoPlace = z.infer<typeof geoPlaceSchema>;
const record = z.record(z.string(), z.unknown());
function object(value: unknown): Record<string, unknown> {
  return record.safeParse(value).data ?? {};
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function https(value: unknown): string | null {
  const v = text(value);
  if (!v || v.length > 2048 || /[\s\\]/.test(v)) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function normalizeGeoapify(body: unknown): GeoPlace[] {
  const root = object(body);
  if (!Array.isArray(root.features))
    throw new Error("Invalid provider response");
  const result = new Map<string, GeoPlace>();
  for (const item of root.features) {
    const feature = object(item),
      p = object(feature.properties),
      geometry = object(feature.geometry);
    const raw = object(object(p.datasource).raw),
      contact = object(p.contact);
    const coords =
      geometry.type === "Point" && Array.isArray(geometry.coordinates)
        ? geometry.coordinates
        : [];
    const normalized = geoPlaceSchema.safeParse({
      provider: "geoapify",
      providerPlaceId: p.place_id,
      name:
        text(p.name) ??
        text(p.address_line1) ??
        text(p.formatted) ??
        "Địa điểm",
      address: text(p.formatted) ?? text(p.address_line2),
      lat: p.lat ?? coords[1],
      lng: p.lon ?? coords[0],
      categories: Array.isArray(p.categories)
        ? p.categories.filter((c): c is string => typeof c === "string")
        : [],
      rawCategory: text(p.category),
      website: https(
        p.website ?? contact.website ?? raw.website ?? raw["contact:website"],
      ),
      phone: text(
        p.phone ?? contact.phone ?? raw.phone ?? raw["contact:phone"],
      ),
      openingHoursText: text(p.opening_hours ?? raw.opening_hours),
      sourceAttribution: ["Geoapify", "© OpenStreetMap contributors"],
    });
    if (normalized.success)
      result.set(normalized.data.providerPlaceId, normalized.data);
  }
  return [...result.values()];
}
export function geoapifyUrl(
  input: z.output<typeof geoRequestSchema>,
  key: string,
): URL {
  if (
    input.action === "routeMatrix" ||
    input.action === "route" ||
    input.action === "resolveGoogleMapsUrl"
  )
    throw new Error("Request uses a dedicated handler");
  const endpoints = {
    autocomplete: "/v1/geocode/autocomplete",
    places: "/v2/places",
    placeDetails: "/v2/place-details",
    reverseGeocode: "/v1/geocode/reverse",
  };
  const url = new URL(endpoints[input.action], "https://api.geoapify.com");
  url.searchParams.set("apiKey", key);
  url.searchParams.set("lang", input.language);
  if (input.action === "autocomplete") {
    url.searchParams.set("text", input.text);
    url.searchParams.set("limit", String(input.limit));
    if (input.bias)
      url.searchParams.set(
        "bias",
        `proximity:${input.bias.lng},${input.bias.lat}`,
      );
  } else if (input.action === "places") {
    url.searchParams.set("categories", input.categories.join(","));
    url.searchParams.set(
      "filter",
      `circle:${input.center.lng},${input.center.lat},${input.radiusMeters}`,
    );
    url.searchParams.set(
      "bias",
      `proximity:${input.center.lng},${input.center.lat}`,
    );
    url.searchParams.set("limit", String(input.limit));
  } else if (input.action === "placeDetails") {
    url.searchParams.set("id", input.providerPlaceId);
    url.searchParams.set("features", "details");
  } else {
    url.searchParams.set("lat", String(input.lat));
    url.searchParams.set("lon", String(input.lng));
    url.searchParams.set("limit", "1");
  }
  return url;
}
