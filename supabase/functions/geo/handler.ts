import {
  geoRequestSchema,
  geoapifyUrl,
  normalizeGeoapify,
} from "../_shared/geo.ts";
import {
  coordinatesFromGoogleMapsUrl,
  googleMapsResolutionSchema,
  lookupTextFromGoogleMapsUrl,
  resolveGoogleMapsRedirects,
} from "../_shared/googleMaps.ts";
import {
  buildRouteMatrixUpstream,
  buildRouteUpstream,
  normalizeRoute,
  normalizeRouteMatrix,
} from "../_shared/routing.ts";
export interface GeoDependencies {
  apiKey: string | undefined;
  allowedOrigins: string[];
  authorize: (token: string) => Promise<"aal2" | "aal1" | null>;
  consumeQuota: (token: string) => Promise<boolean>;
  fetch: typeof fetch;
}
export function createGeoHandler(deps: GeoDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowed = !origin || deps.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;
    const fail = (status: number, code: string) =>
      new Response(JSON.stringify({ error: { code } }), {
        status,
        headers: status === 429 ? { ...headers, "Retry-After": "60" } : headers,
      });
    if (!allowed) return fail(403, "ORIGIN_DENIED");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token || token.length > 16000) return fail(401, "UNAUTHENTICATED");
    try {
      const access = await deps.authorize(token);
      if (!access) return fail(401, "UNAUTHENTICATED");
      if (access !== "aal2") return fail(403, "MFA_REQUIRED");
    } catch {
      return fail(503, "AUTH_UNAVAILABLE");
    }
    if (!request.headers.get("content-type")?.includes("application/json"))
      return fail(400, "INVALID_REQUEST");
    // Stream cap, not just Content-Length (which untrusted clients can omit).
    let raw = "";
    try {
      const reader = request.body?.getReader();
      if (!reader) return fail(400, "INVALID_REQUEST");
      const decoder = new TextDecoder();
      let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8192) {
          await reader.cancel();
          return fail(413, "REQUEST_TOO_LARGE");
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch {
      return fail(400, "INVALID_REQUEST");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, "INVALID_REQUEST");
    }
    const parsed = geoRequestSchema.safeParse(body);
    if (!parsed.success) return fail(400, "INVALID_REQUEST");
    if (!deps.apiKey) return fail(503, "PROVIDER_NOT_CONFIGURED");
    try {
      if (!(await deps.consumeQuota(token))) return fail(429, "RATE_LIMITED");
    } catch {
      return fail(503, "QUOTA_UNAVAILABLE");
    } // Fail closed; never bypass quota.
    try {
      const input = parsed.data;
      if (input.action === "resolveGoogleMapsUrl") {
        const resolvedUrl = await resolveGoogleMapsRedirects(
          input.url,
          deps.fetch,
        );
        const direct = coordinatesFromGoogleMapsUrl(resolvedUrl);
        if (direct) {
          const location = googleMapsResolutionSchema.parse({
            ...direct,
            resolvedUrl,
            method: "url",
            name: null,
            address: null,
          });
          return new Response(JSON.stringify({ location }), {
            status: 200,
            headers,
          });
        }

        const lookupText = lookupTextFromGoogleMapsUrl(resolvedUrl);
        if (!lookupText) return fail(404, "PLACE_NOT_FOUND");
        const providerUrl = geoapifyUrl(
          {
            action: "autocomplete",
            text: lookupText,
            limit: 1,
            language: input.language,
          },
          deps.apiKey,
        );
        const providerResponse = await deps.fetch(providerUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
          redirect: "error",
        });
        if (providerResponse.status === 429)
          return fail(429, "PROVIDER_RATE_LIMITED");
        if (!providerResponse.ok) return fail(502, "PROVIDER_UNAVAILABLE");
        const places = normalizeGeoapify(await providerResponse.json());
        const place = places[0];
        if (!place) return fail(404, "PLACE_NOT_FOUND");
        const location = googleMapsResolutionSchema.parse({
          lat: place.lat,
          lng: place.lng,
          resolvedUrl,
          method: "geoapify",
          name: place.name,
          address: place.address,
        });
        return new Response(JSON.stringify({ location }), {
          status: 200,
          headers,
        });
      }

      const upstream =
        input.action === "routeMatrix"
          ? buildRouteMatrixUpstream(input, deps.apiKey)
          : input.action === "route"
            ? buildRouteUpstream(input, deps.apiKey)
            : {
                url: geoapifyUrl(input, deps.apiKey),
                init: {
                  method: "GET",
                  headers: { Accept: "application/json" },
                } satisfies RequestInit,
              };
      const response = await deps.fetch(upstream.url, {
        ...upstream.init,
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (response.status === 429) return fail(429, "PROVIDER_RATE_LIMITED");
      if (!response.ok) return fail(502, "PROVIDER_UNAVAILABLE");
      const providerBody = await response.json();

      if (input.action === "routeMatrix") {
        const matrix = normalizeRouteMatrix(providerBody);
        return new Response(JSON.stringify({ matrix }), {
          status: 200,
          headers,
        });
      }
      if (input.action === "route") {
        const route = normalizeRoute(providerBody);
        return new Response(JSON.stringify({ route }), {
          status: 200,
          headers,
        });
      }

      const places = normalizeGeoapify(providerBody);
      if (input.action === "placeDetails" && !places.length)
        return fail(404, "PLACE_NOT_FOUND");
      return new Response(JSON.stringify({ places }), { status: 200, headers });
    } catch {
      return fail(502, "PROVIDER_UNAVAILABLE");
    }
  };
}
