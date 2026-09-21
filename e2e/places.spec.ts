import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { USER_ID, mockSupabase, beginLogin, login } from "./fixtures";

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
  const category = dialog.getByRole("combobox", {
    name: "Danh mục",
    exact: true,
  });
  const categoryOptions = await category.evaluate((select) =>
    Array.from((select as HTMLSelectElement).options).map((option) => ({
      value: option.value,
      text: option.textContent?.trim() ?? "",
    })),
  );
  expect(categoryOptions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ value: "food", text: expect.stringMatching(/Ăn$/) }),
      expect.objectContaining({
        value: "drink",
        text: expect.stringMatching(/Uống$/),
      }),
    ]),
  );
  expect(categoryOptions.some((option) => option.text.includes("Ăn uống"))).toBe(
    false,
  );
  await category.selectOption("other");
  await dialog
    .getByLabel("Tên loại cụ thể", { exact: true })
    .fill("Tiệm hoa");
  await dialog
    .getByLabel("Liên kết Google Maps", { exact: true })
    .fill("https://www.google.com/maps/@10.78,106.7,17z");
  await dialog.getByLabel("Ghi chú của bạn").fill("Ghi chú riêng");

  await page.reload();
  const restoredDialog = page.getByRole("dialog");
  await expect(restoredDialog).toBeVisible();
  await expect(
    restoredDialog.getByLabel("Tên địa điểm", { exact: true }),
  ).toHaveValue("Nhà tôi");
  await expect(
    restoredDialog.getByRole("combobox", {
      name: "Danh mục",
      exact: true,
    }),
  ).toHaveValue("other");
  await expect(
    restoredDialog.getByLabel("Tên loại cụ thể", { exact: true }),
  ).toHaveValue("Tiệm hoa");
  await expect(
    restoredDialog.getByLabel("Liên kết Google Maps", { exact: true }),
  ).toHaveValue("https://www.google.com/maps/@10.78,106.7,17z");
  await expect(restoredDialog.getByLabel("Ghi chú của bạn")).toHaveValue(
    "Ghi chú riêng",
  );
  await restoredDialog
    .getByRole("button", { name: "Xác định vị trí", exact: true })
    .click();
  await expect(restoredDialog.getByRole("status")).toContainText(
    "Đã xác định vị trí",
  );
  await restoredDialog
    .getByRole("button", { name: "Lưu địa điểm", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Nhà tôi");
  expect(service.getPlaces()[0]).toMatchObject({
    source: "custom",
    is_private: true,
    provider_place_id: null,
    category: "other",
    sub_category: "Tiệm hoa",
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

test("exports all saved places or only checked places as TXT", async ({ page }) => {
  const row = (
    id: string,
    name: string,
    category: string,
    lat: number,
    lng: number,
    googleMapsUrl: string | null = null,
  ) => ({
    id,
    user_id: USER_ID,
    source: "custom",
    category,
    provider_place_id: null,
    name,
    address: "TP.HCM",
    lat,
    lng,
    sub_category: category === "other" ? "Điểm thử" : null,
    estimated_cost_per_person: null,
    average_time_spent_minutes: 60,
    notes: null,
    custom_tags: [],
    is_favorite: false,
    is_private: category === "start_point",
    google_maps_url: googleMapsUrl,
    source_name: "Người dùng",
    needs_location: false,
    created_at: "2026-09-21T00:00:00.000Z",
  });

  await mockSupabase(page, {
    initialPlaces: [
      row(
        "70000000-0000-4000-8000-000000000001",
        "Cổng 1 HCMUTE",
        "start_point",
        10.85,
        106.77,
        "https://www.google.com/maps/@10.85,106.77,17z",
      ),
      row(
        "70000000-0000-4000-8000-000000000002",
        "Vincom Plaza Lê Văn Việt",
        "other",
        10.8475,
        106.7893,
      ),
      row(
        "70000000-0000-4000-8000-000000000003",
        "Tiệm trà Na ơi",
        "food",
        10.8,
        106.6854,
      ),
    ],
  });
  await login(page);

  await page
    .getByRole("checkbox", { name: "Chọn Cổng 1 HCMUTE để xuất TXT" })
    .check();
  await page
    .getByRole("checkbox", {
      name: "Chọn Vincom Plaza Lê Văn Việt để xuất TXT",
    })
    .check();

  const selectedDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Xuất đã chọn (2)", exact: true })
    .click();
  const selectedDownload = await selectedDownloadPromise;
  const selectedPath = await selectedDownload.path();
  expect(selectedPath).toBeTruthy();
  const selectedText = await readFile(selectedPath!, "utf8");
  expect(selectedText).toContain("H0 - Cổng 1 HCMUTE");
  expect(selectedText).toContain("D1 - Vincom Plaza Lê Văn Việt");
  expect(selectedText).not.toContain("Tiệm trà Na ơi");

  const allDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất tất cả TXT" }).click();
  const allDownload = await allDownloadPromise;
  const allPath = await allDownload.path();
  expect(allPath).toBeTruthy();
  const allText = await readFile(allPath!, "utf8");
  expect(allText).toContain("H0 - Cổng 1 HCMUTE");
  expect(allText).toContain("D1 - Vincom Plaza Lê Văn Việt");
  expect(allText).toContain("D2 - Tiệm trà Na ơi");
});
