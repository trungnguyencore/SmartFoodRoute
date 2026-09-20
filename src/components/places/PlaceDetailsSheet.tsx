import { useState } from "react";
import { categories, type SavedPlace } from "../../domain/place";
import { useLivePlace, usePlaceMutations } from "../../hooks/usePlaces";
import { buildGoogleMapsSearchUrl, safeHttps } from "../../utils/externalUrls";
import { Modal } from "../ui/Modal";
import { Attributions } from "./Attributions";
import { PlaceEditor } from "./PlaceEditor";
export function PlaceDetailsSheet({
  place,
  onClose,
}: {
  place: SavedPlace;
  onClose: () => void;
}) {
  const live = useLivePlace(
    place.source === "geoapify" ? place.providerPlaceId : null,
  );
  const { remove } = usePlaceMutations();
  const [edit, setEdit] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const mapsUrl = buildGoogleMapsSearchUrl(place),
    website = safeHttps(live.data?.website);
  return (
    <Modal title={place.name} onClose={onClose}>
      {edit ? (
        <>
          <button className="secondary" onClick={() => setEdit(false)}>
            ← Chi tiết
          </button>
          <PlaceEditor
            source={place.source}
            initial={place}
            onSaved={() => setEdit(false)}
          />
        </>
      ) : (
        <div className="stack">
          <p className="muted">
            {categories[place.category].icon} {categories[place.category].label}{" "}
            · {place.isPrivate ? "Riêng tư" : "Có thể chia sẻ trong tour"}
          </p>
          <p>{place.address || "Chưa nhập địa chỉ"}</p>
          {place.needsLocation ? (
            <p className="notice">
              Địa điểm cũ cần bổ sung tọa độ. Chọn Sửa địa điểm để hoàn tất.
            </p>
          ) : (
            <p>
              Tọa độ: {place.lat}, {place.lng}
            </p>
          )}
          {place.source === "geoapify" && (
            <section>
              {live.isFetching && (
                <p role="status">Đang cập nhật thông tin Geoapify…</p>
              )}
              {live.isError && (
                <div role="alert" className="error">
                  <p>{live.error.message}</p>
                  <button
                    className="secondary"
                    onClick={() => void live.refetch()}
                  >
                    Tải lại thông tin
                  </button>
                </div>
              )}
              <h3>Giờ mở cửa</h3>
              <p>
                {live.data?.openingHoursText ||
                  "Chưa có dữ liệu giờ mở cửa (chưa xác minh)."}
              </p>
              <p>Điện thoại: {live.data?.phone || "Chưa có dữ liệu"}</p>
              {!place.isPrivate &&
                place.category !== "start_point" &&
                website && (
                  <a href={website} target="_blank" rel="noopener noreferrer">
                    Website địa điểm ↗
                  </a>
                )}
              <Attributions />
            </section>
          )}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              Xem Google Maps Reviews ↗
            </a>
          )}
          <section>
            <h3>Thông tin của bạn</h3>
            <p>
              Chi phí ước tính/người:{" "}
              {place.estimatedCostPerPerson === null
                ? "Chưa nhập"
                : place.estimatedCostPerPerson.toLocaleString("vi-VN") + " ₫"}
            </p>
            <p>Thời gian ở lại: {place.averageTimeSpentMinutes} phút</p>
            {place.notes && <p className="personal-note">{place.notes}</p>}
            {!!place.tags.length && (
              <p className="muted">{place.tags.join(" · ")}</p>
            )}
          </section>
          <div className="row">
            <button onClick={() => setEdit(true)}>Sửa địa điểm</button>
            <button className="secondary" onClick={() => setConfirm(true)}>
              Xóa
            </button>
          </div>
          {confirm && (
            <div className="notice">
              <p>Xóa địa điểm khỏi danh sách đã lưu?</p>
              <div className="row">
                <button
                  className="danger"
                  disabled={remove.isPending}
                  onClick={async () => {
                    try {
                      await remove.mutateAsync(place.id);
                      onClose();
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Không xóa được.",
                      );
                    }
                  }}
                >
                  Xác nhận xóa
                </button>
                <button className="secondary" onClick={() => setConfirm(false)}>
                  Hủy
                </button>
              </div>
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
