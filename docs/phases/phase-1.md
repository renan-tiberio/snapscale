---
phase: 1
name: Monolith
branch: phase-1-monolith
status: done
---

## Goal

From `04-implementation-plan.md`:

> **Goal**: Gallery works end-to-end locally: OTP login via MailHog, albums, upload,
> heavy `sharp` process route — one API, one DB, one compose file.
> **Exit criterion**: Playwright E2E passes the full journey (request OTP → read code
> from MailHog → login → create album → upload image → process image → see result)
> against `docker compose up`.

The goal is not "a gallery". It is a *baseline*: one process that provably works, and
that contains, on purpose, the flaw the next eight phases exist to measure and remove.
Everything phase 2 draws on a dashboard, phase 3 extracts, and phase 4 autoscales is
already sitting in this branch — undiagnosed.

The exit criterion is deliberately the harshest check in the phase: not "the tests
pass", but "the stack works as a stack, in containers, through a browser".

## What changed and why

### What exists now

`main` is a single commit — the documentation set, no code. This branch adds 71 commits
on top of it: `git diff --shortstat main...HEAD` reports **360 files changed, 32,145
insertions, 46 deletions**. What those files are:

| Piece | What it is |
|---|---|
| Monorepo | pnpm workspaces + Turborepo, 8 workspace projects (7 named packages plus the root) |
| `apps/api` | Fastify 5.12.1 monolith — OTP auth, albums, images, the heavy route, static file serving; Drizzle ORM 0.45.2 over Postgres; `sharp` 0.35.3 |
| `apps/web` | React 19.2.8 + Vite 7.3.6 SPA with the React Compiler on, Tailwind 4.3.3, TanStack Query 5.102.0, Storybook for the component kit |
| `packages/shared` | zod 3.25.76 contracts (one declaration = validator + TS type + OpenAPI source), the response envelope, error codes, HTTP status table, and the value objects (`Email`, `OtpCode`, `JwtToken`, `StorageKey`, entity ids) |
| `packages/otel` | OpenTelemetry bootstrap, wired into the api's entrypoint from day 1 |
| `packages/eslint-config`, `packages/tsconfig` | The machine-enforced half of the house style, and strict TS presets |
| `e2e` | Playwright: `tests/gallery-journey.spec.ts`, two tests, driving a real browser against the composed stack and reading the OTP out of MailHog's REST API |
| `docker-compose.yml` | Five services: `postgres`, `mailhog`, `migrate`, `api`, `web`; one Dockerfile per app, added in `11d16de` together with the full-stack compose file |

The API surface is twelve route paths, every one of them declared through a shared zod
schema, which is also what `@fastify/swagger` publishes as OpenAPI at `/docs` and
`/docs/json`:

```
/health            /auth/otp/request   /auth/otp/verify   /auth/me
/auth/file-token   /albums             /albums/:id        /images
/images/:id        /images/:id/file    /images/process    /files/*
```

### Why the monolith is deliberate

A monolith is not the starting point because it is easier. It is the starting point
because **the failure being studied only exists in a monolith**: one Node process, one
event loop, and two workloads that do not belong together.

- **I/O-bound**: auth, album and image CRUD. Cheap per request, and healthy — until
  something else starves the process.
- **CPU-bound**: `POST /images/process`, synchronous `sharp` work, on purpose.

`sharp` occupies the process; the CRUD routes that share it get slower for reasons that
are nowhere in their own code. That asymmetry — a route degrading its *neighbours* — is
the engine of the whole nine-phase project. Phase 2 makes it visible on a dashboard,
phase 3 moves the offender out, phase 4 gives it its own scaling behaviour, phase 5
stops making callers wait for it at all. None of those lessons can be taught starting
from a system that is already split: you cannot show a diagnosis without a patient.

This is also why the heavy work is *real*. `05-decision-log.md` #3 rejected a fibonacci
loop, an absurd-cost bcrypt, and headless-Chrome PDF generation. A fake CPU loop proves
you can write a slow function; it does not make anyone believe an extraction. Image
processing is genuinely CPU-bound, naturally bursty, and obviously separable from CRUD —
the textbook extraction case, so the extraction argument in phase 3 is about
architecture rather than about the benchmark.

