import { z } from "zod";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("begin"),
    email: z.string().trim().toLowerCase().email().max(320),
  }).strict(),
  z.object({
    action: z.literal("finish"),
    email: z.string().trim().toLowerCase().email().max(320),
    code: z.string().regex(/^\d{6}$/),
    factorId: z.string().uuid().optional(),
  }).strict(),
]);

export type BootstrapSession = {
  access_token: string;
  refresh_token: string;
};

export type TotpFactor = {
  id: string;
  factor_type: string;
  status: string;
};

export interface TotpAuthDependencies {
  allowedOrigins: string[];
  mintAal1: (email: string) => Promise<BootstrapSession>;
  listFactors: (session: BootstrapSession) => Promise<TotpFactor[]>;
  removeFactor: (
    session: BootstrapSession,
    factorId: string,
  ) => Promise<void>;
  enroll: (
    session: BootstrapSession,
  ) => Promise<{ id: string; secret: string; uri: string }>;
  verify: (
    session: BootstrapSession,
    factorId: string,
    code: string,
  ) => Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: "bearer";
  }>;
}

export function createTotpAuthHandler(deps: TotpAuthDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const allowed = !origin || deps.allowedOrigins.includes(origin);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
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
        if (bytes > 2048) {
          await reader.cancel();
          return fail(413, "REQUEST_TOO_LARGE");
        }
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch {
      return fail(400, "INVALID_REQUEST");
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(400, "INVALID_REQUEST");
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return fail(400, "INVALID_REQUEST");

    try {
      const input = parsed.data;
      const session = await deps.mintAal1(input.email);
      const factors = await deps.listFactors(session);
      const verified = factors.filter(
        (factor) =>
          factor.factor_type === "totp" && factor.status === "verified",
      );

      if (input.action === "begin") {
        if (verified.length) {
          return new Response(JSON.stringify({ mode: "verify" }), {
            status: 200,
            headers,
          });
        }
        for (const factor of factors.filter(
          (candidate) =>
            candidate.factor_type === "totp" &&
            candidate.status === "unverified",
        )) {
          await deps.removeFactor(session, factor.id);
        }
        const enrollment = await deps.enroll(session);
        return new Response(
          JSON.stringify({
            mode: "enroll",
            factorId: enrollment.id,
            uri: enrollment.uri,
            secret: enrollment.secret,
          }),
          { status: 200, headers },
        );
      }

      const target = input.factorId
        ? factors.find(
            (factor) =>
              factor.id === input.factorId &&
              factor.factor_type === "totp" &&
              factor.status === "unverified",
          )
        : verified[0];
      if (!target) return fail(409, "AUTH_FLOW_RESTART_REQUIRED");

      try {
        const upgraded = await deps.verify(
          session,
          target.id,
          input.code,
        );
        return new Response(JSON.stringify({ session: upgraded }), {
          status: 200,
          headers,
        });
      } catch {
        return fail(401, "INVALID_CODE");
      }
    } catch {
      return fail(503, "AUTH_UNAVAILABLE");
    }
  };
}
