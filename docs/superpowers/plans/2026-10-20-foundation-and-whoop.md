# Foundation + WHOOP Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, login-protected web app that connects to the owner's WHOOP account. It keeps recovery, sleep, cycle (day strain) and workout data synced through webhooks and a daily reconciliation pull, and it shows the owner's latest numbers on a first version of the Today screen.

**Architecture:** A Next.js (App Router) TypeScript app does both jobs: it serves the UI and handles the API routes (OAuth callback, webhooks, cron). Data lives in Postgres through Drizzle ORM. Development and tests use PGlite, an in-process Postgres, so nothing needs installing. Production uses Neon's free Postgres. WHOOP tokens are encrypted at rest. A single-user password login protects everything except the webhook, cron and OAuth-callback routes.

**Tech Stack:** Node.js 22 LTS, Next.js 15, TypeScript, Drizzle ORM + drizzle-kit, @electric-sql/pglite (dev/test), @neondatabase/serverless (prod), zod, jose, bcryptjs, Vitest. Hosting: Vercel Hobby (free) and Neon free tier.

**Spec:** `docs/superpowers/specs/2026-10-20-training-app-design.md`. API facts are in `WHOOP_API_NOTES.md`.

**This plan is 1 of 5.** It covers spec sections 6 (WHOOP only), 10 (Today, first version) and 11 (security, cost, registration). Later plans, each written after the previous one ships:
- **Plan 2:** Log (strength sets, manual run, bike and swim entries, weight, joint pain, weekly VO2 max and WHOOP Age, scans, labs), and loading the baseline seed.
- **Plan 3:** Rules library, training plan engine, adaptation (spec section 7) and the Plan tab with the Library.
- **Plan 4:** Nutrition: the Apple Health Shortcut ingest, calorie calibration (spec section 8), the Day tab, and full Today fuel tiles.
- **Plan 5:** Progress tab, plus a polish and PWA pass.

## Global Constraints

- **Public repo:** the GitHub repo `jaredmcelreath-a11y/whoop-training-app` is **public**. Never commit:
  - `docs/baseline.local.md`
  - `*.local.md`
  - `.env*` (except `.env.example`)
  - tokens, secrets, or the owner's health values
- **Commit author:** commits are authored as `jaredmcelreath-a11y <288721429+jaredmcelreath-a11y@users.noreply.github.com>`. Set this in local git config. **Never use the owner's Gmail.**
- **No pushing without asking:** do not `git push` without the owner's OK in chat. The remote already has `PRIVACY.md` on `main`.
- **No per-use AI features.** No paid service is chosen without asking the owner first.
- **WHOOP base URL:**
  - API: `https://api.prod.whoop.com/developer/v2`
  - Auth: `https://api.prod.whoop.com/oauth/oauth2/auth`
  - Token: `https://api.prod.whoop.com/oauth/oauth2/token`
- **Scopes requested** (exact string): `offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement`
- **OAuth state:** exactly 8 characters.
- **Redirect URI path:** `/auth/whoop/callback`. Dev value: `http://localhost:3000/auth/whoop/callback`.
- **Owner timezone:** `America/Chicago`. Use it for "today" boundaries and display.
- **Webhook signature:** `base64(HMAC_SHA256(key=WHOOP_CLIENT_SECRET, msg=X-WHOOP-Signature-Timestamp + rawBody))` compared to `X-WHOOP-Signature`.
- **Rate limits:** 100 requests/min and 10,000/day. On a 429, wait `X-RateLimit-Reset` seconds.
- **Unit conversion:** kcal = kJ / 4.184.

## Review Focus

