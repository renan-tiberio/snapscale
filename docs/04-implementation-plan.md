# Plan: SnapScale — Image Gallery Scaling Lab

**Source PRD**: `docs/01-prd.md`
**Selected Milestones**: all 8 (project-level plan; one section per phase)
**Complexity**: Large

## Summary

Build an image-gallery monolith with a deliberately CPU-heavy route, prove with metrics
which route degrades the system, extract it into a real microservice, then autoscale it
on local Kubernetes — one branch per phase, TDD throughout. Architecture rationale lives
in `02-architecture.md`; stack choices and conventions live in `03-technical-design.md`.
This document is the task breakdown only.

## Patterns to Mirror

Greenfield repository — no existing code to mirror. All conventions (naming, error
handling, logging, data access, test layout) are defined in `03-technical-design.md`
and become the reference for every subsequent phase. Phase 1 establishes them; later
phases mirror phase 1.

## Global Conventions

### Branch-per-phase workflow

- Each phase lives on its own branch, created from the **previous phase's final state**:
  `main` → `phase-1-monolith` → `phase-2-observability` → `phase-3-microservice` →
  `phase-4-autoscaling` → `phase-5-queue` → `phase-6-data-sync` → `phase-7-resilience` →
  `phase-8-cache` → `phase-9-gateway`.
- A phase is merged forward only when its Definition of Done is met. Branches are never
  deleted — the repo history is the deliverable.
- All commits authored by the user only; no automated commits or pushes without explicit
  user go-ahead.

### TDD cycle (every task that produces behavior)

1. Write the test — run it — it **must fail** (a test born green is deleted, not kept).
2. Implement the minimum to pass.
3. Refactor with the test green.
4. Asserts target observable behavior (HTTP responses, DB rows, emails in MailHog,
   pixels/dimensions of processed images) — never internals. No `expect` inside
   conditionals. Error tests assert type/message, not just "throws".

### Definition of Done (every phase)

- [ ] All phase tasks complete; `turbo run test` green.
- [ ] Coverage ≥ 80% lines on every app/package touched (`@vitest/coverage-v8`
      threshold fails the run — not honor-system).
- [ ] Exit-criterion evidence committed to `docs/evidence/phase-N/` (screenshot, k6
      summary, trace export, or `kubectl` capture + a short `findings.md`).
- [ ] Phase report appended to the phase's docs (what was proven, what surprised).
- [ ] Lint + typecheck green (`turbo run lint typecheck`).

### Host port map (avoids the user's protected ports 3000/3001/5432)

| Service | Host port |
|---|---|
| apps/api | 4000 |
| apps/web (Vite) | 5173 |
| apps/image-processor | 4100 |
| Postgres (gallery) | 5433 |
| Postgres (processor, phase 3+) | 5434 |
| MailHog SMTP / UI | 1025 / 8025 |
| Prometheus | 9090 |
| Grafana | 3300 |
| Jaeger UI | 16686 |

---

## Phase 1 — Monolith (`phase-1-monolith`)

**Goal**: Gallery works end-to-end locally: OTP login via MailHog, albums, upload,
heavy `sharp` process route — one API, one DB, one compose file.
**Exit criterion**: Playwright E2E passes the full journey (request OTP → read code from
MailHog → login → create album → upload image → process image → see result) against
`docker compose up`.

### Files to create

| File | Action | Why |
|---|---|---|
| `turbo.json`, `pnpm-workspace.yaml`, root `package.json`, `.gitignore`, `.nvmrc` | CREATE | Monorepo skeleton |
| `packages/tsconfig/*`, `packages/eslint-config/*` | CREATE | Shared strict TS + lint config |
| `packages/shared/src/*` | CREATE | Zod schemas, API contracts, shared types |
| `packages/otel/src/*` | CREATE | OTel SDK bootstrap (console exporter for now) |
| `apps/api/src/*` | CREATE | Fastify monolith: auth, albums, images, process |
| `apps/api/migrations/*` | CREATE | users, otp_codes, albums, images tables |
| `apps/web/src/*` | CREATE | React + Vite front (atomic components + hooks/services/context/utils): OTP login, gallery, upload |
| `apps/web/.storybook/*` | CREATE | Storybook for the `shared/ui` kit |
| `docker-compose.yml` | CREATE | postgres, mailhog, api, web |
| `apps/*/Dockerfile` | CREATE | One image per app from day 1 |
| `e2e/*` (Playwright) | CREATE | Full-journey spec |

