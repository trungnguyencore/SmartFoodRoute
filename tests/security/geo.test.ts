import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGeoHandler,
  type GeoDependencies,
} from "../../supabase/functions/geo/handler";
const feature = {
  properties: {
    place_id: "abc123",
    name: "Chợ Bến Thành",
    lat: 10.772,
    lon: 106.698,
    formatted: "Quận 1, TP.HCM",
  },
};
let deps: GeoDependencies;
const payload = {
  action: "autocomplete",
  text: "Bến Thành",
  bias: { lat: 10.77, lng: 106.7 },
};
function request(
  body: unknown = payload,
  token = "signed-test-token",
  origin = "http://localhost:5173",
) {
  return new Request("https://project.example/functions/v1/geo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  deps = {
    apiKey: "private-server-key-test-only",
    allowedOrigins: ["http://localhost:5173"],
    authorize: vi.fn().mockResolvedValue("aal2"),
    consumeQuota: vi.fn().mockResolvedValue(true),
    fetch: vi.fn().mockResolvedValue(Response.json({ features: [feature] })),
  };
});
describe("Edge handler contract — upstream/Auth doubles, no live verification", () => {
  it.each(["autocomplete", "places", "placeDetails", "reverseGeocode"])(
    "dispatches validated %s with normalized DTO and no secret/raw data",
    async (action) => {
      const body =
        action === "autocomplete"
          ? payload
          : action === "places"
            ? {
                action,
                categories: ["catering.cafe"],
                center: { lat: 10, lng: 106 },
                radiusMeters: 3000,
              }
            : action === "placeDetails"
              ? { action, providerPlaceId: "abc123" }
              : { action, lat: 10, lng: 106 };
      const res = await createGeoHandler(deps)(request(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        places: [
          {
            provider: "geoapify",
            name: "Chợ Bến Thành",
            openingHoursText: null,
          },
        ],
      });
      const url = new URL(String(vi.mocked(deps.fetch).mock.calls[0]?.[0]));
      expect(url.origin).toBe("https://api.geoapify.com");
      expect(url.searchParams.get("apiKey")).toBe(deps.apiKey);
      expect(res.headers.get("cache-control")).toBe("no-store");
    },
  );
  it.each([null, "aal1"] as const)(
    "rejects authorization %s before provider/quota calls",
    async (access) => {
      vi.mocked(deps.authorize).mockResolvedValue(access);
      const response = await createGeoHandler(deps)(request());
      expect(response.status).toBe(access === null ? 401 : 403);
      expect(deps.fetch).not.toHaveBeenCalled();
      expect(deps.consumeQuota).not.toHaveBeenCalled();
    },
  );
  it("rejects missing token and disallowed origin; preflight does not consume quota", async () => {
    expect((await createGeoHandler(deps)(request(payload, ""))).status).toBe(
      401,
    );
    expect(
      (
        await createGeoHandler(deps)(
          request(payload, "token", "https://evil.example"),
        )
      ).status,
    ).toBe(403);
    const res = await createGeoHandler(deps)(
      new Request("https://project.example/geo", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([
    { action: "route" },
    { ...payload, url: "https://evil.example" },
    { ...payload, text: "ab" },
    { ...payload, limit: 1000 },
    {
      action: "places",
      categories: ["arbitrary"],
      center: { lat: 10, lng: 106 },
      radiusMeters: 3000,
    },
    { action: "reverseGeocode", lat: 91, lng: 106 },
    {
      action: "resolveGoogleMapsUrl",
      url: "https://evil.example/maps/@10,106,15z",
    },
    { action: "placeDetails", providerPlaceId: "../?apiKey=override" },
  ])("rejects invalid action/input %j", async (body) => {
    expect((await createGeoHandler(deps)(request(body))).status).toBe(400);
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.consumeQuota).not.toHaveBeenCalled();
  });
  it("bounds body even without Content-Length", async () => {
    expect(
      (
        await createGeoHandler(deps)(
          request({ ...payload, text: "x".repeat(9000) }),
        )
      ).status,
    ).toBe(413);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it("fails closed when quota is exhausted or unavailable", async () => {
    vi.mocked(deps.consumeQuota).mockResolvedValue(false);
    expect((await createGeoHandler(deps)(request())).status).toBe(429);
    vi.mocked(deps.consumeQuota).mockRejectedValue(new Error("db offline"));
    expect((await createGeoHandler(deps)(request())).status).toBe(503);
    expect(deps.fetch).not.toHaveBeenCalled();
  });
  it.each([400, 401, 403, 429, 500, 503])(
    "normalizes provider status %s and suppresses body",
    async (status) => {
      vi.mocked(deps.fetch).mockResolvedValue(
        new Response(deps.apiKey, { status }),
      );
      const res = await createGeoHandler(deps)(request());
      expect(res.status).toBe(status === 429 ? 429 : 502);
      expect(await res.text()).not.toContain(deps.apiKey);
    },
  );
  it("normalizes provider network/JSON errors and absent configuration", async () => {
    vi.mocked(deps.fetch).mockRejectedValue(
      new Error("fetch URL with apiKey=" + deps.apiKey),
    );
    const res = await createGeoHandler(deps)(request());
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(deps.apiKey);
    deps.apiKey = undefined;
    expect((await createGeoHandler(deps)(request())).status).toBe(503);
  });

  it("resolves coordinate-bearing Google Maps links without fetching Google", async () => {
    const res = await createGeoHandler(deps)(
      request({
        action: "resolveGoogleMapsUrl",
        url: "https://www.google.com/maps/@10.78,106.7,17z",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      location: {
        lat: 10.78,
        lng: 106.7,
        resolvedUrl: "https://www.google.com/maps/@10.78,106.7,17z",
        method: "url",
        name: null,
        address: null,
      },
    });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("follows an allowlisted Google Maps short-link redirect", async () => {
    vi.mocked(deps.fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location:
            "https://www.google.com/maps/place/Test/@10.79,106.71,17z",
        },
      }),
    );
    const res = await createGeoHandler(deps)(
      request({
        action: "resolveGoogleMapsUrl",
        url: "https://maps.app.goo.gl/testOnly",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      location: { lat: 10.79, lng: 106.71, method: "url" },
    });
    expect(String(vi.mocked(deps.fetch).mock.calls[0]?.[0])).toBe(
      "https://maps.app.goo.gl/testOnly",
    );
    expect(vi.mocked(deps.fetch).mock.calls[0]?.[1]).toMatchObject({
      redirect: "manual",
    });
  });

  it("falls back to Geoapify when a Google Maps link contains only place text", async () => {
    const res = await createGeoHandler(deps)(
      request({
        action: "resolveGoogleMapsUrl",
        url: "https://www.google.com/maps/place/Ch%E1%BB%A3+B%E1%BA%BFn+Th%C3%A0nh/",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      location: {
        lat: 10.772,
        lng: 106.698,
        method: "geoapify",
        name: "Chợ Bến Thành",
        address: "Quận 1, TP.HCM",
      },
    });
    const providerUrl = new URL(
      String(vi.mocked(deps.fetch).mock.calls[0]?.[0]),
    );
    expect(providerUrl.origin).toBe("https://api.geoapify.com");
    expect(providerUrl.searchParams.get("text")).toBe("Chợ Bến Thành");
  });

  it("rejects a short-link redirect that leaves the Google Maps allowlist", async () => {
    vi.mocked(deps.fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://evil.example/redirect" },
      }),
    );
    const res = await createGeoHandler(deps)(
      request({
        action: "resolveGoogleMapsUrl",
        url: "https://maps.app.goo.gl/testOnly",
      }),
    );
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("evil.example");
  });

  it("proxies a bounded Route Matrix and returns only normalized costs", async () => {
    vi.mocked(deps.fetch).mockResolvedValue(
      Response.json({
        sources_to_targets: [
          [
            { distance: 0, time: 0 },
            { distance: 2500, time: 540 },
          ],
          [
            { distance: 2600, time: 560 },
            { distance: 0, time: 0 },
          ],
        ],
      }),
    );
    const body = {
      action: "routeMatrix",
      sources: [
        { lat: 10.77, lng: 106.69 },
        { lat: 10.78, lng: 106.7 },
      ],
      targets: [
        { lat: 10.77, lng: 106.69 },
        { lat: 10.78, lng: 106.7 },
      ],
      mode: "motorcycle",
      traffic: "approximated",
    };
    const res = await createGeoHandler(deps)(request(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      matrix: {
        cells: [
          [
            { distanceMeters: 0, durationSeconds: 0 },
            { distanceMeters: 2500, durationSeconds: 540 },
          ],
          [
            { distanceMeters: 2600, durationSeconds: 560 },
            { distanceMeters: 0, durationSeconds: 0 },
          ],
        ],
      },
    });
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0]!;
    const upstream = new URL(String(url));
    expect(upstream.pathname).toBe("/v1/routematrix");
    expect(upstream.searchParams.get("apiKey")).toBe(deps.apiKey);
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).not.toContain(String(deps.apiKey));
  });

  it("proxies final routing and normalizes GeoJSON geometry", async () => {
    vi.mocked(deps.fetch).mockResolvedValue(
      Response.json({
        features: [
          {
            type: "Feature",
            properties: { distance: 5200, time: 1320 },
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [106.69, 10.77],
                  [106.7, 10.78],
                ],
              ],
            },
          },
        ],
      }),
    );
    const res = await createGeoHandler(deps)(
      request({
        action: "route",
        waypoints: [
          { lat: 10.77, lng: 106.69 },
          { lat: 10.78, lng: 106.7 },
        ],
        mode: "drive",
        traffic: "approximated",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      route: {
        distanceMeters: 5200,
        durationSeconds: 1320,
        geometry: { type: "MultiLineString" },
      },
    });
    const [url, init] = vi.mocked(deps.fetch).mock.calls[0]!;
    const upstream = new URL(String(url));
    expect(upstream.pathname).toBe("/v1/routing");
    expect(upstream.searchParams.get("waypoints")).toContain("|");
    expect(upstream.searchParams.get("apiKey")).toBe(deps.apiKey);
    expect(init?.method).toBe("GET");
  });

  it("rejects route requests above planner bounds before quota/provider", async () => {
    const points = Array.from({ length: 31 }, (_, index) => ({
      lat: 10 + index / 1000,
      lng: 106 + index / 1000,
    }));
    const res = await createGeoHandler(deps)(
      request({
        action: "routeMatrix",
        sources: points,
        targets: points.slice(0, 2),
        mode: "walk",
      }),
    );
    expect(res.status).toBe(400);
    expect(deps.consumeQuota).not.toHaveBeenCalled();
    expect(deps.fetch).not.toHaveBeenCalled();
  });
});
