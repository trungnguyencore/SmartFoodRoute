import { useState } from "react";
import {
  categories,
  inferCategory,
  placeDraftSchema,
  type PlaceCategory,
  type SavedPlace,
} from "../../domain/place";
import {
  geoProvider,
  type GeoPlace,
  type GoogleMapsResolution,
} from "../../services/geoProvider";
import { usePlaceMutations } from "../../hooks/usePlaces";
import { safeGoogleMapsUrl } from "../../utils/externalUrls";
export function PlaceEditor({
  source,
  providerPlace,
  initial,
  onSaved,
}: {
  source: "geoapify" | "custom";
  providerPlace?: GeoPlace;
  initial?: SavedPlace;
  onSaved: (place: SavedPlace) => void;
}) {
  const { save } = usePlaceMutations();
  const [category, setCategory] = useState<PlaceCategory>(
    initial?.category ??
      (providerPlace ? inferCategory(providerPlace.categories) : "start_point"),
  );
  const [isPrivate, setPrivate] = useState(
    initial?.isPrivate ?? source === "custom",
  );
  const values = initial ?? providerPlace;
  const baseLocation =
    values?.lat !== null &&
    values?.lat !== undefined &&
    values?.lng !== null &&
    values?.lng !== undefined
      ? { lat: values.lat, lng: values.lng }
      : null;
  const initialMapsUrl = initial?.googleMapsUrl ?? "";
  const [googleMapsUrl, setGoogleMapsUrl] = useState(initialMapsUrl);
  const [resolvedLocation, setResolvedLocation] =
    useState<GoogleMapsResolution | null>(
      baseLocation
        ? {
            ...baseLocation,
            resolvedUrl: initialMapsUrl,
            method: "url",
            name: values?.name ?? null,
            address: values?.address ?? null,
          }
        : null,
    );
  const [resolvedForUrl, setResolvedForUrl] = useState(initialMapsUrl);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState("");

  const resolveMapsUrl = async (
    rawUrl = googleMapsUrl,
  ): Promise<GoogleMapsResolution | null> => {
    const normalized = safeGoogleMapsUrl(rawUrl.trim());
    if (!normalized) {
      setError("Dán liên kết Google Maps HTTPS hợp lệ.");
      return null;
    }
    setResolving(true);
    setError("");
    try {
      const location = await geoProvider.resolveGoogleMapsUrl(normalized);
      setGoogleMapsUrl(normalized);
      setResolvedLocation(location);
      setResolvedForUrl(normalized);
      return location;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chưa xác định được vị trí từ liên kết Google Maps.",
      );
      return null;
    } finally {
      setResolving(false);
    }
  };
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const form = new FormData(event.currentTarget);
        const text = (key: string) =>
          String(form.get(key) ?? "").trim() || null;
        const numeric = (key: string) =>
          text(key) === null ? null : Number(text(key));
        const mapsUrl = text("googleMapsUrl");
        const normalizedMapsUrl = mapsUrl ? safeGoogleMapsUrl(mapsUrl) : null;
        if (mapsUrl && !normalizedMapsUrl) {
          setError("Dán liên kết Google Maps HTTPS hợp lệ.");
          return;
        }

        let location = baseLocation;
        const needsResolution =
          !location || (source === "custom" && !!normalizedMapsUrl);
        if (needsResolution) {
          if (!normalizedMapsUrl) {
            setError(
              "Dán liên kết Google Maps để hệ thống tự xác định vị trí.",
            );
            return;
          }
          location =
            resolvedLocation && resolvedForUrl === normalizedMapsUrl
              ? resolvedLocation
              : await resolveMapsUrl(normalizedMapsUrl);
          if (!location) return;
        }
        if (!location) {
          setError("Chưa xác định được vị trí của địa điểm.");
          return;
        }

        const parsed = placeDraftSchema.safeParse({
          source,
          category,
          providerPlaceId:
            source === "geoapify"
              ? (initial?.providerPlaceId ?? providerPlace?.providerPlaceId)
              : null,
          name: text("label"),
          address: text("address"),
          lat: location.lat,
          lng: location.lng,
          subCategory: text("subCategory"),
          estimatedCostPerPerson: numeric("budget"),
          averageTimeSpentMinutes: numeric("duration") ?? 60,
          notes: text("notes"),
          tags: (text("tags") || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          isFavorite: form.get("favorite") === "on",
          isPrivate,
          googleMapsUrl: normalizedMapsUrl,
          sourceName:
            source === "geoapify"
              ? "Geoapify / OpenStreetMap"
              : (initial?.sourceName ?? "Người dùng"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues.map((i) => i.message).join(". "));
          return;
        }
        try {
          onSaved(
            await save.mutateAsync({ draft: parsed.data, id: initial?.id }),
          );
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Chưa lưu được địa điểm.",
          );
        }
      }}
    >
      {initial?.needsLocation && (
        <p className="notice">
          Địa điểm cũ chưa có vị trí. Dán liên kết Google Maps để hệ thống tự
          xác định; ghi chú của bạn vẫn được giữ.
        </p>
      )}
      <label>
        Tên địa điểm
        <input
          name="label"
          defaultValue={values?.name ?? ""}
          required
          maxLength={120}
          placeholder="Nhà tôi / điểm đón"
        />
      </label>
      <label>
        Danh mục
        <select
          value={category}
          onChange={(e) => {
            const next = e.target.value as PlaceCategory;
            setCategory(next);
            if (next === "start_point") setPrivate(true);
          }}
        >
          {Object.entries(categories).map(([key, c]) => (
            <option key={key} value={key}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Địa chỉ do bạn nhập
        <input
          name="address"
          defaultValue={values?.address ?? ""}
          maxLength={500}
        />
      </label>
      <label>
        {source === "custom" && !baseLocation
          ? "Liên kết Google Maps"
          : "Liên kết Google Maps (không bắt buộc)"}
        <input
          name="googleMapsUrl"
          type="url"
          maxLength={2048}
          value={googleMapsUrl}
          onChange={(event) => setGoogleMapsUrl(event.target.value)}
          required={source === "custom" && !baseLocation}
          placeholder="https://maps.app.goo.gl/…"
        />
      </label>
      {(source === "custom" || !baseLocation) && (
        <div className="stack">
          <button
            type="button"
            className="secondary"
            disabled={resolving || !googleMapsUrl.trim()}
            onClick={() => void resolveMapsUrl()}
          >
            {resolving ? "Đang tìm vị trí…" : "Xác định vị trí"}
          </button>
          {resolvedLocation &&
            safeGoogleMapsUrl(googleMapsUrl.trim()) === resolvedForUrl && (
              <p role="status" className="notice">
                ✓ Đã xác định vị trí
                {resolvedLocation.name
                  ? `: ${resolvedLocation.name}`
                  : " từ Google Maps"}
                {resolvedLocation.address
                  ? ` — ${resolvedLocation.address}`
                  : "."}
              </p>
            )}
        </div>
      )}
      <p className="muted">
        Bạn chỉ cần dán liên kết Google Maps; hệ thống sẽ tự lấy vị trí để dùng
        cho bản đồ và Planner. Vị trí điểm đón vẫn được ẩn khi chia sẻ tour.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setPrivate(e.target.checked)}
        />
        Đây là địa điểm riêng tư
      </label>
      <label className="checkbox">
        <input
          name="favorite"
          type="checkbox"
          defaultChecked={initial?.isFavorite ?? false}
        />
        Yêu thích
      </label>
      <div className="two-columns">
        <label>
          Chi phí ước tính/người (₫)
          <input
            name="budget"
            type="number"
            min={0}
            max={2147483647}
            step={1}
            defaultValue={initial?.estimatedCostPerPerson ?? ""}
          />
        </label>
        <label>
          Thời gian ở lại (phút)
          <input
            name="duration"
            type="number"
            min={0}
            max={1440}
            step={1}
            defaultValue={initial?.averageTimeSpentMinutes ?? 60}
            required
          />
        </label>
      </div>
      <label>
        Loại phụ
        <input
          name="subCategory"
          maxLength={80}
          defaultValue={initial?.subCategory ?? ""}
          placeholder="Ví dụ: photobooth"
        />
      </label>
      <label>
        Ghi chú của bạn
        <textarea
          name="notes"
          maxLength={3000}
          defaultValue={initial?.notes ?? ""}
          rows={3}
        />
      </label>
      <label>
        Nhãn, ngăn cách bằng dấu phẩy
        <input name="tags" defaultValue={initial?.tags.join(", ") ?? ""} />
      </label>
      <p className="muted">
        Liên kết Google Maps sẽ bị ẩn với địa điểm riêng tư.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={save.isPending || resolving}>
        {save.isPending
          ? "Đang lưu…"
          : initial
            ? "Lưu thay đổi"
            : "Lưu địa điểm"}
      </button>
    </form>
  );
}
