// Live Prompt 2 browser acceptance. Never print credentials or user data.
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { chromium, devices } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = "http://localhost:5173";
const credentialText = existsSync("pass-key/1.txt")
  ? readFileSync("pass-key/1.txt", "utf8")
  : "";
const url =
  process.env.VITE_SUPABASE_URL ||
  credentialText.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
const token =
  process.env.SUPABASE_ACCESS_TOKEN ||
  credentialText.match(/sbp_[a-zA-Z0-9]+/)?.[0];
const publicKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  credentialText.match(/sb_publishable_[a-zA-Z0-9_-]+/)?.[0];
if (!url || !token || !publicKey)
  throw new Error("Missing live credentials (values suppressed)");
const ref = new URL(url).hostname.split(".")[0];
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

async function management(path) {
  const response = await fetch(
    "https://api.supabase.com/v1/projects/" + ref + path,
    {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw new Error("Management request failed with status " + response.status);
  return response.json();
}

function requirePass(condition, label) {
  if (!condition) throw new Error("Verification failed: " + label);
  console.log("PASS " + label);
}
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.toUpperCase().replace(/=+$/, "")) {
    const n = alphabet.indexOf(ch);
    if (n < 0) throw new Error("Invalid TOTP format");
    bits += n.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000,
  ).padStart(6, "0");
}

function localInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(ORIGIN, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Local Vite server did not start");
}

const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "localhost",
    "--port",
    "5173",
    "--strictPort",
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
    windowsHide: true,
  },
);

