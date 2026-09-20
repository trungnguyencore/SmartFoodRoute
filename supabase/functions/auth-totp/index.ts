import { createClient } from "@supabase/supabase-js";
import {
  createTotpAuthHandler,
  type BootstrapSession,
} from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const admin = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

async function sessionClient(session: BootstrapSession) {
  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const restored = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (restored.error) throw restored.error;
  return client;
}

Deno.serve(
  createTotpAuthHandler({
    allowedOrigins: (Deno.env.get("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),

    mintAal1: async (email) => {
      if (!url || !anonKey || !serviceRoleKey)
        throw new Error("Auth environment unavailable");

      const generated = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { data: { smartfoodroute_auth: "totp-only" } },
      });
      if (generated.error) throw generated.error;

      const tokenHash = generated.data.properties.hashed_token;
      if (!tokenHash) throw new Error("Auth token unavailable");

      const verifier = createClient(url, anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const verified = await verifier.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (verified.error || !verified.data.session)
        throw verified.error ?? new Error("Session unavailable");

      return {
        access_token: verified.data.session.access_token,
        refresh_token: verified.data.session.refresh_token,
      };
    },

    listFactors: async (session) => {
      const client = await sessionClient(session);
      const result = await client.auth.mfa.listFactors();
      if (result.error) throw result.error;
      return result.data.all.map((factor) => ({
        id: factor.id,
        factor_type: factor.factor_type,
        status: factor.status,
      }));
    },

    removeFactor: async (session, factorId) => {
      const client = await sessionClient(session);
      const result = await client.auth.mfa.unenroll({ factorId });
      if (result.error) throw result.error;
    },

    enroll: async (session) => {
      const client = await sessionClient(session);
      const result = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "SmartFoodRoute Authenticator",
        issuer: "SmartFoodRoute",
      });
      if (result.error) throw result.error;
      return {
        id: result.data.id,
        secret: result.data.totp.secret,
        uri: result.data.totp.uri,
      };
    },

    verify: async (session, factorId, code) => {
      const client = await sessionClient(session);
      const result = await client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (result.error) throw result.error;
      return {
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
        expires_in: result.data.expires_in,
        token_type: result.data.token_type,
      };
    },
  }),
);
