# SmartFoodRoute — Implementation Progress

## Overall Status

Current Phase: Phase 9 Sharing UI DONE — Phases 0–9 verified; passwordless email + TOTP production auth is deployed and verified
Current Task: PRODUCTION RELEASE MANUAL CHECK — production UI/backend path verified; one physical Authenticator QR/code UX check remains; Phase 10 product work not started
Last Updated: 2026-09-20 (Asia/Ho_Chi_Minh)

Authoritative specification: implementation.md v3.0, read completely and unchanged. Previous Google-based Phase 3–4 labels are legacy history only. Phase 0–9 now implement the v3 architecture through Planner, Showtime fallback, Matrix/Scheduler, Final Route/Timeline/Budget and secure Sharing UI.

## Status Legend

- TODO
- IN_PROGRESS
- DONE
- BLOCKED_EXTERNAL
- BLOCKED_TECHNICAL

## Phase Progress

| Phase | Task | Status | Evidence / Files | Verification | Notes |
|---|---|---|---|---|---|
| 0 Foundation | Node 24, strict TS, Vite/React/Tailwind, env/router/query, CI | DONE | package.json, configs, .github/workflows/ci.yml | lint, browser + Edge typecheck, 82 tests, build PASS | Node 24.21.0 used by npm scripts |
| 1 Schema/security | Provider-neutral forward schema, RLS/AAL2, share/privacy, quota | DONE | supabase/migrations, tests/security/database.test.ts | 25 local PostgreSQL tests PASS; 10 migrations live; two-user live RLS/share audit PASS | Historical migrations preserved; Phase 9 added one forward-only sharing migration |
| 2 Auth/MFA | Passwordless email identifier + TOTP enrollment/login, AAL2 guards and cache cleanup | DONE | `src/components/auth/LoginForm.tsx`, `src/services/totpAuth.ts`, `supabase/functions/auth-totp` | 93 frontend + 57 security tests PASS; Playwright 14/14; `npm run live:auth` verifies enrollment, second login, AAL2 and protected RLS live | User-facing flow has no password/email OTP; one physical Authenticator UX check remains manual |
| 3 MapLibre/MapTiler | Map lifecycle, bundled worker, markers, attribution, opt-in geolocation, route-layer skeleton | DONE | src/components/map, src/lib/mapStyle.ts | unit/component PASS; desktop/mobile real MapLibre WebGL against explicit MOCK style PASS | No Google runtime |
| 3 MapLibre/MapTiler | Real MapTiler style/key/origin verification | DONE | VITE_MAPTILER_API_KEY, scripts/live-maptiler.mjs | Real streets-v4 style/tiles PASS on desktop + mobile; attribution visible; 28 MapTiler responses per viewport with no non-2xx; unlisted origin rejected 403 | Browser key remains origin-restricted; no Google runtime requests observed |
| 4 Geoapify Places | Provider abstraction, Edge Function, search/browse/details/reverse, durable CRUD, private place, attribution and external Google URL | DONE | src/services/geoProvider.ts, src/components/places, supabase/functions/geo | unit/component/Edge/E2E PASS; deployed Edge auth/error behavior live PASS | Phase 4 place actions preserved; Prompt 2 extends the same Edge boundary with matrix/routing |
| 4 Geoapify Places | Real Geoapify responses through deployed Edge | DONE | GEOAPIFY_API_KEY Edge secret, scripts/live-supabase.mjs | AAL2 live autocomplete, category Places, place details and reverse geocoding PASS through deployed /geo; normalized DTO checked; anonymous/forged/AAL1 rejected | Server key remains Edge-only; no direct frontend Geoapify path |
| 5 Planner UI | Start/candidates, transport, party/time/preferences, planner state | DONE | src/components/planner/PlannerPanel.tsx, src/stores/plannerStore.ts, src/hooks/usePlaces.ts | unit/full gate PASS; Planner desktop/mobile E2E PASS | Uses saved owner places with coordinates; Phase 9 now snapshots selected Planner output |
| 6 Cinema/Showtime | ShowtimeProvider abstraction, manual fallback, fixed showtime input, booking handoff/freshness | DONE | src/services/showtimeProvider.ts, src/components/cinema/CinemaShowtimeEditor.tsx | showtime unit tests PASS; Planner E2E + live browser PASS | Moveek scraping/bypass not implemented; manual provider is the supported fallback until a permitted feed/adapter is available |
| 7 Route Matrix/Scheduler | Haversine prefilter, Geoapify matrix, fixed anchor, backward + forward validation, opening hours, Top 3 | DONE | src/services/plannerService.ts, supabase/functions/_shared/routing.ts, supabase/functions/geo/handler.ts | scheduler tests PASS; Edge security tests PASS; live Geoapify Route Matrix PASS | Matrix failure degrades to explicitly unverified Haversine preview; hard constraints still reject infeasible candidates |
| 8 Final Route/Timeline/Budget | Final Geoapify route, MapLibre route layer, timeline, budget and warnings | DONE | src/components/map/MapCanvas.tsx, src/components/timeline/RouteResults.tsx, src/domain/planner.ts | full browser E2E PASS; deployed final Routing PASS; live browser canvas changed after verified route | Final route requested only for ranked feasible candidates; one-way by default |
| 9 Sharing UI | Save tour, share token, secure public RPC, redaction, QR/revoke | DONE | supabase/migrations/202609200004_phase9_sharing.sql, src/domain/tour.ts, src/services/tourService.ts, src/components/sharing/ShareTourPanel.tsx, src/pages/SharedTourPage.tsx | 94 frontend + 51 security tests PASS; Playwright 14/14 desktop/mobile; live Supabase + live browser save/share/redaction/revoke PASS | Atomic snapshot RPC; public route is outside auth guards and reads only get_shared_tour |
| 10 External handoffs | Tasks beyond current review/booking handoffs | TODO | — | Not started | Outside Prompt 2 |
| 11 PWA/Lucky Wheel/Polish | All tasks | TODO | — | Not started | Outside Prompt 2 |
| 12 Production audit/release | GitHub/Vercel production deployment + release checks | BLOCKED_EXTERNAL | private GitHub repo, Vercel project/alias, `auth-totp` + `geo` Edge functions, MapTiler origin restriction | Production `/login` 200 with password field absent, `Tiếp tục` present, `@trunk.ng` Instagram link correct; auth/geo preflight 204; MapTiler 200 | Technical path verified; one physical Authenticator QR/code UX check remains manual |

