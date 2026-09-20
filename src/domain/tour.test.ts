import { describe, expect, it } from "vitest";
import { buildTourSnapshot } from "./tour";
import type { SavedPlace } from "./place";
import type { PlannerCandidate, Showtime } from "./planner";

function place(
  id: string,
  name: string,
  category: SavedPlace["category"],
  options: Partial<SavedPlace> = {},
): SavedPlace {
  return {
    id,
    userId: "10000000-0000-4000-8000-000000000001",
    source: "custom",
    category,
    providerPlaceId: null,
    name,
    address: name + " address",
    lat: 10.77,
    lng: 106.69,
    subCategory: null,
    estimatedCostPerPerson: category === "cinema" ? null : 50_000,
    averageTimeSpentMinutes: category === "cinema" ? 120 : 60,
    notes: null,
    tags: [],
    isFavorite: false,
    isPrivate: category === "start_point",
    googleMapsUrl: null,
    sourceName: null,
    needsLocation: false,
    ...options,
  };
}

describe("tour snapshot", () => {
  it("persists the start as private position zero and fixed cinema metadata", () => {
    const start = place("10000000-0000-4000-8000-000000000010", "Nhà", "start_point");
    const cinema = place("10000000-0000-4000-8000-000000000011", "Rạp", "cinema");
    const candidate: PlannerCandidate = {
      id: "candidate-1",
      stopIds: [cinema.id],
      timeline: [{
        stopId: cinema.id,
        stopName: cinema.name,
        arrivalAt: "2026-09-20T11:40:00.000Z",
        startAt: "2026-09-20T12:00:00.000Z",
        endAt: "2026-09-20T14:00:00.000Z",
        travelFromPreviousMinutes: 20,
        waitMinutes: 20,
        status: "OK",
        warnings: [],
      }],
      departureAt: "2026-09-20T11:20:00.000Z",
      arrivalAtFinal: "2026-09-20T14:00:00.000Z",
      totalTravelSeconds: 1200,
      totalDistanceMeters: 5000,
      totalWaitSeconds: 1200,
      budget: {
        knownActivitiesVnd: 0,
        cinemaTicketsVnd: 300_000,
        transportVnd: 20_000,
        totalKnownVnd: 320_000,
        missingCostStopIds: [],
      },
      feasible: true,
      verifiedMatrix: true,
      verifiedRoute: true,
      violations: [],
      warnings: [],
      score: 1,
      route: null,
    };
    const showtime: Showtime = {
      id: "manual-showtime",
      cinemaPlaceId: cinema.id,
      movieTitle: "Phim test",
      startAt: "2026-09-20T12:00:00.000Z",
      runtimeMinutes: 120,
      bookingUrl: "https://moveek.com/booking/test",
      fetchedAt: "2026-09-20T10:00:00.000Z",
      source: "manual",
    };

    const draft = buildTourSnapshot({
      title: "Tour test",
      start,
      places: [start, cinema],
      candidate,
      transportMode: "MOTORCYCLE",
      partySize: 2,
      showtime,
      cinemaTicketPerPersonVnd: 150_000,
    });

    expect(draft.totalDurationMinutes).toBe(160);
    expect(draft.totalEstimatedBudget).toBe(320_000);
    expect(draft.stops[0]).toMatchObject({
      position: 0,
      category: "start_point",
      isPrivate: true,
      plannedDepartureAt: candidate.departureAt,
    });
    expect(draft.stops[1]).toMatchObject({
      position: 1,
      category: "cinema",
      timingType: "FIXED",
      fixedStartAt: showtime.startAt,
      movieTitle: "Phim test",
      estimatedCost: 300_000,
    });
  });
});
