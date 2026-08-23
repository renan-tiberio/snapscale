# Phase 1 — Final Gate Verification

Date: 2026-08-23
Branch: `phase-1-monolith`
Commit verified: `f7d061abc785c14e1d41e936cd8e5c6ba4d4c39e` (`fix(api): recover idempotent processing by row existence, not sqlstate`)
Base branch: `main` @ `e4e2da32989ed300cc635edf3b45633b55ddb700`
Verifier: last-check gate run, no application code/tests/configs modified in the course of this verification.

## Environment

- Host: macOS (Darwin 25.5.0, arm64, "Renans-MacBook-Pro-2")
- Node: `v24.18.1` (repo `package.json` declares `engines.node: 22.x` — every command below printed
  `WARN Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v24.18.1", ...})` but still ran
  and passed; flagged here, not treated as a failure)
- pnpm: `9.15.0`
- Docker: `29.6.2` (build dfc4efb)
- Docker Compose: `v5.3.1`

## Open issues (read this first)

Two real problems were found. Neither was fixed — application code, tests, and configs were left
untouched per the verification mandate.

### 1. The api suite still flakes — a different failure than the one the regression fix targeted

The task brief described a known flake in `images-process.test.ts` (idempotency race), and said a
concurrency cap (`apps/api/vitest.config.ts` maxThreads 4) plus `f7d061a` (recovery by row existence
instead of SQLSTATE) had just been applied to fix it. Running `@snapscale/api` alone 10 consecutive
times (`pnpm --filter @snapscale/api test`) gave:

```
RUN 1  EXIT=0
RUN 2  EXIT=0
RUN 3  EXIT=0
RUN 4  EXIT=1   <-- FAILURE
RUN 5  EXIT=0
RUN 6  EXIT=0
RUN 7  EXIT=0
RUN 8  EXIT=0
RUN 9  EXIT=0
RUN 10 EXIT=0
```

**Pass count: 9/10.** The failure on run 4 was NOT the `images-process.test.ts` idempotency race —
it was `src/routes/auth.test.ts` timing out spinning up a Testcontainers-managed MailHog instance:

```
FAIL  src/routes/auth.test.ts > auth routes (/auth/otp/*)
Error: Timed out after 10000ms while waiting for container ports to be bound to the host
 ❯ ../../node_modules/.pnpm/testcontainers@12.1.0/node_modules/testcontainers/build/generic-container/inspect-container-util-ports-exposed.js:15:16
 ❯ IntervalRetry.retryUntil ../../node_modules/.pnpm/testcontainers@12.1.0/node_modules/testcontainers/build/common/retry.js:29:24
 ❯ inspectContainerUntilPortsExposed ../../node_modules/.pnpm/testcontainers@12.1.0/node_modules/testcontainers/build/generic-container/inspect-container-util-ports-exposed.js:6:20
 ❯ GenericContainer.startContainer ../../node_modules/.pnpm/testcontainers@12.1.0/node_modules/testcontainers/build/generic-container/generic-container.js:152:31
 ❯ startMailhog test/mailhog.ts:49:43

FAIL  src/routes/auth.test.ts > auth routes (/auth/otp/*)
TypeError: Cannot read properties of undefined (reading 'close')
 ❯ src/routes/auth.test.ts:65:15
     63|
     64|   afterAll(async () => {
     65|     await app.close()
       |               ^
     66|     await mailhog.stop()
     67|     await database.destroy()
```

12 tests in that file were reported "skipped" (vitest's term for tests whose `beforeAll` failed), and
a cascading `TypeError` fired in `afterAll` because `app` was never assigned. Net for that run: `Test
Files 1 failed | 27 passed (28)`, `Tests 201 passed | 12 skipped (213)`.

This looks like Docker resource contention from starting/stopping a fresh MailHog testcontainer once
per full `vitest run` invocation, 10 times back-to-back in ~90 seconds, on top of whatever else the
host's Docker Desktop was doing (a second, unrelated `snapscale` compose project — the coordinator's
own postgres/mailhog — was running the whole time; see below). It reproduced once in 10 runs, i.e. a
~10% flake rate for this suite as configured on this machine, not the 1-in-3 rate described for the
originally-reported bug, and not the same code path. The applied fix (`f7d061a` + the maxThreads cap)
may well have fixed the idempotency race it targeted — nothing in these runs re-triggered that
specific failure — but it does **not** make the api suite deterministic end-to-end. The flake
regression check in the task brief is not fully satisfied.

