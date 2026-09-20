import { safeHttps } from "../utils/externalUrls";
import type { Showtime } from "../domain/planner";

export interface ProviderCinema {
  id: string;
  name: string;
  placeId: string;
}

export interface CinemaSearchInput {
  cinemas: ProviderCinema[];
  query?: string;
}

export interface CinemaShowtimeInput {
  cinemaId: string;
  date: string;
}

export interface CinemaSchedule {
  cinema: ProviderCinema;
  showtimes: Showtime[];
  fetchedAt: string;
}

export interface BookingInput {
  showtimeId: string;
}

export interface ShowtimeProvider {
  searchCinemas(input: CinemaSearchInput): Promise<ProviderCinema[]>;
  getCinemaShowtimes(input: CinemaShowtimeInput): Promise<CinemaSchedule>;
  getBookingUrl(input: BookingInput): Promise<string | null>;
}
export interface ManualShowtimeRecord {
  cinema: ProviderCinema;
  showtime: Showtime;
}

export class ManualShowtimeProvider implements ShowtimeProvider {
  constructor(private readonly records: ManualShowtimeRecord[]) {}

  async searchCinemas(input: CinemaSearchInput) {
    const query = input.query?.trim().toLocaleLowerCase("vi") ?? "";
    return input.cinemas.filter(
      (cinema) =>
        !query || cinema.name.toLocaleLowerCase("vi").includes(query),
    );
  }

  async getCinemaShowtimes(input: CinemaShowtimeInput) {
    const record = this.records.find(
      ({ cinema, showtime }) =>
        cinema.id === input.cinemaId &&
        showtime.startAt.slice(0, 10) === input.date,
    );
    if (!record) throw new Error("Chưa có suất chiếu thủ công cho rạp này.");
    const showtimes = this.records
      .filter(
        ({ cinema, showtime }) =>
          cinema.id === input.cinemaId &&
          showtime.startAt.slice(0, 10) === input.date,
      )
      .map(({ showtime }) => showtime);
    return {
      cinema: record.cinema,
      showtimes,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getBookingUrl(input: BookingInput) {
    const match = this.records.find(
      ({ showtime }) => showtime.id === input.showtimeId,
    );
    return match?.showtime.bookingUrl
      ? safeHttps(match.showtime.bookingUrl)
      : null;
  }
}

export function createManualShowtime(input: {
  cinemaPlaceId: string;
  movieTitle: string;
  startAt: string;
  runtimeMinutes: number;
  bookingUrl?: string;
  now?: Date;
}): Showtime {
  const movieTitle = input.movieTitle.trim();
  if (!movieTitle) throw new Error("Nhập tên phim.");
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new Error("Giờ chiếu không hợp lệ.");
  if (!Number.isInteger(input.runtimeMinutes) || input.runtimeMinutes < 1)
    throw new Error("Thời lượng phim không hợp lệ.");
  const bookingUrl = input.bookingUrl?.trim()
    ? safeHttps(input.bookingUrl.trim())
    : null;
  if (input.bookingUrl?.trim() && !bookingUrl)
    throw new Error("Link đặt vé phải là HTTPS hợp lệ.");

  const now = input.now ?? new Date();
  return {
    id: `manual:${input.cinemaPlaceId}:${start.getTime()}`,
    cinemaPlaceId: input.cinemaPlaceId,
    movieTitle,
    startAt: start.toISOString(),
    runtimeMinutes: input.runtimeMinutes,
    bookingUrl,
    fetchedAt: now.toISOString(),
    source: "manual",
  };
}

export function validateShowtimeFreshness(showtime: Showtime, now = new Date()) {
  const start = new Date(showtime.startAt);
  if (Number.isNaN(start.getTime()))
    return { valid: false, warning: "Suất chiếu có thời gian không hợp lệ." };
  if (start.getTime() <= now.getTime())
    return { valid: false, warning: "Suất chiếu đã bắt đầu hoặc đã qua." };
  return {
    valid: true,
    warning:
      showtime.source === "manual"
        ? "Suất chiếu nhập thủ công — nên kiểm tra lại trước khi đặt vé."
        : null,
  };
}
