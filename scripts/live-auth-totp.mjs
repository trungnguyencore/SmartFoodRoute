import { readFileSync } from "node:fs";
import { randomUUID, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const credentialText = readFileSync("pass-key/1.txt", "utf8");
const url = credentialText.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
const accessToken = credentialText.match(/sbp_[a-zA-Z0-9]+/)?.[0];
const publicKey = credentialText.match(/sb_publishable_[a-zA-Z0-9_-]+/)?.[0];
if (!url || !accessToken || !publicKey) throw new Error("Missing live credentials");
const ref = new URL(url).hostname.split(".")[0];

async function management(path) {
  const response = await fetch(
    "https://api.supabase.com/v1/projects/" + ref + path,
    {
      headers: { Authorization: "Bearer " + accessToken },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw new Error("Management status " + response.status);
  return response.json();
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

function requirePass(condition, label) {
  if (!condition) throw new Error("Verification failed: " + label);
  console.log("PASS " + label);
}

async function authEdge(body, origin = "http://localhost:5173") {
  const response = await fetch(url + "/functions/v1/auth-totp", {
    method: "POST",
    headers: {
      apikey: publicKey,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  let json = null;
  try {
    json = await response.json();
  } catch {
    // Preserve status for diagnostics without printing provider bodies.
  }
  return { status: response.status, json };
}

function jwtPayload(token) {
  const part = token.split(".")[1];
  if (!part) throw new Error("Invalid JWT shape");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

const keys = await management("/api-keys");
const serviceKey = keys.find((item) => item.name === "service_role")?.api_key;
if (!serviceKey) throw new Error("Admin test credential unavailable");

const admin = createClient(url, serviceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
const email = "sfr-totp-" + randomUUID() + "@example.invalid";
let userId = null;

async function cleanup() {
  try {
    if (!userId) {
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = listed.data.users.find((user) => user.email === email)?.id ?? null;
    }
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      requirePass(!removed.error, "temporary Auth account cleanup");
    }
  } catch {
    console.log("WARN temporary Auth account cleanup needs manual review");
  }
}

try {
  const begin = await authEdge({ action: "begin", email });
  console.log(JSON.stringify({ beginStatus: begin.status, beginCode: begin.json?.error?.code ?? null }));
  requirePass(begin.status === 200, "live auth begin HTTP 200");
  requirePass(
    begin.json?.mode === "enroll" &&
      typeof begin.json?.secret === "string" &&
      typeof begin.json?.factorId === "string",
    "new email receives TOTP enrollment",
  );

  const firstCode = totp(begin.json.secret);
  const finished = await authEdge({
    action: "finish",
    email,
    code: firstCode,
    factorId: begin.json.factorId,
  });
  requirePass(finished.status === 200, "live enrollment TOTP accepted");

  const firstAccess = finished.json?.session?.access_token;
  const firstRefresh = finished.json?.session?.refresh_token;
  requirePass(
    typeof firstAccess === "string" && typeof firstRefresh === "string",
    "AAL2 browser session returned only after TOTP",
  );

  const firstClaims = jwtPayload(firstAccess);
  userId = firstClaims.sub ?? null;
  requirePass(
    firstClaims.aal === "aal2" && firstClaims.role === "authenticated",
    "returned JWT is authenticated AAL2",
  );

  const client = createClient(url, publicKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const restored = await client.auth.setSession({
    access_token: firstAccess,
    refresh_token: firstRefresh,
  });
  requirePass(!restored.error, "AAL2 session restores in browser client");
  const rlsRead = await client.from("saved_places").select("id").limit(1);
  requirePass(!rlsRead.error, "AAL2 session reaches protected RLS path");

  const secondBegin = await authEdge({ action: "begin", email });
  requirePass(
    secondBegin.status === 200 && secondBegin.json?.mode === "verify",
    "registered email returns verify mode",
  );

  const wait = 30000 - (Date.now() % 30000) + 1200;
  await new Promise((resolve) => setTimeout(resolve, wait));
  const secondCode = totp(begin.json.secret);
  const secondFinish = await authEdge({
    action: "finish",
    email,
    code: secondCode,
  });
  requirePass(
    secondFinish.status === 200,
    "subsequent email plus TOTP login succeeds",
  );
  const secondAccess = secondFinish.json?.session?.access_token;
  requirePass(
    typeof secondAccess === "string" &&
      jwtPayload(secondAccess).aal === "aal2",
    "subsequent login also returns AAL2",
  );

  const productionPreflight = await fetch(
    url + "/functions/v1/auth-totp",
    {
      method: "OPTIONS",
      headers: { Origin: "https://smart-food-route.vercel.app" },
      signal: AbortSignal.timeout(15000),
    },
  );
  requirePass(
    productionPreflight.status === 204 &&
      productionPreflight.headers.get("access-control-allow-origin") ===
        "https://smart-food-route.vercel.app",
    "production origin CORS for auth-totp",
  );

  console.log(
    JSON.stringify({
      enrollment: "pass",
      subsequentLogin: "pass",
      aal2: "pass",
      rls: "pass",
      productionCors: "pass",
    }),
  );
} finally {
  await cleanup();
}
