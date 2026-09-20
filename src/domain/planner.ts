import type { PlaceCategory, SavedPlace } from "./place";
import type { RouteResult } from "../services/geoProvider";

export const transportModes = {
  MOTORCYCLE: { label: "Xe máy", provider: "motorcycle" },
  SCOOTER: { label: "Xe tay ga / scooter", provider: "scooter" },
  DRIVING: { label: "Ô tô", provider: "drive" },
  WALKING: { label: "Đi bộ", provider: "walk" },
} as const;

export type TransportMode = keyof typeof transportModes;
export type ActivityCategory = Exclude<PlaceCategory, "start_point">;

export interface PlannerStop {
  id: string;
  name: string;
  category: ActivityCategory;
  subCategory: string | null;
  lat: number;
  lng: number;
  dwellMinutes: number;
  estimatedCostPerPerson: number | null;
  isFavorite: boolean;
  isPrivate: boolean;
}

export function toPlannerStop(place: SavedPlace): PlannerStop | null {
  if (
    place.category === "start_point" ||
    place.lat === null ||
    place.lng === null
  )
    return null;
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    subCategory: place.subCategory,
    lat: place.lat,
    lng: place.lng,
    dwellMinutes: place.averageTimeSpentMinutes,
    estimatedCostPerPerson: place.estimatedCostPerPerson,
    isFavorite: place.isFavorite,
    isPrivate: place.isPrivate,
  };
}

export interface PlannerStart {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isPrivate: boolean;
}

export function toPlannerStart(place: SavedPlace): PlannerStart | null {
  if (place.lat === null || place.lng === null) return null;
  return {
    id: place.id,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    isPrivate: place.isPrivate,
  };
}
export interface Showtime {
  id: string;
  cinemaPlaceId: string;
  movieTitle: string;
  startAt: string;
  runtimeMinutes: number;
  bookingUrl: string | null;
  fetchedAt: string;
  source: "manual" | "moveek";
}

export interface FixedAnchor {
  stopId: string;
  fixedStartAt: string;
  durationMinutes: number;
  arrivalBufferMinutes: number;
}

export interface PlannerPreferences {
  maxCandidatesPerCategory: number;
  preferFavorites: boolean;
  hardBudgetLimitVnd: number | null;
  cinemaTicketPerPersonVnd: number;
  transportEstimateVnd: number;
}

export interface PlannerInput {
  start: PlannerStart;
  candidates: PlannerStop[];
  activityOrder: ActivityCategory[];
  transportMode: TransportMode;
  partySize: number;
  availableFrom: string;
  availableUntil: string | null;
  fixedAnchor: FixedAnchor | null;
  openingOverrides: Record<string, string>;
  preferences: PlannerPreferences;
}
export interface TimelineItem {
  stopId: string;
  stopName: string;
  arrivalAt: string;
  startAt: string;
  endAt: string;
  travelFromPreviousMinutes: number;
  waitMinutes: number;
  status: "OK" | "WARNING" | "INVALID";
  warnings: string[];
}

export interface BudgetEstimate {
  knownActivitiesVnd: number;
  cinemaTicketsVnd: number;
  transportVnd: number;
  totalKnownVnd: number;
  missingCostStopIds: string[];
}

export interface PlannerCandidate {
  id: string;
  stopIds: string[];
  timeline: TimelineItem[];
  departureAt: string;
  arrivalAtFinal: string;
  totalTravelSeconds: number;
  totalDistanceMeters: number;
  totalWaitSeconds: number;
  budget: BudgetEstimate;
  feasible: boolean;
  verifiedMatrix: boolean;
  verifiedRoute: boolean;
  violations: string[];
  warnings: string[];
  score: number;
  route: RouteResult | null;
}

export interface PlannerRunResult {
  candidates: PlannerCandidate[];
  usedMatrixFallback: boolean;
  matrixWarning: string | null;
}

export const defaultPlannerPreferences: PlannerPreferences = {
  maxCandidatesPerCategory: 5,
  preferFavorites: false,
  hardBudgetLimitVnd: null,
  cinemaTicketPerPersonVnd: 0,
  transportEstimateVnd: 0,
};
