import { z } from "zod";

export const routingLatLngSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

export const routingModeSchema = z.enum([
  "drive",
  "motorcycle",
  "scooter",
  "walk",
]);

export const trafficModelSchema = z.enum(["free_flow", "approximated"]);

export const routeMatrixRequestSchema = z
  .object({
    action: z.literal("routeMatrix"),
    sources: z.array(routingLatLngSchema).min(1).max(30),
    targets: z.array(routingLatLngSchema).min(1).max(30),
    mode: routingModeSchema,
    traffic: trafficModelSchema.optional(),
  })
  .strict();
export const routeRequestSchema = z
  .object({
    action: z.literal("route"),
    waypoints: z.array(routingLatLngSchema).min(2).max(10),
    mode: routingModeSchema,
    traffic: trafficModelSchema.optional(),
  })
  .strict();

export type RouteMatrixRequest = z.input<typeof routeMatrixRequestSchema>;
export type RouteRequest = z.input<typeof routeRequestSchema>;

export const routeMatrixCellSchema = z
  .object({
    distanceMeters: z.number().nonnegative(),
    durationSeconds: z.number().nonnegative(),
  })
  .strict();

export const routeMatrixResultSchema = z
  .object({
    cells: z.array(z.array(routeMatrixCellSchema.nullable())),
  })
  .strict();

const routePointSchema = z.tuple([z.number(), z.number()]);
export const routeGeometrySchema = z.union([
  z
    .object({
      type: z.literal("LineString"),
      coordinates: z.array(routePointSchema).min(2),
    })
    .strict(),
  z
    .object({
      type: z.literal("MultiLineString"),
      coordinates: z.array(z.array(routePointSchema).min(2)).min(1),
    })
    .strict(),
]);

export const routeResultSchema = z
  .object({
    distanceMeters: z.number().nonnegative(),
    durationSeconds: z.number().nonnegative(),
    geometry: routeGeometrySchema,
  })
  .strict();

export type RouteMatrixResult = z.infer<typeof routeMatrixResultSchema>;
export type RouteResult = z.infer<typeof routeResultSchema>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function normalizeRouteMatrix(body: unknown): RouteMatrixResult {
  const root = record(body);
  if (!Array.isArray(root.sources_to_targets))
    throw new Error("Invalid route matrix response");

  const cells = root.sources_to_targets.map((row) => {
    if (!Array.isArray(row)) throw new Error("Invalid route matrix row");
    return row.map((item) => {
      const cell = record(item);
      const distanceMeters = finiteNonNegative(cell.distance);
      const durationSeconds = finiteNonNegative(cell.time);
      return distanceMeters === null || durationSeconds === null
        ? null
        : { distanceMeters, durationSeconds };
    });
  });

  return routeMatrixResultSchema.parse({ cells });
}
export function normalizeRoute(body: unknown): RouteResult {
  const root = record(body);
  if (!Array.isArray(root.features) || !root.features[0])
    throw new Error("Invalid route response");

  const feature = record(root.features[0]);
  const properties = record(feature.properties);
  const parsed = routeResultSchema.safeParse({
    distanceMeters: properties.distance,
    durationSeconds: properties.time,
    geometry: feature.geometry,
  });
  if (!parsed.success) throw new Error("Invalid route response");
  return parsed.data;
}

export function buildRouteMatrixUpstream(
  input: z.output<typeof routeMatrixRequestSchema>,
  key: string,
) {
  const url = new URL("https://api.geoapify.com/v1/routematrix");
  url.searchParams.set("apiKey", key);
  const body = {
    mode: input.mode,
    sources: input.sources.map((point) => ({
      location: [point.lng, point.lat],
    })),
    targets: input.targets.map((point) => ({
      location: [point.lng, point.lat],
    })),
    ...(input.traffic ? { traffic: input.traffic } : {}),
  };
  return {
    url,
    init: {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    } satisfies RequestInit,
  };
}

export function buildRouteUpstream(
  input: z.output<typeof routeRequestSchema>,
  key: string,
) {
  const url = new URL("https://api.geoapify.com/v1/routing");
  url.searchParams.set(
    "waypoints",
    input.waypoints.map((point) => `${point.lat},${point.lng}`).join("|"),
  );
  url.searchParams.set("mode", input.mode);
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", key);
  if (input.traffic) url.searchParams.set("traffic", input.traffic);
  return {
    url,
    init: {
      method: "GET",
      headers: { Accept: "application/json" },
    } satisfies RequestInit,
  };
}
