import { z } from "zod";
import { envResult } from "../lib/env";

const beginResponse = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("verify") }),
  z.object({
    mode: z.literal("enroll"),
    factorId: z.uuid(),
    uri: z.string().min(1),
    secret: z.string().min(1),
  }),
]);

const finishResponse = z.object({
  session: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_in: z.number().positive(),
    token_type: z.literal("bearer"),
  }),
});

export type TotpBegin = z.infer<typeof beginResponse>;

export class TotpAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function call(body: Record<string, unknown>) {
  if (!envResult.success) throw new TotpAuthError(503, "AUTH_UNAVAILABLE");
  let response: Response;
  try {
    response = await fetch(
      new URL("/functions/v1/auth-totp", envResult.data.VITE_SUPABASE_URL),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: envResult.data.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw new TotpAuthError(0, "NETWORK_ERROR");
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Normalize malformed Edge responses below.
  }
  if (!response.ok) {
    const code = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(payload);
    throw new TotpAuthError(
      response.status,
      code.success ? code.data.error.code : "AUTH_UNAVAILABLE",
    );
  }
  return payload;
}

export async function beginTotpAuth(email: string): Promise<TotpBegin> {
  const parsed = beginResponse.safeParse(
    await call({ action: "begin", email }),
  );
  if (!parsed.success) throw new TotpAuthError(502, "INVALID_RESPONSE");
  return parsed.data;
}

export async function finishTotpAuth(input: {
  email: string;
  code: string;
  factorId?: string;
}) {
  const parsed = finishResponse.safeParse(
    await call({ action: "finish", ...input }),
  );
  if (!parsed.success) throw new TotpAuthError(502, "INVALID_RESPONSE");
  return parsed.data.session;
}
