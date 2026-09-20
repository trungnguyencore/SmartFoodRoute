import type { PlannerRunResult } from "../../domain/planner";

const time = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function RouteResults({
  result,
  selectedIndex,
  onSelect,
  bookingUrl,
}: {
  result: PlannerRunResult;
  selectedIndex: number;
  onSelect: (index: number) => void;
  bookingUrl: string | null;
}) {
  return (
    <section className="planner-results" aria-label="Lịch trình đề xuất">
      <div className="saved-heading">
        <h3>Top {result.candidates.length} lịch trình khả thi</h3>
        {result.usedMatrixFallback && (
          <span className="route-badge warning">Preview Haversine</span>
        )}
      </div>
      {result.matrixWarning && (
        <p role="status" className="notice">
          {result.matrixWarning}
        </p>
      )}
      <div className="route-candidates">
        {result.candidates.map((candidate, index) => (
          <article
            className={
              "route-card" + (selectedIndex === index ? " selected" : "")
            }
            key={candidate.id}
          >
            <div className="route-card-heading">
              <div>
                <strong>Lịch trình {index + 1}</strong>
                <span className="muted">
                  Xuất phát {time.format(new Date(candidate.departureAt))}
                </span>
              </div>
              <button
                type="button"
                className="secondary"
                aria-pressed={selectedIndex === index}
                onClick={() => onSelect(index)}
              >
                {selectedIndex === index ? "Đang xem" : "Xem route"}
              </button>
            </div>
            <div className="route-metrics">
              <span>
                {Math.round(candidate.totalTravelSeconds / 60)} phút di chuyển
              </span>
              <span>
                {(candidate.totalDistanceMeters / 1000).toFixed(1)} km
              </span>
              <span>{Math.round(candidate.totalWaitSeconds / 60)} phút chờ</span>
              <span>Ước tính {money.format(candidate.budget.totalKnownVnd)}</span>
            </div>
            <p className="muted">
              Matrix: {candidate.verifiedMatrix ? "Geoapify" : "preview"} · Route:
              {" "}
              {candidate.verifiedRoute ? "Geoapify verified" : "chưa verified"}
            </p>
            <ol className="timeline">
              {candidate.timeline.map((item) => (
                <li key={item.stopId}>
                  <time>{time.format(new Date(item.arrivalAt))}</time>
                  <div>
                    <strong>{item.stopName}</strong>
                    <p>
                      {item.travelFromPreviousMinutes} phút di chuyển
                      {item.waitMinutes > 0
                        ? ` · chờ ${item.waitMinutes} phút`
                        : ""}
                    </p>
                    {item.warnings.map((warning) => (
                      <p className="timeline-warning" key={warning}>
                        {warning}
                      </p>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
            {candidate.warnings.length > 0 && (
              <details>
                <summary>Cảnh báo ({candidate.warnings.length})</summary>
                <ul className="warning-list">
                  {[...new Set(candidate.warnings)].map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            {candidate.budget.missingCostStopIds.length > 0 && (
              <p className="muted">
                Tổng trên chỉ gồm các khoản đã có dữ liệu; đây không phải giá
                real-time.
              </p>
            )}
          </article>
        ))}
      </div>
      {bookingUrl && (
        <a
          className="button secondary"
          href={bookingUrl}
          target="_blank"
          rel="noreferrer"
        >
          Đặt vé ↗
        </a>
      )}
    </section>
  );
}
