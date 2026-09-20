# SmartFoodRoute

Read [PROGRESS.md](PROGRESS.md) first for verified status, external blockers and the next action.
[implementation.md](implementation.md) is the unchanged v3.0 specification. Phases 0–9 are implemented and verified; Phase 10+ remains future work.

## Architecture through Phase 9

- React 19, strict TypeScript, Vite and Tailwind CSS v4.
- Supabase Auth with email/password, recovery and TOTP/AAL2 guards.
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
- MapTiler still requires smart-food-route.vercel.app in the dedicated browser key's Allowed HTTP Origins; the current production-origin smoke request returns HTTP 403 until that external setting is updated.

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
```

`GEOAPIFY_API_KEY` is server-only. The Edge Function validates the action-specific schema, verifies the user and verified TOTP/AAL2 state, enforces an atomic per-user quota, fixes the upstream host/path, normalizes responses, and suppresses provider/internal error bodies.

Configure the Auth Site URL and exact callback/reset redirect URLs. Enable email confirmation, SMTP and TOTP. Production origins and provider-key restrictions live outside the repository.

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
npm run live:planner
```

The live security script creates two uniquely named temporary users, verifies real password/TOTP/AAL2, RLS ownership, Edge authorization, live Geoapify autocomplete/Places/details/reverse plus Route Matrix/final Routing through the deployed Edge Function, share redaction after source deletion and revocation, then deletes both temporary Auth users and cascade-owned test data. `npm run live:planner` adds a real browser Planner journey with temporary places and verifies live matrix/routing HTTP 200, verified result labels and a MapLibre canvas change after route rendering, then cleans up. These scripts do not verify email delivery or a physical Authenticator app. Real MapTiler browser acceptance is handled separately by `node scripts/live-maptiler.mjs`.

## External provider verification

Before production release:

- MapTiler: set the restricted browser key, load the real `streets-v4` style on desktop/mobile, confirm attribution and inspect origin/quota errors.
- Geoapify: set the Edge secret, then test a small number of Vietnamese autocomplete, category Places, details, reverse-geocode, Route Matrix and final Routing requests through `/functions/v1/geo`.
- Auth: verify real email confirmation/reset delivery and one physical Authenticator TOTP flow.
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
