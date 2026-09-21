import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGuestAccessHandler,
  formatGuestCode,
  normalizeGuestCode,
  type GuestAccessDeps,
} from "../../supabase/functions/guest-access/handler";

let deps: GuestAccessDeps;

function request(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request("https://project.example/functions/v1/guest-access", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  deps = {
    allowedOrigins: ["http://localhost:5173"],
    exchangeCode: vi.fn().mockResolvedValue({
      token: "guest-token-long-enough-for-test",
      expiresAt: "2026-09-22T00:00:00Z",
    }),
    validateGuest: vi.fn().mockResolvedValue({
      ownerUserId: "10000000-0000-4000-8000-000000000001",
      accessCodeId: "20000000-0000-4000-8000-000000000002",
    }),
    listPlaces: vi.fn().mockResolvedValue([
      {
        id: "30000000-0000-4000-8000-000000000003",
        name: "Cafe",
        address: "TP.HCM",
        category: "cafe",
        subCategory: null,
        lat: 10.7,
        lng: 106.7,
        googleMapsUrl: null,
      },
    ]),
    createSuggestion: vi.fn().mockResolvedValue(undefined),
    authorizeAdmin: vi.fn().mockResolvedValue(true),
    listCodes: vi.fn().mockResolvedValue([]),
    createCode: vi.fn().mockResolvedValue({
      id: "40000000-0000-4000-8000-000000000004",
      code: "A1B2-C3D4-E5",
      createdAt: "2026-09-21T00:00:00Z",
    }),
    deleteCode: vi.fn().mockResolvedValue(undefined),
    listSuggestions: vi.fn().mockResolvedValue([]),
    deleteSuggestion: vi.fn().mockResolvedValue(undefined),
  };
});

describe("guest-access Edge contract", () => {
  it("normalizes and formats admin-selected codes", () => {
    expect(normalizeGuestCode("a1b2-c3d4-e5")).toBe("A1B2C3D4E5");
    expect(formatGuestCode("a1b2c3d4e5")).toBe("A1B2-C3D4-E5");
    expect(normalizeGuestCode("ABC")).toBeNull();
    expect(normalizeGuestCode("A1B2_")).toBeNull();
  });

  it("exchanges a valid formatted code without an Auth session", async () => {
    const response = await createGuestAccessHandler(deps)(
      request({ action: "exchange", code: "a1b2-c3d4-e5" }),
    );
    expect(response.status).toBe(200);
    expect(deps.exchangeCode).toHaveBeenCalledWith(
      "A1B2C3D4E5",
      expect.any(Request),
    );
    expect(await response.json()).toMatchObject({
      token: "guest-token-long-enough-for-test",
    });
  });

  it("requires a valid guest capability for read and suggestion actions", async () => {
    const handler = createGuestAccessHandler(deps);
    expect((await handler(request({ action: "listPlaces" }))).status).toBe(401);

    vi.mocked(deps.validateGuest).mockResolvedValueOnce(null);
    expect(
      (
        await handler(
          request(
            { action: "listPlaces" },
            { "x-guest-token": "revoked-token" },
          ),
        )
      ).status,
    ).toBe(401);

    const ok = await handler(
      request(
        { action: "listPlaces" },
        { "x-guest-token": "valid-token" },
      ),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      places: [{ name: "Cafe", category: "cafe" }],
    });
  });

  it("allows basic suggestions but rejects unsafe external URLs", async () => {
    const handler = createGuestAccessHandler(deps);
    const good = await handler(
      request(
        {
          action: "suggest",
          name: "Chỗ mới",
          googleMapsUrl: "https://www.google.com/maps/place/Test",
          tiktokUrl: "https://www.tiktok.com/@demo/video/123",
        },
        { "x-guest-token": "valid-token" },
      ),
    );
    expect(good.status).toBe(201);
    expect(deps.createSuggestion).toHaveBeenCalledOnce();

    const bad = await handler(
      request(
        {
          action: "suggest",
          name: "Unsafe",
          tiktokUrl: "https://evil.example/video",
        },
        { "x-guest-token": "valid-token" },
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("keeps code management behind an authorized admin bearer", async () => {
    vi.mocked(deps.authorizeAdmin).mockResolvedValue(false);
    const denied = await createGuestAccessHandler(deps)(
      request(
        { action: "adminListCodes" },
        { Authorization: "Bearer ordinary-user" },
      ),
    );
    expect(denied.status).toBe(403);
    expect(deps.listCodes).not.toHaveBeenCalled();

    vi.mocked(deps.authorizeAdmin).mockResolvedValue(true);
    const created = await createGuestAccessHandler(deps)(
      request(
        { action: "adminCreateCode", code: "a1b2c3d4e5" },
        { Authorization: "Bearer admin-aal2" },
      ),
    );
    expect(created.status).toBe(201);
    expect(deps.createCode).toHaveBeenCalledWith("A1B2C3D4E5");
  });

  it("rejects disallowed origins before any code lookup", async () => {
    const response = await createGuestAccessHandler(deps)(
      new Request("https://project.example/functions/v1/guest-access", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://evil.example",
        },
        body: JSON.stringify({ action: "exchange", code: "A1B2" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(deps.exchangeCode).not.toHaveBeenCalled();
  });
});
