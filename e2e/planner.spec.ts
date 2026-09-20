import { expect, test } from "@playwright/test";
import { USER_ID, login, mockSupabase } from "./fixtures";

function savedPlace(
  id: string,
  name: string,
  category: string,
  lat: number,
  lng: number,
  options: {
    minutes?: number;
    cost?: number | null;
    private?: boolean;
    favorite?: boolean;
  } = {},
) {
  return {
    id,
    user_id: USER_ID,
    source: "custom",
    category,
    provider_place_id: null,
    name,
    address: "TP.HCM",
    lat,
    lng,
    sub_category: null,
    estimated_cost_per_person: options.cost ?? 100_000,
    average_time_spent_minutes: options.minutes ?? 45,
    notes: null,
    custom_tags: [],
    is_favorite: options.favorite ?? false,
    is_private: options.private ?? false,
    google_maps_url: null,
    source_name: null,
    needs_location: false,
    created_at: "2026-09-20T00:00:00.000Z",
  };
}

function localInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test("Planner builds fixed-cinema Top route through matrix then final routing", async ({
  page,
}) => {
  const service = await mockSupabase(page, {
    initialPlaces: [
      savedPlace(
        "40000000-0000-4000-8000-000000000001",
        "Điểm xuất phát",
        "start_point",
        10.77,
        106.69,
        { private: true, cost: null },
      ),
      savedPlace(
        "40000000-0000-4000-8000-000000000002",
        "Bún bò",
        "food",
        10.775,
        106.695,
        { minutes: 60, favorite: true },
      ),
      savedPlace(
        "40000000-0000-4000-8000-000000000003",
        "Rạp trung tâm",
        "cinema",
        10.78,
        106.7,
        { minutes: 120, cost: null },
      ),
      savedPlace(
        "40000000-0000-4000-8000-000000000004",
        "Cafe tối",
        "cafe",
        10.785,
        106.705,
      ),
    ],
  });
  await login(page);

  await page.getByRole("button", { name: "Lên lịch" }).click();
  await expect(
    page.getByRole("heading", { name: "Lên lịch cho buổi đi chơi." }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Bún bò/ }).check();
  await page.getByRole("checkbox", { name: /Rạp trung tâm/ }).check();
  await page.getByRole("checkbox", { name: /Cafe tối/ }).check();

  const showtime = new Date(Date.now() + 4 * 60 * 60_000);
  showtime.setSeconds(0, 0);
  const latestFinish = new Date(showtime.getTime() + 4 * 60 * 60_000);
  await page
    .getByLabel("Muộn nhất kết thúc")
    .fill(localInput(latestFinish));
  await page.getByLabel("Tên phim").fill("Phim thử nghiệm");
  await page.getByLabel("Giờ bắt đầu phim").fill(localInput(showtime));
  await page
    .getByLabel("Link đặt vé HTTPS (không bắt buộc)")
    .fill("https://moveek.com/booking/test");

  await page.getByRole("button", { name: "Tìm Top 3 lịch trình" }).click();
  await expect(
    page.getByRole("heading", { name: /Top 1 lịch trình khả thi/ }),
  ).toBeVisible();
  const routeCard = page.locator(".route-card").first();
  await expect(routeCard).toContainText("Geoapify");
  await expect(routeCard).toContainText("Ước tính");
  await expect(routeCard).toContainText("Bún bò");
  await expect(routeCard).toContainText("Rạp trung tâm");
  await expect(routeCard).toContainText("Cafe tối");
  await expect(page.getByRole("link", { name: "Đặt vé ↗" })).toHaveAttribute(
    "href",
    /^https:\/\/moveek\.com/,
  );

  await page.getByRole("button", { name: "Lưu tour" }).click();
  await expect(page.getByText("Đã lưu snapshot lịch trình.")).toBeVisible();
  const saveRequest = service.requests.find((request) =>
    request.path.endsWith("/rpc/save_tour_snapshot"),
  );
  expect(saveRequest).toBeTruthy();
  const savedStops = saveRequest?.body?.p_stops as
    | Record<string, unknown>[]
    | undefined;
  expect(savedStops?.[0]).toMatchObject({
    position: 0,
    category: "start_point",
    isPrivate: true,
  });

  await page.getByRole("button", { name: "Tạo link chia sẻ" }).click();
  await expect(page.getByLabel("QR link chia sẻ")).toBeVisible();
  const shareUrl = await page.getByLabel("Link public").inputValue();
  expect(shareUrl).toContain("/share/");
  await page.goto(shareUrl);
  await expect(page.getByRole("heading", { name: /Lịch trình/ })).toBeVisible();
  await expect(page.getByText("Điểm bắt đầu riêng tư")).toBeVisible();
  await expect(
    page.getByText("Vị trí chính xác đã được ẩn để bảo vệ riêng tư."),
  ).toBeVisible();

  expect(service.requests.some((r) => r.body?.action === "routeMatrix")).toBe(
    true,
  );
  expect(service.requests.some((r) => r.body?.action === "route")).toBe(true);
  const matrixIndex = service.requests.findIndex(
    (r) => r.body?.action === "routeMatrix",
  );
  const routeIndex = service.requests.findIndex(
    (r) => r.body?.action === "route",
  );
  expect(matrixIndex).toBeGreaterThanOrEqual(0);
  expect(routeIndex).toBeGreaterThan(matrixIndex);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
