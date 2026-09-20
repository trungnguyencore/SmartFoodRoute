import type { PlannerStop } from "../../domain/planner";

export interface CinemaDraft {
  cinemaId: string;
  movieTitle: string;
  startAt: string;
  runtimeMinutes: number;
  arrivalBufferMinutes: number;
  ticketPerPersonVnd: number;
  bookingUrl: string;
}

export function CinemaShowtimeEditor({
  cinemas,
  value,
  onChange,
}: {
  cinemas: PlannerStop[];
  value: CinemaDraft;
  onChange: (value: CinemaDraft) => void;
}) {
  if (!cinemas.length) return null;
  const patch = (next: Partial<CinemaDraft>) =>
    onChange({ ...value, ...next });

  return (
    <fieldset className="planner-fieldset">
      <legend>🎬 Suất chiếu cố định</legend>
      <p className="muted">
        Fallback thủ công. SmartFoodRoute không scrape Moveek hoặc bypass anti-bot.
      </p>
      <label>
        Rạp phim
        <select
          value={value.cinemaId}
          onChange={(event) => patch({ cinemaId: event.target.value })}
        >
          <option value="">Chọn rạp</option>
          {cinemas.map((cinema) => (
            <option key={cinema.id} value={cinema.id}>
              {cinema.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tên phim
        <input
          value={value.movieTitle}
          onChange={(event) => patch({ movieTitle: event.target.value })}
          placeholder="Ví dụ: phim đã chọn trên trang đặt vé"
        />
      </label>
      <label>
        Giờ bắt đầu phim
        <input
          type="datetime-local"
          value={value.startAt}
          onChange={(event) => patch({ startAt: event.target.value })}
        />
      </label>
      <div className="planner-grid-2">
        <label>
          Thời lượng phim (phút)
          <input
            type="number"
            min={1}
            max={600}
            value={value.runtimeMinutes}
            onChange={(event) =>
              patch({ runtimeMinutes: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Buffer tới rạp (phút)
          <input
            type="number"
            min={0}
            max={120}
            value={value.arrivalBufferMinutes}
            onChange={(event) =>
              patch({ arrivalBufferMinutes: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <label>
        Vé / người — ước tính (VND)
        <input
          type="number"
          min={0}
          step={1000}
          value={value.ticketPerPersonVnd}
          onChange={(event) =>
            patch({ ticketPerPersonVnd: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Link đặt vé HTTPS (không bắt buộc)
        <input
          type="url"
          value={value.bookingUrl}
          onChange={(event) => patch({ bookingUrl: event.target.value })}
          placeholder="https://..."
        />
      </label>
    </fieldset>
  );
}