1. **Score not ready.** WHOOP returns records with `score_state` of `PENDING_SCORE` or `UNSCORABLE` and no `score`. Expected: store null scores, and show the Today tiles as "pending", never 0. Tests: Task 7, Task 10.
2. **Day boundary in Chicago time.** A sleep that ends at 6 am Chicago time and a cycle that starts the evening before must count as "today". Expected: Today uses the latest cycle and the sleep that ended most recently in the owner's timezone. Test: Task 10.
3. **Revoked or dead refresh token.** The owner disconnects in the WHOOP app, so refresh returns 400/401. Expected: mark the connection `needs_reconnect`, stop retrying, and show "Reconnect WHOOP". No loop. Test: Task 6.
4. **Webhook raw body.** The signature must be computed over the exact raw bytes, including whitespace. Re-serialized JSON fails. Also, an event can arrive while WHOOP isn't connected. Expected: verify against the raw text, and return 200 while ignoring events when there's no connection. Tests: Task 8.
5. **Duplicate or out-of-order webhooks.** The same `trace_id` can arrive twice, or a `.deleted` event can arrive before its `.updated` event. Expected: processing is idempotent, a delete of an unknown id is a no-op, and an update after a delete re-inserts the row. Test: Task 8.

---

### Task 1: Tooling, scaffold, git

**Files:**
- Create: Next.js app at the repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`), `vitest.config.ts`, `src/lib/smoke.test.ts`
- Modify: `.gitignore` (keep the existing entries and add `.data/`)
- Keep untouched: `WHOOP_API_NOTES.md`, `docs/`, `mockups/`

- [ ] **Step 1: Install Node 22 LTS**

  The owner's Mac has Homebrew and no Node. Run `brew install node@22`. Then `node -v` should print `v22.x`.

- [ ] **Step 2: Scaffold**

  Use `create-next-app` with TypeScript, App Router, `src/` dir, ESLint and no Tailwind, in a temp dir. Then move its files into the repo root without overwriting the existing files above. Add Vitest (`npm i -D vitest`), plus the scripts `"test": "vitest run"` and `"typecheck": "tsc --noEmit"`.

- [ ] **Step 3: Smoke test**

  In `src/lib/smoke.test.ts`, assert `expect(1 + 1).toBe(2)`. Run `npm test`. Expected: 1 passed.

- [ ] **Step 4: Git**

  ```bash
  git init -b main
  git config user.name "jaredmcelreath-a11y"
  git config user.email "288721429+jaredmcelreath-a11y@users.noreply.github.com"
  git remote add origin https://github.com/jaredmcelreath-a11y/whoop-training-app.git
  git fetch origin && git reset --soft origin/main   # adopt remote history (PRIVACY.md) without touching working files
  git status --ignored | grep baseline.local.md       # must be listed as ignored
  ```

- [ ] **Step 5: Commit**

  `git add -A && git commit -m "chore: scaffold Next.js app"`.

  Before committing, check `git diff --cached --name-only`. It must not contain `baseline.local.md` or any `.env`.

### Task 2: Env config and token encryption

**Files:**
- Create: `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/crypto.ts`, `src/lib/crypto.test.ts`, `.env.example`

**Interfaces:**
- Produces:
  - `getEnv(): Env`. The fields are `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI`, `APP_PASSWORD_HASH`, `SESSION_SECRET` (≥32 chars), `TOKEN_ENC_KEY` (base64, 32 bytes), `CRON_SECRET`, `DATABASE_URL?`, and `OWNER_TZ` (default `America/Chicago`).
  - `encrypt(plain: string): string` and `decrypt(blob: string): string`. AES-256-GCM. The blob format is `base64(iv).base64(tag).base64(ciphertext)`.

- [ ] **Step 1: Failing tests**
  - `getEnv` throws an error whose message lists **every** missing variable name.
  - `OWNER_TZ` defaults to `America/Chicago`.
  - `decrypt(encrypt("abc")) === "abc"`.
  - Encrypting the same text twice gives different blobs.
  - Changing one character of the ciphertext makes `decrypt` throw.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3: Implement**

  `env.ts` uses a zod schema and parses lazily (on the first call, then caches). `crypto.ts` uses `node:crypto`. Write `.env.example` with every key and placeholder values.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: env validation and token encryption`.