### Tasks

1. **Scaffold monorepo** — Turborepo + pnpm workspaces + shared tsconfig/eslint
   packages (flat config: `base`/`react`/`node` presets), root Prettier +
   `prettier-plugin-tailwindcss`, `@/`→src and `~/`→app-root aliases in every app;
   empty `apps/api`, `apps/web` wired into the pipeline.
   *Validate*: `pnpm install && turbo run lint typecheck` exits 0; a fixture file with
   an inline `style=` prop and a `../../` import fails lint (proof both rules bite).
2. **Infra up** — compose with Postgres (host 5433) + MailHog; healthchecks on both.
   *Validate*: `docker compose up -d && docker compose ps` shows both healthy;
   `curl localhost:8025/api/v2/messages` returns JSON.
3. **Contracts first** — `packages/shared`: zod schemas for auth, album, image, process
   request/response. Red-first unit tests on edge cases (invalid email, oversized
   payloads).
   *Validate*: `turbo run test --filter=shared` — tests failed before implementation,
   pass after (both states shown in commit history).
4. **API skeleton** — Fastify app factory, env validation (zod, fail-fast at boot),
   `/health` route, error handler envelope, pino logger; `fastify-type-provider-zod` +
   `@fastify/swagger` + swagger-ui serving OpenAPI at `/docs` from the shared schemas.
   *Validate*: red-first test `GET /health → 200 {status:"ok"}`; boot with a missing
   env var exits non-zero with a clear message; `/docs/json` returns a spec containing
   every registered route.
5. **DB layer** — migration runner + repository pattern for users/albums/images.
   Integration tests run against the real compose Postgres (no mocked DB).
   *Validate*: `turbo run test:integration --filter=api` green; migrations are
   re-runnable (idempotent up on a fresh volume).
6. **OTP auth** — `POST /auth/request-otp` (create code, email it via nodemailer →
   MailHog), `POST /auth/verify-otp` (exchange code for token). Codes: single-use,
   expiring, rate-limited per email.
   *Validate*: integration test asserts the email physically arrives in MailHog
   (`GET :8025/api/v2/messages`), extracts the code, exchanges it, and gets 401 on
   reuse and on expiry. All red-first.
7. **Auth guard** — Fastify hook validating the token; applied to album/image routes.
   *Validate*: red-first tests: no token → 401; valid → 200; tampered → 401.
8. **Albums + images CRUD** — albums CRUD, image upload (multipart → local volume),
   image metadata rows, list per album.
   *Validate*: integration tests cover create/list/get/delete + upload happy path and
   rejection paths (wrong mime, too large).
9. **Heavy route** — `POST /images/:id/process` with `sharp` (resize + filter presets
   from `packages/shared`). Synchronous on purpose — this is the future culprit.
   *Validate*: red-first test with a small fixture image asserts output dimensions +
   format; a concurrency smoke test (10 parallel calls) documents baseline latency in
   the test output.
10. **OTel bootstrap** — `packages/otel` wired into api boot (auto-instrumentation
    http/fastify/pg, console/OTLP exporter behind env flag; no backends yet).
    *Validate*: dev run logs spans for one request; disabling via env produces none.
