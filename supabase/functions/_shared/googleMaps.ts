import { z } from "zod";

export const googleMapsResolutionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  resolvedUrl: z.string().url(),
  method: z.enum(["url", "geoapify"]),
  name: z.string().nullable(),
  address: z.string().nullable(),
});
export type GoogleMapsResolution = z.infer<typeof googleMapsResolutionSchema>;

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

function allowedGoogleMapsUrl(value: string): URL | null {
  if (value.length > 2048 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port
    )
      return null;
    const host = url.hostname.toLowerCase();
    if (
      (host === "www.google.com" ||
        host === "google.com" ||
        host === "maps.google.com") &&
      (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))
    )
      return url;
    if (host === "maps.app.goo.gl" && url.pathname.length > 1) return url;
    if (host === "goo.gl" && url.pathname.startsWith("/maps/")) return url;
    return null;
  } catch {
    return null;
  }
}

export function isGoogleMapsUrl(value: string): boolean {
  return allowedGoogleMapsUrl(value) !== null;
}

function coordinates(lat: string, lng: string) {
  const parsed = coordinateSchema.safeParse({
    lat: Number(lat),
    lng: Number(lng),
  });
  return parsed.success ? parsed.data : null;
}

export function coordinatesFromGoogleMapsUrl(value: string) {
  const url = allowedGoogleMapsUrl(value);
  if (!url) return null;
  const decoded = decodeURIComponent(url.href);

  // Google place URLs can contain both a camera center (@lat,lng)
  // and the actual place pin (!3dlat!4dlng). Prefer the pin.
  const data = decoded.match(
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
  );
  if (data?.[1] && data[2]) return coordinates(data[1], data[2]);

  for (const key of ["query", "q", "ll", "destination"]) {
    const raw = url.searchParams.get(key);
    if (!raw) continue;
    const pair = raw
      .trim()
      .match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
    if (pair?.[1] && pair[2]) return coordinates(pair[1], pair[2]);
  }

  const at = decoded.match(
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)(?:,|\/|$)/,
  );
  if (at?.[1] && at[2]) return coordinates(at[1], at[2]);

  return null;
}

export function lookupTextFromGoogleMapsUrl(value: string): string | null {
  const url = allowedGoogleMapsUrl(value);
  if (!url) return null;
  for (const key of ["query", "q", "destination"]) {
    const raw = url.searchParams.get(key)?.trim();
    if (raw && !coordinatesFromGoogleMapsUrl(url.href)) return raw.slice(0, 200);
  }
  const match = url.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/);
  if (!match?.[1]) return null;
  const text = decodeURIComponent(match[1]).replace(/\+/g, " ").trim();
  return text ? text.slice(0, 200) : null;
}

export async function resolveGoogleMapsRedirects(
  value: string,
  fetcher: typeof fetch,
  maxRedirects = 4,
): Promise<string> {
  let current = allowedGoogleMapsUrl(value);
  if (!current) throw new Error("INVALID_GOOGLE_MAPS_URL");

  for (let index = 0; index <= maxRedirects; index += 1) {
    if (coordinatesFromGoogleMapsUrl(current.href) || lookupTextFromGoogleMapsUrl(current.href))
      return current.href;

    const host = current.hostname.toLowerCase();
    const isShort =
      host === "maps.app.goo.gl" ||
      (host === "goo.gl" && current.pathname.startsWith("/maps/"));
    if (!isShort) return current.href;
    if (index === maxRedirects) throw new Error("TOO_MANY_REDIRECTS");

    const response = await fetcher(current, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status < 300 || response.status >= 400)
      throw new Error("SHORT_LINK_NOT_REDIRECT");
    const location = response.headers.get("location");
    if (!location) throw new Error("SHORT_LINK_NO_LOCATION");
    const next = allowedGoogleMapsUrl(new URL(location, current).href);
    if (!next) throw new Error("UNSAFE_REDIRECT");
    current = next;
  }

  throw new Error("UNRESOLVED_GOOGLE_MAPS_URL");
}
