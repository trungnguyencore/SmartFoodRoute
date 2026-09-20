// Opt-in live diagnostics. Never print credential values, API bodies or user data.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
const credentialText = existsSync("pass-key/1.txt") ? readFileSync("pass-key/1.txt", "utf8") : "";
const url = process.env.VITE_SUPABASE_URL || credentialText.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
const token = process.env.SUPABASE_ACCESS_TOKEN || credentialText.match(/sbp_[a-zA-Z0-9]+/)?.[0];
const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || credentialText.match(/sb_publishable_[a-zA-Z0-9_-]+/)?.[0];
const password = process.env.SUPABASE_DB_PASSWORD || credentialText.match(/password\s*:\s*([^\r\n]+)/i)?.[1]?.trim();
if (!url || !token || !publicKey) throw new Error("Missing live Supabase credentials (values suppressed)");
const ref = new URL(url).hostname.split(".")[0];
const base = "https://api.supabase.com/v1/projects/" + ref;
async function management(path, init = {}) {
  const response = await fetch(base + path, { ...init, headers: { Authorization: "Bearer " + token, ...init.headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Management " + path.split("?")[0] + " status " + response.status + " (body suppressed)");
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}
async function query(sql) {
  return management("/database/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: sql, read_only: true }) });
}
async function audit() {
  const project = await management("");
  console.log(JSON.stringify({ project: { name: project.name, status: project.status, region: project.region }, credentials: { url: true, publicKey: true, accessToken: true } }));
  const schema = await query("select tablename, rowsecurity from pg_tables where schemaname='public' order by tablename");
  console.log(JSON.stringify({ publicTables: schema }));
  console.log(JSON.stringify({ migrationTable: await query("select to_regclass('supabase_migrations.schema_migrations') is not null as exists") }));
  const functions = await management("/functions");
  console.log(JSON.stringify({ functions: functions.map(f => ({ slug: f.slug, status: f.status, verify_jwt: f.verify_jwt })) }));
  const secrets = await management("/secrets");
  console.log(JSON.stringify({ edgeSecretNames: secrets.map(s => s.name) }));
  const auth = await management("/config/auth");
  console.log(JSON.stringify({ auth: {
    site_url: auth.site_url, email_confirmations: !auth.mailer_autoconfirm,
    totp_enroll: auth.mfa_totp_enroll_enabled, totp_verify: auth.mfa_totp_verify_enabled,
    redirectConfigured: !!auth.uri_allow_list,
  } }));
  const response = await fetch(url + "/auth/v1/settings", { headers: { apikey: publicKey }, signal: AbortSignal.timeout(15000) });
  console.log(JSON.stringify({ livePublicAuthSettingsStatus: response.status }));
}
function cli(args) {
  const result = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", ...args], {
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token, SUPABASE_DB_PASSWORD: password },
    encoding: "utf8", timeout: 120000, windowsHide: true,
  });
  let output = (result.stdout ?? "") + (result.stderr ?? "");
  for (const secret of [token, publicKey, password]) if (secret) output = output.split(secret).join("[REDACTED]");
  output = output.replace(/sbp_[a-zA-Z0-9]+|sb_secret_[a-zA-Z0-9_-]+/g, "[REDACTED]");
  console.log(output.slice(-6000));
  if (result.status !== 0) throw new Error("CLI operation failed (details suppressed)");
}
async function deploy() {
  const project = await management("");
  if (project.name !== "SmartFoodRoute" || project.status !== "ACTIVE_HEALTHY") throw new Error("Target project mismatch");
  if (!password) throw new Error("Missing database credential");
  cli(["link", "--project-ref", ref]);
  cli(["migration", "list"]);
  cli(["db", "push", "--dry-run"]);
  cli(["db", "push", "--yes"]);
  await management("/secrets", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ name: "ALLOWED_ORIGINS", value: "http://localhost:5173,http://127.0.0.1:5173" }]) });
  cli(["functions", "deploy", "geo", "--project-ref", ref, "--use-api", "--import-map", "supabase/functions/deno.json"]);
  await audit();
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
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}
async function liveSecurity() {
  const keys = await management("/api-keys");
  const serviceKey = keys.find(k => k.name === "service_role")?.api_key;
  if (!serviceKey) throw new Error("Admin test credential unavailable");
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, serviceKey, options);
  const ids = [];
  const clients = [];
  const run = randomUUID();
  const edgeCall = async (jwt, body = { action: "autocomplete", text: "Bến Thành", bias: { lat: 10.77, lng: 106.7 } }) => {
    const response = await fetch(url + "/functions/v1/geo", {
      method: "POST", headers: { apikey: publicKey, "Content-Type": "application/json", Origin: "http://localhost:5173", ...(jwt ? { Authorization: "Bearer " + jwt } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
    });
    let json = null;
    try { json = await response.json(); } catch { /* Error responses may omit JSON. */ }
    return {
      status: response.status,
      places: Array.isArray(json?.places) ? json.places : [],
      matrix: json?.matrix ?? null,
      route: json?.route ?? null,
    };
  };
  try {
    for (const label of ["A", "B"]) {
      const email = "sfr-smoke-" + run + "-" + label.toLowerCase() + "@example.invalid";
      const pass = randomBytes(24).toString("base64url");
      const created = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: { temporary_verification_run: run } });
      requirePass(!created.error && !!created.data.user, "temporary Auth account " + label);
      const userId = created.data.user.id; ids.push(userId);
      const client = createClient(url, publicKey, options); clients.push(client);
      const signed = await client.auth.signInWithPassword({ email, password: pass });
      requirePass(!signed.error && !!signed.data.session, "real password login " + label);
      const aal1 = signed.data.session.access_token;
      const pre = await client.from("saved_places").select("id");
      requirePass(!pre.error && pre.data.length === 0, "AAL1 protected read empty " + label);
      const denied = await client.from("saved_places").insert({ user_id: userId, source: "custom", category: "food", name: "MUST NOT INSERT", lat: 10, lng: 106 });
      requirePass(denied.error?.code === "42501", "AAL1 insert denied " + label);
      const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Temporary automated verification" });
      requirePass(!enrolled.error && enrolled.data.type === "totp", "real TOTP enrollment " + label);
      const verified = await client.auth.mfa.challengeAndVerify({ factorId: enrolled.data.id, code: totp(enrolled.data.totp.secret) });
      requirePass(!verified.error, "real generated TOTP verification " + label);
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      requirePass(!assurance.error && assurance.data.currentLevel === "aal2", "real AAL2 session " + label);
      if (label === "A") {
        requirePass((await edgeCall()).status === 401, "live Edge rejects anonymous");
        requirePass((await edgeCall("forged.invalid.token")).status === 401, "live Edge rejects forged JWT");
        requirePass((await edgeCall(aal1)).status === 403, "live Edge rejects AAL1");
        const current = (await client.auth.getSession()).data.session.access_token;
        requirePass((await edgeCall(current, { action: "arbitrary" })).status === 400, "live Edge rejects unknown actions");
        const liveAutocomplete = await edgeCall(current);
        requirePass(liveAutocomplete.status === 200 && liveAutocomplete.places.length > 0, "live Geoapify autocomplete through Edge");
        const firstAutocomplete = liveAutocomplete.places[0];
        requirePass(firstAutocomplete?.provider === "geoapify" && typeof firstAutocomplete.providerPlaceId === "string" && typeof firstAutocomplete.lat === "number" && typeof firstAutocomplete.lng === "number", "live Geoapify normalized autocomplete DTO");
        const livePlaces = await edgeCall(current, { action: "places", categories: ["catering.cafe"], center: { lat: 10.772, lng: 106.698 }, radiusMeters: 3000, limit: 3, language: "vi" });
        requirePass(livePlaces.status === 200 && livePlaces.places.length > 0, "live Geoapify category Places through Edge");
        const firstPlace = livePlaces.places[0];
        const liveDetails = await edgeCall(current, { action: "placeDetails", providerPlaceId: firstPlace.providerPlaceId });
        requirePass(liveDetails.status === 200 && liveDetails.places.length > 0, "live Geoapify place details through Edge");
        const liveReverse = await edgeCall(current, { action: "reverseGeocode", lat: 10.772, lng: 106.698, language: "vi" });
        requirePass(liveReverse.status === 200 && liveReverse.places.length > 0, "live Geoapify reverse geocoding through Edge");
        const liveMatrix = await edgeCall(current, {
          action: "routeMatrix",
          sources: [{ lat: 10.772, lng: 106.698 }, { lat: 10.782, lng: 106.708 }],
          targets: [{ lat: 10.772, lng: 106.698 }, { lat: 10.782, lng: 106.708 }],
          mode: "motorcycle",
          traffic: "approximated",
        });
        requirePass(
          liveMatrix.status === 200 &&
            Array.isArray(liveMatrix.matrix?.cells) &&
            typeof liveMatrix.matrix?.cells?.[0]?.[1]?.distanceMeters === "number" &&
            typeof liveMatrix.matrix?.cells?.[0]?.[1]?.durationSeconds === "number",
          "live Geoapify Route Matrix through Edge",
        );
        const liveRoute = await edgeCall(current, {
          action: "route",
          waypoints: [{ lat: 10.772, lng: 106.698 }, { lat: 10.782, lng: 106.708 }],
          mode: "motorcycle",
          traffic: "approximated",
        });
        requirePass(
          liveRoute.status === 200 &&
            typeof liveRoute.route?.distanceMeters === "number" &&
            typeof liveRoute.route?.durationSeconds === "number" &&
            ["LineString", "MultiLineString"].includes(liveRoute.route?.geometry?.type),
          "live Geoapify final Routing through Edge",
        );
      }
    }
    const [a, b] = clients;
    const insert = await a.from("saved_places").insert({ user_id: ids[0], source: "custom", category: "food", name: "PRIVATE verification " + run, address: "PRIVATE test address", lat: 10.123, lng: 106.456, is_private: true }).select().single();
    requirePass(!insert.error && !!insert.data, "live AAL2 custom insert");
    const placeId = insert.data.id;
    const other = await b.from("saved_places").select("id").eq("id", placeId);
    requirePass(!other.error && other.data.length === 0, "live cross-owner read isolated");
    const stolen = await b.from("saved_places").update({ notes: "unauthorized" }).eq("id", placeId).select("id");
    requirePass(!stolen.error && stolen.data.length === 0, "live cross-owner update isolated");
    const update = await a.from("saved_places").update({ notes: "owner note" }).eq("id", placeId).select("notes").single();
    requirePass(!update.error && update.data.notes === "owner note", "live owner update/reload");
    const tour = await a.rpc("save_tour_snapshot", {
      p_title: "Temporary Phase 9 security test",
      p_departure_at: new Date().toISOString(),
      p_party_size: 2,
      p_transport_mode: "MOTORCYCLE",
      p_total_distance_meters: 1200,
      p_total_travel_duration_seconds: 600,
      p_total_duration_minutes: 90,
      p_total_estimated_budget: 250000,
      p_stops: [
        {
          position: 0,
          savedPlaceId: null,
          nameSnapshot: "PRIVATE start snapshot",
          category: "start_point",
          latSnapshot: 10.12,
          lngSnapshot: 106.45,
          addressSnapshot: "PRIVATE start address",
          durationMinutes: 0,
          isPrivate: true,
        },
        {
          position: 1,
          savedPlaceId: placeId,
          nameSnapshot: "PRIVATE verification",
          category: "food",
          latSnapshot: 10.123,
          lngSnapshot: 106.456,
          addressSnapshot: "PRIVATE test address",
          durationMinutes: 60,
          isPrivate: false,
        },
      ],
    });
    requirePass(!tour.error && !!tour.data, "live atomic Phase 9 tour snapshot RPC");
    const removed = await a.from("saved_places").delete().eq("id", placeId).select("id");
    requirePass(!removed.error && removed.data.length === 1, "live owner delete");
    const share = await a.rpc("create_or_rotate_share_token", { p_tour_id: tour.data });
    requirePass(!share.error && !!share.data, "live share token RPC");
    const anonymous = createClient(url, publicKey, options);
    const shared = await anonymous.rpc("get_shared_tour", { p_token: share.data });
    const safe = shared.data?.stops?.[1];
    requirePass(
      !shared.error &&
        shared.data?.id === tour.data &&
        shared.data?.totalDurationMinutes === 90 &&
        shared.data?.totalBudget === 250000 &&
        safe?.isPrivate &&
        safe.lat === null &&
        safe.lng === null &&
        safe.address === null &&
        !JSON.stringify(shared.data).includes("PRIVATE"),
      "live Phase 9 Safe DTO stays redacted after source deletion",
    );
    const anonRows = await anonymous.from("saved_places").select("id");
    requirePass(!!anonRows.error, "live anonymous direct table denied");
    const revoked = await a.rpc("revoke_share_token", { p_tour_id: tour.data });
    const expired = await anonymous.rpc("get_shared_tour", { p_token: share.data });
    requirePass(!revoked.error && !expired.error && expired.data === null, "live share revocation");
    requirePass((await a.rpc("consume_geo_quota")).data === true, "live AAL2 quota RPC");
    console.log("LIVE SUPABASE SECURITY + GEOAPIFY PASS; email delivery and physical authenticator NOT verified.");
  } finally {
    for (const client of clients) await client.auth.signOut({ scope: "local" });
    for (const id of ids) {
      const removed = await admin.auth.admin.deleteUser(id);
      requirePass(!removed.error, "temporary test account and cascade data cleaned");
    }
  }
}
try {
  const action = process.argv[2] ?? "audit";
  if (action === "audit") await audit();
  else if (action === "deploy") await deploy();
  else if (action === "security") await liveSecurity();
  else throw new Error("Unsupported operation");
} catch (error) {
  // Generated error messages are sanitized; never dump remote error objects.
  console.error(error instanceof Error && (error.message.startsWith("Management ") || error.message.startsWith("Verification failed: ")) ? error.message : "Live check failed (details suppressed)");
  process.exitCode = 1;
}