The full 3x run of the whole workspace (`pnpm turbo run test`, all 4 test:coverage packages) came back
green all three times, so this is a scheduling/resource-timing issue specific to hammering the api
package alone in a tight loop, not something the full-suite command surfaced.

### 2. The `web` container's own Docker HEALTHCHECK never passes under `docker compose up`

Under the isolated compose stack (see below), `postgres`, `mailhog`, `migrate` and `api` all reported
`healthy`/exited-0 as expected, but `web` stayed `unhealthy` for the entire run:

```
$ docker inspect snapscale-verify-web-1 --format '{{json .State.Health}}'
"Status": "unhealthy", "FailingStreak": 6
"Output": "wget: can't connect to remote host: Connection refused"
```

Root cause, confirmed by shelling into the container: `apps/web/Dockerfile` (lines 49-50) runs

```
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["wget", "-q", "-O", "-", "http://localhost:5173/"]
```

but the generated nginx config only does `listen 5173;` (IPv4 wildcard, no `[::]:5173`). Inside the
container, `/etc/hosts` lists `::1 localhost` before `127.0.0.1 localhost`, and busybox `wget`
resolves `localhost` to `::1` first — which nothing is listening on — and reports "Connection
refused" instead of falling back to `127.0.0.1`. `wget http://127.0.0.1:5173/` and
`wget http://0.0.0.0:5173/` both succeed from inside the same container at the same moment. The app
itself is fully functional (host curl through the mapped port returns HTTP 200 throughout, and the
E2E journey below passed against it) — this is purely a broken container healthcheck, not a broken
app. Because nothing in `docker-compose.yml` depends on `web: condition: service_healthy`, `docker
compose up` still succeeds and the stack is usable, but `docker compose ps` permanently shows `web`
as unhealthy, and anything that gates on that status downstream would incorrectly treat a working
deployment as broken.

Neither issue was fixed here, per the "you may NOT edit application code, tests, or configs" rule for
this gate.

## Part 1 — verification results

### 1. `pnpm install --frozen-lockfile`

```
$ pnpm install --frozen-lockfile
WARN  Unsupported engine: wanted: {"node":"22.x"} (current: {"node":"v24.18.1","pnpm":"9.15.0"})
Scope: all 8 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
```

**Exit 0. PASS.**

### 2. `pnpm turbo run typecheck lint`

```
$ pnpm turbo run typecheck lint
Packages in scope: @snapscale/api, @snapscale/e2e, @snapscale/eslint-config, @snapscale/otel,
                    @snapscale/shared, @snapscale/tsconfig, @snapscale/web
Running typecheck, lint in 7 packages
Tasks:    10 successful, 10 total
Cached:    10 cached, 10 total
```

**Exit 0. PASS.** (All 7 packages; `tsconfig`/`e2e` contribute no `typecheck`/`lint` scripts of their
own, hence 10 executed tasks across 7 packages.)

### 3. `pnpm turbo run test:coverage` (api, web, shared, otel)

Command actually run: `pnpm turbo run test:coverage --filter=@snapscale/api --filter=@snapscale/web
--filter=@snapscale/shared --filter=@snapscale/otel --force` (forced, bypassing turbo cache, so every
number below is from a fresh execution on this machine).

```
Tasks:    4 successful, 4 total
Cached:    0 cached, 4 total
```

**Exit 0. PASS.** Per-package test counts and coverage:

| Package | Test Files | Tests | Stmts % | Branch % | Funcs % | Lines % |
|---|---|---|---|---|---|---|
| @snapscale/otel   | 6 passed (6)   | 20 passed (20)   | 98.49 | 90.00 | 100.00 | 98.49 |
| @snapscale/shared | 6 passed (6)   | 71 passed (71)   | 100.00 | 100.00 | 100.00 | 100.00 |
| @snapscale/web    | 28 passed (28) | 177 passed (177) | 98.04 | 93.26 | 100.00 | 98.04 |
| @snapscale/api    | 28 passed (28) | 213 passed (213) | 97.36 | 90.40 | 95.28 | 97.36 |

All four packages clear the 80% floor on every dimension. Full per-file tables in
[`coverage-summary.md`](./coverage-summary.md).

### 4. Flake regression check

See "Open issues #1" above for the full failure detail.

- `pnpm --filter @snapscale/api test`, run 10 consecutive times: **9/10 passed**, 1 failure (run 4,
  `src/routes/auth.test.ts`, Testcontainers MailHog startup timeout — not the previously-described
  `images-process.test.ts` idempotency race).
