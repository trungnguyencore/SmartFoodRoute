import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { categories, type MapPlace } from "../domain/place";
import { MapCanvas } from "../components/map/MapCanvas";
import { Modal } from "../components/ui/Modal";
import { useMapStore } from "../stores/mapStore";
import {
  clearGuestToken,
  getGuestToken,
  listGuestPlaces,
  submitGuestSuggestion,
  type GuestPlace,
} from "../services/guestAccess";

export function GuestPage() {
  const navigate = useNavigate();
  const [places, setPlaces] = useState<GuestPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedId = useMapStore((state) => state.selectedId);
  const selected = places.find((place) => place.id === selectedId) ?? null;

  useEffect(() => {
    if (!getGuestToken()) {
      navigate("/login", { replace: true });
      return;
    }
    let active = true;
    void listGuestPlaces()
      .then((rows) => {
        if (active) setPlaces(rows);
      })
      .catch(() => {
        if (!active) return;
        clearGuestToken();
        navigate("/login", { replace: true });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      useMapStore.getState().reset();
    };
  }, [navigate]);

  const markers = useMemo<MapPlace[]>(
    () =>
      places.flatMap((place) =>
        place.lat === null || place.lng === null
          ? []
          : [
              {
                id: place.id,
                title: place.name,
                category: place.category,
                subCategory: place.subCategory,
                location: { lat: place.lat, lng: place.lng },
              },
            ],
      ),
    [places],
  );

  return (
    <div className="guest-page">
      <header className="guest-header">
        <div>
          <span className="eyebrow">SMARTFOODROUTE</span>
          <strong>Chế độ xem</strong>
        </div>
        <div className="header-actions">
          <button className="secondary" onClick={() => setSuggesting(true)}>
            + Gợi ý chỗ đi mới
          </button>
          <button
            className="text-button"
            onClick={() => {
              clearGuestToken();
              navigate("/login", { replace: true });
            }}
          >
            Thoát
          </button>
        </div>
      </header>
      <main className="guest-layout">
        <aside className="guest-list">
          <h1>Những nơi đã lưu.</h1>
          <p className="muted">
            Bạn đang xem ở chế độ chỉ đọc. Không thể sửa hoặc xóa dữ liệu.
          </p>
          {message && <p role="status" className="notice">{message}</p>}
          {loading ? (
            <p role="status">Đang tải địa điểm…</p>
          ) : (
            <div className="place-list">
              {places.map((place) => (
                <button
                  key={place.id}
                  className={
                    "guest-place-card" +
                    (selectedId === place.id ? " selected" : "")
                  }
                  onClick={() => {
                    useMapStore.getState().select(place.id);
                    if (place.lat !== null && place.lng !== null)
                      useMapStore
                        .getState()
                        .setView({ lat: place.lat, lng: place.lng }, 16);
                  }}
                >
                  <span>{categories[place.category].icon}</span>
                  <span>
                    <strong>{place.name}</strong>
                    <small>
                      {place.address ||
                        (place.category === "other" && place.subCategory
                          ? place.subCategory
                          : categories[place.category].label)}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <section className="card stack guest-detail">
              <h2>{selected.name}</h2>
              <p>{selected.address || "Chưa có địa chỉ."}</p>
              {selected.googleMapsUrl && (
                <a href={selected.googleMapsUrl} target="_blank" rel="noreferrer">
                  Mở Google Maps ↗
                </a>
              )}
            </section>
          )}
        </aside>
        <MapCanvas places={markers} />
      </main>
      {suggesting && (
        <Modal title="Gợi ý chỗ đi mới" onClose={() => setSuggesting(false)}>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const value = (key: string) =>
                String(form.get(key) ?? "").trim();
              setBusy(true);
              setMessage("");
              try {
                await submitGuestSuggestion({
                  name: value("name"),
                  address: value("address") || null,
                  googleMapsUrl: value("googleMapsUrl") || null,
                  tiktokUrl: value("tiktokUrl") || null,
                  notes: value("notes") || null,
                });
                setSuggesting(false);
                setMessage("Đã gửi gợi ý.");
              } catch {
                setMessage("Chưa gửi được gợi ý. Kiểm tra link và thử lại.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Tên địa điểm
              <input name="name" maxLength={120} required />
            </label>
            <label>
              Địa chỉ
              <input name="address" maxLength={500} />
            </label>
            <label>
              Google Maps
              <input
                name="googleMapsUrl"
                type="url"
                maxLength={2048}
                placeholder="https://www.google.com/maps/…"
              />
            </label>
            <label>
              TikTok
              <input
                name="tiktokUrl"
                type="url"
                maxLength={2048}
                placeholder="https://www.tiktok.com/…"
              />
            </label>
            <label>
              Ghi chú
              <textarea name="notes" maxLength={2000} rows={4} />
            </label>
            <button disabled={busy}>
              {busy ? "Đang gửi…" : "Gửi gợi ý"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
