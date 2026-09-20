// Live MapTiler acceptance probe. Never prints the browser key.
import { readFileSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const ORIGIN = "http://localhost:5173";
const USER_ID = "10000000-0000-4000-8000-000000000001";
const FACTOR_ID = "20000000-0000-4000-8000-000000000002";

function fail(message) {
  console.error("FAIL " + message);
  process.exitCode = 1;
}
function session(aal) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = [
    { alg: "HS256", typ: "JWT" },
    {
      sub: USER_ID,
      aal,
      exp,
      role: "authenticated",
      amr: [{ method: "password", timestamp: exp - 3600 }],
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString("base64url"))
    .join(".") + ".dGVzdC1vbmx5";
  return {
    access_token: token,
    refresh_token: "test-refresh-only",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    user: {
      id: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "test@example.com",
      created_at: "2026-09-20T00:00:00Z",
      app_metadata: { provider: "email" },
      user_metadata: {},
      factors: [
        {
          id: FACTOR_ID,
          factor_type: "totp",
          status: "verified",
          friendly_name: "Test Authenticator",
        },
      ],
    },
  };
}

async function installSupabaseMock(page) {
  let aal = "aal1";
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.hostname.endsWith(".supabase.co")) return route.continue();
    const headers = {
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,PUT,OPTIONS",
    };
    const fulfill = (json, status = 200) =>
      route.fulfill({ status, json, headers });
    if (request.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    let body = null;
    try {
      body = request.postData() ? request.postDataJSON() : null;
    } catch {
      // Ignore non-JSON bodies in this test-only Auth mock.
    }
    if (url.pathname === "/auth/v1/token") {
      aal = "aal1";
      return fulfill(session(aal));
    }
    if (url.pathname === "/auth/v1/user") return fulfill(session(aal).user);
    if (url.pathname.endsWith("/challenge"))
      return fulfill({
        id: "challenge-test",
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    if (url.pathname.endsWith("/verify")) {
      if (body?.code !== "123456")
        return fulfill(
          { msg: "Invalid code", code: "mfa_verification_failed" },
          422,
        );
      aal = "aal2";
      return fulfill(session(aal));
    }
    if (url.pathname === "/auth/v1/logout") return fulfill({});
    if (url.pathname.startsWith("/rest/v1/saved_places")) return fulfill([]);
    return fulfill({});
  });
}

async function verifyBrowser(label, device) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  await installSupabaseMock(page);
  const provider = [];
  const pageErrors = [];
  let googleRuntimeRequests = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.hostname.endsWith("maptiler.com"))
      provider.push({
        host: url.hostname,
        path: url.pathname,
        status: response.status(),
      });
  });
  page.on("request", (request) => {
    if (/maps\.googleapis|places\.googleapis|routes\.googleapis/.test(request.url()))
      googleRuntimeRequests += 1;
  });

  await page.goto(ORIGIN + "/login", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page
    .getByLabel("Mật khẩu", { exact: true })
    .fill("test-password-only");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Mã xác thực", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await page
    .locator(".maplibregl-canvas")
    .waitFor({ state: "visible", timeout: 30000 });
  await page
    .locator(".maplibregl-ctrl-attrib")
    .waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(2500);
  const attribution = (
    await page.locator(".maplibregl-ctrl-attrib").innerText()
  )
    .replace(/\s+/g, " ")
    .trim();
  const result = {
    label,
    canvas: await page.locator(".maplibregl-canvas").count(),
    attributionVisible: attribution.length > 0,
    attributionHasMapTiler: /MapTiler/i.test(attribution),
    style200: provider.some(
      (item) =>
        item.path.includes("/maps/streets-v4/style.json") &&
        item.status === 200,
    ),
    otherMapTiler200: provider.some(
      (item) =>
        !item.path.includes("/maps/streets-v4/style.json") &&
        item.status >= 200 &&
        item.status < 300,
    ),
    mapTilerResponseCount: provider.length,
    mapTilerNon2xx: provider
      .filter((item) => item.status < 200 || item.status >= 300)
      .slice(0, 5),
    fallbackCount: await page.getByText("Bản đồ chưa sẵn sàng").count(),
    pageErrors,
    googleRuntimeRequests,
  };
  console.log(JSON.stringify(result));
  await browser.close();
  if (
    result.canvas !== 1 ||
    !result.attributionVisible ||
    !result.attributionHasMapTiler ||
    !result.style200 ||
    !result.otherMapTiler200 ||
    result.fallbackCount !== 0 ||
    result.pageErrors.length ||
    result.googleRuntimeRequests
  )
    fail(label + " live MapTiler browser acceptance");
}

function mapTilerKey() {
  const text = readFileSync(".env.local", "utf8");
  const line = text
    .split(/\r?\n/)
    .find((value) => /^\s*VITE_MAPTILER_API_KEY\s*=/.test(value));
  const key = line?.replace(/^\s*VITE_MAPTILER_API_KEY\s*=\s*/, "").trim();
  if (!key) throw new Error("VITE_MAPTILER_API_KEY missing");
  return key.replace(/^["']|["']$/g, "");
}

async function verifyRestriction() {
  const key = mapTilerKey();
  const url = new URL("https://api.maptiler.com/maps/streets-v4/style.json");
  url.searchParams.set("key", key);
  const response = await fetch(url, {
    headers: {
      Origin: "https://not-allowed.invalid",
      Referer: "https://not-allowed.invalid/",
    },
    signal: AbortSignal.timeout(15000),
  });
  const rejected = response.status === 401 || response.status === 403;
  console.log(
    JSON.stringify({
      unlistedOriginRejected: rejected,
      unlistedOriginStatus: response.status,
    }),
  );
  if (!rejected) fail("MapTiler key restriction for an unlisted origin");
}

await verifyBrowser("desktop", devices["Desktop Chrome"]);
await verifyBrowser("mobile", devices["Pixel 7"]);
await verifyRestriction();
if (!process.exitCode) console.log("LIVE MAPTILER ACCEPTANCE PASS");