11. **Frontend** — React + Vite with **React Compiler enabled**; folders:
    `components/` (atomic design, each component a folder:
    component/types/story/test/index, Storybook), `pages/`, `hooks/` (+
    `hooks/queries/`: TanStack hooks per domain — `useUser`, `useAlbums`, `useImages`,
    `useProcessImage`), `context/`, `services/` (axios `http.ts` + per-domain API
    functions), `utils/`; Tailwind v4 — screens: OTP login, album grid, upload,
    "process" with preset picker; Testing Library tests (behavior: form flows, error
    states).
    *Validate*: `turbo run test --filter=web` green with ≥80% coverage;
    `storybook build` succeeds; lint proves: inline style fails, component importing
    `services/` fails, bare `useQuery` in a page fails; React Compiler active in the
    Vite build (plugin listed, dev overlay shows compiled components).
12. **E2E + coverage gate** — Playwright full journey (reads OTP from MailHog HTTP
    API); coverage thresholds (80%) turned on for api, web, shared — build fails below.
    *Validate*: `turbo run e2e` green against compose; deliberately dropping a test
    file makes the coverage gate fail (proof the gate bites).

### Phase risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| sharp native install friction in Docker (arm64 mac) | Medium | Pin sharp version; use official node:22 slim base; document platform flag |
| OTP flow scope-creeps into full auth product | Medium | Single method (email OTP), single session shape; refresh tokens out of scope |
| Coverage gate gamed by shallow tests | Medium | Red-first discipline + reviewer agent checks assert quality per task |

---

## Phase 2 — Observability (`phase-2-observability`)

**Goal**: Make the invisible visible — dashboards prove `/images/:id/process` is the
route degrading everything.
**Exit criterion**: Grafana dashboard (screenshot in `docs/evidence/phase-2/`) shows,
under k6 mixed load: process-route p95 exploding, CPU saturated, and *other* routes'
latency dragged down with it; `findings.md` names the culprit with numbers.

### Files to create

| File | Action | Why |
|---|---|---|
| `infra/prometheus/prometheus.yml` | CREATE | Scrape api `/metrics` |
| `infra/grafana/provisioning/*` | CREATE | Datasource + dashboard as code |
| `k6/baseline.js`, `k6/mixed.js` | CREATE | CRUD-only vs CRUD+process scenarios |
| `packages/otel` (extend) | UPDATE | Prometheus metrics exporter |
| `docker-compose.yml` | UPDATE | prometheus, grafana services |

### Tasks

1. **Metrics endpoint** — OTel metrics pipeline → Prometheus exporter on api
   (`/metrics`): http duration histogram by route/method/status, process-duration
   histogram, Node runtime metrics.
   *Validate*: red-first test: after one request, `/metrics` exposes
   `http_server_request_duration` labeled with the route.
2. **Prometheus service** — scrape config for api.
   *Validate*: `curl :9090/api/v1/targets` shows target `up`.
3. **Grafana as code** — provisioned datasource + dashboard JSON: RPS, p50/p95/p99 per
   route, error rate, event-loop lag, CPU/memory.
   *Validate*: `docker compose up`, dashboard renders with live data — no clicking
   around to rebuild it.
4. **k6 scenarios** — `baseline.js` (CRUD only) and `mixed.js` (CRUD + process at
   realistic ratio), ramp-up stages, thresholds exported to JSON summary.
   *Validate*: both run clean against compose; summaries land in
   `docs/evidence/phase-2/`.
5. **The experiment** — run baseline, then mixed; capture dashboards; write
   `findings.md`: what saturated, what degraded collaterally, why (event loop +
   CPU-bound work in-process).
   *Validate*: findings show baseline p95 healthy vs mixed p95 degraded **on routes
   that don't process images** — the collateral-damage proof.
6. **Docs** — phase report: how each tool answered its question (Prometheus: what/how
   much; Grafana: seeing it; k6: repeatable load).
   *Validate*: report committed with evidence links.

### Phase risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Load numbers too small to visibly degrade (fast machine) | Medium | Tune image size/preset cost + k6 VUs until degradation is unmistakable; document the knobs |
| Dashboard built by clicking, lost on volume wipe | Medium | Provisioning-as-code only; UI edits must be exported back to JSON |

