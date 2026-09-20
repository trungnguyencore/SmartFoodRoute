import { createClient } from "@supabase/supabase-js";
import { createGeoHandler } from "./handler.ts";
const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const scoped = (token: string) =>
  createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
Deno.serve(
  createGeoHandler({
    apiKey: Deno.env.get("GEOAPIFY_API_KEY"),
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    authorize: async (token) => {
      const client = scoped(token);
      // SDK verifies JWT cryptographically (JWKS or Auth server), never trust decoded claims alone.
      const { data, error } = await client.auth.getClaims(token);
      if (error || !data?.claims.sub || data.claims.role !== "authenticated")
        return null;
      const { data: userData, error: userError } =
        await client.auth.getUser(token);
      if (userError || userData.user?.id !== data.claims.sub) return null;
      return data.claims.aal === "aal2" &&
        userData.user.factors?.some(
          (f) => f.factor_type === "totp" && f.status === "verified",
        )
        ? "aal2"
        : "aal1";
    },
    consumeQuota: async (token) => {
      const { data, error } = await scoped(token).rpc("consume_geo_quota");
      if (error) throw new Error("Quota unavailable");
      return data === true;
    },
    fetch,
  }),
);
