import { z } from "zod";
import { categorySchema, type SavedPlace } from "./place";
import type {
  PlannerCandidate,
  Showtime,
  TransportMode,
} from "./planner";

const transportModeSchema = z.enum([
  "MOTORCYCLE",
  "SCOOTER",
  "DRIVING",
  "WALKING",
]);

export const shareTokenSchema = z.uuid();

export const publicSharedStopSchema = z.object({
  position: z.number().int().min(0),
  category: categorySchema,
  name: z.string(),
  isPrivate: z.boolean(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  address: z.string().nullable(),
  providerPlaceId: z.string().nullable(),
  arrivalAt: z.string().nullable(),
  departureAt: z.string().nullable(),
  fixedStartAt: z.string().nullable(),
  fixedEndAt: z.string().nullable(),
  movieTitle: z.string().nullable(),
});

export const publicSharedTourSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  departureAt: z.string().nullable(),
  transportMode: transportModeSchema,
  partySize: z.number().int().min(1).max(20),
  totalDurationMinutes: z.number().int().min(0).nullable(),
  totalBudget: z.number().int().min(0).nullable(),
  stops: z.array(publicSharedStopSchema),
});

export type PublicSharedTour = z.infer<typeof publicSharedTourSchema>;
export type PublicSharedStop = z.infer<typeof publicSharedStopSchema>;

export interface TourStopSnapshot {
  position: number;
  savedPlaceId: string | null;
  nameSnapshot: string;
  category: SavedPlace["category"];
  subCategory: string | null;
  latSnapshot: number | null;
  lngSnapshot: number | null;
  addressSnapshot: string | null;
  timingType: "FLEXIBLE" | "FIXED";
  plannedArrivalAt: string | null;
  plannedDepartureAt: string | null;
  fixedStartAt: string | null;
  fixedEndAt: string | null;
  durationMinutes: number;
  estimatedCost: number | null;
  isPrivate: boolean;
  showtimeProvider: string | null;
  providerPlaceId: string | null;
  providerCinemaId: string | null;
  providerMovieId: string | null;
  providerShowtimeId: string | null;
  movieTitle: string | null;
  movieRuntimeMinutes: number | null;
  showtimeFetchedAt: string | null;
  bookingUrl: string | null;
}

export interface SaveTourInput {
  title: string;
  departureAt: string;
  partySize: number;
  transportMode: TransportMode;
  totalDistanceMeters: number;
  totalTravelDurationSeconds: number;
  totalDurationMinutes: number;
  totalEstimatedBudget: number;
  stops: TourStopSnapshot[];
}

export function buildTourSnapshot({
  title,
  start,
  places,
  candidate,
  transportMode,
  partySize,
  showtime,
  cinemaTicketPerPersonVnd,
}: {
  title: string;
  start: SavedPlace;
  places: SavedPlace[];
  candidate: PlannerCandidate;
  transportMode: TransportMode;
  partySize: number;
  showtime: Showtime | null;
  cinemaTicketPerPersonVnd: number;
}): SaveTourInput {
  if (start.lat === null || start.lng === null)
    throw new Error("Điểm xuất phát chưa có tọa độ.");
  const timelineById = new Map(candidate.timeline.map((item) => [item.stopId, item]));
  const byId = new Map(places.map((place) => [place.id, place]));
  const snapshots: TourStopSnapshot[] = [
    {
      position: 0,
      savedPlaceId: start.id,
      nameSnapshot: start.name,
      category: "start_point",
      subCategory: start.subCategory,
      latSnapshot: start.lat,
      lngSnapshot: start.lng,
      addressSnapshot: start.address,
      timingType: "FLEXIBLE",
      plannedArrivalAt: null,
      plannedDepartureAt: candidate.departureAt,
      fixedStartAt: null,
      fixedEndAt: null,
      durationMinutes: 0,
      estimatedCost: 0,
      isPrivate: true,
      showtimeProvider: null,
      providerPlaceId: start.providerPlaceId,
      providerCinemaId: null,
      providerMovieId: null,
      providerShowtimeId: null,
      movieTitle: null,
      movieRuntimeMinutes: null,
      showtimeFetchedAt: null,
      bookingUrl: null,
    },
  ];

  candidate.stopIds.forEach((id, index) => {
    const place = byId.get(id);
    const timeline = timelineById.get(id);
    if (!place || !timeline)
      throw new Error("Lịch trình không còn khớp với dữ liệu địa điểm.");
    const fixed = showtime?.cinemaPlaceId === id;
    const fixedEndAt = fixed
      ? new Date(
          new Date(showtime.startAt).getTime() + showtime.runtimeMinutes * 60_000,
        ).toISOString()
      : null;
    const estimatedCost = fixed
      ? cinemaTicketPerPersonVnd * partySize
      : place.estimatedCostPerPerson === null
        ? null
        : place.estimatedCostPerPerson * partySize;
    snapshots.push({
      position: index + 1,
      savedPlaceId: place.id,
      nameSnapshot: place.name,
      category: place.category,
      subCategory: place.subCategory,
      latSnapshot: place.lat,
      lngSnapshot: place.lng,
      addressSnapshot: place.address,
      timingType: fixed ? "FIXED" : "FLEXIBLE",
      plannedArrivalAt: timeline.arrivalAt,
      plannedDepartureAt: timeline.endAt,
      fixedStartAt: fixed ? showtime.startAt : null,
      fixedEndAt,
      durationMinutes: fixed ? showtime.runtimeMinutes : place.averageTimeSpentMinutes,
      estimatedCost,
      isPrivate: place.isPrivate,
      showtimeProvider: fixed ? showtime.source : null,
      providerPlaceId: place.providerPlaceId,
      providerCinemaId: null,
      providerMovieId: null,
      providerShowtimeId: fixed ? showtime.id : null,
      movieTitle: fixed ? showtime.movieTitle : null,
      movieRuntimeMinutes: fixed ? showtime.runtimeMinutes : null,
      showtimeFetchedAt: fixed ? showtime.fetchedAt : null,
      bookingUrl: fixed ? showtime.bookingUrl : null,
    });
  });

  return {
    title,
    departureAt: candidate.departureAt,
    partySize,
    transportMode,
    totalDistanceMeters: candidate.totalDistanceMeters,
    totalTravelDurationSeconds: candidate.totalTravelSeconds,
    totalDurationMinutes: Math.max(
      0,
      Math.round(
        (new Date(candidate.arrivalAtFinal).getTime() -
          new Date(candidate.departureAt).getTime()) /
          60_000,
      ),
    ),
    totalEstimatedBudget: candidate.budget.totalKnownVnd,
    stops: snapshots,
  };
}
