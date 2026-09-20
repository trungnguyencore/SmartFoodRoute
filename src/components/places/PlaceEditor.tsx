import { useState } from "react";
import {
  categories,
  inferCategory,
  placeDraftSchema,
  type PlaceCategory,
  type SavedPlace,
} from "../../domain/place";
import type { GeoPlace } from "../../services/geoProvider";
import { usePlaceMutations } from "../../hooks/usePlaces";
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
  const [error, setError] = useState("");
  const values = initial ?? providerPlace;
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
        const parsed = placeDraftSchema.safeParse({
          source,
          category,
          providerPlaceId:
            source === "geoapify"
              ? (initial?.providerPlaceId ?? providerPlace?.providerPlaceId)
              : null,
          name: text("label"),
          address: text("address"),
          lat: numeric("lat"),
          lng: numeric("lng"),
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
          googleMapsUrl: text("googleMapsUrl"),
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
          Địa điểm cũ chưa có tọa độ. Bổ sung tên và vị trí thực để dùng trên
          bản đồ; ghi chú của bạn vẫn được giữ.
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
      <div className="two-columns">
        <label>
          Vĩ độ
          <input
            name="lat"
            type="number"
            step="any"
            min={-90}
            max={90}
            defaultValue={values?.lat ?? ""}
            required
          />
        </label>
        <label>
          Kinh độ
          <input
            name="lng"
            type="number"
            step="any"
            min={-180}
            max={180}
            defaultValue={values?.lng ?? ""}
            required
          />
        </label>
      </div>
      <p className="muted">
        Tọa độ chính xác chỉ được công khai trong tour nếu bạn cho phép. Điểm
        đón luôn được ẩn khi chia sẻ.
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
      <label>
        Liên kết Google Maps (không bắt buộc)
        <input
          name="googleMapsUrl"
          type="url"
          maxLength={2048}
          defaultValue={initial?.googleMapsUrl ?? ""}
          placeholder="https://www.google.com/maps/…"
        />
      </label>
      <p className="muted">Liên kết đánh giá sẽ bị ẩn với địa điểm riêng tư.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button disabled={save.isPending}>
        {save.isPending
          ? "Đang lưu…"
          : initial
            ? "Lưu thay đổi"
            : "Lưu địa điểm"}
      </button>
    </form>
  );
}