### Task 3: Database schema and client

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/test-db.ts`, `src/db/schema.test.ts`, `drizzle.config.ts`, and `drizzle/` (generated migrations)

**Interfaces:**
- Produces:
  - `getDb(): Db`. This is Neon when `DATABASE_URL` is set, otherwise PGlite persisted to `./.data/pglite`.
  - `createTestDb(): Promise<Db>`. In-memory PGlite with the migrations applied.
  - Tables:
    - `whoop_connection`: a single row with `id = 1`. Columns:
      - `whoop_user_id` (bigint)
      - `access_token_enc`
      - `refresh_token_enc`
      - `expires_at` (timestamptz)
      - `scope`
      - `status` (`'connected' | 'needs_reconnect'`)
      - `updated_at`
    - `whoop_raw`: primary key (`resource`, `id`). Columns:
      - `resource` (`'recovery'|'sleep'|'cycle'|'workout'|'body'|'profile'`)
      - `id` (text)
      - `payload` (jsonb)
      - `fetched_at`
    - `cycles`: primary key `id` (bigint). Columns:
      - `start`, `end` (nullable)
      - `timezone_offset`, `score_state`
      - `strain`, `kilojoule`, `kcal`, `avg_hr`, `max_hr` (all nullable)
    - `recoveries`: primary key `cycle_id`. Columns:
      - `sleep_id` (uuid text), `score_state`
      - `recovery_score`, `rhr`, `hrv_rmssd_ms`, `spo2_pct`, `skin_temp_c`, `user_calibrating` (all nullable)
    - `sleeps`: primary key `id` (uuid text). Columns:
      - `cycle_id`, `start`, `end`, `timezone_offset`, `nap`, `score_state`
      - `asleep_min`, `light_min`, `sws_min`, `rem_min`, `awake_min`
      - `performance_pct`, `consistency_pct`, `efficiency_pct`, `respiratory_rate`
      - `need_baseline_min`, `need_debt_min`, `need_strain_min`, `need_nap_min`
      - (all score fields nullable)
    - `workouts`: primary key `id` (uuid text). Columns:
      - `start`, `end`, `timezone_offset`, `sport_name`, `sport_id`, `score_state`
      - `strain`, `avg_hr`, `max_hr`, `kilojoule`, `kcal`, `distance_m`, `altitude_gain_m`
      - `zone_ms` (jsonb `{z0..z5}`)
    - `webhook_events`: primary key `trace_id`. Columns: `type`, `object_id`, `user_id`, `received_at`, `processed_at` (nullable), `error` (nullable).
    - `sync_state`: primary key `key`. Columns: `last_synced_at`.

- [ ] **Step 1: Failing test**

  In `schema.test.ts`, using `createTestDb()`:
  - Insert a `workouts` row and select it back with equal fields.
  - Inserting the same `webhook_events.trace_id` twice with `onConflictDoNothing` leaves 1 row.
- [ ] **Step 2:** Run `npm test -- schema`. Expected: FAIL.
- [ ] **Step 3: Implement**

  Write the schema, run `npx drizzle-kit generate`, and have `createTestDb` apply the migrations through drizzle's PGlite migrator. Add the scripts `db:generate` and `db:migrate`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat: database schema`.

### Task 4: App login (single user)

**Files:**
- Create: `src/lib/auth/session.ts`, `src/lib/auth/session.test.ts`, `src/lib/auth/password.ts`, `src/middleware.ts`, `src/middleware.test.ts`, `src/app/login/page.tsx`, `src/app/login/actions.ts`, `scripts/hash-password.mjs`

**Interfaces:**
- Produces:
  - `createSessionToken(now?: Date): Promise<string>`. An HS256 JWT signed with `SESSION_SECRET` using `jose`. `sub: "owner"`, expires in 30 days.
  - `verifySessionToken(token: string): Promise<boolean>`.
  - `verifyPassword(plain: string): Promise<boolean>`. Uses bcryptjs against `APP_PASSWORD_HASH`.
  - Cookie name: `session`, set `httpOnly`, `secure` in prod, `sameSite=lax`.
  - `PUBLIC_PATHS = ["/login", "/auth/whoop/callback", "/api/webhooks/whoop", "/api/cron/sync", "/manifest.webmanifest", "/icons/"]`, exported from `middleware.ts`.