## External Blockers

- No Prompt 2 live-provider blocker remains.
- Production origin is `https://smart-food-route.vercel.app`. Vercel `VITE_APP_URL`, Edge `ALLOWED_ORIGINS`, Supabase Site URL and exact auth redirect URLs are configured and verified.
- MapTiler production-origin restriction is now verified: `streets-v4` style request from the canonical production origin returns HTTP 200.
- Email delivery is no longer part of the user-facing auth design. One physical Authenticator QR scan/code remains MANUAL_VERIFICATION_REQUIRED.

## Technical Blockers

- None.
- Non-blocking observation: production build succeeds but Vite warns that the MapLibre dashboard and worker chunks exceed 500 kB. Preserve as a future performance task; no warning threshold was hidden or relaxed.
- Docker/psql are unavailable locally. PGlite executes the real PostgreSQL migrations/policies; remote Supabase behavior was separately verified live.

## Decisions Made

- KEEP: Phase 0–2 foundation, Auth/MFA, owner/AAL2 policies, secure share RPC, private-source deletion regression, query cache cleanup and responsive shell.
- MIGRATE: durable provider-neutral places and MapLibre/Geoapify UI/services.
- REMOVE: Google JS loader, Google Places adapter, Google map/marker types, Google env requirements and runtime packages.
- RETAIN: only validated external Google Maps search/review URLs; hidden for private/start-point places.
- Existing six v2 migrations remain immutable. Three forward migrations preserve legacy ownership/notes/references, mark unresolved Google rows `needs_location`, add atomic geo quota and align future schema names without inventing coordinates.
- MapLibre v6 worker is emitted by Vite through `?worker&url` and configured once; this fixed a failure found by production-browser testing.
- The Edge Function uses handler-level `getClaims` plus live `getUser`/verified TOTP/AAL2 checks and database quota, so Supabase platform `verify_jwt=false` is deliberate and not anonymous access.
- Live provider/auth closeout is reproducible through the recorded MapTiler probe plus `npm run live:security`, `npm run live:auth` and `npm run live:planner`; none prints provider secret values.
- Prompt 2 routing stays server-side through `/geo`: bounded Route Matrix + final Routing use the Edge secret; Haversine is only an explicitly unverified fallback.
- Fixed showtime is a scheduler anchor: backward departure calculation is followed by forward validation, opening-hour checks and one-way Top 3 ranking.
- ShowtimeProvider currently has the safe manual fallback; no Moveek scraping/bypass was added without a permitted feed/adapter source.
- Git is initialized on `main`; private GitHub repository `trungnguyencore/SmartFoodRoute` is connected to Vercel for Git deployments.
- User-facing Auth is passwordless: email selects/creates the Supabase identity, first use enrolls TOTP by QR, later logins use email + 6-digit TOTP. Edge `auth-totp` keeps its bootstrap AAL1 session server-side and returns only an AAL2 browser session after valid TOTP. First-use email inbox ownership is not independently verified because this UX intentionally does not send email OTP/magic links.
- Global creator attribution `@trunk.ng` links to `https://www.instagram.com/trunk.ng/`; Playwright checks the link on the public share route.
- Phase 9 uses a forward-only migration with transactional `save_tour_snapshot`; the client snapshots start at position 0, then ordered candidate stops. Public sharing reads only `get_shared_tour`, with server-side private/start-point redaction, 7-day token expiry, rotation and revocation.
- Phase 10+ remains untouched.