---

## Phase 3 — Microservice extraction (`phase-3-microservice`)

**Goal**: `image-processor` becomes a true microservice — own DB, own container, own
lifecycle — and Jaeger shows one trace crossing both services.
**Exit criterion**: Jaeger screenshot of a single trace `api → image-processor → sharp`
committed; kill test proves gallery survives processor death.

### Files to create

| File | Action | Why |
|---|---|---|
| `apps/image-processor/src/*` | CREATE | Fastify service: process endpoint, job records |
| `apps/image-processor/migrations/*` | CREATE | Own DB: processing_jobs table |
| `apps/image-processor/Dockerfile` | CREATE | Own image |
| `packages/shared` (extend) | UPDATE | api↔processor contract (zod) |
| `infra/` + `docker-compose.yml` | UPDATE | processor + processor-postgres (5434) + jaeger |
| `apps/api/src/*` | UPDATE | Replace in-process sharp with HTTP client call |

### Tasks

1. **Contract first** — zod contract for api↔processor in `packages/shared`; red-first
   contract tests on both sides (api client + processor handler share the schema).
   *Validate*: incompatible payload fails both sides' tests identically.
2. **Processor service** — Fastify app mirroring phase-1 conventions; port 4100; own
   Postgres (5434) with `processing_jobs` (id, source ref, preset, status, timings).
   *Validate*: red-first integration tests against its own DB only — zero imports from
   `apps/api`, zero connections to gallery DB (enforced by env: it never receives
   gallery DB creds).
3. **Move the heavy code** — sharp logic + its tests migrate from api to processor; api
   route becomes an HTTP call to the processor.
   *Validate*: phase-1 E2E journey still green end-to-end, unchanged from the outside.
4. **Failure mode** — processor down → api returns 503 envelope with a friendly
   message; CRUD routes unaffected.
   *Validate*: automated test: stop processor container, process returns 503, album
   CRUD suite stays green — the isolation proof.
5. **Distributed tracing** — Jaeger in compose; OTel trace pipeline on in both apps;
   W3C trace-context propagated on the api→processor call.
   *Validate*: one E2E process request produces one trace in Jaeger with spans from
   both services (asserted via Jaeger HTTP API, plus screenshot for evidence).
6. **Per-route dashboards split** — Grafana gains processor panels (its own RPS/p95/CPU).
   *Validate*: mixed k6 run shows load shifting to processor panels; api p95 for CRUD
   recovers vs phase-2 findings.
7. **Evidence + report** — trace screenshot, kill-test output, before/after latency
   comparison in `findings.md`.
   *Validate*: committed to `docs/evidence/phase-3/`.

### Phase risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hidden coupling (shared types drift into shared state) | Medium | Only `packages/shared` contracts cross the boundary; DBs and volumes are disjoint; test asserting processor has no gallery-DB env |
| Sync HTTP call just moves the bottleneck | High (expected!) | That's the phase-4/5 lesson — document it in findings, don't fix it here |

---

## Phase 4 — Autoscaling (`phase-4-autoscaling`)

**Goal**: Everything runs on local Kubernetes (k3d); HPA scales the processor with load
and back down after.
**Exit criterion**: Captured `kubectl get hpa -w` timeline + Grafana pod-count panel
showing 1→N→1 during a k6 run, in `docs/evidence/phase-4/`.

### Files to create

| File | Action | Why |
|---|---|---|
| `infra/k3d/cluster.sh` (or config yaml) | CREATE | Reproducible cluster + local registry |
| `k8s/base/*` | CREATE | Deployments/Services/ConfigMaps/Secrets for api, web, processor, both postgres, mailhog, prometheus, grafana, jaeger |
| `k8s/hpa/processor.yaml` | CREATE | CPU-based HPA, min 1 / max N |
| `Makefile` or `scripts/*` | CREATE | build → push → deploy loop |

