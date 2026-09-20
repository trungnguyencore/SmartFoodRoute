import { test, expect } from "@playwright/test";
import { GEO_PLACE, login, mockSupabase } from "./fixtures";
test("mocked Geo Edge journey: autocomplete, durable POI CRUD, details/privacy and quota", async ({
  page,
}) => {
  const service = await mockSupabase(page);
  const platformRequests: string[] = [];
  page.on("request", (request) => {
    if (
      /maps\.googleapis|places\.googleapis|routes\.googleapis/.test(
        request.url(),
      )
    )
      platformRequests.push(request.url());
  });
  await login(page);
  await page.getByRole("button", { name: "Tìm địa điểm", exact: true }).click();
  const search = page.getByRole("combobox", { name: "Tìm địa điểm / địa chỉ" });
  await search.fill("cà phê");
  await expect(
    page.getByRole("option", { name: /Cà phê Sài Gòn/ }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Tên địa điểm", { exact: true })).toHaveValue(
    GEO_PLACE.name,
  );
  await expect(dialog.getByLabel("Đây là địa điểm riêng tư")).not.toBeChecked();
  await dialog
    .getByRole("button", { name: "Lưu địa điểm", exact: true })
    .click();
  await expect(
    dialog.getByRole("link", { name: "Xem Google Maps Reviews ↗" }),
  ).toHaveAttribute("href", /www.google.com\/maps\/search/);
  await expect(dialog).toContainText("Chưa có dữ liệu giờ mở cửa");
  expect(service.getPlaces()[0]).toMatchObject({
    source: "geoapify",
    provider_place_id: GEO_PLACE.providerPlaceId,
    name: GEO_PLACE.name,
    lat: GEO_PLACE.lat,
    lng: GEO_PLACE.lng,
  });
  await dialog.getByRole("button", { name: "Sửa địa điểm" }).click();
  await dialog.getByLabel("Đây là địa điểm riêng tư").check();
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(
    dialog.getByRole("link", { name: /Google Maps Reviews/ }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /Cà phê Sài Gòn/ }).click();
  await expect(dialog).toContainText("Riêng tư");
  await dialog.getByRole("button", { name: "Xóa", exact: true }).click();
  await dialog.getByRole("button", { name: "Xác nhận xóa" }).click();
  expect(service.getPlaces()).toHaveLength(0);
  await page.getByRole("button", { name: "Tìm địa điểm", exact: true }).click();
  await search.fill("quota");
  await expect(
    page.getByRole("alert").filter({ hasText: "hạn mức" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Xóa tìm kiếm" }).click();
  await page
    .getByRole("combobox", { name: "Khám phá trong 3 km" })
    .selectOption("cafe");
  await expect(
    page.getByRole("option", { name: /Cà phê Sài Gòn/ }),
  ).toBeVisible();
  expect(service.requests.some((r) => r.body?.action === "places")).toBe(true);
  expect(platformRequests).toEqual([]);
});

test("real MapLibre WebGL renders a MOCK style with attribution and cleans up on navigation", async ({
  page,
}, testInfo) => {
  await mockSupabase(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://api.maptiler.com/**", (route) =>
    route.fulfill({
      json: {
        version: 8,
        name: "TEST fixture — not live MapTiler",
        sources: {
          fixture: {
            type: "geojson",
            attribution: "MapTiler / © OpenStreetMap contributors — TEST STYLE",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: [106.7009, 10.7769] },
                },
              ],
            },
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#dde9de" },
          },
          {
            id: "fixture-points",
            type: "circle",
            source: "fixture",
            paint: { "circle-color": "#bc381c", "circle-radius": 12 },
          },
        ],
      },
    }),
  );
  await login(page, "http://127.0.0.1:5175");
  await expect(
    page.getByRole("button", { name: "Vị trí của tôi" }),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText(
    "TEST STYLE",
  );
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("maplibre-mock-style.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Tài khoản" }).click();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Vị trí của tôi" }),
  ).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
