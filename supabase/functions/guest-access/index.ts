import { createClient } from "@supabase/supabase-js";
import {
  createGuestAccessHandler,
  formatGuestCode,
  type GuestCodeDto,
  type GuestSuggestionDto,
} from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const adminUserId = Deno.env.get("GUEST_ADMIN_USER_ID") ?? "";
const pepper = Deno.env.get("GUEST_CODE_PEPPER") ?? "";

const admin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const scoped = (token: string) =>
  createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(domain: string, value: string) {
  if (!pepper) throw new Error("Guest pepper unavailable");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(domain + ":" + value),
  );
  return base64Url(new Uint8Array(signature));
}

function newToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function codeHint(normalized: string) {
  if (normalized.length <= 4) return "••••";
  if (normalized.length <= 8)
    return normalized.slice(0, 2) + "••••" + normalized.slice(-2);
  return normalized.slice(0, 4) + "-••••-" + normalized.slice(-4);
}

async function consumeAttempt(request: Request) {
  const forwarded =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const fingerprint = await hmac("fingerprint", forwarded + "|" + userAgent);
  const now = Date.now();
  const { data, error } = await admin
    .from("guest_access_attempts")
    .select("window_started_at,attempts")
    .eq("fingerprint_hash", fingerprint)
    .maybeSingle();
  if (error) throw error;

  if (!data || now - new Date(data.window_started_at).getTime() >= 15 * 60_000) {
    const reset = await admin.from("guest_access_attempts").upsert({
      fingerprint_hash: fingerprint,
      window_started_at: new Date(now).toISOString(),
      attempts: 1,
    });
    if (reset.error) throw reset.error;
    return fingerprint;
  }
  if (data.attempts >= 10) throw new Error("RATE_LIMITED");
  const updated = await admin
    .from("guest_access_attempts")
    .update({ attempts: data.attempts + 1 })
    .eq("fingerprint_hash", fingerprint);
  if (updated.error) throw updated.error;
  return fingerprint;
}

