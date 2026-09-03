# Phase 1 — Findings

Recorded 2026-09-02 against `29727cc`. Scope: what the verification and E2E evidence in
this folder actually establishes. The phase narrative lives in the phase report; this is
the short version a reader needs before trusting the numbers.

**What phase 1 proved.** The monolith's code gate holds at HEAD, measured rather than
assumed: 630 tests across 82 files, all green, with coverage above the 80% floor on every
dimension of every workspace project that has tests (shared and otel at 100% lines, web
97.72%, api 97.14%), and lint, typecheck and build clean across all seven workspace
projects. The house-standards refactor in `d719685` touched 341 files and cost no test:
shared went 71 -> 168, web 177 -> 202, api 213 -> 240, otel held at 20, and nothing is
skipped, `only`-ed or `todo`-ed anywhere in the tree. The api's integration tests still
stand up real Postgres and real MailHog through Testcontainers, so "the query works" is a
claim about a database rather than about a mock. The exit criterion holds too, but only
after a defect had to be found and fixed first — see below.

**What surprised.** The api's runtime image could not be built at HEAD, and the breakage
had gone unnoticed for three commits. `37d4ea8` added a root `prepare` script that runs
husky; the api image's `prod-deps` stage installs with `--prod`, which excludes
devDependencies, so `husky` is not on PATH and the stage died with
`sh: 1: husky: not found`. A commit whose entire purpose was tightening the local commit
gate is what broke the deployable artefact — and CI stayed green throughout, because the
workflow runs lint, typecheck, build, test and coverage but never builds an image and
never runs the journey. It is fixed: `prepare` is now `"husky || true"`, the guard husky
documents for installs that do not include it. `--ignore-scripts` was rejected, because the
same stage runs protobufjs's `postinstall` from the OTLP exporter and would have broken
differently. The guard does not disable the hooks it swallows the failure of — with
`core.hooksPath` unset, `pnpm prepare` restores it to `.husky/_`. The second surprise is
procedural and cost more than it should have: the 2026-08-23 evidence recorded a compose
invocation whose override file was never committed, so the one previously-passing run of
the exit criterion could not be repeated at all. That override now exists as
`docker-compose.verify.yml`, which is the only reason this failure could be pinned to a
reproducible command rather than argued about. Evidence that names an uncommitted file is
not evidence.

**What is still open.** The exit criterion is met: with the fix in place the stack came
up and the two journey tests in `e2e/tests/gallery-journey.spec.ts` ran and passed 2/2
against `29727cc` plus the one-line `prepare` fix (uncommitted at time of run) — the first
time they had executed since `f7d061a`, fourteen commits and one large refactor ago. They
remain the only check in the project that crosses a real origin and a real socket:
`app.inject()` hands a request straight to the router, so CORS, preflight, compression,
cookie flags, nginx's static serving and the browser's own fetch of a processed image are
structurally invisible to all 630 tests. What is still open is why nobody noticed. CI needs
a step that builds the images and runs the journey, or the next phase inherits exactly this
blind spot — a green pipeline that has never seen the artefact it ships. Every service
added from phase 3 onward copies this Dockerfile pattern, so the `--prod` install and its
lifecycle-script hazard get duplicated each time.
