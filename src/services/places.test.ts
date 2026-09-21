import { describe, expect, it, vi } from "vitest";
import {
  buildPlacePayload,
  listSavedPlaces,
  savePlace,
  deletePlace,
} from "./placesService";
import {
  normalizeGeoapify,
  geoRequestSchema,
  geoapifyUrl,
} from "../../supabase/functions/_shared/geo";
import {
  buildGoogleMapsSearchUrl,
  safeGoogleMapsUrl,
} from "../utils/externalUrls";
import {
  inferCategory,
  placeDraftSchema,
  type PlaceDraft,
} from "../domain/place";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase", () => ({
  getSupabase: () => ({ from: mocks.from }),
}));
const owner = "10000000-0000-4000-8000-000000000001";
const draft: PlaceDraft = {
  source: "geoapify",
  category: "food",
  providerPlaceId: "test-place",
  name: "Quán A",
  address: "Địa chỉ",
  lat: 10,
  lng: 106,
  subCategory: null,
  estimatedCostPerPerson: 100000,
  averageTimeSpentMinutes: 60,
  notes: "User note",
  tags: ["dinner"],
  isFavorite: false,
  isPrivate: true,
  googleMapsUrl: null,
  sourceName: "Geoapify / OpenStreetMap",
};
const id = "20000000-0000-4000-8000-000000000002";
function row() {
  return { ...buildPlacePayload(owner, draft), id };
}
describe("saved place persistence boundary", () => {
  it("persists normalized durable data but excludes raw blobs and spoofed owner", () => {
    const p = buildPlacePayload(owner, {
      ...draft,
      raw: { secret: true },
      user_id: "attacker",
      needs_location: true,
    });
    expect(p).toMatchObject({
      user_id: owner,
      provider_place_id: "test-place",
      name: "Quán A",
      lat: 10,
      lng: 106,
      needs_location: false,
    });
    expect(p).not.toHaveProperty("raw");
  });
  it("persists custom private data without provider ID", () => {
    expect(
      buildPlacePayload(owner, {
        ...draft,
        source: "custom",
        providerPlaceId: null,
      }),
    ).toMatchObject({
      source: "custom",
      provider_place_id: null,
      is_private: true,
    });
  });
  it.each([
    { lat: 91 },
    { lng: 181 },
    { lat: null },
    { name: "" },
    { providerPlaceId: null },
    { source: "google" },
    { averageTimeSpentMinutes: 1441 },
    { estimatedCostPerPerson: -1 },
    { googleMapsUrl: "javascript:alert(1)" },
  ])("rejects invalid payload %j", (override) => {
    expect(() => buildPlacePayload(owner, { ...draft, ...override })).toThrow();
  });
  it("inserts only allowlisted payload", async () => {
    const insert = vi.fn(() => ({
      select: () => ({ single: async () => ({ data: row(), error: null }) }),
    }));
    mocks.from.mockReturnValue({ insert });
    const saved = await savePlace(owner, { ...draft, raw: "discard" });
    expect(insert).toHaveBeenCalledWith(buildPlacePayload(owner, draft));
    expect(saved.providerPlaceId).toBe("test-place");
  });
  it("reload is user-scoped and normalizes persisted data", async () => {
    const query = { eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockResolvedValue({ data: [row()], error: null });
    mocks.from.mockReturnValue({ select: () => query });
    expect((await listSavedPlaces(owner, 0)).places[0]?.name).toBe("Quán A");
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
  });
  it("updates and deletes scope both ID and owner", async () => {
    const query = { eq: vi.fn(), select: vi.fn(), single: vi.fn() };
    query.eq.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockResolvedValue({ data: row(), error: null });
    mocks.from.mockReturnValue({ update: () => query, delete: () => query });
    await savePlace(owner, draft, id);
    expect(query.eq).toHaveBeenCalledWith("user_id", owner);
    expect(query.eq).toHaveBeenCalledWith("id", id);
    query.select.mockResolvedValue({ data: [{ id }], error: null });
    await deletePlace(owner, id);
  });
});
describe("Geoapify normalization contracts — not live", () => {
  const feature = {
    properties: {
      place_id: "geo-id",
      name: "Cà phê",
      formatted: "Hồ Chí Minh",
      categories: ["catering.cafe"],
    },
    geometry: { type: "Point", coordinates: [106, 10] },
  };
  it("missing optional fields stay unknown, coordinate order is lon/lat", () => {
    expect(normalizeGeoapify({ features: [feature] })[0]).toMatchObject({
      lat: 10,
      lng: 106,
      phone: null,
      website: null,
      openingHoursText: null,
      sourceAttribution: ["Geoapify", "© OpenStreetMap contributors"],
    });
  });
  it("deduplicates and ignores malformed IDs/locations without fabricating data", () => {
    expect(
      normalizeGeoapify({
        features: [feature, feature, { properties: { place_id: "bad" } }],
      }),
    ).toHaveLength(1);
    expect(() => normalizeGeoapify({ message: "error" })).toThrow();
  });
  it("reads optional contact/hours and removes unsafe links", () => {
    const p = {
      ...feature.properties,
      contact: { phone: "+84 123", website: "javascript:bad" },
      datasource: { raw: { opening_hours: "Mo-Fr 09:00-18:00" } },
    };
    expect(
      normalizeGeoapify({ features: [{ ...feature, properties: p }] })[0],
    ).toMatchObject({
      phone: "+84 123",
      website: null,
      openingHoursText: "Mo-Fr 09:00-18:00",
    });
  });
  it("maps categories conservatively", () => {
    expect(inferCategory(["catering.cafe"])).toBe("cafe");
    expect(inferCategory(["catering.bar"])).toBe("drink");
    expect(inferCategory(["catering.pub"])).toBe("drink");
    expect(inferCategory(["catering.restaurant"])).toBe("food");
    expect(inferCategory(["entertainment.cinema"])).toBe("cinema");
    expect(inferCategory([])).toBe("other");
  });
  it("requires a specific type name for new Other drafts", () => {
    expect(
      placeDraftSchema.safeParse({
        ...draft,
        category: "other",
        subCategory: null,
      }).success,
    ).toBe(false);
    expect(
      placeDraftSchema.safeParse({
        ...draft,
        category: "other",
        subCategory: "Tiệm hoa",
      }).success,
    ).toBe(true);
  });
  it("uses bounded URLs and Vietnamese/map-center bias", () => {
    const input = geoRequestSchema.parse({
      action: "autocomplete",
      text: "Sài Gòn",
      bias: { lat: 10, lng: 106 },
    });
    const url = geoapifyUrl(input, "server-test-only");
    expect(url.searchParams.get("bias")).toBe("proximity:106,10");
    expect(url.searchParams.get("lang")).toBe("vi");
    expect(
      geoRequestSchema.safeParse({
        action: "route",
        url: "https://evil.example",
      }).success,
    ).toBe(false);
  });
});
describe("external Google URL only", () => {
  it.each([
    "javascript:alert(1)",
    "http://www.google.com/maps/x",
    "https://www.google.com.evil/maps/x",
    "https://user:pass@www.google.com/maps/x",
    "https://www.google.com/url?q=evil",
    "https://example.com",
  ])("rejects unsafe URL %s", (value) =>
    expect(safeGoogleMapsUrl(value)).toBeNull(),
  );
  it("hides private/start point URLs, including supplied shortcuts", () => {
    expect(buildGoogleMapsSearchUrl(draft)).toBeNull();
    expect(
      buildGoogleMapsSearchUrl({
        ...draft,
        isPrivate: false,
        category: "start_point",
      }),
    ).toBeNull();
  });
  it("prefers validated saved URL, otherwise encoded name/address then coordinates", () => {
    const p = { ...draft, isPrivate: false };
    expect(
      buildGoogleMapsSearchUrl({
        ...p,
        googleMapsUrl: "https://maps.app.goo.gl/test",
      }),
    ).toBe("https://maps.app.goo.gl/test");
    expect(
      new URL(buildGoogleMapsSearchUrl(p)!).searchParams.get("query"),
    ).toBe("Quán A, Địa chỉ");
    expect(
      new URL(
        buildGoogleMapsSearchUrl({ ...p, name: "", address: null })!,
      ).searchParams.get("query"),
    ).toBe("10,106");
  });
});
