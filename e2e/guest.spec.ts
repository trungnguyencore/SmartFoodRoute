import { test, expect, type Page } from "@playwright/test";
import { login, mockSupabase } from "./fixtures";

const CODE_ID = "80000000-0000-4000-8000-000000000008";
const SUGGESTION_ID = "90000000-0000-4000-8000-000000000009";

async function mockGuestAccess(page: Page) {
  const codes = [
    {
      id: CODE_ID,
      codeHint: "A1B2-••••-D4E5",
      createdAt: "2026-09-21T10:00:00Z",
    },
  ];
  const suggestions: Record<string, unknown>[] = [];
  await page.route(
    "http://127.0.0.1:54329/functions/v1/guest-access",
    async (route) => {
      const request = route.request();
      const body = request.postDataJSON() as Record<string, unknown>;
      const ok = (json: unknown, status = 200) =>
        route.fulfill({
          status,
          json,
          headers: { "access-control-allow-origin": "*" },
        });
      if (body.action === "exchange") {
        const normalized = String(body.code).replace(/-/g, "").toUpperCase();
        return normalized === "A1B2C3D4E5"
          ? ok({
              token: "guest-session-token-long-enough",
              expiresAt: "2026-09-22T00:00:00Z",
            })
          : ok({ error: { code: "INVALID_GUEST_CODE" } }, 401);
      }
      if (body.action === "listPlaces")
        return ok({
          places: [
            {
              id: "70000000-0000-4000-8000-000000000007",
              name: "Zapí pizza",
              address: "An Nhơn, TP.HCM",
              category: "food",
              subCategory: null,
              lat: 10.841487,
              lng: 106.6778395,
              googleMapsUrl:
                "https://www.google.com/maps/@10.841487,106.6778395,17z",
            },
          ],
        });
      if (body.action === "suggest") {
        suggestions.unshift({
          id: SUGGESTION_ID,
          codeHint: "A1B2-••••-D4E5",
          name: body.name,
          address: body.address ?? null,
          googleMapsUrl: body.googleMapsUrl ?? null,
          tiktokUrl: body.tiktokUrl ?? null,
          notes: body.notes ?? null,
          createdAt: "2026-09-21T11:00:00Z",
        });
        return ok({ ok: true }, 201);
      }
      if (body.action === "adminListCodes") return ok({ codes });
      if (body.action === "adminListSuggestions")
        return ok({ suggestions });
      if (body.action === "adminCreateCode") {
        const code = String(body.code).toUpperCase();
        const created = {
          id: "81000000-0000-4000-8000-000000000008",
          codeHint: "ZZ99-••••-1234",
          createdAt: "2026-09-21T12:00:00Z",
        };
        codes.unshift(created);
        return ok(
          {
            id: created.id,
            code: code.match(/.{1,4}/g)?.join("-"),
            createdAt: created.createdAt,
          },
          201,
        );
      }
      if (body.action === "adminDeleteCode") {
        const index = codes.findIndex((code) => code.id === body.id);
        if (index >= 0) codes.splice(index, 1);
        return ok({ ok: true });
      }
      if (body.action === "adminDeleteSuggestion") {
        const index = suggestions.findIndex(
          (suggestion) => suggestion.id === body.id,
        );
        if (index >= 0) suggestions.splice(index, 1);
        return ok({ ok: true });
      }
      return ok({ error: { code: "UNIMPLEMENTED" } }, 501);
    },
  );
  return { codes, suggestions };
}

test("Try another way exchanges code for read-only guest access and suggestion", async ({
  page,
}) => {
  await mockSupabase(page);
  const guest = await mockGuestAccess(page);
  await page.goto("http://127.0.0.1:5174/login");

  await page.getByRole("button", { name: "Try another way" }).click();
  const input = page.getByLabel("Access code");
  await input.fill("a1b2c3d4e5");
  await expect(input).toHaveValue("A1B2-C3D4-E5");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();

  await expect(
    page.getByRole("heading", { name: "Những nơi đã lưu." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Zapí pizza/ })).toBeVisible();
  await expect(page.getByText("chế độ chỉ đọc")).toBeVisible();

  await page.getByRole("button", { name: "Gợi ý chỗ đi mới" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên địa điểm").fill("Tiệm bánh mới");
  await dialog.getByLabel("Địa chỉ").fill("Thủ Đức");
  await dialog
    .getByLabel("TikTok")
    .fill("https://www.tiktok.com/@demo/video/123");
  await dialog.getByRole("button", { name: "Gửi gợi ý" }).click();
  await expect(page.getByRole("status")).toContainText("Đã gửi gợi ý");
  expect(guest.suggestions).toHaveLength(1);
});

test("admin AAL2 account can create and delete access codes", async ({ page }) => {
  await mockSupabase(page);
  const guest = await mockGuestAccess(page);
  await login(page);
  expect(
    await page.locator(".app-header").evaluate(
      (element) => element.getBoundingClientRect().height,
    ),
  ).toBeLessThanOrEqual(72);
  expect(
    await page.locator(".creator-mark").evaluate(
      (element) => getComputedStyle(element).position,
    ),
  ).toBe("fixed");
  await page.getByRole("link", { name: "Tài khoản" }).click();

  await expect(page.getByRole("heading", { name: "Access codes" })).toBeVisible();
  const codeInput = page.getByLabel("Code mới");
  await codeInput.fill("zz99abcd1234");
  await expect(codeInput).toHaveValue("ZZ99-ABCD-1234");
  await page.getByRole("button", { name: "Thêm code" }).click();
  await expect(page.getByText(/Code vừa tạo: ZZ99-ABCD-1234/)).toBeVisible();
  expect(guest.codes).toHaveLength(2);

  page.on("dialog", (dialog) => void dialog.accept());
  const row = page.locator(".admin-code-row").filter({ hasText: "ZZ99" });
  await row.getByRole("button", { name: "Xóa" }).click();
  await expect(row).toHaveCount(0);
  expect(guest.codes).toHaveLength(1);
});
