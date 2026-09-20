import type {
  ActivityCategory,
  BudgetEstimate,
  PlannerCandidate,
  PlannerInput,
  PlannerRunResult,
  PlannerStop,
  TimelineItem,
  TransportMode,
} from "../domain/planner";
import { transportModes } from "../domain/planner";
import {
  geoProvider,
  type GeoProvider,
  type RouteMatrixResult,
} from "./geoProvider";

const EARTH_RADIUS_METERS = 6_371_000;
const MAX_COMBINATIONS = 200;
const SCORE = {
  travelMinute: 1,
  waitMinute: 0.25,
  distanceKm: 0.05,
  nonFavorite: 5,
} as const;

// Product-only fallback heuristics. They are never presented as provider data.
const PREVIEW_KPH: Record<TransportMode, number> = {
  WALKING: 4.5,
  SCOOTER: 20,
  MOTORCYCLE: 25,
  DRIVING: 22,
};

export class PlannerError extends Error {}
function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function uniqueCategories(order: ActivityCategory[]) {
  return [...new Set(order)];
}

export function prefilterCandidates(input: PlannerInput) {
  const reduced = new Map<ActivityCategory, PlannerStop[]>();
  for (const category of uniqueCategories(input.activityOrder)) {
    let matches = input.candidates.filter((p) => p.category === category);
    if (category === "cinema" && input.fixedAnchor)
      matches = matches.filter((p) => p.id === input.fixedAnchor?.stopId);
    matches.sort(
      (a, b) =>
        haversineMeters(input.start, a) - haversineMeters(input.start, b),
    );
    const selected = matches.slice(
      0,
      input.preferences.maxCandidatesPerCategory,
    );
    if (!selected.length)
      throw new PlannerError(
        `Không có địa điểm phù hợp cho nhóm ${category}.`,
      );
    reduced.set(category, selected);
  }
  return reduced;
}

function combinations(
  order: ActivityCategory[],
  groups: Map<ActivityCategory, PlannerStop[]>,
) {
  let result: PlannerStop[][] = [[]];
  for (const category of order) {
    const choices = groups.get(category) ?? [];
    result = result.flatMap((prefix) =>
      choices.map((choice) => [...prefix, choice]),
    );
    if (result.length > MAX_COMBINATIONS)
      result = result.slice(0, MAX_COMBINATIONS);
  }
  return result;
}

function buildPointSet(input: PlannerInput, groups: Map<ActivityCategory, PlannerStop[]>) {
  const points = [
    {
      id: input.start.id,
      lat: input.start.lat,
      lng: input.start.lng,
    },
  ];
  const seen = new Set([input.start.id]);
  for (const list of groups.values())
    for (const stop of list)
      if (!seen.has(stop.id)) {
        seen.add(stop.id);
        points.push({ id: stop.id, lat: stop.lat, lng: stop.lng });
      }
  return points;
}

function fallbackMatrix(
  points: { lat: number; lng: number }[],
  mode: TransportMode,
): RouteMatrixResult {
  const metersPerSecond = (PREVIEW_KPH[mode] * 1000) / 3600;
  return {
    cells: points.map((source) =>
      points.map((target) => {
        const distanceMeters = haversineMeters(source, target);
        return {
          distanceMeters,
          durationSeconds: distanceMeters / metersPerSecond,
        };
      }),
    ),
  };
}

function matrixCell(
  matrix: RouteMatrixResult,
  index: Map<string, number>,
  fromId: string,
  toId: string,
) {
  const from = index.get(fromId);
  const to = index.get(toId);
  if (from === undefined || to === undefined) return null;
  return matrix.cells[from]?.[to] ?? null;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}
function budgetFor(input: PlannerInput, stops: PlannerStop[]): BudgetEstimate {
  let knownActivitiesVnd = 0;
  const missingCostStopIds: string[] = [];
  for (const stop of stops) {
    if (stop.category === "cinema") continue;
    if (stop.estimatedCostPerPerson === null)
      missingCostStopIds.push(stop.id);
    else knownActivitiesVnd += stop.estimatedCostPerPerson * input.partySize;
  }
  const cinemaTicketsVnd = input.fixedAnchor
    ? input.preferences.cinemaTicketPerPersonVnd * input.partySize
    : 0;
  const transportVnd = input.preferences.transportEstimateVnd;
  return {
    knownActivitiesVnd,
    cinemaTicketsVnd,
    transportVnd,
    totalKnownVnd: knownActivitiesVnd + cinemaTicketsVnd + transportVnd,
    missingCostStopIds,
  };
}