### Tasks

1. **Cluster bootstrap** — k3d cluster script with local registry; images built and
   pushed by script.
   *Validate*: fresh-machine run: one command → cluster up, images pushed.
2. **Manifests** — all services as k8s manifests; resource requests/limits everywhere
   (requests are what HPA math uses); Secrets for DB creds.
   *Validate*: `kubectl get pods` all Running/Ready; E2E journey green against the
   cluster ingress/port-forward.
3. **metrics-server + HPA** — HPA on processor: CPU target, min 1, max 5 (tune to the
   machine); stabilization windows set consciously.
   *Validate*: `kubectl get hpa` reports live CPU percentage (not `<unknown>`).
4. **Scale experiment** — k6 mixed load against the cluster; record HPA timeline and
   pod count; then stop load and record scale-down.
   *Validate*: evidence shows scale-out under load and scale-in after cooldown;
   `findings.md` explains the HPA formula with the observed numbers.
5. **Observability parity** — Prometheus scrapes pods (kubernetes_sd or annotations);
   Grafana dashboards work as before plus pod-count panel.
   *Validate*: same dashboards, now per-pod; no manual rebuild.
6. **Report** — what ECS Service Auto Scaling would look like for the same thing;
   mapping table AWS-concept → k8s-concept.
   *Validate*: committed report.

### Phase risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mac resources exhausted (full stack + N pods) | High | Tight requests/limits; max replicas small; observability retention minimal; document minimum RAM |
| HPA flapping on spiky CPU | Medium | Stabilization windows + documented tuning — flapping itself is a lesson, capture it |

---

## Phase 5 — Queue (`phase-5-queue`) — coarser grain

**Goal**: Processing becomes async via a queue; scaling driven by queue depth, not CPU.
**Exit criterion**: Evidence that jobs queue up under burst, workers drain them, and
scaling reacts to backlog (not CPU); user-facing flow becomes submit → poll/notify.

Decision already made (PRD, 2026-08-23): **RabbitMQ** — broker semantics exposed (ack,
prefetch, redelivery, DLQ), native Prometheus plugin for queue depth, AMQP stays
language-agnostic. Scaling signal also decided: **KEDA** (`ScaledObject` on the
RabbitMQ queue, scale-to-zero enabled) — see PRD open questions.

Tasks (outline): ADR queue decision → contract: job submission
returns job id, status endpoint (red-first) → producer in api, consumer in processor →
frontend polling UX → expose queue-depth metric → queue-depth-driven autoscaling →
burst-load experiment + evidence.

Risks: exactly-once illusions (embrace at-least-once + idempotent jobs, keyed by
content hash); KEDA adds a new controller to learn.

---

## Phase 6 — Data sync (`phase-6-data-sync`) — coarser grain

**Goal**: Data replicated across service DBs stays consistent through outages — one
owner per record, event-fed replicas, no distributed transactions.
**Exit criterion**: Recovery experiment recorded: gallery consumer killed → 50 images
processed → gallery still serves reads (briefly stale) → consumer restarted → backlog
drains, replicas converge; evidence proves zero loss and zero stale overwrites
(version checks), duplicate deliveries visibly deduped.

Decision already made (PRD, 2026-08-23): **transactional outbox + idempotent, versioned
consumers** over RabbitMQ. CDC (Debezium), plain dual-write, and read-time API calls
rejected — see `05-decision-log.md`.

Tasks (outline): ADR data-ownership map (who owns what, what is replicated where) →
outbox table + same-transaction write in processor (red-first: crash between DB write
and publish loses nothing) → relay: outbox → RabbitMQ, marks published, at-least-once →
`processed_events` idempotency ledger + version-gated upsert in api (red-first: replay
same event twice, apply out-of-order event — both no-ops) → replica-backed `GET /images`
(no processor call on read) → kill/recover experiment + convergence evidence in
Grafana (outbox lag, consumer backlog panels).

