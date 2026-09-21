import { describe, expect, it, vi } from "vitest";
import type {
  PlannerInput,
  PlannerStop,
} from "../domain/planner";
import type { GeoProvider, RouteMatrixResult } from "./geoProvider";
import {
  PlannerError,
  haversineMeters,
  optimizeDateRoute,
  prefilterCandidates,
} from "./plannerService";

const start = {
  id: "start",
  name: "Nhà",
  lat: 10.77,
  lng: 106.69,
  isPrivate: true,
};

function stop(
  id: string,
  category: PlannerStop["category"],
  overrides: Partial<PlannerStop> = {},
): PlannerStop {
  return {
    id,
    name: id,
    category,
    subCategory: null,
    lat: 10.77 + Number(id.length) / 1000,
    lng: 106.69 + Number(id.length) / 1000,
    dwellMinutes: category === "food" ? 60 : 45,
    estimatedCostPerPerson: 100_000,
    isFavorite: false,
    isPrivate: false,
    ...overrides,
  };
}

function baseInput(): PlannerInput {
  return {
    start,
    candidates: [
      stop("food", "food"),
      stop("cinema", "cinema", { dwellMinutes: 120 }),
      stop("cafe", "cafe"),
    ],
    activityOrder: ["food", "cinema", "cafe"],
    transportMode: "MOTORCYCLE",
    partySize: 2,
    availableFrom: "2026-09-20T10:00:00.000Z",
    availableUntil: "2026-09-20T17:00:00.000Z",
    fixedAnchor: {
      stopId: "cinema",
      fixedStartAt: "2026-09-20T13:00:00.000Z",
      durationMinutes: 120,
      arrivalBufferMinutes: 20,
    },
    openingOverrides: {},
    preferences: {
      maxCandidatesPerCategory: 5,
      preferFavorites: false,
      hardBudgetLimitVnd: null,
      cinemaTicketPerPersonVnd: 80_000,
      transportEstimateVnd: 20_000,
    },
  };
}

function uniformMatrix(size: number): RouteMatrixResult {
  return {
    cells: Array.from({ length: size }, (_, row) =>
      Array.from({ length: size }, (_, col) =>
        row === col
          ? { distanceMeters: 0, durationSeconds: 0 }
          : { distanceMeters: 1000, durationSeconds: 600 },
      ),
    ),
  };
}

function provider(
  overrides: Partial<GeoProvider> = {},
): GeoProvider {
  return {
    autocomplete: vi.fn(),
    searchPlaces: vi.fn(),
    placeDetails: vi.fn(),
    reverseGeocode: vi.fn(),
    resolveGoogleMapsUrl: vi.fn(),
    routeMatrix: vi.fn(async ({ sources }) => uniformMatrix(sources.length)),
    route: vi.fn(async () => ({
      distanceMeters: 3000,
      durationSeconds: 1800,
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [106.69, 10.77] as [number, number],
          [106.7, 10.78] as [number, number],
        ],
      },
    })),
    ...overrides,
  };
}

describe("planner optimizer", () => {
  it("calculates Haversine deterministically and prefilters Top N", () => {
    expect(haversineMeters(start, start)).toBe(0);
    const input = baseInput();
    input.fixedAnchor = null;
    input.activityOrder = ["food"];
    input.candidates = [
      stop("near", "food", { lat: 10.771, lng: 106.691 }),
      stop("far", "food", { lat: 10.9, lng: 106.9 }),
    ];
    input.preferences.maxCandidatesPerCategory = 1;
    expect(prefilterCandidates(input).get("food")?.[0]?.id).toBe("near");
  });
  it("backward-schedules fixed cinema, forward-validates and stays one-way", async () => {
    const fake = provider();
    const result = await optimizeDateRoute(baseInput(), fake);
    const candidate = result.candidates[0]!;
    expect(candidate.departureAt).toBe("2026-09-20T11:20:00.000Z");
    expect(candidate.timeline.map((item) => item.stopId)).toEqual([
      "food",
      "cinema",
      "cafe",
    ]);
    expect(candidate.timeline[1]).toMatchObject({
      arrivalAt: "2026-09-20T12:40:00.000Z",
      startAt: "2026-09-20T13:00:00.000Z",
      waitMinutes: 20,
    });
    expect(candidate.budget.totalKnownVnd).toBe(580_000);
    expect(candidate.verifiedMatrix).toBe(true);
    expect(candidate.verifiedRoute).toBe(true);

    const route = vi.mocked(fake.route);
    expect(route).toHaveBeenCalledTimes(1);
    const routeInput = route.mock.calls[0]?.[0];
    expect(routeInput?.waypoints).toHaveLength(4);
    expect(routeInput?.waypoints.at(-1)).not.toEqual({
      lat: start.lat,
      lng: start.lng,
    });
  });
  it("rejects candidates that violate confirmed closing time", async () => {
    const input = baseInput();
    input.openingOverrides.food = "2026-09-20T12:00:00.000Z";
    await expect(optimizeDateRoute(input, provider())).rejects.toBeInstanceOf(
      PlannerError,
    );
  });

  it("rejects known cost above hard budget", async () => {
    const input = baseInput();
    input.preferences.hardBudgetLimitVnd = 500_000;
    await expect(optimizeDateRoute(input, provider())).rejects.toThrow(
      /ngân sách/i,
    );
  });

  it("marks Haversine fallback unverified when Route Matrix fails", async () => {
    const input = baseInput();
    input.fixedAnchor = null;
    input.activityOrder = ["food"];
    input.candidates = [stop("food", "food")];
    const fake = provider({
      routeMatrix: vi.fn(async () => {
        throw new Error("provider down");
      }),
    });
    const result = await optimizeDateRoute(input, fake);
    expect(result.usedMatrixFallback).toBe(true);
    expect(result.matrixWarning).toMatch(/Haversine/);
    expect(result.candidates[0]).toMatchObject({
      verifiedMatrix: false,
      verifiedRoute: true,
    });
    expect(result.candidates[0]?.warnings.join(" ")).toMatch(/chưa verified/);
  });

  it("keeps timeline but marks final route unverified when routing fails", async () => {
    const input = baseInput();
    input.fixedAnchor = null;
    input.activityOrder = ["food"];
    input.candidates = [stop("food", "food")];
    const fake = provider({
      route: vi.fn(async () => {
        throw new Error("route down");
      }),
    });
    const result = await optimizeDateRoute(input, fake);
    expect(result.candidates[0]?.verifiedRoute).toBe(false);
    expect(result.candidates[0]?.route).toBeNull();
    expect(result.candidates[0]?.warnings.join(" ")).toMatch(/final route/);
  });
});
