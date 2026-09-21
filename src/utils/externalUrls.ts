export function safeHttps(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/.test(value))
    return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function safeGoogleMapsUrl(value: unknown): string | null {
  const safe = safeHttps(value);
  if (!safe) return null;
  const url = new URL(safe);
  return ((url.hostname === "www.google.com" ||
      url.hostname === "google.com") &&
    (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) ||
    url.hostname === "maps.google.com" ||
    url.hostname === "maps.app.goo.gl" ||
    (url.hostname === "goo.gl" && url.pathname.startsWith("/maps/"))
    ? safe
    : null;
}
export function buildGoogleMapsSearchUrl(place: {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  isPrivate: boolean;
  category?: string;
  googleMapsUrl: string | null;
}): string | null {
  if (place.isPrivate || place.category === "start_point") return null;
  const saved = safeGoogleMapsUrl(place.googleMapsUrl);
  if (saved) return saved;
  const query =
    [place.name, place.address].filter(Boolean).join(", ") ||
    (place.lat !== null && place.lng !== null
      ? `${place.lat},${place.lng}`
      : "");
  if (!query) return null;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", query);
  return url.href;
}
