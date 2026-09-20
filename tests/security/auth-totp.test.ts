import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTotpAuthHandler,
  type BootstrapSession,
  type TotpAuthDependencies,
} from "../../supabase/functions/auth-totp/handler";

const bootstrap: BootstrapSession = {
  access_token: "aal1-access",
  refresh_token: "aal1-refresh",
};

let deps: TotpAuthDependencies;

function request(
  body: unknown,
  origin = "http://localhost:5173",
) {
  return new Request("https://project.example/functions/v1/auth-totp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  deps = {
    allowedOrigins: ["http://localhost:5173"],
    mintAal1: vi.fn().mockResolvedValue(bootstrap),
    listFactors: vi.fn().mockResolvedValue([
      {
        id: "20000000-0000-4000-8000-000000000002",
        factor_type: "totp",
        status: "verified",
      },
    ]),
    removeFactor: vi.fn().mockResolvedValue(undefined),
    enroll: vi.fn().mockResolvedValue({
      id: "30000000-0000-4000-8000-000000000003",
      secret: "TESTONLY",
      uri: "otpauth://totp/SmartFoodRoute?secret=TESTONLY",
    }),
    verify: vi.fn().mockResolvedValue({
      access_token: "aal2-access",
      refresh_token: "aal2-refresh",
      expires_in: 3600,
      token_type: "bearer",
    }),
  };
});

describe("passwordless email + TOTP Edge handler", () => {
  it("returns verify mode for an enrolled account without leaking a session", async () => {
    const response = await createTotpAuthHandler(deps)(
      request({ action: "begin", email: "User@Example.com" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ mode: "verify" });
    expect(deps.enroll).not.toHaveBeenCalled();
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("replaces abandoned enrollment and returns only QR enrollment data", async () => {
    vi.mocked(deps.listFactors).mockResolvedValue([
      {
        id: "10000000-0000-4000-8000-000000000001",
        factor_type: "totp",
        status: "unverified",
      },
    ]);
    const response = await createTotpAuthHandler(deps)(
      request({ action: "begin", email: "new@example.com" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      mode: "enroll",
      factorId: "30000000-0000-4000-8000-000000000003",
      secret: "TESTONLY",
      uri: "otpauth://totp/SmartFoodRoute?secret=TESTONLY",
    });
    expect(deps.removeFactor).toHaveBeenCalledWith(
      bootstrap,
      "10000000-0000-4000-8000-000000000001",
    );
    expect(deps.enroll).toHaveBeenCalledWith(bootstrap);
  });

  it("returns an AAL2 session only after a correct TOTP", async () => {
    const response = await createTotpAuthHandler(deps)(
      request({
        action: "finish",
        email: "user@example.com",
        code: "123456",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: {
        access_token: "aal2-access",
        refresh_token: "aal2-refresh",
        expires_in: 3600,
        token_type: "bearer",
      },
    });
    expect(deps.verify).toHaveBeenCalledWith(
      bootstrap,
      "20000000-0000-4000-8000-000000000002",
      "123456",
    );
  });

  it("rejects an invalid TOTP without exposing provider errors", async () => {
    vi.mocked(deps.verify).mockRejectedValue(new Error("sensitive"));
    const response = await createTotpAuthHandler(deps)(
      request({
        action: "finish",
        email: "user@example.com",
        code: "000000",
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CODE" },
    });
  });

  it("requires the current unverified factor to finish enrollment", async () => {
    vi.mocked(deps.listFactors).mockResolvedValue([
      {
        id: "30000000-0000-4000-8000-000000000003",
        factor_type: "totp",
        status: "unverified",
      },
    ]);
    const response = await createTotpAuthHandler(deps)(
      request({
        action: "finish",
        email: "new@example.com",
        code: "123456",
        factorId: "40000000-0000-4000-8000-000000000004",
      }),
    );
    expect(response.status).toBe(409);
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("enforces origin, method and request validation before auth calls", async () => {
    const handler = createTotpAuthHandler(deps);
    expect(
      (await handler(request({ action: "begin", email: "a@b.com" }, "https://evil.example"))).status,
    ).toBe(403);
    const preflight = await handler(
      new Request("https://project.example/functions/v1/auth-totp", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:5173" },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
    const invalid = await handler(
      request({ action: "finish", email: "bad", code: "123" }),
    );
    expect(invalid.status).toBe(400);
    expect(deps.mintAal1).not.toHaveBeenCalled();
  });
});