Deno.serve(
  createGuestAccessHandler({
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),

    exchangeCode: async (normalizedCode, request) => {
      if (!url || !anonKey || !serviceRoleKey || !adminUserId || !pepper)
        throw new Error("Guest environment unavailable");
      const fingerprint = await consumeAttempt(request);
      const codeHash = await hmac("code", normalizedCode);
      const { data: code, error } = await admin
        .from("guest_access_codes")
        .select("id,owner_user_id")
        .eq("code_hash", codeHash)
        .maybeSingle();
      if (error) throw error;
      if (!code || code.owner_user_id !== adminUserId) return null;

      const token = newToken();
      const tokenHash = await hmac("session", token);
      const expiresAt = new Date(Date.now() + 12 * 60 * 60_000).toISOString();
      const inserted = await admin.from("guest_sessions").insert({
        access_code_id: code.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
      if (inserted.error) throw inserted.error;
      await admin
        .from("guest_access_attempts")
        .delete()
        .eq("fingerprint_hash", fingerprint);
      return { token, expiresAt };
    },

    validateGuest: async (token) => {
      if (!token || !adminUserId || !pepper) return null;
      const tokenHash = await hmac("session", token);
      const { data: session, error } = await admin
        .from("guest_sessions")
        .select("access_code_id,expires_at")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (error || !session) return null;
      if (new Date(session.expires_at).getTime() <= Date.now()) {
        await admin
          .from("guest_sessions")
          .delete()
          .eq("token_hash", tokenHash);
        return null;
      }
      const { data: code, error: codeError } = await admin
        .from("guest_access_codes")
        .select("owner_user_id")
        .eq("id", session.access_code_id)
        .maybeSingle();
      if (
        codeError ||
        !code ||
        code.owner_user_id !== adminUserId
      )
        return null;
      return {
        ownerUserId: code.owner_user_id,
        accessCodeId: session.access_code_id,
      };
    },

    listPlaces: async (ownerUserId) => {
      const { data, error } = await admin
        .from("saved_places")
        .select(
          "id,name,address,category,sub_category,lat,lng,google_maps_url,needs_location",
        )
        .eq("user_id", ownerUserId)
        .eq("needs_location", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        address: row.address,
        category: row.category,
        subCategory: row.sub_category,
        lat: row.lat,
        lng: row.lng,
        googleMapsUrl: row.google_maps_url,
      }));
    },

    createSuggestion: async (context, input) => {
      const inserted = await admin.from("guest_suggestions").insert({
        owner_user_id: context.ownerUserId,
        access_code_id: context.accessCodeId,
        name: input.name,
        address: input.address,
        google_maps_url: input.googleMapsUrl,
        tiktok_url: input.tiktokUrl,
        notes: input.notes,
      });
      if (inserted.error) throw inserted.error;
    },

    authorizeAdmin: async (token) => {
      if (!token || !adminUserId) return false;
      const client = scoped(token);
      const { data, error } = await client.auth.getClaims(token);
      if (
        error ||
        !data?.claims.sub ||
        data.claims.role !== "authenticated" ||
        data.claims.aal !== "aal2" ||
        data.claims.sub !== adminUserId
      )
        return false;
      const { data: userData, error: userError } =
        await client.auth.getUser(token);
      return (
        !userError &&
        userData.user?.id === adminUserId &&
        !!userData.user.factors?.some(
          (factor) =>
            factor.factor_type === "totp" && factor.status === "verified",
        )
      );
    },

    listCodes: async () => {
      const { data, error } = await admin
        .from("guest_access_codes")
        .select("id,code_hint,created_at")
        .eq("owner_user_id", adminUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(
        (row): GuestCodeDto => ({
          id: row.id,
          codeHint: row.code_hint,
          createdAt: row.created_at,
        }),
      );
    },

    createCode: async (normalizedCode) => {
      const hash = await hmac("code", normalizedCode);
      const createdAt = new Date().toISOString();
      const inserted = await admin
        .from("guest_access_codes")
        .insert({
          owner_user_id: adminUserId,
          code_hash: hash,
          code_hint: codeHint(normalizedCode),
          created_at: createdAt,
        })
        .select("id,created_at")
        .single();
      if (inserted.error) {
        if (inserted.error.code === "23505")
          throw new Error("DUPLICATE_CODE");
        throw inserted.error;
      }
      return {
        id: inserted.data.id,
        code: formatGuestCode(normalizedCode) ?? normalizedCode,
        createdAt: inserted.data.created_at,
      };
    },

    deleteCode: async (id) => {
      const deleted = await admin
        .from("guest_access_codes")
        .delete()
        .eq("id", id)
        .eq("owner_user_id", adminUserId);
      if (deleted.error) throw deleted.error;
    },

    listSuggestions: async () => {
      const { data, error } = await admin
        .from("guest_suggestions")
        .select(
          "id,access_code_id,name,address,google_maps_url,tiktok_url,notes,created_at",
        )
        .eq("owner_user_id", adminUserId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const codeIds = [
        ...new Set(
          (data ?? [])
            .map((row) => row.access_code_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const hints = new Map<string, string>();
      if (codeIds.length) {
        const codeRows = await admin
          .from("guest_access_codes")
          .select("id,code_hint")
          .in("id", codeIds);
        if (codeRows.error) throw codeRows.error;
        for (const row of codeRows.data ?? []) hints.set(row.id, row.code_hint);
      }
      return (data ?? []).map(
        (row): GuestSuggestionDto => ({
          id: row.id,
          codeHint: row.access_code_id
            ? (hints.get(row.access_code_id) ?? null)
            : null,
          name: row.name,
          address: row.address,
          googleMapsUrl: row.google_maps_url,
          tiktokUrl: row.tiktok_url,
          notes: row.notes,
          createdAt: row.created_at,
        }),
      );
    },

    deleteSuggestion: async (id) => {
      const deleted = await admin
        .from("guest_suggestions")
        .delete()
        .eq("id", id)
        .eq("owner_user_id", adminUserId);
      if (deleted.error) throw deleted.error;
    },
  }),
);
