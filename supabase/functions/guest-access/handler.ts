import { z } from "zod";

const codeInput = z.string().trim().min(4).max(24);

export function normalizeGuestCode(value: string) {
  const normalized = value.replace(/-/g, "").toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(normalized) ? normalized : null;
}

export function formatGuestCode(value: string) {
  const normalized = normalizeGuestCode(value);
  if (!normalized) return null;
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

const guestActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("exchange"), code: codeInput }).strict(),
  z.object({ action: z.literal("listPlaces") }).strict(),
  z
    .object({
      action: z.literal("suggest"),
      name: z.string().trim().min(1).max(120),
      address: z.string().trim().max(500).nullable().optional(),
      googleMapsUrl: z.url().max(2048).nullable().optional(),
      tiktokUrl: z.url().max(2048).nullable().optional(),
      notes: z.string().trim().max(2000).nullable().optional(),
    })
    .strict(),
  z.object({ action: z.literal("adminListCodes") }).strict(),
  z
    .object({ action: z.literal("adminCreateCode"), code: codeInput })
    .strict(),
  z.object({ action: z.literal("adminDeleteCode"), id: z.uuid() }).strict(),
  z.object({ action: z.literal("adminListSuggestions") }).strict(),
  z
    .object({ action: z.literal("adminDeleteSuggestion"), id: z.uuid() })
    .strict(),
]);

export type GuestSessionContext = {
  ownerUserId: string;
  accessCodeId: string;
};

export type GuestPlaceDto = {
  id: string;
  name: string;
  address: string | null;
  category: string;
  subCategory: string | null;
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string | null;
};

export type GuestCodeDto = {
  id: string;
  codeHint: string;
  createdAt: string;
};

export type GuestSuggestionDto = {
  id: string;
  codeHint: string | null;
  name: string;
  address: string | null;
  googleMapsUrl: string | null;
  tiktokUrl: string | null;
  notes: string | null;
  createdAt: string;
};

export interface GuestAccessDeps {
  allowedOrigins: string[];
  exchangeCode: (
    normalizedCode: string,
    request: Request,
  ) => Promise<{ token: string; expiresAt: string } | null>;
  validateGuest: (token: string) => Promise<GuestSessionContext | null>;
  listPlaces: (ownerUserId: string) => Promise<GuestPlaceDto[]>;
  createSuggestion: (
    context: GuestSessionContext,
    input: {
      name: string;
      address: string | null;
      googleMapsUrl: string | null;
      tiktokUrl: string | null;
      notes: string | null;
    },
  ) => Promise<void>;
  authorizeAdmin: (token: string) => Promise<boolean>;
  listCodes: () => Promise<GuestCodeDto[]>;
  createCode: (
    normalizedCode: string,
  ) => Promise<{ id: string; code: string; createdAt: string }>;
  deleteCode: (id: string) => Promise<void>;
  listSuggestions: () => Promise<GuestSuggestionDto[]>;
  deleteSuggestion: (id: string) => Promise<void>;
}

function bearer(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function guestToken(request: Request) {
  return request.headers.get("x-guest-token")?.trim() ?? "";
}

function isAllowedTikTok(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

function isAllowedGoogleMaps(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      ((["google.com", "www.google.com", "maps.google.com"].includes(host) &&
        (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) ||
        (host === "maps.app.goo.gl" && url.pathname.length > 1) ||
        (host === "goo.gl" && url.pathname.startsWith("/maps/")))
    );
  } catch {
    return false;
  }
}

export function createGuestAccessHandler(deps: GuestAccessDeps) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowed = !origin || deps.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers":
        "apikey, authorization, content-type, x-client-info, x-guest-token",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;

    const fail = (status: number, code: string) =>
      new Response(JSON.stringify({ error: { code } }), { status, headers });

    if (!allowed) return fail(403, "ORIGIN_DENIED");
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
    if (!request.headers.get("content-type")?.includes("application/json"))
      return fail(400, "INVALID_REQUEST");

    let raw = "";
    try {
      const reader = request.body?.getReader();
      if (!reader) return fail(400, "INVALID_REQUEST");
      const decoder = new TextDecoder();
      let bytes = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8192) {
          await reader.cancel();
          return fail(413, "REQUEST_TOO_LARGE");
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch {
      return fail(400, "INVALID_REQUEST");
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return fail(400, "INVALID_REQUEST");
    }
    const parsed = guestActionSchema.safeParse(json);
    if (!parsed.success) return fail(400, "INVALID_REQUEST");
    const input = parsed.data;

    try {
      if (input.action === "exchange") {
        const normalized = normalizeGuestCode(input.code);
        if (!normalized) return fail(400, "INVALID_CODE_FORMAT");
        const exchanged = await deps.exchangeCode(normalized, request);
        if (!exchanged) return fail(401, "INVALID_GUEST_CODE");
        return new Response(JSON.stringify(exchanged), { status: 200, headers });
      }

      if (input.action === "listPlaces" || input.action === "suggest") {
        const token = guestToken(request);
        if (!token) return fail(401, "GUEST_SESSION_REQUIRED");
        const context = await deps.validateGuest(token);
        if (!context) return fail(401, "GUEST_SESSION_INVALID");

        if (input.action === "listPlaces") {
          const places = await deps.listPlaces(context.ownerUserId);
          return new Response(JSON.stringify({ places }), {
            status: 200,
            headers,
          });
        }

        const googleMapsUrl = input.googleMapsUrl ?? null;
        const tiktokUrl = input.tiktokUrl ?? null;
        if (
          !isAllowedGoogleMaps(googleMapsUrl) ||
          !isAllowedTikTok(tiktokUrl)
        )
          return fail(400, "UNSAFE_EXTERNAL_URL");
        await deps.createSuggestion(context, {
          name: input.name,
          address: input.address || null,
          googleMapsUrl,
          tiktokUrl,
          notes: input.notes || null,
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers,
        });
      }

      const token = bearer(request);
      if (!token || !(await deps.authorizeAdmin(token)))
        return fail(403, "ADMIN_REQUIRED");

      if (input.action === "adminListCodes")
        return new Response(JSON.stringify({ codes: await deps.listCodes() }), {
          status: 200,
          headers,
        });

      if (input.action === "adminCreateCode") {
        const normalized = normalizeGuestCode(input.code);
        if (!normalized) return fail(400, "INVALID_CODE_FORMAT");
        try {
          const created = await deps.createCode(normalized);
          return new Response(JSON.stringify(created), {
            status: 201,
            headers,
          });
        } catch (error) {
          if (error instanceof Error && error.message === "DUPLICATE_CODE")
            return fail(409, "DUPLICATE_CODE");
          throw error;
        }
      }

      if (input.action === "adminDeleteCode") {
        await deps.deleteCode(input.id);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers,
        });
      }

      if (input.action === "adminListSuggestions")
        return new Response(
          JSON.stringify({ suggestions: await deps.listSuggestions() }),
          { status: 200, headers },
        );

      await deps.deleteSuggestion(input.id);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "RATE_LIMITED")
        return fail(429, "RATE_LIMITED");
      return fail(503, "GUEST_ACCESS_UNAVAILABLE");
    }
  };
}