- [ ] **Step 1: Failing tests**
  - A token from `createSessionToken` verifies as true.
  - A token signed with a different secret verifies as false.
  - A token created 31 days ago verifies as false.
  - Middleware on `/` with no cookie returns a redirect to `/login`.
  - Middleware on `/api/webhooks/whoop` with no cookie passes through.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement**

  - The login server action: on success it sets the cookie and redirects to `/`. On failure it waits 1 s and shows "Wrong password".
  - `scripts/hash-password.mjs` prompts for a password and prints the bcrypt hash (cost 12) for `.env`.
  - Note: `/auth/whoop/callback` is public only so the redirect can land. It still requires a valid session cookie inside the handler (Task 5).
- [ ] **Step 4:** Run tests. Expected: PASS. Run `npm run dev`, then confirm that `/` redirects to the login page and the correct password reaches `/`.
- [ ] **Step 5:** Commit `feat: single-user login`.

### Task 5: WHOOP OAuth connect

**Files:**
- Create: `src/lib/whoop/oauth.ts`, `src/lib/whoop/oauth.test.ts`, `src/lib/whoop/connection.ts`, `src/app/api/whoop/connect/route.ts`, `src/app/auth/whoop/callback/route.ts`

**Interfaces:**
- Consumes: `getEnv`, `encrypt`/`decrypt`, `whoop_connection`, `verifySessionToken`.
- Produces:
  - `WHOOP_SCOPES` (the exact string from Global Constraints).
  - `makeState(): string`. 8 characters, from `crypto.randomBytes`, URL-safe.
  - `buildAuthorizeUrl(state: string): string`
  - `exchangeCode(code: string): Promise<TokenSet>`
  - `type TokenSet = { accessToken: string; refreshToken: string; expiresAt: Date; scope: string }`
  - `saveConnection(db, t: TokenSet, whoopUserId: number): Promise<void>`. Stores both tokens encrypted with `status='connected'`.
  - `loadConnection(db): Promise<(TokenSet & { status: string; whoopUserId: number }) | null>`. Decrypts the tokens.

- [ ] **Step 1: Failing tests** (`fetch` mocked with `vi.fn`)
  - `makeState()` has length 8, and two calls give different values.
  - The `buildAuthorizeUrl` query has `response_type=code`, `client_id`, `redirect_uri` equal to the env value, `scope` equal to `WHOOP_SCOPES`, and `state`.
  - `exchangeCode` POSTs form-encoded `grant_type=authorization_code`, `code`, `client_id`, `client_secret` and `redirect_uri` to the token URL. It maps `expires_in: 3600` to `expiresAt` = now + 3600 s.
  - After `saveConnection`, the raw DB column does not contain the plain access token, and `loadConnection` returns it.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement the routes**
  - `GET /api/whoop/connect` requires a session. It sets an httpOnly cookie `whoop_state` (10 min) and redirects to the authorize URL.
  - `GET /auth/whoop/callback`:
    - Requires a session and `state === cookie`. Otherwise it returns 400 "State mismatch".
    - Calls `exchangeCode`.
    - Fetches `/user/profile/basic` for `user_id`.
    - Calls `saveConnection`.
    - Redirects to `/?connected=1`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: WHOOP OAuth connect`.

### Task 6: Token refresh and API client

**Files:**
- Create: `src/lib/whoop/tokens.ts`, `src/lib/whoop/tokens.test.ts`, `src/lib/whoop/client.ts`, `src/lib/whoop/client.test.ts`

**Interfaces:**
- Consumes: `loadConnection`, `saveConnection`.
- Produces:
  - `getValidAccessToken(db): Promise<string>`. Refreshes when `expiresAt` is less than 60 s away. Refreshing is single-flight: concurrent callers share one in-flight promise.
  - `class WhoopReconnectRequired extends Error`
  - `whoopGet<T>(db, path: string, query?: Record<string,string>): Promise<T>`
  - `listAll<T>(db, path: string, range: { start: Date; end?: Date }): Promise<T[]>`. Follows `next_token` with `limit=25`.
  - `whoopDelete(db, path: string): Promise<void>`

- [ ] **Step 1: Failing tests**
  - Two concurrent `getValidAccessToken` calls with an expired token make exactly **1** refresh POST. The refresh body has `grant_type=refresh_token` and `scope=offline`. The new refresh token is saved.
  - A refresh that returns 400 sets `status='needs_reconnect'` and throws `WhoopReconnectRequired`. A later call throws immediately with no fetch. (Review Focus 3)
  - A `whoopGet` that gets a 401 refreshes once and retries once. If the retry also returns 401, it throws `WhoopReconnectRequired`.
  - A 429 with `X-RateLimit-Reset: 2` waits 2 s (fake timers) and then retries.
  - `listAll` over pages `[{records:[a],next_token:"t"},{records:[b]}]` returns `[a,b]`, and the 2nd request includes `nextToken=t`.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement**

  Use a module-level `refreshing: Promise<string> | null` for single-flight. After a failed refresh, re-read the DB once: another instance may have rotated the token. Only then mark `needs_reconnect`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: WHOOP token refresh and API client`.

