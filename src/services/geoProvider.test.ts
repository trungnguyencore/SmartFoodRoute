import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeoError, SupabaseGeoClient } from "./geoProvider";
const mock = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mock.session } }),
}));
vi.mock("../lib/env", () => ({
  envResult: {
    success: true,
    data: {
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_only",
    },
  },
}));
const fetchMock = vi.fn();
const client = new SupabaseGeoClient();
beforeEach(() => {
  mock.session.mockResolvedValue({
    data: { session: { access_token: "user-test-token" } },
    error: null,
  });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
describe("authenticated frontend Geo client — HTTP doubles", () => {
  it("calls only Edge with bearer token and no provider secret", async () => {
    fetchMock.mockResolvedValue(Response.json({ places: [] }));
    expect(await client.autocomplete({ text: "Sài Gòn" })).toEqual([]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://test.supabase.co/functions/v1/geo",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer user-test-token",
        apikey: "sb_publishable_test_only",
      },
    });
    expect(fetchMock.mock.calls[0]?.[1].body).not.toContain("apiKey");
  });
  it.each([400, 401, 403, 429, 500, 503])(
    "normalizes status %s",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response("untrusted upstream text", { status }),
      );
      await expect(
        client.autocomplete({ text: "Sài Gòn" }),
      ).rejects.toMatchObject({ status });
    },
  );
  it("fails closed without session or for invalid requests", async () => {
    mock.session.mockResolvedValue({ data: { session: null }, error: null });
    await expect(
      client.autocomplete({ text: "Sài Gòn" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(client.reverseGeocode({ lat: 91, lng: 0 })).rejects.toThrow();
  });
  it("normalizes network/invalid JSON and passes caller cancellation", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(
      client.autocomplete({ text: "Sài Gòn" }),
    ).rejects.toMatchObject({ status: 0 });
    fetchMock.mockResolvedValue(new Response("bad JSON"));
    await expect(
      client.autocomplete({ text: "Sài Gòn" }),
    ).rejects.toMatchObject({ status: 502 });
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(controller.signal.reason);
    await expect(
      client.autocomplete({ text: "Sài Gòn" }, controller.signal),
    ).rejects.not.toBeInstanceOf(GeoError);
  });
  it("reverse empty is null, missing details is a normalized 404", async () => {
    fetchMock.mockImplementation(async () => Response.json({ places: [] }));
    expect(await client.reverseGeocode({ lat: 10, lng: 106 })).toBeNull();
    await expect(client.placeDetails("p")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("parses Route Matrix through the authenticated Edge endpoint", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        matrix: {
          cells: [
            [
              { distanceMeters: 0, durationSeconds: 0 },
              { distanceMeters: 1200, durationSeconds: 300 },
            ],
          ],
        },
      }),
    );
    const matrix = await client.routeMatrix({
      sources: [{ lat: 10.77, lng: 106.69 }],
      targets: [
        { lat: 10.77, lng: 106.69 },
        { lat: 10.78, lng: 106.7 },
      ],
      mode: "motorcycle",
      traffic: "approximated",
    });
    expect(matrix.cells[0]?.[1]).toEqual({
      distanceMeters: 1200,
      durationSeconds: 300,
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(String(init.body)).toContain('"action":"routeMatrix"');
    expect(String(init.body)).not.toContain("apiKey");
  });

  it("parses normalized final route and rejects malformed route output", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({
        route: {
          distanceMeters: 5000,
          durationSeconds: 1400,
          geometry: {
            type: "LineString",
            coordinates: [
              [106.69, 10.77],
              [106.7, 10.78],
            ],
          },
        },
      }),
    );
    const route = await client.route({
      waypoints: [
        { lat: 10.77, lng: 106.69 },
        { lat: 10.78, lng: 106.7 },
      ],
      mode: "walk",
    });
    expect(route.geometry.type).toBe("LineString");
    fetchMock.mockResolvedValueOnce(Response.json({ route: { raw: true } }));
    await expect(
      client.route({
        waypoints: [
          { lat: 10.77, lng: 106.69 },
          { lat: 10.78, lng: 106.7 },
        ],
        mode: "walk",
      }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