## Verification History

- 2026-09-19 legacy baseline: `npm run check` PASS (52 tests, 18 SQL tests, build); Playwright 6/6 PASS. These were not v3/live-provider evidence.
- 2026-09-20 local v3 final gate: `npm run check` PASS — lint, TypeScript browser + Deno Edge, 82/82 frontend tests, 46/46 security tests (23 PostgreSQL + 23 Edge), production build and credential/runtime audit.
- 2026-09-20 browser final gate: Playwright 10/10 PASS on desktop/mobile, including Auth/MFA/custom/provider-place CRUD/privacy/quota journeys and real MapLibre WebGL against a clearly labeled mocked style using the production build.
- 2026-09-20 dependency/security gate: `npm audit --omit=dev` reports 0 vulnerabilities; runtime/build secret and legacy-Google audit reports 0 findings across 42 runtime and 10 build files.
- 2026-09-20 Supabase live: project SmartFoodRoute ACTIVE_HEALTHY in ap-southeast-1; nine migrations present; seven public tables have RLS; `geo` function ACTIVE; email confirmation and TOTP enabled; public Auth settings HTTP 200.
- 2026-09-20 live two-user security + Geoapify audit PASS: password login, TOTP enrollment/challenge/AAL2, AAL1 empty read/denied insert, AAL2 owner CRUD, cross-owner isolation, anonymous table denial, forged JWT/AAL1/unknown Edge request rejection, live Geoapify autocomplete/category Places/place details/reverse geocoding through deployed Edge, quota RPC, private snapshot redaction and share revocation.
- 2026-09-20 real MapTiler acceptance PASS: desktop and Pixel 7 browser profiles loaded real `streets-v4`, attribution was visible, each observed 28 successful MapTiler responses with no non-2xx/page errors/Google runtime requests, and an unlisted origin was rejected with HTTP 403.
- Both temporary live Auth users and cascade-owned fixtures were deleted successfully after each live security verification.
- 2026-09-20 Prompt 1B final closeout regression PASS: `npm run check` (82/82 frontend + 46/46 security, build/audit), Playwright 10/10 desktop/mobile, and `npm audit --omit=dev` reports 0 vulnerabilities.
- 2026-09-20 Prompt 2 local final gate PASS: `npm run check` — lint, browser + Deno Edge typecheck, 93/93 frontend tests, 49/49 security tests, production build and runtime/secret audit with 0 findings.
- 2026-09-20 Prompt 2 browser final gate PASS: Playwright 12/12 on desktop/mobile, including the fixed-cinema Planner journey; `npm audit --omit=dev` reports 0 vulnerabilities.
- 2026-09-20 Prompt 2 deployed provider gate PASS: `geo` redeployed ACTIVE with the same nine migrations; two-user live security still PASS; real Geoapify Route Matrix and final Routing PASS through deployed `/geo` with AAL2 while anonymous/forged/AAL1 requests remain rejected.
- 2026-09-20 Prompt 2 live browser gate PASS: `npm run live:planner` created a temporary real Auth/TOTP user and places, ran Planner through the real browser/Edge/provider path, observed matrix + route HTTP 200, verified `Matrix: Geoapify` and `Route: Geoapify verified`, observed MapLibre canvas change after route, no page errors, then cleaned the temporary user/data.
- 2026-09-20 Phase 9 local final gate PASS: `npm run check` — lint, browser + Deno Edge typecheck, 94/94 frontend tests, 51/51 security tests, production build and runtime/secret audit with 0 findings. Dedicated PostgreSQL tests verify atomic rollback on cross-owner stop and Safe DTO private redaction.
- 2026-09-20 Phase 9 browser final gate PASS: Playwright 14/14 on desktop/mobile, including Planner save → share token → QR → anonymous public route and private start redaction.
- 2026-09-20 Phase 9 remote migration PASS: `202609200004_phase9_sharing.sql` pushed successfully; local/remote migration history both show 10/10 applied migrations.
- 2026-09-20 Phase 9 live security PASS: real Supabase Auth/TOTP/AAL2 run verified atomic `save_tour_snapshot`, Safe DTO `id/totalDurationMinutes/totalBudget`, redaction after source deletion, anonymous direct-table denial and share revocation; temporary users/data cleaned.
- 2026-09-20 Phase 9 live browser PASS: real browser saved the verified Planner candidate, generated a live share URL + QR, opened it in an unauthenticated browser context, retained public stops while hiding the private start label/location, revoked the token and observed the public URL become unavailable; no page errors and cleanup PASS.
- 2026-09-20 production deployment partial: private GitHub repo created and pushed on `main`; Vercel project connected to GitHub and production alias `https://smart-food-route.vercel.app` is Ready. Production smoke returned HTTP 200 for `/login`, `/reset-password` and a `/share/:token` deep link with no page errors; Supabase Edge preflight returned 204 and `Access-Control-Allow-Origin: https://smart-food-route.vercel.app`; initial MapTiler production-origin style request returned HTTP 403.
- 2026-09-20 MapTiler production-origin recheck PASS: after the external allowlist update, the same `streets-v4` style request from `https://smart-food-route.vercel.app` returned HTTP 200.
- 2026-09-21 passwordless Auth final gate PASS: `npm run check` = 93/93 frontend + 57/57 security, build/audit PASS; Playwright 14/14 desktop/mobile; `npm audit --omit=dev` = 0 vulnerabilities. Deployed `auth-totp` live acceptance verified new-email QR enrollment, generated TOTP, AAL2-only browser session, protected RLS access, second email+TOTP login and production-origin CORS; temporary Auth user cleanup PASS.
- 2026-09-21 production frontend smoke PASS on `https://smart-food-route.vercel.app`: `/login` HTTP 200, password field count 0, `Tiếp tục` present, passwordless copy present, global `@trunk.ng` link targets `https://www.instagram.com/trunk.ng/`, no page errors, `auth-totp` and `geo` preflights HTTP 204 with the canonical origin, MapTiler style HTTP 200.

