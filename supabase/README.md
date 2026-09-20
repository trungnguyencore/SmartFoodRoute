# Supabase database, Auth and Edge verification

Migrations run in filename order. Historical migrations remain immutable; the v3 provider-neutral schema is a forward-only upgrade. The schema retains same-owner foreign keys, restrictive AAL2 policies, safe public-share RPCs, private-snapshot inheritance and deletion protection.

## Local PostgreSQL and Edge checks

`npm run test:security` executes every SQL migration against in-memory PGlite PostgreSQL with pgcrypto. The harness provides test-only Auth roles and JWT helpers; the migrations, policies, triggers and SECURITY DEFINER functions execute as real PostgreSQL.

The same suite exercises the `geo` Edge handler with explicit Auth/upstream doubles. It verifies:

- accepted autocomplete, Places, details and reverse-geocode contracts;
- unknown fields/actions, oversized requests, invalid provider IDs and arbitrary categories are rejected;
- anonymous, forged-token and AAL1 access is rejected before quota/provider calls;
- quota exhaustion and quota-storage failure fail closed;
- upstream 429, 5xx, network and malformed responses become normalized errors;
- server secrets and untrusted provider bodies are not returned.

These are local contract tests, not live-provider results.

## Remote deployment

Review the target project and migration diff first. Never reset a remote project.

```sh
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase secrets set GEOAPIFY_API_KEY=YOUR_SERVER_KEY
npx supabase secrets set ALLOWED_ORIGINS=http://localhost:5173,https://YOUR_PRODUCTION_ORIGIN
npx supabase functions deploy geo --use-api --import-map supabase/functions/deno.json
```

The function config intentionally sets platform `verify_jwt = false` because the handler performs its own current-key-compatible `getClaims` verification, live `getUser` check, verified-TOTP/AAL2 check and database quota call. Do not remove those checks or make the function a public arbitrary proxy.

## Live security audit

When the ignored `pass-key/1.txt` or equivalent environment variables contain account-scoped credentials:

```sh
npm run live:audit
npm run live:security
```

The live audit reports only non-secret project state. The security run creates two temporary users, checks AAL1/AAL2, cross-owner isolation, private share redaction after deleting the source, anonymous table denial, share revocation and the quota RPC, then removes both test users and cascade data.

A passing run does not establish SMTP delivery, a physical Authenticator flow, MapTiler or Geoapify. Provider live checks require their own keys.

Local-only `npx supabase db reset` is destructive and must never be pointed at a remote project.
