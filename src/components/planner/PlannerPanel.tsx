import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Route } from "lucide-react";
import type { SavedPlace } from "../../domain/place";
import {
  defaultPlannerPreferences,
  toPlannerStart,
  toPlannerStop,
  transportModes,
  type ActivityCategory,
  type Showtime,
  type TransportMode,
} from "../../domain/planner";
import { buildTourSnapshot } from "../../domain/tour";
import { optimizeDateRoute } from "../../services/plannerService";
import {
  createManualShowtime,
  validateShowtimeFreshness,
} from "../../services/showtimeProvider";
import { usePlannerStore } from "../../stores/plannerStore";
import {
  CinemaShowtimeEditor,
  type CinemaDraft,
} from "../cinema/CinemaShowtimeEditor";
import { RouteResults } from "../timeline/RouteResults";
import { ShareTourPanel } from "../sharing/ShareTourPanel";

function localDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const labels: Record<ActivityCategory, string> = {
  food: "Ăn",
  drink: "Uống",
  cafe: "Cà phê",
  cinema: "Rạp phim",
  entertainment: "Vui chơi / photobooth",
  other: "Khác",
};

const orderPresets = {
  before: ["food", "drink", "entertainment", "cinema", "cafe", "other"],
  after: ["food", "cinema", "entertainment", "drink", "cafe", "other"],
} satisfies Record<string, ActivityCategory[]>;

const initialCinema: CinemaDraft = {
  cinemaId: "",
  movieTitle: "",
  startAt: "",
  runtimeMinutes: 120,
  arrivalBufferMinutes: 20,
  ticketPerPersonVnd: 0,
  bookingUrl: "",
};

