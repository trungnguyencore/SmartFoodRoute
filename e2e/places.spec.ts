import { test, expect } from "@playwright/test";
import { mockSupabase, login } from "./fixtures";

test("mocked SDK journey: login, reject wrong TOTP, AAL2, custom CRUD and reload", async ({
  page,
}, testInfo) => {
  const service = await mockSupabase(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Xác thực hai bước" }),
  ).toBeVisible();
  expect(
    service.requests.filter((r) => r.path.startsWith("/rest/")),
  ).toHaveLength(0);
  await page.getByLabel("Mã xác thực", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Mã không hợp lệ");
  await page.getByLabel("Mã xác thực", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
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
  await dialog.getByLabel("Vĩ độ", { exact: true }).fill("10.78");
  await dialog.getByLabel("Kinh độ", { exact: true }).fill("106.7");
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
    page.getByRole("button", { name: "Đăng nhập", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mocked first enrollment exposes QR only after explicit request", async ({
  page,
}) => {
  await mockSupabase(page, { enrolled: false });
  await login(page);
  await page.getByRole("button", { name: "Tạo mã QR bảo mật" }).click();
  await expect(
    page.getByRole("img", { name: "Mã QR thiết lập TOTP" }),
  ).toBeVisible();
  await page.getByLabel("Mã xác thực", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Những nơi muốn ghé." }),
  ).toBeVisible();
});