function preAnchorMinutes(
  input: PlannerInput,
  stops: PlannerStop[],
  matrix: RouteMatrixResult,
  index: Map<string, number>,
) {
  if (!input.fixedAnchor) return null;
  const anchorIndex = stops.findIndex((s) => s.id === input.fixedAnchor?.stopId);
  if (anchorIndex < 0) return null;
  let minutes = 0;
  let previousId = input.start.id;
  for (let i = 0; i <= anchorIndex; i += 1) {
    const stop = stops[i];
    if (!stop) return null;
    const cell = matrixCell(matrix, index, previousId, stop.id);
    if (!cell) return null;
    minutes += cell.durationSeconds / 60;
    if (i < anchorIndex) minutes += stop.dwellMinutes;
    previousId = stop.id;
  }
  return minutes;
}

function scheduleCandidate(
  input: PlannerInput,
  stops: PlannerStop[],
  matrix: RouteMatrixResult,
  pointIndex: Map<string, number>,
  verifiedMatrix: boolean,
  sequenceNumber: number,
): PlannerCandidate {
  const violations: string[] = [];
  const warnings: string[] = [];
  const availableFrom = new Date(input.availableFrom);
  const availableUntil = input.availableUntil
    ? new Date(input.availableUntil)
    : null;
  let departureAt = availableFrom;

  if (input.fixedAnchor) {
    const lead = preAnchorMinutes(input, stops, matrix, pointIndex);
    if (lead === null) {
      violations.push("Không có route khả thi tới mốc giờ cố định.");
    } else {
      const fixedStart = new Date(input.fixedAnchor.fixedStartAt);
      const deadline = addMinutes(
        fixedStart,
        -input.fixedAnchor.arrivalBufferMinutes,
      );
      departureAt = addMinutes(deadline, -lead);
      if (departureAt < availableFrom)
        violations.push(
          "Cần xuất phát trước thời gian bạn cho phép để kịp suất chiếu.",
        );
    }
  }

  const timeline: TimelineItem[] = [];
  let cursor = new Date(departureAt);
  let previousId = input.start.id;
  let totalTravelSeconds = 0;
  let totalDistanceMeters = 0;
  let totalWaitSeconds = 0;

  for (const stop of stops) {
    const cell = matrixCell(matrix, pointIndex, previousId, stop.id);
    if (!cell) {
      violations.push(`Không có route khả thi tới ${stop.name}.`);
      continue;
    }
    totalTravelSeconds += cell.durationSeconds;
    totalDistanceMeters += cell.distanceMeters;
    const arrival = new Date(cursor.getTime() + cell.durationSeconds * 1000);
    let startAt = arrival;
    let endAt: Date;
    let waitMinutes = 0;
    const itemWarnings: string[] = [];

    if (input.fixedAnchor?.stopId === stop.id) {
      const fixedStart = new Date(input.fixedAnchor.fixedStartAt);
      const deadline = addMinutes(
        fixedStart,
        -input.fixedAnchor.arrivalBufferMinutes,
      );
      if (arrival > deadline)
        violations.push(
          `Tới ${stop.name} quá muộn so với buffer trước suất chiếu.`,
        );
      startAt = fixedStart;
      waitMinutes = Math.max(
        0,
        (fixedStart.getTime() - arrival.getTime()) / 60_000,
      );
      endAt = addMinutes(fixedStart, input.fixedAnchor.durationMinutes);
    } else {
      endAt = addMinutes(startAt, stop.dwellMinutes);
    }

    const confirmedUntil = input.openingOverrides[stop.id];
    if (confirmedUntil) {
      const closing = new Date(confirmedUntil);
      if (!Number.isNaN(closing.getTime()) && endAt > closing)
        violations.push(`${stop.name} đóng trước khi hoạt động kết thúc.`);
    } else {
      itemWarnings.push(
        "Chưa có dữ liệu giờ mở cửa — nên kiểm tra trước khi đi.",
      );
    }

    totalWaitSeconds += waitMinutes * 60;
    timeline.push({
      stopId: stop.id,
      stopName: stop.name,
      arrivalAt: arrival.toISOString(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      travelFromPreviousMinutes: Math.round(cell.durationSeconds / 60),
      waitMinutes: Math.round(waitMinutes),
      status: itemWarnings.length ? "WARNING" : "OK",
      warnings: itemWarnings,
    });
    warnings.push(...itemWarnings.map((w) => `${stop.name}: ${w}`));
    cursor = endAt;
    previousId = stop.id;
  }

  if (availableUntil && cursor > availableUntil)
    violations.push("Lịch trình kết thúc sau thời gian bạn cho phép.");

  const budget = budgetFor(input, stops);
  if (budget.missingCostStopIds.length)
    warnings.push("Một số địa điểm chưa có ước tính chi phí.");
  const hardLimit = input.preferences.hardBudgetLimitVnd;
  if (hardLimit !== null && budget.totalKnownVnd > hardLimit)
    violations.push("Chi phí đã biết vượt ngân sách hard limit.");

  if (!verifiedMatrix)
    warnings.push(
      "Route Matrix provider lỗi; thời gian hiện chỉ là preview Haversine, chưa verified.",
    );

  const favoritePenalty = input.preferences.preferFavorites
    ? stops.filter((stop) => !stop.isFavorite).length * SCORE.nonFavorite
    : 0;
  const score =
    (totalTravelSeconds / 60) * SCORE.travelMinute +
    (totalWaitSeconds / 60) * SCORE.waitMinute +
    (totalDistanceMeters / 1000) * SCORE.distanceKm +
    favoritePenalty;

  return {
    id: `candidate-${sequenceNumber}`,
    stopIds: stops.map((s) => s.id),
    timeline,
    departureAt: departureAt.toISOString(),
    arrivalAtFinal: cursor.toISOString(),
    totalTravelSeconds,
    totalDistanceMeters,
    totalWaitSeconds,
    budget,
    feasible: violations.length === 0,
    verifiedMatrix,
    verifiedRoute: false,
    violations,
    warnings,
    score,
    route: null,
  };
}

function trafficFor(mode: TransportMode) {
  return mode === "WALKING" ? undefined : ("approximated" as const);
}

export async function optimizeDateRoute(
  input: PlannerInput,
  provider: GeoProvider = geoProvider,
): Promise<PlannerRunResult> {
  if (!Number.isInteger(input.partySize) || input.partySize < 1)
    throw new PlannerError("Số người phải từ 1 trở lên.");
  if (!input.activityOrder.length)
    throw new PlannerError("Chọn ít nhất một hoạt động.");
  if (new Date(input.availableFrom).toString() === "Invalid Date")
    throw new PlannerError("Thời gian bắt đầu không hợp lệ.");

  const groups = prefilterCandidates(input);
  const combos = combinations(input.activityOrder, groups);
  const points = buildPointSet(input, groups);
  const pointIndex = new Map(points.map((point, i) => [point.id, i]));

  let matrix: RouteMatrixResult;
  let verifiedMatrix = true;
  let matrixWarning: string | null = null;
  try {
    matrix = await provider.routeMatrix({
      sources: points.map(({ lat, lng }) => ({ lat, lng })),
      targets: points.map(({ lat, lng }) => ({ lat, lng })),
      mode: transportModes[input.transportMode].provider,
      traffic: trafficFor(input.transportMode),
    });
  } catch {
    verifiedMatrix = false;
    matrixWarning =
      "Geoapify Route Matrix không khả dụng; đang dùng preview Haversine chưa verified.";
    matrix = fallbackMatrix(points, input.transportMode);
  }

  const ranked = combos
    .map((stops, index) =>
      scheduleCandidate(
        input,
        stops,
        matrix,
        pointIndex,
        verifiedMatrix,
        index + 1,
      ),
    )
    .filter((candidate) => candidate.feasible)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.totalDistanceMeters - b.totalDistanceMeters ||
        a.totalWaitSeconds - b.totalWaitSeconds,
    )
    .slice(0, 3);

  const byId = new Map(input.candidates.map((stop) => [stop.id, stop]));
  const candidates = await Promise.all(
    ranked.map(async (candidate) => {
      const stops = candidate.stopIds
        .map((id) => byId.get(id))
        .filter((stop): stop is PlannerStop => !!stop);
      try {
        const route = await provider.route({
          waypoints: [
            { lat: input.start.lat, lng: input.start.lng },
            ...stops.map(({ lat, lng }) => ({ lat, lng })),
          ],
          mode: transportModes[input.transportMode].provider,
          traffic: trafficFor(input.transportMode),
        });
        return {
          ...candidate,
          verifiedRoute: true,
          route,
        };
      } catch {
        return {
          ...candidate,
          warnings: [
            ...candidate.warnings,
            "Không lấy được final route Geoapify; timeline vẫn giữ nhưng bản đồ route chưa verified.",
          ],
        };
      }
    }),
  );

  if (!candidates.length)
    throw new PlannerError(
      "Không tìm thấy lịch trình khả thi với giờ, thứ tự và ngân sách hiện tại.",
    );

  return {
    candidates,
    usedMatrixFallback: !verifiedMatrix,
    matrixWarning,
  };
}