### Task 7: Normalize and sync

**Files:**
- Create: `src/lib/whoop/normalize.ts`, `src/lib/whoop/normalize.test.ts`, `src/lib/whoop/sync.ts`, `src/lib/whoop/sync.test.ts`, `src/lib/whoop/fixtures/*.json` (sample v2 payloads: scored, `PENDING_SCORE`, `UNSCORABLE`)

**Interfaces:**
- Consumes: `whoopGet`, `listAll`, the schema.
- Produces:
  - `normalizeCycle(p)`, `normalizeRecovery(p)`, `normalizeSleep(p)`, `normalizeWorkout(p)`. Each returns its table's insert row.
  - `upsertRecord(db, resource, payload): Promise<void>`. Writes `whoop_raw` and the normalized row (insert … on conflict do update).
  - `deleteRecord(db, resource, id): Promise<void>`. A no-op when the row is missing.
  - `syncRange(db, start: Date, end?: Date): Promise<{ cycles: number; recoveries: number; sleeps: number; workouts: number }>`
  - `syncRecent(db, days = 7)`. Calls `syncRange(now - days)`, upserts `/user/measurement/body` into `whoop_raw` (resource `body`; there are no webhooks for it), and sets `sync_state('whoop').last_synced_at`.

- [ ] **Step 1: Failing tests**
  - Workout fixture with `kilojoule: 4184` gives `kcal: 1000`. `zone_durations` maps to `zone_ms.z0…z5`.
  - Sleep `stage_summary` milliseconds become minutes, rounded. `asleep_min` = light + sws + rem.
  - The `PENDING_SCORE` fixture gives a row with `score_state='PENDING_SCORE'` and all score fields `null`. (Review Focus 1)
  - Calling `upsertRecord` twice with an updated strain leaves 1 row with the new value.
  - `deleteRecord` on an unknown id doesn't throw. Upsert after delete re-inserts the row. (Review Focus 5)
  - `syncRange` with mocked endpoints (`/cycle`, `/recovery`, `/activity/sleep`, `/activity/workout`) returns the counts and fills the tables.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement**

  The field paths follow `WHOOP_API_NOTES.md`. The sleep need fields come from `score.sleep_needed.{baseline_milli, need_from_sleep_debt_milli, need_from_recent_strain_milli, need_from_recent_nap_milli}`. Note that the field names in the fixtures are a best guess. On the first real data pull (Task 11), save the actual responses as fixtures and fix any mismatches.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: WHOOP normalization and sync`.

### Task 8: Webhooks

**Files:**
- Create: `src/lib/whoop/webhook.ts`, `src/lib/whoop/webhook.test.ts`, `src/app/api/webhooks/whoop/route.ts`

**Interfaces:**
- Consumes: `upsertRecord`, `deleteRecord`, `whoopGet`, `loadConnection`.
- Produces:
  - `verifySignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean`. Uses a constant-time compare.
  - `handleEvent(db, evt: { user_id: number; id: string; type: string; trace_id: string }): Promise<"processed" | "duplicate" | "ignored">`

- [ ] **Step 1: Failing tests**
  - A signature computed over a raw body with irregular whitespace (`'{ "id" :"x",\n "type":"sleep.updated"}'`) verifies true. The same body passed through `JSON.stringify(JSON.parse(...))` verifies false. (Review Focus 4)
  - A wrong signature fails, and the route returns 401.
  - A timestamp more than 5 minutes old is rejected with 401. **(Claude's call:** replay protection)
  - `handleEvent` when no connection exists returns `"ignored"`, and the route still returns 200. (Review Focus 4)
  - The same `trace_id` twice gives `"processed"`, then `"duplicate"`, with only 1 fetch. (Review Focus 5)
  - `workout.updated` fetches `/activity/workout/{id}` and upserts it.
  - `sleep.deleted` calls `deleteRecord('sleep', id)`.
  - `recovery.updated`: the `id` is the **sleep** UUID. The handler fetches `/activity/sleep/{id}`, reads `cycle_id`, then fetches `/cycle/{cycle_id}/recovery` and upserts it.
  - An event whose `user_id` doesn't match the connection's `whoop_user_id` returns `"ignored"`.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement the route**
  - Read `await req.text()`, verify the signature, and insert into `webhook_events` (on conflict do nothing).
  - Return 200 immediately.
  - Process with `after()` from `next/server`. Write `processed_at`, or `error` on failure.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: WHOOP webhooks`.

