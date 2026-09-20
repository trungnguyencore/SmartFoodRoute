import { describe, expect, it } from "vitest";
import {
  ManualShowtimeProvider,
  createManualShowtime,
  validateShowtimeFreshness,
} from "./showtimeProvider";

describe("manual showtime provider", () => {
  it("creates a safe fixed-time showtime and external booking handoff", async () => {
    const showtime = createManualShowtime({
      cinemaPlaceId: "cinema-1",
      movieTitle: "Test Movie",
      startAt: "2026-09-21T13:00:00.000Z",
      runtimeMinutes: 125,
      bookingUrl: "https://moveek.com/booking/example",
      now: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(showtime).toMatchObject({
      cinemaPlaceId: "cinema-1",
      source: "manual",
      runtimeMinutes: 125,
    });

    const cinema = {
      id: "provider-cinema-1",
      name: "Rạp thử nghiệm",
      placeId: "cinema-1",
    };
    const provider = new ManualShowtimeProvider([{ cinema, showtime }]);
    const schedule = await provider.getCinemaShowtimes({
      cinemaId: cinema.id,
      date: "2026-09-21",
    });
    expect(schedule.showtimes).toHaveLength(1);
    expect(
      await provider.getBookingUrl({ showtimeId: showtime.id }),
    ).toMatch(/^https:\/\/moveek\.com/);
  });

  it("rejects unsafe booking URLs and invalid runtime", () => {
    expect(() =>
      createManualShowtime({
        cinemaPlaceId: "cinema-1",
        movieTitle: "Movie",
        startAt: "2026-09-21T13:00:00.000Z",
        runtimeMinutes: 100,
        bookingUrl: "javascript:alert(1)",
      }),
    ).toThrow(/HTTPS/);
    expect(() =>
      createManualShowtime({
        cinemaPlaceId: "cinema-1",
        movieTitle: "Movie",
        startAt: "2026-09-21T13:00:00.000Z",
        runtimeMinutes: 0,
      }),
    ).toThrow(/Thời lượng/);
  });
  it("marks past showtimes invalid and manual future data as verify-first", () => {
    const future = createManualShowtime({
      cinemaPlaceId: "cinema-1",
      movieTitle: "Movie",
      startAt: "2026-09-21T13:00:00.000Z",
      runtimeMinutes: 100,
      now: new Date("2026-09-20T00:00:00.000Z"),
    });
    expect(
      validateShowtimeFreshness(
        future,
        new Date("2026-09-20T00:00:00.000Z"),
      ),
    ).toEqual({
      valid: true,
      warning: expect.stringMatching(/thủ công/i),
    });
    expect(
      validateShowtimeFreshness(
        future,
        new Date("2026-09-22T00:00:00.000Z"),
      ).valid,
    ).toBe(false);
  });
});