The route was given its own module for the same reason, and the code says so out loud in
`apps/api/src/routes/images-process/images-process.ts`:

> Its own module rather than part of `routes/images` because a later phase extracts
> exactly this handler into its own service: that move should be a file move plus a
> contract import.

### The other structural decisions this phase locked in

- **OTel from day 1, backends per phase.** `packages/otel` is wired into the api entrypoint
  now, but `OTEL_ENABLED` defaults to `false` (`packages/otel/src/env/env.ts`) and the
  SDK is loaded through a dynamic `import()` that never executes when it is off — so
  phase 1 pays nothing for instrumentation it cannot yet look at. Pipelines arrive per
  phase (Prometheus in 2, Jaeger in 3); the instrumentation is never rewritten.
- **Integration tests against real infrastructure.** The api's integration suites stand
  up their own Postgres *and* their own MailHog through Testcontainers 12.1.0. "The
  query works" is therefore a claim about a database, and "the email arrives" a claim
  about an SMTP server, not about a mock.
- **Auth shaped by a later phase.** Email OTP into MailHog, exchanged for an HS256 JWT
  with a 1h life and no refresh (`05-decision-log.md` #10) — chosen partly *because* a
  shared secret means every future service can validate tokens, which is precisely the
  coupling phase 9's gateway exists to fix.
- **A separate, 60-second, file-scoped token** for the two `<img src>` routes
  (`05-decision-log.md` #18), because an `<img>` tag cannot send an `Authorization`
  header and the credential has to travel in the URL.
- **TDD, visibly.** 24 of the 71 commits are `test(...)` commits, and 19 of those carry
  `(red)` in the subject — each followed in the log by the `feat`/`fix` commit that
  turned it green. The red-first claim is auditable from `git log` rather than asserted.
- **A house style, retrofitted.** `docs/06-code-standards.md` — 17 binding rules — was
  written in `c7144cb` and applied to the whole codebase in `d719685`. See below: the
  ordering was a mistake, and an instructive one.

## What was proven

Every number here comes from the refreshed evidence in `docs/evidence/phase-1/`,
measured on 2026-09-02 at commit `29727cc`, with every turbo task run under `--force`
so nothing was replayed from cache. The exit-criterion run at the end of this section is
the one exception, and says so: it was made against `29727cc` plus the one-line `prepare`
fix in `package.json`, uncommitted at the time.

**The code gate holds.**

| Check | Result |
|---|---|
| `turbo run lint typecheck --force` | 12/12 tasks, 0 cached, exit 0 (3.44s) |
| `turbo run build --force` | 4/4 tasks, 0 cached, exit 0 (2.305s) |
| `turbo run test --force` | 6/6 tasks, 0 cached, exit 0 — **630 tests across 82 files**, 0 skipped, 0 todo, 0 failed |
| `turbo run test:coverage --force` | 6/6 tasks, 0 cached, exit 0 |

Coverage, against an 80% floor declared in each package's `vitest.config.ts` (the
threshold fails the task, so the exit code *is* the gate):

| Package | Tests | Stmts % | Branch % | Funcs % | Lines % |
|---|---|---|---|---|---|
| `@snapscale/shared` | 168 | 100.00 | 100.00 | 100.00 | 100.00 |
| `@snapscale/otel` | 20 | 100.00 | 90.00 | 100.00 | 100.00 |
| `@snapscale/web` | 202 | 97.72 | 92.59 | 98.29 | 97.72 |
| `@snapscale/api` | 240 | 97.14 | 90.25 | 94.95 | 97.14 |

**The refactor cost no test.** Against the 2026-08-23 baseline at `f7d061a`: shared
71 → 168, otel 20 → 20, web 177 → 202, api 213 → 240; total 481 → 630. No package lost
a test, and `grep -rn "\.skip\|\.only\|\.todo"` across `apps`, `packages` and `e2e`
returns nothing.

**CI agrees.** GitHub Actions run `33417990918` on `29727cc` — lint, typecheck, build,
test, coverage — concluded `success`.

**Integrity holds.** Every commit in `main..HEAD` is authored by
`renanolovics@gmail.com`; zero AI-attribution lines anywhere in the history.

**The exit criterion, on the second attempt.** The Playwright journey verdict at HEAD is
**PASS — 2 of 2 tests green**, exit 0, run against `29727cc` plus the one-line `prepare`
fix in `package.json` (uncommitted at time of run). The first attempt executed **0 of the
2 tests**: the api image could not be built, so the stack never came up and
`playwright test` was never invoked — that regression is surprise 4 below, and it is the
most instructive thing in this document. Once `prepare` was made to tolerate a missing
husky the image built, all four services came up (`api`, `mailhog` and `postgres` healthy,
`web` up), and the full journey — request OTP, read the code out of MailHog, log in, create
an album, upload an image, process it, see the result — ran through a real browser against
the composed stack:

```
✓  1 [chromium] › tests/gallery-journey.spec.ts:83:1 › full gallery journey: OTP sign-in, album, upload, process, rendered result (777ms)
✓  2 [chromium] › tests/gallery-journey.spec.ts:182:1 › an invalid OTP code shows an error and does not authenticate (319ms)

  2 passed (2.5s)
```

That matters because `app.inject()` hands a request straight to Fastify's router, so
everything the journey uniquely covers — a real origin, a real socket, CORS and preflight,
compression, cookie flags, nginx serving the static bundle, the browser's own fetch of a
processed image — is structurally invisible to all 630 tests. Before this run the journey
had last executed on 2026-08-23 at `f7d061a`, fourteen commits and one 341-file refactor
ago, so "phase 1 works end to end" was an inference. It is now a measurement.

## What surprised

This is the section that carries the value, so it is written against `git log` rather
than from memory.

### 1. The mandated gate reported passing suites it had never executed

`turbo.json` declared `test` and `test:coverage` with no `dependsOn`, from the branch's
very first commit (`ee609b0`, 2026-08-23) until `51a7115` (2026-08-31) — the entire
implementation window. Without a `^build` edge, a change in `packages/shared` was not
part of `api#test`'s or `web#test`'s cache key, so turbo replayed both from cache. The
fix commit records the symptom verbatim:

> Without a `^build` edge, a change in `packages/shared` was not part of `api#test`'s or
> `web#test`'s cache key, so turbo replayed both from cache: the mandated gate reported
> 240 and 202 tests passing, in 16ms, without executing either suite. Reproduced by
> flipping one constant.

This is the most important thing phase 1 learned, and it is not about images. **Every
"gate green" claim made before `51a7115` is evidence of nothing** — a green tick that
was a cache hit, printing plausible counts for suites that never ran. It is also why the
refreshed evidence in this phase ran every turbo task with `--force` and recorded
`0 cached` for each: the cache is a performance feature and was silently being used as a
correctness claim. A verification command that can succeed without doing the work is not
a verification command.

### 2. The house style arrived after the code was "done"

`docs/06-code-standards.md` landed in `c7144cb` and was applied in `d719685`:
**341 files changed, 10,539 insertions, 7,789 deletions** — six commits after the PRD's
milestone table had already been edited to read *"complete — gate passed 2026-08-23"*
(`753f5ce`, which is nine commits behind HEAD). A rewrite of that size on a phase
declared finished is the exact opposite
of the plan's own claim that "phase 1 establishes the conventions; later phases mirror
phase 1". The conventions were extracted *from* the code and then imposed back *on* it.

It was not busywork — the refactor is where `packages/shared`'s value objects came from
(`Email`, `OtpCode`, `JwtToken`, `StorageKey`, entity ids: none of those folders existed
at `f7d061a`) and where rule 17's per-module folders replaced loose `envelope.test.ts`
beside `envelope.ts`. The changes to `packages/eslint-config` in that commit were purely
additive — 148 insertions, 2 deletions across `base.js`, `node.js` and `react.js` — so no
rule was weakened to let the retrofit pass. But the ordering cost a large diff on working
code, and it is the direct cause of surprises 3 and 6 below. The lesson for phases 2–9 is
the cheap one: the standard is now written, so conforming to it costs one review instead
of ten thousand lines.

### 3. The refactor commit shipped red on lint, and no CI run ever saw it

`d719685` introduced an `eslint-disable-next-line @typescript-eslint/max-params` inside
an `it.each` tuple array in `apps/web/src/services/http/http.test.ts` — placed on the
last array element, so the directive applied to the closing `])(` line, which violates
nothing, while the two-parameter case callback it was meant to excuse stayed unprotected.
Per the fix commit `29727cc`: *"Lint reported an unused directive and a real max-params
error at the same time."*

Three commits shipped in that state (`d719685`, `37d4ea8`, `43fde33`). The reason nobody
noticed is worth more than the typo: `gh run list` reports **exactly one CI run in this
repository's history** — run `33417990918`, on `29727cc`, the commit that fixed it. The
workflow was added in `43fde33`, one commit earlier, so no CI run has ever evaluated any
commit other than the fix itself. A pipeline introduced at the end of a phase lends
confidence about that phase's past which it did not earn.

An `eslint-disable` is a review finding, not a fix — and this one is a good argument for
why: it looked correct, it was placed one line away from correct, and lint said so in a
message nobody was reading yet.

### 4. The commit that tightened the local gate broke the deployable artefact — fixed

`37d4ea8` ("chore(git): gate commits with husky and lint-staged") added a `prepare` script
to the root `package.json` that runs `husky`. The api image's `prod-deps` stage runs
`pnpm install --frozen-lockfile --prod --filter=@snapscale/api...`; `--prod` excludes
devDependencies; `husky` is a devDependency. The stage died:

```
#60 4.291 . prepare$ husky
#60 4.295 . prepare: sh: 1: husky: not found
#60 4.295  ELIFECYCLE  Command failed.
#60 ERROR: process "/bin/sh -c pnpm install --frozen-lockfile --prod --filter=@snapscale/api..." did not complete successfully: exit code: 1
```

Reproduced twice, deterministically. Blast radius was the api image only — `web` builds
and tags fine, and the `migrate` service targets the dev-inclusive `build` stage, which
completed. `HUSKY=0` does **not** help: the shell fails to find the binary before husky
can read its own environment variable.

Two things about this are more interesting than the missing binary. First, a commit whose
entire purpose was *tightening quality* is what broke the one artefact that has to work
for the phase to be called done. Second, it survived three commits and a green CI run,
because `.github/workflows/ci.yml` runs lint → typecheck → build → test → coverage plus a
`docker info` probe — it never builds a container image and never runs the journey. The
workspace gate and the runtime artefact were being verified by different amounts of
nothing.

**The fix is one line**, in the root `package.json`: `"prepare": "husky"` became
`"prepare": "husky || true"`, which is the guard husky's own documentation gives for
installs that do not include husky. The alternative — `--ignore-scripts` on the
`prod-deps` stage — was considered and rejected: that same stage runs protobufjs's
`postinstall`, which arrives with the OTLP exporter, so suppressing all lifecycle scripts
would have traded one breakage for another. The obvious hazard of `|| true` is that husky
quietly stops installing everywhere, since failure is precisely what the guard swallows;
that was checked rather than assumed. With `core.hooksPath` unset, `pnpm prepare` restored
it to `.husky/_`, and `.husky/_/pre-commit` is present — the commit-time gate still
installs in a developer checkout, and only the prod-deps install, where husky is absent by
design, now degrades silently. The api image builds again and the journey passes; see
"What was proven".

What stays on the record is the shape of the failure rather than the size of the fix. A
one-line guard was all that stood between a green workspace gate and an undeployable
service, and nothing in the pipeline was looking.

### 5. Evidence that names an uncommitted file is not evidence

The 2026-08-23 run of the journey passed — and could not be repeated, because the compose
override that remapped the ports (to keep off the user's protected 3000/3001/5432) was
ad-hoc and was never committed. The one green run of the exit criterion existed only as
text. It is now `docker-compose.verify.yml` at the repo root, which is the sole reason
issue 4 above could be pinned to a reproducible command instead of argued about.

Related, and the same shape of mistake: the journey had not been run *at all* between
`f7d061a` (2026-08-23) and the 2026-09-02 verification — across the 341-file refactor,
the turbo cache fix, the husky commit and the CI addition. The one check that crosses a
real socket was the one check nobody re-ran.

### 6. ESLint 9 does not read `.gitignore`

`.gitignore` has excluded `playwright-report` and `test-results` since the branch's first
commit (`ee609b0`, 2026-08-23) — and ESLint 9's flat config does not read `.gitignore` at
all. It honours only its own `ignores` key, which until `d719685` listed `dist`,
`coverage`, `.turbo`, `node_modules` and `storybook-static` and nothing else. So nothing
excluded Playwright's generated report — 1.9 MB on disk in `e2e/playwright-report` right
now, minified vendor `.js` bundles included — from the lint run, and whether lint had
anything to say depended on whether an e2e run had happened on that machine. `d719685`
added the two missing entries, with the reason recorded inline in
`packages/eslint-config/base.js`:

> Playwright's generated report and traces: minified vendor bundles whose contents change
> on every e2e run, so linting them makes the result state-dependent.

A lint result that depends on which files happen to be on disk is a third instance of the
same theme as items 1 and 4: a check that reports on something other than the thing it
claims to check.

### 7. The first file-serving design leaked a full-authority credential into the URL

`<img src>` cannot carry an `Authorization` header, so something had to go in the query
string. What shipped first was the 1h session token — a full-API-authority credential —
and pino logs request URLs, so it landed in structured logs and in browser history. The
correction (`4878e1a` → `81b8fb5` → `ea4e714`, recorded as `05-decision-log.md` #18) was a
second JWT scoped `scope: 'file'`, 60-second expiry, carrying only `sub`, with neither
guard accepting the other's scope and `?token=` redacted from request logs. The surprise
is not the mistake; it is that "just put the token in the URL" reads as harmless until you
name what the token can do.

## Open items

**The phase's Definition of Done is met.** Against the checklist in
`04-implementation-plan.md`:

| DoD item | State |
|---|---|
| All phase tasks complete; `turbo run test` green | met — all 12 plan tasks landed; 630 tests green |
| Coverage ≥ 80% lines on every app/package touched | met — 97.14% lines is the lowest package figure |
| Lint + typecheck green | met — 12/12 turbo tasks, exit 0 |
| Exit-criterion evidence committed to `docs/evidence/phase-1/` | met — `e2e-compose-run.txt` records the journey passing 2/2 under `docker compose`, alongside the regression that blocked it first |
| Phase report (what was proven, what surprised) | met by this file |

`status` in this file's frontmatter is therefore `done`. The run it rests on is `29727cc`
plus the one-line `prepare` fix in `package.json`, uncommitted at the time of the run and
belonging to whoever owns that file; the phase is done when that line is committed, not
before.

**Carried into phase 2 and beyond:**

- **CI has no container step.** `.github/workflows/ci.yml` must build the images and,
  ideally, run the journey through `docker-compose.verify.yml`. Without it, the next
  phase inherits exactly the blind spot that let surprise 4 live for three commits — and
  the same `--prod` install pattern, lifecycle scripts included, is copied into every
  service Dockerfile from phase 3 onward.
- **Two documents still disagree about phase 1's status, and neither is right.**
  `docs/01-prd.md`'s milestone table reads "complete — gate passed 2026-08-23", which
  points at a nine-commit-old run made before the 341-file refactor;
  `04-implementation-plan.md`'s closing status line still says verification is in
  progress. The current answer — gate green and exit criterion met on 2026-09-02 — is in
  neither. One edit each, by whoever owns them.
- **Node version drift.** The repo declares `engines.node: 22.x`; the verification ran
  on `v24.18.1`, and every pnpm command printed
  `WARN Unsupported engine` and passed anyway. Flagged, not diagnosed.
- **Thinnest coverage.** `apps/api/src/services/image-processing/image-processing.ts` at
  84.32% statements / 82.6% branches is the weakest real file in the workspace — above
  the floor, and it is the exact code phase 3 extracts, so it is worth strengthening
  before it moves rather than after.
- **No load has been applied to anything.** The claim that `/images/process` degrades its
  neighbours is, at the end of phase 1, an argument from first principles. Proving it is
  phase 2's job, and the reason phase 2 exists.