### Task 9: Reconciliation cron and sync-on-open

**Files:**
- Create: `src/app/api/cron/sync/route.ts`, `src/app/api/cron/sync/route.test.ts`, `vercel.json`, `src/lib/whoop/ensure-fresh.ts`, `src/lib/whoop/ensure-fresh.test.ts`

**Interfaces:**
- Consumes: `syncRecent`, `sync_state`.
- Produces:
  - `ensureFresh(db, maxAgeMin = 30): Promise<"synced" | "fresh" | "disconnected">`. Runs `syncRecent(db, 2)` when the last sync is older than `maxAgeMin`.

- [ ] **Step 1: Failing tests**
  - The cron route without `Authorization: Bearer ${CRON_SECRET}` returns 401. With it, it calls `syncRecent(db, 7)` and returns 200 with the counts.
  - `ensureFresh` with a sync 10 minutes ago returns `"fresh"` and makes no fetch.
  - With a sync 45 minutes ago it returns `"synced"`.
  - With the connection in `needs_reconnect` it returns `"disconnected"` and doesn't throw.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement**

  `vercel.json` gets `{"crons":[{"path":"/api/cron/sync","schedule":"0 11 * * *"}]}`. That's daily at 11:00 UTC, about 6 am Chicago time. Vercel Hobby allows a daily cron.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat: reconciliation cron and sync-on-open`.

### Task 10: Today screen (first version), PWA, and disconnect

