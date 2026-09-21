import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapCanvas } from "../components/map/MapCanvas";
import { useAuth } from "../hooks/useAuth";
import { useMapStore } from "../stores/mapStore";
import { usePlannerPlaces, useSavedPlaces } from "../hooks/usePlaces";
import { PlaceSearch } from "../components/places/PlaceSearch";
import { PlaceCard } from "../components/places/PlaceCard";
import { PlaceDetailsSheet } from "../components/places/PlaceDetailsSheet";
import { SaveCustomPlaceModal } from "../components/places/SaveCustomPlaceModal";
import { SavePlaceModal } from "../components/places/SavePlaceModal";
import { PlannerPanel } from "../components/planner/PlannerPanel";
import { usePlannerStore } from "../stores/plannerStore";
import type { MapPlace, SavedPlace } from "../domain/place";
import type { GeoPlace } from "../services/geoProvider";
import { Download, MapPin, Plus, Search } from "lucide-react";
import { hasCustomPlaceDraft } from "../utils/customPlaceDraft";
import {
  listAllSavedPlaces,
  listSavedPlacesByIds,
} from "../services/placesService";
import { downloadPlacesTxt } from "../utils/placeExport";
export function DashboardPage() {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const [sheet, setSheet] = useState<"collapsed" | "half" | "expanded">("half");
  const saved = useSavedPlaces(page);
  const plannerPlaces = usePlannerPlaces();
  const [plannerOpen, setPlannerOpen] = useState(false);
  const plannerResult = usePlannerStore((s) => s.result);
  const plannerSelectedIndex = usePlannerStore((s) => s.selectedIndex);
  const activeRoute =
    plannerResult?.candidates[plannerSelectedIndex]?.route ?? null;
  const [search, setSearch] = useState(false);
  const [custom, setCustom] = useState(() => hasCustomPlaceDraft());
  const [providerPlace, setProviderPlace] = useState<GeoPlace | null>(null);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportSelection, setExportSelection] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedId = useMapStore((s) => s.selectedId);
  const initialCenter = useRef(false);
  const markers = useMemo(
    () =>
      (saved.data?.places ?? []).flatMap((place): MapPlace[] => {
        const location =
          place.lat !== null && place.lng !== null
            ? { lat: place.lat, lng: place.lng }
            : null;
        return location
          ? [
              {
                id: place.id,
                title: place.name,
                category: place.category,
                subCategory: place.subCategory,
                location,
              },
            ]
          : [];
      }),
    [saved.data],
  );
  useEffect(() => {
    if (!initialCenter.current && markers[0]) {
      initialCenter.current = true;
      const current = useMapStore.getState();
      if (current.center.lat === 10.7769 && current.center.lng === 106.7009)
        current.setView(markers[0].location, 14);
    }
  }, [markers]);
  useEffect(() => () => useMapStore.getState().reset(), []);
  const selected = saved.data?.places.find((p) => p.id === selectedId);
  function onSaved(place: SavedPlace) {
    setCustom(false);
    setProviderPlace(null);
    setMessage("Đã lưu địa điểm.");
    setPage(0);
    useMapStore.getState().select(place.id);
  }

  function toggleExportPlace(id: string) {
    setExportSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportPlaces(mode: "all" | "selected") {
    const userId = auth.session?.user.id;
    if (!userId || auth.access !== "ready") {
      setMessage("Cần đăng nhập lại trước khi xuất danh sách.");
      return;
    }
    if (mode === "selected" && exportSelection.size === 0) {
      setMessage("Chọn ít nhất một địa điểm để xuất.");
      return;
    }
    setExporting(true);
    setMessage("");
    try {
      const places =
        mode === "all"
          ? await listAllSavedPlaces(userId)
          : await listSavedPlacesByIds(userId, [...exportSelection]);
      if (!places.length) {
        setMessage("Không có địa điểm phù hợp để xuất.");
        return;
      }
      const suffix = mode === "all" ? "tat-ca" : "da-chon";
      const date = new Date().toISOString().slice(0, 10);
      downloadPlacesTxt(
        places,
        `smartfoodroute-${suffix}-${date}.txt`,
      );
      setMessage(
        mode === "all"
          ? `Đã xuất ${places.length} địa điểm.`
          : `Đã xuất ${places.length} địa điểm được chọn.`,
      );
    } catch {
      setMessage("Không xuất được danh sách. Kiểm tra kết nối và thử lại.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="dashboard">
      <header className="app-header">
        <div>
          <p className="eyebrow">SmartFoodRoute</p>
          <h1>Đi đâu, ăn gì?</h1>
        </div>
        <nav className="row">
          <Link to="/account">Tài khoản</Link>
          <button className="secondary" onClick={() => void auth.logout()}>
            Đăng xuất
          </button>
        </nav>
      </header>
      <div className={"workspace sheet-" + sheet}>
        <aside className="places-panel">
          <div className="sheet-sizes" aria-label="Kích thước bảng địa điểm">
            <button
              className="secondary"
              aria-pressed={sheet === "collapsed"}
              onClick={() => setSheet("collapsed")}
            >
              Gọn
            </button>
            <button
              className="secondary"
              aria-pressed={sheet === "half"}
              onClick={() => setSheet("half")}
            >
              Một nửa
            </button>
            <button
              className="secondary"
              aria-pressed={sheet === "expanded"}
              onClick={() => setSheet("expanded")}
            >
              Mở rộng
            </button>
          </div>
          <div className="panel-content">
            <p className="eyebrow">Bộ sưu tập cá nhân</p>
            <h2>Những nơi muốn ghé.</h2>
            <p className="muted">
              Một quán quen, một góc mới, hay điểm đón cho buổi hẹn tiếp theo.
            </p>
            <div className="row">
              <button
                onClick={() => setSearch((v) => !v)}
                aria-expanded={search}
              >
                <Search size={17} aria-hidden="true" />
                Tìm địa điểm
              </button>
              <button className="secondary" onClick={() => setCustom(true)}>
                <Plus size={17} aria-hidden="true" />
                Địa điểm riêng
              </button>
              <button
                className="secondary"
                aria-expanded={plannerOpen}
                onClick={() => setPlannerOpen((value) => !value)}
              >
                Lên lịch
              </button>
            </div>
            {search && (
              <div className="search-panel">
                <PlaceSearch
                  onSelect={(place) => {
                    setProviderPlace(place);
                    useMapStore
                      .getState()
                      .setView({ lat: place.lat, lng: place.lng }, 16);
                  }}
                />
              </div>
            )}
            {plannerOpen && (
              <div className="planner-shell">
                {plannerPlaces.isPending && (
                  <p role="status">Đang tải dữ liệu Planner…</p>
                )}
                {plannerPlaces.isError && (
                  <p role="alert" className="error">
                    Không tải được địa điểm cho Planner.
                  </p>
                )}
                {plannerPlaces.data && (
                  <PlannerPanel places={plannerPlaces.data} />
                )}
              </div>
            )}
            {message && (
              <p role="status" className="notice">
                {message}
              </p>
            )}
            <div className="saved-heading">
              <h3>Địa điểm đã lưu</h3>
              <button
                className="text-button"
                onClick={() => void saved.refetch()}
                disabled={saved.isFetching}
              >
                Tải lại
              </button>
            </div>
            <div className="export-actions" aria-label="Xuất danh sách địa điểm">
              <button
                className="secondary"
                disabled={exporting || saved.isPending}
                onClick={() => void exportPlaces("all")}
              >
                <Download size={16} aria-hidden="true" />
                Xuất tất cả TXT
              </button>
              <button
                className="secondary"
                disabled={exporting || exportSelection.size === 0}
                onClick={() => void exportPlaces("selected")}
              >
                <Download size={16} aria-hidden="true" />
                Xuất đã chọn ({exportSelection.size})
              </button>
            </div>
            {saved.isPending && <p role="status">Đang tải bộ sưu tập…</p>}
            {saved.isError && (
              <p role="alert" className="error">
                Không tải được địa điểm. Kiểm tra kết nối hoặc xác thực lại
                phiên.
              </p>
            )}
            {saved.data?.places.length === 0 && (
              <div className="empty-state">
                <MapPin size={32} aria-hidden="true" />
                <h3>
                  {page === 0
                    ? "Điểm hẹn đầu tiên?"
                    : "Trang này chưa có địa điểm."}
                </h3>
                <p>
                  {page === 0
                    ? "Tìm một quán với Geoapify hoặc thêm địa điểm riêng của bạn."
                    : "Quay lại trang trước để xem danh sách."}
                </p>
              </div>
            )}
            <div className="place-list">
              {saved.data?.places.map((place) => (
                <div className="place-export-item" key={place.id}>
                  <label className="place-export-select">
                    <input
                      type="checkbox"
                      checked={exportSelection.has(place.id)}
                      onChange={() => toggleExportPlace(place.id)}
                      aria-label={`Chọn ${place.name} để xuất TXT`}
                    />
                    <span>Chọn</span>
                  </label>
                  <PlaceCard
                    place={place}
                    onSelect={() => {
                      useMapStore.getState().select(place.id);
                      const marker = markers.find((m) => m.id === place.id);
                      if (marker)
                        useMapStore.getState().setView(marker.location, 16);
                    }}
                  />
                </div>
              ))}
            </div>
            {(page > 0 || saved.data?.hasNext) && (
              <div className="row">
                <button
                  className="secondary"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trang trước
                </button>
                <span>Trang {page + 1}</span>
                <button
                  className="secondary"
                  disabled={!saved.data?.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </button>
              </div>
            )}
            <p className="muted collection-footer">
              Vị trí riêng tư và ghi chú chỉ hiển thị trong tài khoản của bạn.
            </p>
          </div>
        </aside>
        <MapCanvas places={markers} route={activeRoute} />
      </div>
      {custom && (
        <SaveCustomPlaceModal
          onClose={() => setCustom(false)}
          onSaved={onSaved}
        />
      )}
      {providerPlace && (
        <SavePlaceModal
          place={providerPlace}
          onClose={() => setProviderPlace(null)}
          onSaved={onSaved}
        />
      )}
      {selected && !custom && !providerPlace && (
        <PlaceDetailsSheet
          key={selected.id}
          place={selected}
          onClose={() => useMapStore.getState().select(null)}
        />
      )}
    </main>
  );
}
