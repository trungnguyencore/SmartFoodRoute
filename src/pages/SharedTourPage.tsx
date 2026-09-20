import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { categories } from "../domain/place";
import { getSharedTour } from "../services/tourService";

const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});
const dateTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "medium",
  timeStyle: "short",
});
const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function SharedTourPage() {
  const { token = "" } = useParams();
  const query = useQuery({
    queryKey: ["shared-tour", token],
    queryFn: () => getSharedTour(token),
    retry: false,
  });

  if (query.isPending)
    return (
      <main className="shared-tour-page">
        <section className="card" role="status">
          Đang tải lịch trình được chia sẻ…
        </section>
      </main>
    );

  if (query.isError || !query.data)
    return (
      <main className="shared-tour-page">
        <section className="card">
          <p className="eyebrow">SmartFoodRoute</p>
          <h1>Link chia sẻ không còn khả dụng</h1>
          <p>
            Token có thể không hợp lệ, đã hết hạn hoặc đã được chủ tour thu hồi.
          </p>
          <Link to="/">Về SmartFoodRoute</Link>
        </section>
      </main>
    );

  const tour = query.data;
  return (
    <main className="shared-tour-page">
      <section className="card shared-tour-card">
        <header>
          <p className="eyebrow">SmartFoodRoute · Shared tour</p>
          <h1>{tour.title}</h1>
          <p className="muted">
            {tour.departureAt
              ? "Xuất phát " + dateTime.format(new Date(tour.departureAt))
              : "Chưa đặt giờ xuất phát"}
            {" · "}
            {tour.partySize} người
          </p>
        </header>

        <div className="route-metrics">
          {tour.totalDurationMinutes !== null && (
            <span>{tour.totalDurationMinutes} phút tổng thời gian</span>
          )}
          {tour.totalBudget !== null && (
            <span>Ước tính {money.format(tour.totalBudget)}</span>
          )}
          <span>{tour.transportMode}</span>
        </div>

        <ol className="shared-timeline">
          {tour.stops.map((stop) => (
            <li key={stop.position}>
              <div className="shared-stop-time">
                {stop.arrivalAt
                  ? time.format(new Date(stop.arrivalAt))
                  : stop.departureAt
                    ? time.format(new Date(stop.departureAt))
                    : "Bắt đầu"}
              </div>
              <div>
                <strong>{stop.name}</strong>
                <p className="muted">
                  {categories[stop.category].label}
                  {stop.movieTitle ? " · " + stop.movieTitle : ""}
                </p>
                {stop.isPrivate ? (
                  <p className="privacy-note">
                    Vị trí chính xác đã được ẩn để bảo vệ riêng tư.
                  </p>
                ) : (
                  stop.address && <p>{stop.address}</p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <p className="muted">
          Trang public chỉ hiển thị snapshot an toàn do server trả về. Địa điểm
          riêng tư không chứa tọa độ hoặc địa chỉ chính xác.
        </p>
        <Link className="button secondary" to="/">
          Mở SmartFoodRoute
        </Link>
      </section>
    </main>
  );
}
