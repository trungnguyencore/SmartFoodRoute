import { describe, expect, it } from "vitest";
import type { SavedPlace } from "../domain/place";
import { buildPlacesTxt } from "./placeExport";

function place(
  id: string,
  name: string,
  category: SavedPlace["category"],
  overrides: Partial<SavedPlace> = {},
): SavedPlace {
  return {
    id,
    userId: "10000000-0000-4000-8000-000000000001",
    source: "custom",
    category,
    providerPlaceId: null,
    name,
    address: null,
    lat: 10.78,
    lng: 106.7,
    subCategory: null,
    estimatedCostPerPerson: null,
    averageTimeSpentMinutes: 60,
    notes: null,
    tags: [],
    isFavorite: false,
    isPrivate: false,
    googleMapsUrl: null,
    sourceName: "Người dùng",
    needsLocation: false,
    ...overrides,
  };
}

describe("place TXT export", () => {
  it("numbers start points from H0 and destinations from D1", () => {
    const text = buildPlacesTxt([
      place(
        "20000000-0000-4000-8000-000000000001",
        "Cổng 1 HCMUTE",
        "start_point",
        {
          googleMapsUrl:
            "https://www.google.com/maps/@10.85,106.77,17z",
          isPrivate: true,
        },
      ),
      place(
        "20000000-0000-4000-8000-000000000002",
        "Vincom Plaza Lê Văn Việt",
        "other",
      ),
    ]);
    expect(text).toContain("H0 - Cổng 1 HCMUTE");
    expect(text).toContain("D1 - Vincom Plaza Lê Văn Việt");
    expect(text).toContain(
      "Google Maps: https://www.google.com/maps/@10.85,106.77,17z",
    );
  });

  it("creates an exact coordinate search URL when no saved Maps link exists", () => {
    const text = buildPlacesTxt([
      place(
        "20000000-0000-4000-8000-000000000003",
        "Quán thử",
        "food",
        { lat: 10.841487, lng: 106.6778395 },
      ),
    ]);
    expect(text).toContain("D1 - Quán thử");
    expect(text).toContain("query=10.841487%2C106.6778395");
  });
});