Risks: outbox relay ordering across aggregates (order per aggregate id only — document);
replica read-your-writes gaps confusing the UI (surface "processing…" state, embrace
eventual consistency as UX).

---

## Phase 7 — Resilience (`phase-7-resilience`) — coarser grain

**Goal**: Processor outage never takes the gallery down.
**Exit criterion**: Chaos test (kill processor pods mid-load) recorded: CRUD E2E stays
green, queued jobs survive and complete after recovery, breaker state visible in
metrics.

Tasks (outline): timeout budget on every cross-service call (red-first) → retry with
backoff + jitter on transient failures only → circuit breaker (decide: `opossum` vs
hand-rolled — ADR) → breaker state as OTel metric + Grafana panel → dead-letter
handling for poisoned jobs → chaos experiment + evidence.

Risks: retries amplifying load (cap + jitter); breaker thresholds guessed wrong (tune
from phase-5 numbers, document).

---

## Phase 8 — Cache (`phase-8-cache`) — coarser grain

**Goal**: Repeat processing served from Redis; load visibly collapses.
**Exit criterion**: Grafana before/after: same k6 scenario, cache-hit ratio panel high,
processor CPU and queue depth collapse; evidence committed.

Tasks (outline): cache key = content hash(image bytes + preset) (red-first unit tests)
→ Redis in compose/k8s → read-through cache in processor → hit/miss OTel metrics +
panel → TTL/eviction policy documented → rerun phase-5 burst scenario + evidence.

Risks: caching hides the very load the lab studies (keep a `nocache` flag for demos);
stale results after preset changes (version the key).

---

## Phase 9 — Gateway (`phase-9-gateway`) — coarser grain

**Goal**: Auth extracted to its own service; a gateway fronts everything (routing, rate
limit, central token validation).
**Exit criterion**: All E2E journeys pass through the gateway only (direct service
ports closed off in k8s); rate-limit demo + token-validation-at-edge trace committed.

Decision already made (PRD, 2026-08-23): **hand-rolled gateway** (`apps/gateway`,
Fastify + `fastify-reply-from`). ADR at phase start records the rationale.

Tasks (outline): ADR gateway decision → extract `apps/auth` (own DB, owns
users/otp tables — migration reuses the phase-6 outbox/replication machinery) →
gateway routes `/auth/*`, `/api/*` → token
validation at the edge, services trust gateway-injected identity → rate limiting with
429 evidence → network policy: services unreachable except via gateway → full E2E +
trace across gateway→api→processor + evidence.

Risks: auth extraction touches every request path (feature-flag the cutover); gateway
becomes a new single point of failure (note HA options, accept locally).

---

## Validation (global)

```bash
# Every phase, before merge:
pnpm install
turbo run lint typecheck
turbo run test              # unit + integration, coverage ≥ 80% enforced
turbo run e2e               # Playwright journey against the running stack

# Phases 1–3 (compose):
docker compose up -d --build && docker compose ps

# Phase 2+: load
k6 run k6/mixed.js --summary-export docs/evidence/phase-N/k6-summary.json

# Phase 4+ (cluster):
./infra/k3d/cluster.sh up && kubectl get pods
kubectl get hpa -w          # during load experiments
```

## Acceptance

- [ ] All 8 phases meet their exit criterion with committed evidence.
- [ ] Every phase branch preserved; history tells the evolution story.
- [ ] Coverage ≥ 80% front and back on every phase branch (gate-enforced).
- [ ] Every test born red — no false positives (spot-checked by review agents per phase).
- [ ] Conventions defined once in `03-technical-design.md`, mirrored everywhere.
- [ ] Open questions from the PRD resolved by ADRs at their phase start, never earlier.

---
*Status: DRAFT.*

**WAITING FOR CONFIRMATION** — no code is written until this plan is approved.
Reply with approval, `modify: <changes>`, or a different approach.