let userId = null;
let browser = null;
try {
  await waitForServer();
  const keys = await management("/api-keys");
  const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
  if (!serviceKey) throw new Error("Admin test credential unavailable");
  const admin = createClient(url, serviceKey, options);
  const run = randomUUID();
  const email = "sfr-planner-" + run + "@example.invalid";
  const password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { temporary_verification_run: run },
  });
  requirePass(!created.error && !!created.data.user, "temporary Planner user");
  userId = created.data.user.id;

  const client = createClient(url, publicKey, options);
  const signed = await client.auth.signInWithPassword({ email, password });
  requirePass(!signed.error && !!signed.data.session, "temporary password login");
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Temporary Planner browser verification",
  });
  requirePass(!enrolled.error, "temporary TOTP enrollment");
  const secret = enrolled.data.totp.secret;
  const verified = await client.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: totp(secret),
  });
  requirePass(!verified.error, "temporary TOTP AAL2");

  const rows = [
    {
      user_id: userId,
      source: "custom",
      category: "start_point",
      name: "Live Start",
      lat: 10.772,
      lng: 106.698,
      average_time_spent_minutes: 0,
      custom_tags: [],
      is_favorite: false,
      is_private: true,
      needs_location: false,
    },
    {
      user_id: userId,
      source: "custom",
      category: "food",
      name: "Live Food",
      lat: 10.776,
      lng: 106.702,
      average_time_spent_minutes: 60,
      estimated_cost_per_person: 100000,
      custom_tags: [],
      is_favorite: true,
      is_private: false,
      needs_location: false,
    },
    {
      user_id: userId,
      source: "custom",
      category: "cinema",
      name: "Live Cinema",
      lat: 10.782,
      lng: 106.708,
      average_time_spent_minutes: 120,
      custom_tags: [],
      is_favorite: false,
      is_private: false,
      needs_location: false,
    },
    {
      user_id: userId,
      source: "custom",
      category: "cafe",
      name: "Live Cafe",
      lat: 10.786,
      lng: 106.712,
      average_time_spent_minutes: 45,
      estimated_cost_per_person: 70000,
      custom_tags: [],
      is_favorite: false,
      is_private: false,
      needs_location: false,
    },
  ];
  const inserted = await client.from("saved_places").insert(rows);
  if (inserted.error)
    console.error("Planner seed error code " + (inserted.error.code ?? "unknown"));
  requirePass(!inserted.error, "temporary Planner places seeded");
  await client.auth.signOut({ scope: "local" });

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const page = await context.newPage();
  const edgeActions = [];
  const edgeStatuses = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.pathname !== "/functions/v1/geo") return;
    try {
      const body = request.postDataJSON();
      if (typeof body?.action === "string") edgeActions.push(body.action);
    } catch {
      // Ignore malformed diagnostics input.
    }
  });
  page.on("response", (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.pathname === "/functions/v1/geo")
      edgeStatuses.push(response.status());
  });

  await page.goto(ORIGIN + "/login", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.getByLabel("Mã xác thực", { exact: true }).fill(totp(secret));
  await page.getByRole("button", { name: "Xác minh", exact: true }).click();
  await page
    .getByRole("heading", { name: "Những nơi muốn ghé." })
    .waitFor({ timeout: 30000 });
  await page.locator(".maplibregl-canvas").waitFor({
    state: "visible",
    timeout: 30000,
  });
  const before = await page.locator(".map-region").screenshot();
  await page.getByRole("button", { name: "Lên lịch" }).click();
  await page.getByRole("checkbox", { name: /Live Food/ }).check();
  await page.getByRole("checkbox", { name: /Live Cinema/ }).check();
  await page.getByRole("checkbox", { name: /Live Cafe/ }).check();

  const showtime = new Date(Date.now() + 4 * 60 * 60_000);
  showtime.setSeconds(0, 0);
  const latestFinish = new Date(showtime.getTime() + 4 * 60 * 60_000);
  await page.getByLabel("Muộn nhất kết thúc").fill(localInput(latestFinish));
  await page.getByLabel("Tên phim").fill("Live verification movie");
  await page.getByLabel("Giờ bắt đầu phim").fill(localInput(showtime));
  await page.getByRole("button", { name: "Tìm Top 3 lịch trình" }).click();

  const card = page.locator(".route-card").first();
  await card.waitFor({ state: "visible", timeout: 30000 });
  const cardText = await card.innerText();
  requirePass(/Matrix: Geoapify/.test(cardText), "browser uses live Route Matrix");
  requirePass(
    /Route:\s*Geoapify verified/.test(cardText),
    "browser uses live final Routing",
  );
  requirePass(
    edgeActions.includes("routeMatrix") && edgeActions.includes("route"),
    "browser called both routing Edge actions",
  );
  requirePass(
    edgeStatuses.length >= 2 && edgeStatuses.every((status) => status === 200),
    "browser routing Edge responses are HTTP 200",
  );
  await page.waitForTimeout(750);
  const after = await page.locator(".map-region").screenshot();
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  requirePass(hash(before) !== hash(after), "MapLibre canvas changed after route");

  await page.getByRole("button", { name: "Lưu tour", exact: true }).click();
  await page
    .getByText("Đã lưu snapshot lịch trình.", { exact: true })
    .waitFor({ timeout: 30000 });
  requirePass(true, "browser saved live tour snapshot");

  await page
    .getByRole("button", { name: "Tạo link chia sẻ", exact: true })
    .click();
  await page.getByLabel("QR link chia sẻ").waitFor({
    state: "visible",
    timeout: 30000,
  });
  const shareUrl = await page.getByLabel("Link public").inputValue();
  requirePass(
    /^http:\/\/localhost:5173\/share\/[0-9a-f-]{36}$/i.test(shareUrl),
    "browser generated live public share URL and QR",
  );

  const publicContext = await browser.newContext({
    ...devices["Desktop Chrome"],
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const publicPage = await publicContext.newPage();
  const publicErrors = [];
  publicPage.on("pageerror", (error) => publicErrors.push(error.message));
  await publicPage.goto(shareUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await publicPage
    .getByText("Điểm bắt đầu riêng tư", { exact: true })
    .waitFor({ timeout: 30000 });
  requirePass(
    (await publicPage.getByText("Live Start", { exact: true }).count()) === 0,
    "anonymous page does not expose private start label",
  );
  requirePass(
    (await publicPage.getByText("Live Food", { exact: true }).count()) === 1,
    "anonymous page retains public itinerary stops",
  );
  requirePass(
    publicErrors.length === 0,
    "anonymous live share page has no page errors",
  );

  await page
    .getByRole("button", { name: "Thu hồi link", exact: true })
    .click();
  await page
    .getByText("Đã thu hồi link chia sẻ.", { exact: true })
    .waitFor({ timeout: 30000 });
  await publicPage.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await publicPage
    .getByRole("heading", { name: "Link chia sẻ không còn khả dụng" })
    .waitFor({ timeout: 30000 });
  requirePass(true, "browser live share revocation invalidates public URL");
  await publicContext.close();

  requirePass(pageErrors.length === 0, "live Planner browser has no page errors");
  console.log("LIVE PROMPT 2 + PHASE 9 BROWSER ACCEPTANCE PASS");
} finally {
  if (browser) await browser.close();
  vite.kill();
  if (userId) {
    try {
      const keys = await management("/api-keys");
      const serviceKey = keys.find((key) => key.name === "service_role")?.api_key;
      if (serviceKey) {
        const admin = createClient(url, serviceKey, options);
        const removed = await admin.auth.admin.deleteUser(userId);
        requirePass(!removed.error, "temporary Planner user/data cleaned");
      }
    } catch {
      console.error("FAIL temporary Planner cleanup");
      process.exitCode = 1;
    }
  }
}
