# SmartFoodRoute

Read [PROGRESS.md](PROGRESS.md) first for verified status, external blockers and the next action.
[implementation.md](implementation.md) is the unchanged v3.0 specification. Phases 0–9 are implemented and verified; Phase 10+ remains future work.

## Architecture through Phase 9

- React 19, strict TypeScript, Vite and Tailwind CSS v4.
- Passwordless user UX: enter email, enroll TOTP by QR on first use, then use email + the 6-digit Authenticator code on later logins.
- Supabase Edge Function `auth-totp` keeps its AAL1 bootstrap session server-side and returns a browser session only after TOTP succeeds; app data remains protected by AAL2 RLS/RPC guards.
- Supabase PostgreSQL with owner RLS, restrictive AAL2 policies and safe public-share RPCs.
- MapLibre GL JS with a MapTiler browser style.
- Authenticated Supabase Edge Function `geo` as the only path to Geoapify Places, Route Matrix and final Routing.
- Planner with Haversine prefilter, fixed-time scheduling, Top 3 ranking, timeline and budget; provider failures are explicitly marked unverified rather than silently trusted.
- ShowtimeProvider abstraction with a manual fixed-showtime fallback; no Moveek scraping/bypass is used without a permitted feed/adapter.
- Phase 9 adds transactional saved-tour snapshots, expiring share tokens, QR sharing, revocation and an anonymous public route backed only by the redacted `get_shared_tour` RPC.
- Google Maps is an external HTTPS search/review link only. No Google Maps Platform SDK, API key, Map ID, Places request or Routes request exists.

## Production deployment

- Canonical Vercel URL: https://smart-food-route.vercel.app.
- GitHub repository: private trungnguyencore/SmartFoodRoute, connected to Vercel for Git deployments.
- Supabase production Site URL, exact auth redirects and Edge ALLOWED_ORIGINS are configured for the canonical Vercel origin.
- MapTiler production-origin access is configured and verified: a `streets-v4` style request from `https://smart-food-route.vercel.app` returns HTTP 200.

## Local development

1. Use Node 24 (`.nvmrc`), then run `npm ci`.
2. Copy `.env.example` to the ignored `.env.local`.
3. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_MAPTILER_API_KEY`.
4. Run `npm run dev`.

The MapTiler key is browser-visible by design. Restrict the dedicated key to the exact Allowed HTTP Origins, including `http://localhost:5173` for development and the production origin later. Missing MapTiler configuration produces a recoverable map fallback; saved/custom places remain available.

Never put a Supabase secret/service-role key, access token, database password or `GEOAPIFY_API_KEY` in a `VITE_*` variable.

## Supabase and Edge setup

Migrations are forward-only and run in filename order. Do not rewrite applied migrations or reset a remote project.

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase secrets set GEOAPIFY_API_KEY=YOUR_SERVER_KEY
npx supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,https://YOUR_PRODUCTION_ORIGIN
npx supabase functions deploy geo --use-api --import-map supabase/functions/deno.json
npx supabase functions deploy auth-totp --no-verify-jwt
```

`GEOAPIFY_API_KEY` is server-only. The Edge Function validates the action-specific schema, verifies the user and verified TOTP/AAL2 state, enforces an atomic per-user quota, fixes the upstream host/path, normalizes responses, and suppresses provider/internal error bodies.

Enable TOTP and keep the production origin in `ALLOWED_ORIGINS`. The user-facing login flow does not use passwords, password recovery, email OTP or magic-link delivery. The server-side bootstrap uses Supabase Auth internally and never returns its AAL1 session to the browser. Production origins and provider-key restrictions live outside the repository.

## Verification

```sh
npm run check
npm run test:e2e
npm run audit:security
npm audit --omit=dev
```

`npm run check` covers lint, browser and Edge type checking, frontend tests, real PostgreSQL migration/RLS tests in PGlite, and a production build. Playwright includes desktop/mobile Auth/MFA and Places journeys plus actual MapLibre WebGL rendering against an explicitly mocked style. Mocks are never evidence of live MapTiler or Geoapify.

With the ignored account-scoped credentials present:

```sh
npm run live:audit
npm run live:security
npm run live:auth
npm run live:planner
```

`npm run live:security` is a lower-level Supabase/RLS probe and still uses a test-only AAL1 setup before TOTP so it can explicitly verify AAL1 denial and AAL2 access. `npm run live:auth` is the canonical user-auth acceptance: new email → QR enrollment → generated TOTP → AAL2 session → protected RLS path → second login with the same email/TOTP, with temporary-user cleanup. `npm run live:planner` then exercises the real browser Planner/Geoapify/Sharing path using the new email + TOTP UI. These automated scripts do not replace one physical Authenticator scan/code UX check. Real MapTiler provider acceptance remains separately evidenced by the prior production/browser probe.

## External provider verification

Before production release:

- MapTiler: set the restricted browser key, load the real `streets-v4` style on desktop/mobile, confirm attribution and inspect origin/quota errors.
- Geoapify: set the Edge secret, then test a small number of Vietnamese autocomplete, category Places, details, reverse-geocode, Route Matrix and final Routing requests through `/functions/v1/geo`.
- Auth: verify one physical Authenticator QR scan/code flow. Email delivery is not part of the user-facing auth design.
- Hosting: configure the production origin in MapTiler, `ALLOWED_ORIGINS`, Supabase Site URL and Auth redirect allowlist.

## Technical references

- [MapLibre GL JS with Vite](https://maplibre.org/maplibre-gl-js/docs/)
- [MapTiler API-key protection](https://docs.maptiler.com/guides/maps-apis/maps-platform/how-to-protect-your-map-key/)
- [Geoapify autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/)
- [Geoapify Places](https://apidocs.geoapify.com/docs/places/)
- [Geoapify Place Details](https://apidocs.geoapify.com/docs/place-details/)
- [Geoapify Route Matrix](https://apidocs.geoapify.com/docs/route-matrix/)
- [Geoapify Routing](https://apidocs.geoapify.com/docs/routing/)
- [Supabase Edge Function authorization](https://supabase.com/docs/guides/functions/auth)
- [Supabase TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
