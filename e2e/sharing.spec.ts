import { expect, test } from "@playwright/test";
import { SHARE_TOKEN, mockSupabase } from "./fixtures";

test("public share route works without login and only renders redacted DTO", async ({
  page,
}) => {
  const service = await mockSupabase(page, {
    sharedTour: {
      id: "60000000-0000-4000-8000-000000000006",
      title: "Tour public",
      departureAt: "2026-09-20T10:00:00.000Z",
      transportMode: "MOTORCYCLE",
      partySize: 2,
      totalDurationMinutes: 120,
      totalBudget: 300000,
      stops: [
        {
          position: 0,
          category: "start_point",
          name: "Điểm bắt đầu riêng tư",
          isPrivate: true,
          lat: null,
          lng: null,
          address: null,
          providerPlaceId: null,
          arrivalAt: null,
          departureAt: "2026-09-20T10:00:00.000Z",
          fixedStartAt: null,
          fixedEndAt: null,
          movieTitle: null,
        },
        {
          position: 1,
          category: "food",
          name: "Quán công khai",
          isPrivate: false,
          lat: 10.78,
          lng: 106.7,
          address: "Quận 1, TP.HCM",
          providerPlaceId: "public-poi",
          arrivalAt: "2026-09-20T10:20:00.000Z",
          departureAt: "2026-09-20T11:20:00.000Z",
          fixedStartAt: null,
          fixedEndAt: null,
          movieTitle: null,
        },
      ],
    },
  });

  await page.goto("http://127.0.0.1:5174/share/" + SHARE_TOKEN);
  await expect(page.getByRole("heading", { name: "Tour public" })).toBeVisible();
  await expect(page.getByText("Điểm bắt đầu riêng tư")).toBeVisible();
  await expect(page.getByText("Quán công khai")).toBeVisible();
  await expect(page.getByText("Quận 1, TP.HCM")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đăng nhập" })).toHaveCount(0);
  expect(
    service.requests.some((request) =>
      request.path.endsWith("/rpc/get_shared_tour"),
    ),
  ).toBe(true);
  expect(
    service.requests.some((request) => request.path === "/rest/v1/saved_tours"),
  ).toBe(false);
});
