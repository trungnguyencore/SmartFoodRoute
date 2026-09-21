import type { Page } from "@playwright/test";
export const USER_ID = "10000000-0000-4000-8000-000000000001";
export const SHARE_TOKEN = "70000000-0000-4000-8000-000000000007";
const TOUR_ID = "60000000-0000-4000-8000-000000000006";
export const GEO_PLACE = {
  provider: "geoapify",
  providerPlaceId: "test-geopoi",
  name: "Cà phê Sài Gòn",
  address: "Quận 1, TP.HCM",
  lat: 10.7769,
  lng: 106.7009,
  categories: ["catering.cafe"],
  rawCategory: null,
  website: null,
  phone: null,
  openingHoursText: null,
  sourceAttribution: ["Geoapify", "© OpenStreetMap contributors"],
};
const FACTOR_ID = "20000000-0000-4000-8000-000000000002";
export async function mockSupabase(
  page: Page,
  {
    enrolled = true,
    initialPlaces = [],
    sharedTour = null,
  }: {
    enrolled?: boolean;
    initialPlaces?: Record<string, unknown>[];
    sharedTour?: Record<string, unknown> | null;
  } = {},
) {
  let aal = "aal1";
  let hasEnrollment = enrolled;
  let verified = enrolled;
  let places: Record<string, unknown>[] = initialPlaces.map((place) => ({
    ...place,
  }));
  let publicTour: Record<string, unknown> | null = sharedTour;
  let shareToken: string | null = sharedTour ? SHARE_TOKEN : null;
  const requests: {
    method: string;
    path: string;
    body: Record<string, unknown> | null;
  }[] = [];
  const user = () => ({
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    created_at: "2026-09-19T00:00:00Z",
    app_metadata: { provider: "email" },
    user_metadata: {},
    factors: verified
      ? [
          {
            id: FACTOR_ID,
            factor_type: "totp",
            status: "verified",
            friendly_name: "Test Authenticator",
          },
        ]
      : [],
  });
  const session = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token =
      [
        { alg: "HS256", typ: "JWT" },
        {
          sub: USER_ID,
          aal,
          exp,
          role: "authenticated",
          amr: [{ method: "password", timestamp: exp - 3600 }],
        },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".dGVzdC1vbmx5";
    return {
      access_token: token,
      refresh_token: "test-refresh-only",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      user: user(),
    };
  };
  await page.route("http://127.0.0.1:54329/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const body: Record<string, unknown> | null = req.postData()
      ? (req.postDataJSON() as Record<string, unknown>)
      : null;
    requests.push({ method, path: url.pathname, body });
    const fulfill = (json: unknown, status = 200) =>
      route.fulfill({
        status,
        json,
        headers: { "access-control-allow-origin": "*" },
      });
    if (method === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,PUT",
        },
      });
    if (url.pathname === "/functions/v1/auth-totp") {
      if (body?.action === "begin") {
        if (hasEnrollment) return fulfill({ mode: "verify" });
        return fulfill({
          mode: "enroll",
          factorId: FACTOR_ID,
          secret: "TESTONLY",
          uri: "otpauth://totp/SmartFoodRoute?secret=TESTONLY",
        });
      }
      if (body?.action === "finish") {
        if (body.code !== "123456")
          return fulfill({ error: { code: "INVALID_CODE" } }, 401);
        if (!hasEnrollment && body.factorId !== FACTOR_ID)
          return fulfill(
            { error: { code: "AUTH_FLOW_RESTART_REQUIRED" } },
            409,
          );
        hasEnrollment = true;
        verified = true;
        aal = "aal2";
        const current = session();
        return fulfill({
          session: {
            access_token: current.access_token,
            refresh_token: current.refresh_token,
            expires_in: current.expires_in,
            token_type: current.token_type,
          },
        });
      }
    }
    if (url.pathname === "/auth/v1/token") {
      aal = "aal1";
      return fulfill(session());
    }
    if (url.pathname === "/auth/v1/user") return fulfill(user());
    if (url.pathname.endsWith("/challenge"))
      return fulfill({
        id: "challenge-test",
        expires_at: Math.floor(Date.now() / 1000) + 300,
      });
    if (url.pathname.endsWith("/verify")) {
      if (body?.code !== "123456")
        return fulfill(
          { msg: "Invalid code", code: "mfa_verification_failed" },
          422,
        );
      aal = "aal2";
      verified = true;
      return fulfill(session());
    }
    if (url.pathname === "/auth/v1/factors" && method === "POST")
      return fulfill({
        id: FACTOR_ID,
        type: "totp",
        totp: {
          qr_code: "",
          secret: "TESTONLY",
          uri: "otpauth://totp/SmartFoodRoute?secret=TESTONLY",
        },
      });
    if (url.pathname === "/auth/v1/logout") return fulfill({});
    if (url.pathname === "/auth/v1/recover") return fulfill({});
    if (url.pathname === "/functions/v1/geo") {
      if (aal !== "aal2")
        return fulfill({ error: { code: "MFA_REQUIRED" } }, 403);
      if (body?.text === "quota")
        return fulfill({ error: { code: "RATE_LIMITED" } }, 429);
      if (body?.action === "resolveGoogleMapsUrl")
        return fulfill({
          location: {
            lat: 10.78,
            lng: 106.7,
            resolvedUrl: body.url,
            method: "url",
            name: null,
            address: null,
          },
        });
      if (body?.action === "routeMatrix") {
        const sources = Array.isArray(body.sources) ? body.sources : [];
        const targets = Array.isArray(body.targets) ? body.targets : [];
        return fulfill({
          matrix: {
            cells: sources.map((_, row) =>
              targets.map((__, col) => ({
                distanceMeters: row === col ? 0 : 1000 * (Math.abs(row - col) + 1),
                durationSeconds: row === col ? 0 : 600 * (Math.abs(row - col) + 1),
              })),
            ),
          },
        });
      }
      if (body?.action === "route")
        return fulfill({
          route: {
            distanceMeters: 4200,
            durationSeconds: 1500,
            geometry: {
              type: "LineString",
              coordinates: [
                [106.69, 10.77],
                [106.71, 10.79],
              ],
            },
          },
        });
      return fulfill({ places: [GEO_PLACE] });
    }
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      const rpc = url.pathname.split("/").at(-1);
      if (rpc === "get_shared_tour") {
        return fulfill(
          body?.p_token === shareToken && publicTour ? publicTour : null,
        );
      }
      if (aal !== "aal2")
        return fulfill({ message: "not authorized", code: "42501" }, 403);
      if (rpc === "save_tour_snapshot") {
        const stops = Array.isArray(body?.p_stops)
          ? (body.p_stops as Record<string, unknown>[])
          : [];
        publicTour = {
          id: TOUR_ID,
          title: body?.p_title,
          departureAt: body?.p_departure_at,
          transportMode: body?.p_transport_mode,
          partySize: body?.p_party_size,
          totalDurationMinutes: body?.p_total_duration_minutes,
          totalBudget: body?.p_total_estimated_budget,
          stops: stops.map((stop) => {
            const isPrivate =
              stop.category === "start_point" || stop.isPrivate === true;
            return {
              position: stop.position,
              category: stop.category,
              name: isPrivate
                ? stop.category === "start_point"
                  ? "Điểm bắt đầu riêng tư"
                  : "Địa điểm riêng tư"
                : stop.nameSnapshot,
              isPrivate,
              lat: isPrivate ? null : stop.latSnapshot,
              lng: isPrivate ? null : stop.lngSnapshot,
              address: isPrivate ? null : (stop.addressSnapshot ?? null),
              providerPlaceId: isPrivate ? null : (stop.providerPlaceId ?? null),
              arrivalAt: stop.plannedArrivalAt ?? null,
              departureAt: stop.plannedDepartureAt ?? null,
              fixedStartAt: stop.fixedStartAt ?? null,
              fixedEndAt: stop.fixedEndAt ?? null,
              movieTitle: isPrivate ? null : (stop.movieTitle ?? null),
            };
          }),
        };
        return fulfill(TOUR_ID);
      }
      if (rpc === "create_or_rotate_share_token") {
        shareToken = SHARE_TOKEN;
        return fulfill(SHARE_TOKEN);
      }
      if (rpc === "revoke_share_token") {
        shareToken = null;
        return fulfill(null);
      }
    }
    if (url.pathname === "/rest/v1/saved_places") {
      // AAL simulation is a UI fixture only; real RLS is tested separately in PostgreSQL.
      if (aal !== "aal2")
        return fulfill({ message: "not authorized", code: "42501" }, 403);
      if (method === "GET") return fulfill(places);
      if (method === "POST") {
        const saved = { ...body, id: "30000000-0000-4000-8000-000000000003" };
        places.push(saved);
        return fulfill(saved, 201);
      }
      if (method === "PATCH") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        places = places.map((p) => (p.id === id ? { ...p, ...body } : p));
        return fulfill(places.find((p) => p.id === id));
      }
      if (method === "DELETE") {
        const id = url.searchParams.get("id")?.replace("eq.", "");
        places = places.filter((p) => p.id !== id);
        return fulfill([{ id }]);
      }
    }
    return fulfill(
      { message: "Unimplemented test fixture endpoint: " + url.pathname },
      501,
    );
  });
  return { requests, getPlaces: () => places };
}
export async function beginLogin(
  page: Page,
  origin = "http://127.0.0.1:5174",
) {
  await page.goto(origin + "/login");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByRole("button", { name: "Tiếp tục", exact: true }).click();
}

export async function login(page: Page, origin = "http://127.0.0.1:5174") {
  await beginLogin(page, origin);
  await page.getByLabel("Mã xác thực", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: /Đăng nhập|Hoàn tất đăng ký/ })
    .click();
}