**Files:**
- Create: `src/lib/today.ts`, `src/lib/today.test.ts`, `src/app/page.tsx` (replace), `src/app/today.module.css`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`, `src/app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`

**Interfaces:**
- Consumes: the tables, `ensureFresh`, `loadConnection`, `whoopDelete`.
- Produces:
  - `getTodaySummary(db, now: Date, tz: string): Promise<TodaySummary>`
  - `TodaySummary = { connection: "none" | "connected" | "needs_reconnect"; recovery: { score: number | null; state: string; avg7: number | null } | null; hrv: { ms: number | null; avg30: number | null } | null; rhr: number | null; sleep: { asleepMin: number | null; needMin: number | null; endedAt: Date } | null; dayStrain: number | null; lastSyncedAt: Date | null }`
  - `disconnectWhoop(db)`. Calls `DELETE /user/access`, then deletes the `whoop_connection` row (spec: revoke on disconnect).

- [ ] **Step 1: Failing tests**
  - With 8 days of seeded recoveries, `recovery.score` is the latest cycle's score, and `avg7` is the mean of the last 7 scored values (pending ones skipped).
  - A latest recovery with `PENDING_SCORE` gives `score: null`, `state: 'PENDING_SCORE'`. (Review Focus 1)
  - Day boundary: `now` = 2026-11-03 07:00 America/Chicago. Main sleeps ended 2026-11-02 06:10 and 2026-11-03 05:50 local, plus a nap ended 2026-11-03 13:00 local the day before. `sleep.endedAt` is the 05:50 one, because naps are excluded. (Review Focus 2)
  - No connection row gives `connection: 'none'`.
- [ ] **Step 2:** Run tests. Expected: FAIL.
- [ ] **Step 3: Implement the UI** (dark style, following mockup C)
  - `page.tsx` is a server component. It calls `ensureFresh`, then `getTodaySummary`.
  - It shows four tiles: Recovery (score, 7-day avg, color), Sleep (asleep vs need), HRV (vs 30-day avg), Day strain. A pending score shows as "Pending".
  - Banners: "Connect WHOOP" (links to `/api/whoop/connect`) and "Reconnect WHOOP" when needed.
  - A "Last synced" time, in the owner's timezone.
  - A bottom tab bar with Today active and placeholders for Day, Plan, Log and Progress.
  - Settings has a "Disconnect WHOOP" button behind a confirmation dialog.
  - The manifest has `display: "standalone"`, a dark theme color, and the icons.
- [ ] **Step 4:** Run tests. Expected: PASS. Run `npm run dev` and use the built-in browser at 375 px width to check the tiles, the banners, and that the page doesn't scroll sideways.
- [ ] **Step 5:** Commit `feat: Today screen v1, PWA manifest, disconnect`.

### Task 11: Local end-to-end with real WHOOP data

**This step needs the owner:** they log in and approve the WHOOP consent screen themselves.

- [ ] **Step 1: Fill in `.env`**

  Create `.env` from `.env.example`:
  - The owner pastes the WHOOP Client ID and Secret into `.env` themselves. The secret must never be pasted into chat.
  - Generate `SESSION_SECRET`, `TOKEN_ENC_KEY` and `CRON_SECRET` with `openssl rand -base64 32`.
  - The owner runs `node scripts/hash-password.mjs` to create `APP_PASSWORD_HASH`.
- [ ] **Step 2: Connect**

  Run `npm run dev`. The owner logs in, then clicks Connect WHOOP and approves.
  Expected: redirect to `/?connected=1`, and the tiles fill with real numbers.

  If WHOOP rejects the `http://localhost` redirect, switch the dashboard and `.env` to the `https://localhost` variant and run `next dev --experimental-https`.
- [ ] **Step 3: Backfill**

  Run a one-off `syncRange` from 2026-08-01 (a script, `npm run whoop:backfill`).
  Expected: the counts are greater than 0.
- [ ] **Step 4: Real fixtures**

  Copy one real scored record of each type from `whoop_raw` into `src/lib/whoop/fixtures/`. Replace all IDs with fake ones; keep the values. Run `npm test` and fix any field-path mismatches. Also confirm whether `step_count` is present in cycles, and add a note to `WHOOP_API_NOTES.md`.
- [ ] **Step 5: Commit**

  Commit `test: real-shape WHOOP fixtures`. Before committing, check that the fixtures contain no real `user_id` and no tokens.

### Task 12: Deploy (Vercel + Neon, free tiers)

**This step needs the owner:** they create the Vercel and Neon accounts and paste in secrets themselves. Ask before pushing to GitHub.

- [ ] **Step 1: Push**

  Ask the owner for OK, then `git push -u origin main`. Before that, check that `git ls-files` contains no `.env`, `baseline.local.md` or `.data`.
- [ ] **Step 2: Accounts and project**

  The owner creates free Neon and Vercel accounts, imports the GitHub repo into Vercel, and sets all env vars from `.env.example` in Vercel. `DATABASE_URL` is the Neon pooled URL.
  Then run `npm run db:migrate` against Neon.
- [ ] **Step 3: WHOOP dashboard**

  The owner adds:
  - **Redirect:** `https://<app>.vercel.app/auth/whoop/callback`
  - **Webhook URL:** `https://<app>.vercel.app/api/webhooks/whoop`, model version **v2**.
  - The production `WHOOP_REDIRECT_URI` env value.
- [ ] **Step 4: Verify**

  The owner logs in on their iPhone and uses Add to Home Screen. They connect WHOOP, then log a short activity in the WHOOP app.
  Expected: within minutes, a `webhook_events` row with `processed_at` set, and the workout shows up. Trigger the cron route manually with the bearer header. Expected: 200.
- [ ] **Step 5: Hand-off note**

  Update `WHOOP_API_NOTES.md` with the production URLs (no secrets), and commit `docs: production setup notes`.
