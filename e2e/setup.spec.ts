import { test, expect } from "@playwright/test";
test("missing credentials show a clear setup state without crashing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Thiết lập kết nối" }),
  ).toBeVisible();
  await expect(
    page.getByText("VITE_SUPABASE_URL", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