export function PlannerPanel({ places }: { places: SavedPlace[] }) {
  const defaults = useMemo(() => {
    const from = new Date(Date.now() + 60 * 60_000);
    from.setMinutes(0, 0, 0);
    const until = new Date(from.getTime() + 6 * 60 * 60_000);
    return { from: localDateTime(from), until: localDateTime(until) };
  }, []);
  const located = useMemo(
    () => places.filter((p) => p.lat !== null && p.lng !== null),
    [places],
  );
  const stops = useMemo(
    () =>
      located
        .map(toPlannerStop)
        .filter((stop): stop is NonNullable<typeof stop> => !!stop),
    [located],
  );
  const [startId, setStartId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [transportMode, setTransportMode] =
    useState<TransportMode>("MOTORCYCLE");
  const [partySize, setPartySize] = useState(2);
  const [availableFrom, setAvailableFrom] = useState(defaults.from);
  const [availableUntil, setAvailableUntil] = useState(defaults.until);
  const [maxCandidates, setMaxCandidates] = useState(5);
  const [preferFavorites, setPreferFavorites] = useState(false);
  const [orderPreset, setOrderPreset] = useState<keyof typeof orderPresets>(
    "before",
  );
  const [hardBudget, setHardBudget] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState(500_000);
  const [transportEstimate, setTransportEstimate] = useState(0);
  const [openingOverrides, setOpeningOverrides] = useState<
    Record<string, string>
  >({});
  const [cinema, setCinema] = useState<CinemaDraft>(initialCinema);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);
  const [shareContext, setShareContext] = useState<{
    start: SavedPlace;
    places: SavedPlace[];
    partySize: number;
    transportMode: TransportMode;
    showtime: Showtime | null;
    cinemaTicketPerPersonVnd: number;
  } | null>(null);
  const result = usePlannerStore((s) => s.result);
  const selectedIndex = usePlannerStore((s) => s.selectedIndex);
  const running = usePlannerStore((s) => s.running);
  const error = usePlannerStore((s) => s.error);
  useEffect(() => {
    if (startId && located.some((p) => p.id === startId)) return;
    const preferred =
      located.find((p) => p.category === "start_point") ?? located[0];
    setStartId(preferred?.id ?? "");
  }, [located, startId]);

  const selectedStops = useMemo(
    () =>
      stops.filter(
        (stop) => selectedIds.includes(stop.id) && stop.id !== startId,
      ),
    [selectedIds, startId, stops],
  );
  const cinemas = selectedStops.filter((stop) => stop.category === "cinema");
  const selectedCandidate = result?.candidates[selectedIndex] ?? null;
  const shareDraft = useMemo(() => {
    if (!selectedCandidate || !shareContext) return null;
    try {
      return buildTourSnapshot({
        title:
          "Lịch trình " +
          new Date(selectedCandidate.departureAt).toLocaleDateString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
          }),
        start: shareContext.start,
        places: shareContext.places,
        candidate: selectedCandidate,
        transportMode: shareContext.transportMode,
        partySize: shareContext.partySize,
        showtime: shareContext.showtime,
        cinemaTicketPerPersonVnd: shareContext.cinemaTicketPerPersonVnd,
      });
    } catch {
      return null;
    }
  }, [selectedCandidate, shareContext]);

  useEffect(() => {
    if (!cinemas.length && cinema.cinemaId)
      setCinema((current) => ({ ...current, cinemaId: "" }));
    else if (
      cinemas.length &&
      !cinemas.some((item) => item.id === cinema.cinemaId)
    )
      setCinema((current) => ({
        ...current,
        cinemaId: cinemas[0]?.id ?? "",
      }));
  }, [cinema.cinemaId, cinemas]);

  function toggleCandidate(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function runPlanner() {
    const store = usePlannerStore.getState();
    store.setError("");
    store.setRunning(true);
    setBookingUrl(null);
    setShareContext(null);
    try {
      const startPlace = located.find((place) => place.id === startId);
      const start = startPlace ? toPlannerStart(startPlace) : null;
      if (!startPlace || !start)
        throw new Error("Chọn điểm xuất phát có tọa độ.");
      if (!selectedStops.length) throw new Error("Chọn ít nhất một hoạt động.");

      const selectedCategories = new Set(
        selectedStops.map((stop) => stop.category),
      );
      const activityOrder = orderPresets[orderPreset].filter((category) =>
        selectedCategories.has(category),
      );
      let fixedAnchor = null;
      let ticketPerPersonVnd = 0;
      let currentShowtime: Showtime | null = null;

      if (cinemas.length) {
        if (!cinema.cinemaId)
          throw new Error("Chọn rạp cho suất chiếu cố định.");
        const showtime = createManualShowtime({
          cinemaPlaceId: cinema.cinemaId,
          movieTitle: cinema.movieTitle,
          startAt: cinema.startAt,
          runtimeMinutes: cinema.runtimeMinutes,
          bookingUrl: cinema.bookingUrl,
        });
        const freshness = validateShowtimeFreshness(showtime);
        currentShowtime = showtime;
        if (!freshness.valid)
          throw new Error(freshness.warning ?? "Suất chiếu không còn hợp lệ.");
        fixedAnchor = {
          stopId: showtime.cinemaPlaceId,
          fixedStartAt: showtime.startAt,
          durationMinutes: showtime.runtimeMinutes,
          arrivalBufferMinutes: cinema.arrivalBufferMinutes,
        };
        ticketPerPersonVnd = cinema.ticketPerPersonVnd;
        setBookingUrl(showtime.bookingUrl);
      }

      const normalizedOpeningOverrides = Object.fromEntries(
        Object.entries(openingOverrides)
          .filter(([, value]) => !!value)
          .map(([id, value]) => [id, new Date(value).toISOString()]),
      );

      const next = await optimizeDateRoute({
        start,
        candidates: selectedStops,
        activityOrder,
        transportMode,
        partySize,
        availableFrom: new Date(availableFrom).toISOString(),
        availableUntil: availableUntil
          ? new Date(availableUntil).toISOString()
          : null,
        fixedAnchor,
        openingOverrides: normalizedOpeningOverrides,
        preferences: {
          ...defaultPlannerPreferences,
          maxCandidatesPerCategory: maxCandidates,
          preferFavorites,
          hardBudgetLimitVnd: hardBudget ? budgetLimit : null,
          cinemaTicketPerPersonVnd: ticketPerPersonVnd,
          transportEstimateVnd: transportEstimate,
        },
      });
      store.setResult(next);
      setShareContext({
        start: startPlace,
        places: [startPlace, ...selectedStops.map((stop) => {
          const place = located.find((item) => item.id === stop.id);
          if (!place) throw new Error("Không tìm thấy snapshot địa điểm để lưu tour.");
          return place;
        })],
        partySize,
        transportMode,
        showtime: currentShowtime,
        cinemaTicketPerPersonVnd: ticketPerPersonVnd,
      });
    } catch (reason) {
      store.setRunning(false);
      store.setError(
        reason instanceof Error ? reason.message : "Không thể tạo lịch trình.",
      );
    }
  }

  if (!located.length)
    return (
      <div className="empty-state">
        <Route size={30} aria-hidden="true" />
        <h3>Chưa có địa điểm để lên lịch</h3>
        <p>Lưu ít nhất một điểm có tọa độ trước khi dùng Planner.</p>
      </div>
    );

  return (
    <div className="planner-panel">
      <div>
        <p className="eyebrow">Prompt 2 Planner</p>
        <h2>Lên lịch cho buổi đi chơi.</h2>
        <p className="muted">
          Matrix trước, kiểm tra mốc giờ cố định, rồi mới lấy final route cho
          tối đa 3 phương án.
        </p>
      </div>

      <label>
        Điểm xuất phát
        <select value={startId} onChange={(e) => setStartId(e.target.value)}>
          {located.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
              {place.isPrivate ? " · riêng tư" : ""}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="planner-fieldset">
        <legend>Hoạt động muốn ghé</legend>
        <div className="candidate-list">
          {stops.map((stop) => (
            <label className="candidate-choice" key={stop.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(stop.id)}
                disabled={stop.id === startId}
                onChange={() => toggleCandidate(stop.id)}
              />
              <span>
                <strong>{stop.name}</strong>
                <small>
                  {labels[stop.category]} · {stop.dwellMinutes} phút
                  {stop.isFavorite ? " · yêu thích" : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="planner-grid-2">
        <label>
          Phương tiện
          <select
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value as TransportMode)}
          >
            {Object.entries(transportModes).map(([value, mode]) => (
              <option key={value} value={value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Số người
          <input
            type="number"
            min={1}
            max={20}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="planner-grid-2">
        <label>
          Có thể xuất phát từ
          <input
            type="datetime-local"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
        </label>
        <label>
          Muộn nhất kết thúc
          <input
            type="datetime-local"
            value={availableUntil}
            onChange={(e) => setAvailableUntil(e.target.value)}
          />
        </label>
      </div>

      <label>
        Thứ tự quanh rạp phim
        <select
          value={orderPreset}
          onChange={(e) =>
            setOrderPreset(e.target.value as keyof typeof orderPresets)
          }
        >
          <option value="before">Ăn → vui chơi → phim → cafe</option>
          <option value="after">Ăn → phim → vui chơi → cafe</option>
        </select>
      </label>

      <div className="planner-grid-2">
        <label>
          Tối đa candidate / nhóm
          <input
            type="number"
            min={1}
            max={5}
            value={maxCandidates}
            onChange={(e) => setMaxCandidates(Number(e.target.value))}
          />
        </label>
        <label>
          Ước tính di chuyển (VND)
          <input
            type="number"
            min={0}
            step={1000}
            value={transportEstimate}
            onChange={(e) => setTransportEstimate(Number(e.target.value))}
          />
        </label>
      </div>

      <label className="inline-check">
        <input
          type="checkbox"
          checked={preferFavorites}
          onChange={(e) => setPreferFavorites(e.target.checked)}
        />
        Ưu tiên địa điểm yêu thích khi hòa điểm
      </label>

      <label className="inline-check">
        <input
          type="checkbox"
          checked={hardBudget}
          onChange={(e) => setHardBudget(e.target.checked)}
        />
        Bật hard budget limit
      </label>
      {hardBudget && (
        <label>
          Ngân sách tối đa đã biết (VND)
          <input
            type="number"
            min={0}
            step={1000}
            value={budgetLimit}
            onChange={(e) => setBudgetLimit(Number(e.target.value))}
          />
        </label>
      )}

      {selectedStops.length > 0 && (
        <details className="planner-overrides">
          <summary>Giờ mở cửa đã xác nhận</summary>
          <p className="muted">
            Không nhập nghĩa là UNKNOWN, không bị coi là CLOSED.
          </p>
          {selectedStops.map((stop) => (
            <label key={stop.id}>
              {stop.name} mở ít nhất tới
              <input
                type="datetime-local"
                value={openingOverrides[stop.id] ?? ""}
                onChange={(e) =>
                  setOpeningOverrides((current) => ({
                    ...current,
                    [stop.id]: e.target.value,
                  }))
                }
              />
            </label>
          ))}
        </details>
      )}

      <CinemaShowtimeEditor
        cinemas={cinemas}
        value={cinema}
        onChange={setCinema}
      />

      <button type="button" onClick={() => void runPlanner()} disabled={running}>
        <CalendarClock size={17} aria-hidden="true" />
        {running ? "Đang tính lịch trình…" : "Tìm Top 3 lịch trình"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {result && (
        <RouteResults
          result={result}
          selectedIndex={selectedIndex}
          onSelect={(index) =>
            usePlannerStore.getState().selectCandidate(index)
          }
          bookingUrl={bookingUrl}
        />
      )}
      {shareDraft && selectedCandidate && (
        <ShareTourPanel key={selectedCandidate.id} draft={shareDraft} />
      )}
    </div>
  );
}
