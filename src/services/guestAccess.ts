import { z } from "zod";
import { categorySchema } from "../domain/place";
import { envResult } from "../lib/env";

const guestTokenKey = "smartfoodroute:guest-token:v1";

const guestPlaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string().nullable(),
  category: categorySchema,
  subCategory: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  googleMapsUrl: z.string().nullable(),
});

const codeSchema = z.object({
  id: z.uuid(),
  codeHint: z.string(),
  createdAt: z.string(),
});

const suggestionSchema = z.object({
  id: z.uuid(),
  codeHint: z.string().nullable(),
  name: z.string(),
  address: z.string().nullable(),
  googleMapsUrl: z.string().nullable(),
  tiktokUrl: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export type GuestPlace = z.infer<typeof guestPlaceSchema>;
export type GuestCode = z.infer<typeof codeSchema>;
export type GuestSuggestion = z.infer<typeof suggestionSchema>;

export class GuestAccessError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function storage() {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

export function getGuestToken() {
  return storage()?.getItem(guestTokenKey) ?? null;
}

export function clearGuestToken() {
  storage()?.removeItem(guestTokenKey);
}

export function normalizeGuestCodeInput(value: string) {
  const normalized = value.replace(/-/g, "").replace(/[^a-zA-Z0-9]/g, "");
  return normalized.toUpperCase().slice(0, 16);
}

export function formatGuestCodeInput(value: string) {
  const normalized = normalizeGuestCodeInput(value);
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

async function call(
  body: Record<string, unknown>,
  options: { guestToken?: string; adminToken?: string } = {},
) {
  if (!envResult.success) throw new GuestAccessError(503, "CONFIG_UNAVAILABLE");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: envResult.data.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (options.guestToken) headers["x-guest-token"] = options.guestToken;
  if (options.adminToken)
    headers.Authorization = "Bearer " + options.adminToken;

  let response: Response;
  try {
    response = await fetch(
      new URL("/functions/v1/guest-access", envResult.data.VITE_SUPABASE_URL),
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new GuestAccessError(0, "NETWORK_ERROR");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Normalized below.
  }
  if (!response.ok) {
    const parsed = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(payload);
    throw new GuestAccessError(
      response.status,
      parsed.success ? parsed.data.error.code : "GUEST_ACCESS_UNAVAILABLE",
    );
  }
  return payload;
}

export async function exchangeGuestCode(code: string) {
  const parsed = z
    .object({ token: z.string().min(20), expiresAt: z.string() })
    .safeParse(await call({ action: "exchange", code }));
  if (!parsed.success)
    throw new GuestAccessError(502, "INVALID_RESPONSE");
  storage()?.setItem(guestTokenKey, parsed.data.token);
  return parsed.data;
}

export async function listGuestPlaces() {
  const token = getGuestToken();
  if (!token) throw new GuestAccessError(401, "GUEST_SESSION_REQUIRED");
  try {
    const parsed = z
      .object({ places: z.array(guestPlaceSchema) })
      .safeParse(await call({ action: "listPlaces" }, { guestToken: token }));
    if (!parsed.success)
      throw new GuestAccessError(502, "INVALID_RESPONSE");
    return parsed.data.places;
  } catch (error) {
    if (error instanceof GuestAccessError && error.status === 401)
      clearGuestToken();
    throw error;
  }
}

export async function submitGuestSuggestion(input: {
  name: string;
  address?: string | null;
  googleMapsUrl?: string | null;
  tiktokUrl?: string | null;
  notes?: string | null;
}) {
  const token = getGuestToken();
  if (!token) throw new GuestAccessError(401, "GUEST_SESSION_REQUIRED");
  try {
    await call(
      { action: "suggest", ...input },
      { guestToken: token },
    );
  } catch (error) {
    if (error instanceof GuestAccessError && error.status === 401)
      clearGuestToken();
    throw error;
  }
}

export async function adminListGuestAccess(adminToken: string) {
  const [codesPayload, suggestionsPayload] = await Promise.all([
    call({ action: "adminListCodes" }, { adminToken }),
    call({ action: "adminListSuggestions" }, { adminToken }),
  ]);
  const codes = z.object({ codes: z.array(codeSchema) }).safeParse(codesPayload);
  const suggestions = z
    .object({ suggestions: z.array(suggestionSchema) })
    .safeParse(suggestionsPayload);
  if (!codes.success || !suggestions.success)
    throw new GuestAccessError(502, "INVALID_RESPONSE");
  return { codes: codes.data.codes, suggestions: suggestions.data.suggestions };
}

export async function adminCreateGuestCode(
  adminToken: string,
  code: string,
) {
  const parsed = z
    .object({ id: z.uuid(), code: z.string(), createdAt: z.string() })
    .safeParse(
      await call({ action: "adminCreateCode", code }, { adminToken }),
    );
  if (!parsed.success)
    throw new GuestAccessError(502, "INVALID_RESPONSE");
  return parsed.data;
}

export async function adminDeleteGuestCode(
  adminToken: string,
  id: string,
) {
  await call({ action: "adminDeleteCode", id }, { adminToken });
}

export async function adminDeleteGuestSuggestion(
  adminToken: string,
  id: string,
) {
  await call({ action: "adminDeleteSuggestion", id }, { adminToken });
}
