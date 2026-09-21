import { test, expect } from "@playwright/test";
import { mockSupabase, beginLogin } from "./fixtures";

test("mocked SDK journey: login, reject wrong TOTP, AAL2, custom CRUD and reload", async ({
  page,
}, testInfo) => {
  const service = await mockSupabase(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await beginLogin(page);
  expect(
    service.requests.filter((r) => r.path.startsWith("/rest/")),
  ).toHaveLength(0);
  await page.getByLabel("Mã xác thực", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Mã không hợp lệ");
  await page.getByLabel("Mã xác thực", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Những nơi muốn ghé." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bản đồ chưa sẵn sàng" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Địa điểm riêng", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Đây là địa điểm riêng tư")).toBeChecked();
  await dialog.getByLabel("Tên địa điểm", { exact: true }).fill("Nhà tôi");
  await expect(dialog.getByLabel("Vĩ độ", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("Kinh độ", { exact: true })).toHaveCount(0);
  await dialog
    .getByLabel("Liên kết Google Maps", { exact: true })
    .fill("https://www.google.com/maps/@10.78,106.7,17z");
  await dialog
    .getByRole("button", { name: "Xác định vị trí", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toContainText(
    "Đã xác định vị trí",
  );
  await dialog.getByLabel("Ghi chú của bạn").fill("Ghi chú riêng");
  await dialog
    .getByRole("button", { name: "Lưu địa điểm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Nhà tôi");
  expect(service.getPlaces()[0]).toMatchObject({
    source: "custom",
    is_private: true,
    provider_place_id: null,
    lat: 10.78,
    lng: 106.7,
    google_maps_url: "https://www.google.com/maps/@10.78,106.7,17z",
  });
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: /Nhà tôi/ })).toBeVisible();
  await page.getByRole("button", { name: /Nhà tôi/ }).click();
  await page.getByRole("button", { name: "Sửa địa điểm" }).click();
  await page
    .getByLabel("Tên địa điểm", { exact: true })
    .fill("Điểm đón của tôi");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("dialog")).toContainText("Điểm đón của tôi");
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Điểm đón của tôi/ }).click();
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await page.getByRole("button", { name: "Xác nhận xóa" }).click();
  await expect(
    page.getByRole("heading", { name: "Điểm hẹn đầu tiên?" }),
  ).toBeVisible();
  expect(service.getPlaces()).toHaveLength(0);
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tiếp tục", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mocked first enrollment shows QR after a new email", async ({
  page,
}) => {
  await mockSupabase(page, { enrolled: false });
  await beginLogin(page);
  await expect(
    page.getByRole("img", { name: "Mã QR thiết lập Authenticator" }),
  ).toBeVisible();
  await page.getByLabel("Mã xác thực", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Hoàn tất đăng ký", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Những nơi muốn ghé." }),
  ).toBeVisible();
});