## Current Repository State

- React application implements Phases 0–9 under v3, including Planner, manual ShowtimeProvider fallback, Matrix/Scheduler, final route, timeline/budget and secure save/share/QR/public-tour flow.
- Supabase remote contains all ten migrations plus active `geo` and `auth-totp` Edge Functions. `auth-totp` provides the passwordless email→TOTP bootstrap while returning only AAL2 browser sessions after valid TOTP; `geo` retains Places + Route Matrix + Routing. `ALLOWED_ORIGINS` includes local development and `https://smart-food-route.vercel.app`; `GEOAPIFY_API_KEY` remains Edge-only.
- Private GitHub repository `trungnguyencore/SmartFoodRoute` tracks `main` and is connected to Vercel project `trunknguen/smart-food-route`; canonical production alias is `https://smart-food-route.vercel.app`.
- No active Google Maps Platform dependency, request, key or Map ID remains. Compatibility field names occur only in historical migrations where required.
- `pass-key/`, environment files, Supabase temporary link state and build/test output are ignored.
- `implementation.md` SHA-256 remained unchanged during migration: `E0B2AE4102B01603A3566AA3B106C04FB8DB9413DFB02ED5B638D24553D16AF9`.

## Next Action

Technical production deployment and passwordless email + TOTP auth are verified. Complete one physical Authenticator QR scan/code UX check before marking Phase 12 release PASS. Phase 10 External Handoffs remains the next product-development phase.

## Session Handoff

Completed: Phase 0–9 v3 implementation plus private GitHub/Vercel production deployment and the passwordless email + TOTP auth redesign. Production `auth-totp` is live; the deployed frontend shows no password field, uses email→QR/TOTP or email→TOTP, and globally links `@trunk.ng` to the requested Instagram profile.
Production verification: `/login` HTTP 200, no observed page errors, auth/geo preflights 204 with the canonical production origin, MapTiler 200; live auth verifies new enrollment, later email+TOTP login, AAL2 session and protected RLS access.
Remaining deployment/manual work: one physical Authenticator QR scan/code UX check.
Technical blockers: none; only the existing non-blocking Vite chunk-size warning remains.
Next product phase after deployment closeout: Phase 10 External Handoffs; Phase 11 remains TODO.