- Full workspace suite (`pnpm turbo run test --force`, all 4 coverage packages), run 3 times: **3/3
  green**, identical counts each time (`shared` 71/71, `otel` 20/20, `web` 177/177, `api` 213/213).

### 5. Exit criterion under real `docker compose`

Committed `docker-compose.yml` maps postgres→5433, mailhog→1025/8025, api→4000, web→5173. Those hosts
ports (plus 3000/3001/5432) were occupied by the coordinator's own dev servers and the
`snapscale-postgres-1`/`snapscale-mailhog-1` containers, which were **not** touched. A private
override file (not committed to the repo) remapped every host port for an isolated compose project:

- postgres `5434:5432`
- mailhog `1026:1025`, `8026:8025`
- api `4001:4000`
- web `5174:5173`, rebuilt with `VITE_API_URL=http://localhost:4001`, and the `api`/`migrate`
  services' `WEB_ORIGIN` overridden to `http://localhost:5174` to match

Every `ports` key in the override uses `!override` so it replaces rather than merges with the
committed file's ports list (confirmed via `docker compose ... config`, which resolved each service to
exactly the remapped port, nothing else).

```
$ docker compose -p snapscale-verify -f docker-compose.yml -f <override> up -d --build
... (full build + up log, all 5 services created)
Container snapscale-verify-postgres-1  Healthy
Container snapscale-verify-mailhog-1   Healthy
Container snapscale-verify-migrate-1   Exited (0)
Container snapscale-verify-api-1       Healthy
Container snapscale-verify-web-1       Started   (see Open issues #2 — its own HEALTHCHECK never
                                                    passes, but it serves traffic correctly)
```

```
$ E2E_WEB_URL=http://localhost:5174 E2E_API_URL=http://localhost:4001 E2E_MAILHOG_URL=http://localhost:8026 \
    pnpm --filter @snapscale/e2e exec playwright test

Running 2 tests using 1 worker
  ✓  1 [chromium] full gallery journey: OTP sign-in, album, upload, process, rendered result (735ms)
  ✓  2 [chromium] an invalid OTP code shows an error and does not authenticate (314ms)
  2 passed (1.5s)
```

**Exit 0. PASS.** This was run against images built from the committed `Dockerfile`s and
`docker-compose.yml` via `docker compose ... up -d --build` — real container images and the real
Postgres/MailHog images, not the `pnpm dev` dev servers, and not turbo's dev/watch mode. Full verbatim
output: [`e2e-compose-run.txt`](./e2e-compose-run.txt).

### 6. Teardown

```
$ docker compose -p snapscale-verify down -v
... all snapscale-verify-* containers/network/volumes removed
```

Post-teardown `docker ps`:

```
snapscale-postgres-1   Up 2 hours (healthy)
snapscale-mailhog-1    Up 2 hours (healthy)
```

**Confirmed:** the coordinator's stack was never stopped, restarted, or otherwise disturbed.

### 7. Integrity

```
$ grep -rn "\.skip\|\.only\|\.todo" --include="*.test.*" --include="*.spec.*" apps packages e2e
(no output — nothing found)

$ git log main..HEAD --format='%ae' | sort -u
renanolovics@gmail.com

$ git log main..HEAD --format='%B' | grep -ciE "co-authored|claude|anthropic|generated with"
0

$ git status --porcelain
(clean, before this evidence commit)
```

**PASS** on all four checks.

## Summary

| # | Check | Result |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | PASS (exit 0) |
| 2 | `pnpm turbo run typecheck lint` | PASS (10/10 tasks, exit 0) |
| 3 | `pnpm turbo run test:coverage` (4 packages) | PASS — 481 tests total, all ≥80% coverage on every dimension |
| 4 | Flake regression (api ×10, workspace ×3) | **PARTIAL** — api alone: 9/10; workspace ×3: 3/3 green |
| 5 | Exit criterion under `docker compose up --build` | PASS — E2E 2/2 against real containers |
| 6 | Teardown / coordinator stack untouched | PASS |
| 7 | Integrity (no skip/only/todo, single author, no AI attribution, clean tree) | PASS |

Two open issues stand: the api suite is not fully deterministic (9/10 over 10 solo runs, a different
failure mode than the one the recent fix targeted), and the `web` container's own Docker HEALTHCHECK
is broken (cosmetic under the current compose graph, since nothing depends on it, but a real defect).
Everything else passed as specified, against real `docker compose up --build`, not dev servers.
