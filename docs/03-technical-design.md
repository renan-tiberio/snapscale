# SnapScale — Technical Design

> How each piece is built. Derives from `00-initial-idea.md` (vision) and `01-prd.md`
> (requirements). Component relationships and topology live in `02-architecture.md`;
> phase-by-phase tasks live in `04-implementation-plan.md`.
> Choices already made at kickoff are documented as-is; choices this document adds are
> listed in [Decisions introduced here](#decisions-introduced-here). Genuinely open
> choices are marked **decide at phase N**, matching the PRD's Open Questions.

## 1. Stack

| Layer | Choice | Version | Role |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | All services. Bun rejected at kickoff: OTel auto-instrumentation depends on Node internals |
| Language | TypeScript | 5.x, `strict: true` | Everywhere, including k6 scripts (transpiled) |
| API framework | Fastify | 5.x | `apps/api`, `apps/image-processor` (phase 3), `apps/auth` (phase 9) |
| Validation | zod | 3.x | All boundaries: env, request bodies, queue payloads |
| Logging | pino | 9.x | Structured JSON logs; Fastify's native logger |
| Image processing | sharp | 0.33+ | The deliberately heavy dependency |
| Frontend | React + Vite | 19 / 7 | `apps/web` |
| Compiler | React Compiler (`babel-plugin-react-compiler`) | latest | `apps/web` — auto-memoization; manual `useMemo`/`useCallback` becomes lint-flagged noise |
| Server state | TanStack Query | 5.x | Fetching/caching; no client state library — not needed |
| Database | PostgreSQL | 16 | One instance per service (hard rule from phase 3 on) |
| DB access | Drizzle ORM + drizzle-kit | latest | See [Decisions introduced here](#decisions-introduced-here) |
| Email (local) | MailHog + nodemailer | latest | SMTP `:1025`, inbox UI + REST API `:8025` |
| Instrumentation | OpenTelemetry JS SDK | 1.x / SDK 0.5x | Metrics + traces from day 1, shared via `packages/otel` |
| Metrics exposure | `@opentelemetry/exporter-prometheus` | latest | `/metrics` on `:9464` per service — see decisions |
| Metrics store | Prometheus | latest | Phase 2+ |
| Dashboards | Grafana | latest | Phase 2+, provisioned as code |
| Tracing UI | Jaeger (all-in-one) | latest | Phase 3+, ingests OTLP natively |
| Load generation | k6 | 1.x | Phase 2+ |
| Unit/integration tests | Vitest + `@vitest/coverage-v8` | 3.x | Back and front |
| Component tests | Testing Library | latest | `apps/web` |
| E2E | Playwright | 1.5x | OTP flow, upload flow |
| Integration DB | Testcontainers | latest | See decisions |
| Monorepo | Turborepo + pnpm | 2.x / 10.x | Task graph + caching |
| Containers | Docker Compose | v2 | Phases 1–3 |
| Orchestration | k3d + metrics-server | latest | Phase 4+ |

## 2. Monorepo layout

```
snapscale/
├── apps/
│   ├── web/                  # React + Vite frontend
│   ├── api/                  # Fastify monolith (gallery, auth until phase 9, process route until phase 3)
│   ├── image-processor/      # born phase 3 — extracted heavy route
│   └── auth/                 # born phase 9 — extracted auth + gateway phase
├── packages/
│   ├── shared/               # zod schemas, API types, error codes — the contract package
│   ├── otel/                 # instrumentation bootstrap (NodeSDK wrapper), one import per service
│   ├── tsconfig/             # base tsconfig presets (base, node, react)
│   └── eslint-config/        # shared lint rules
├── infra/                    # born phase 2 — empty in phase 1
│   ├── prometheus/           # prometheus.yml (scrape configs) — phase 2
│   ├── grafana/              # provisioning/ (datasources, dashboards) + dashboards/*.json — phase 2
│   ├── k6/                   # load scenarios — phase 2
│   └── k8s/                  # born phase 4 — manifests (kustomize overlays per phase)
├── docker-compose.yml        # repo root — not `infra/compose/`; single file, no profiles (phase 1, what shipped)
├── docs/
└── turbo.json
```

Rules:

- `packages/shared` is the only cross-service contract. Services never import each
  other's code; they share schemas/types only. This keeps extraction honest (phase 3):
  moving a route = moving handlers + copying the contract import, nothing else.
- `packages/otel` exports `startTelemetry({ serviceName })`, imported first thing in
  every service entrypoint. Resource attributes: `service.name`, `service.version`,
  `deployment.environment=local`.

### Turborepo pipeline

| Task | dependsOn | Cached | Notes |
|---|---|---|---|
| `build` | `^build` | yes | tsc/Vite; packages build before apps |
| `typecheck` | `^build` | yes | `tsc --noEmit` |
| `lint` | — | yes | eslint |
| `test` | — | yes | Vitest unit + integration; cache keyed on sources |
| `test:coverage` | — | yes | Vitest with thresholds; **fails below 80%** |
| `test:e2e` | `build` | no | Playwright against the compose stack |
| `dev` | — | no (persistent) | tsx watch / Vite dev server |

### Lint & format (all packages)

- ESLint **flat config** lives in `packages/eslint-config` with three exports: `base`
  (TS strict, import ordering, no-console, no relative `../../` climbing — aliases
  exist for that), `react` (extends base: `eslint-plugin-react`,
  `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`,
  `@tanstack/eslint-plugin-query`, `eslint-plugin-storybook`), and `node` (extends
  base: Node/Fastify service rules). Apps consume a preset and may add **app-local
  rules in their own `eslint.config.js`** — app-specific rules never leak into the
  shared package.
- **Prettier** configured once at the repo root; `prettier-plugin-tailwindcss` sorts
  Tailwind classes automatically in `apps/web`.
- **Inline styles are banned** in web: `react/forbid-dom-props` +
  `react/forbid-component-props` deny the `style` prop; styling is Tailwind classes
  only. Lint fails the build (turbo `lint` task), so the rule bites.

### Path aliases (every app)

| Alias | Resolves to | Use for |
|---|---|---|
| `@/*` | `<app>/src/*` | all source imports |
| `~/*` | `<app>/*` (app root) | config files, test fixtures, assets outside `src` |

Declared in each app's tsconfig `paths` + bundler resolve (Vite / tsx / Vitest).
Cross-app imports never use aliases — they go through workspace package names
(`@snapscale/shared`), keeping service boundaries visible.

### Frontend architecture (`apps/web`) — atomic components + conventional folders

Optimized for one thing: **anyone opens the repo and knows where everything lives.**

```
src/
├── components/     # atomic design — the FULL hierarchy, pages included
│   ├── atoms/
│   ├── molecules/
│   ├── organisms/
│   └── pages/      #   route-level components (React Router targets), one folder per route
│       └── Login/  #   Login.tsx + Login.types.ts + Login.test.tsx + index.ts
├── hooks/          # ALL reusable React logic, including TanStack Query hooks
│   ├── queries/    #   one hook per domain: useUser, useAlbums, useImages, useProcessImage
│   └── ...         #   generic hooks: useDebounce, useDisclosure, …
├── context/        # React contexts + providers (auth session, app providers)
├── services/       # how we talk to the world: axios instance + per-domain API functions
│   ├── http.ts     #   axios config: baseURL, auth interceptor, envelope unwrap
│   └── user.ts     #   getUser(), updateUser() — plain typed functions, no React
├── utils/          # pure helpers — no React, no IO
└── router.tsx / main.tsx
```

`pages/` lives **inside** `components/` because this is React Router, not Next: there
is no filesystem routing, so a page is just the top of the atomic hierarchy
(atoms → molecules → organisms → pages). Each route gets its own folder with the same
split-file anatomy as any component — page code and its test never sit loose side by
side in a shared folder. Stories are optional for pages (they exist for the kit,
mandatory atoms→organisms).

- **React Compiler on** (Vite + `babel-plugin-react-compiler`): memoization is
  automatic — manual `useMemo`/`useCallback`/`React.memo` only with a comment
  justifying it; `eslint-plugin-react-hooks` (compiler-aware rules) guards violations.
- **UI separated from logic**: atoms→organisms render props, nothing else. Data flows
  in through `components/pages/` wiring `hooks/` — a non-page component importing from
  `services/` fails review; a page inlining business logic gets extracted to a hook.
- **Atomic design in `components/`**: `atoms/`, `molecules/`, `organisms/`, `pages/`.
  Every component is a folder with split files:

  ```
  components/atoms/Button/
  ├── Button.tsx           # the component (render only)
  ├── Button.types.ts      # props interface
  ├── Button.stories.tsx   # Storybook story
  ├── Button.test.tsx      # Testing Library spec
  └── index.ts             # public export
  ```

- **Storybook** (latest) documents `components/`; a story is part of every component's
  definition of done.
- **Tailwind v4** — latest stable; Tailwind has no LTS channel, so "LTS" resolves to
  the current major. Design tokens via CSS `@theme`; class order enforced by the
  Prettier plugin; zero inline styles (lint rule above).

### Data fetching (`apps/web`)

Two thin layers, one direction: `services/` → `hooks/queries/` → pages.

- **`services/`** — axios instance in `services/http.ts` (`baseURL` from env, request
  interceptor injects the auth token, response interceptor unwraps `ApiResponse<T>`
  and normalizes errors) + one file per domain (`services/user.ts` exports `getUser`,
  `updateUser` as plain typed async functions). No React in this layer — trivially
  unit-testable.
- **`hooks/queries/`** — TanStack Query v5, **one hook per query-key domain**:
  `useUser()` bundles the user query, the update mutation, and every user-related
  invalidation; `useAlbums()`, `useImages()`, `useProcessImage()` repeat the shape.
  Query keys are declared once inside the hook file — a bare `useQuery` in a component
  or page is a lint/review failure.

Why queries live in `hooks/` and not `services/`: `services/` is "talk to the API"
(no React), `hooks/` is "React logic" (TanStack is React state). Reading rule stays
one line: *need data in a page → import the domain hook; need a new endpoint → add the
function in `services/<domain>.ts`, consume it in `hooks/queries/use<Domain>.ts`.*

### Browser APIs (`apps/web`) — always behind typed abstractions

- **localStorage** only through `services/storage.ts`: one typed schema of storage
  keys → value types, generic `getItem`/`setItem`/`removeItem` (JSON-safe; corrupt
  values return `null` and are purged). No raw `localStorage.*` anywhere else.
- **Events** only through `utils/events.ts` (typed `AppEventMap` emitter/subscriber
  over CustomEvent — no string-literal event names at call sites) and the hooks
  `useEventListener` (DOM) / `useAppEvent` (app events) with automatic cleanup.
- Both fully inferred: `storage.getItem('session')` types without casts. Zero `any`,
  zero `as Type` escapes (`as const`/`satisfies` allowed).

### Backend conventions (`apps/api` and every service)

- Layering: `routes/` (Fastify plugins: schema + thin handlers) → `services/`
  (business logic, unit-testable without HTTP) → `repositories/` (Drizzle queries).
- Request/response schemas come from `packages/shared` via `fastify-type-provider-zod`
  — one zod schema is simultaneously the **validator**, the **TypeScript type**, and
  the **OpenAPI source**.
- **API docs**: `@fastify/swagger` + `@fastify/swagger-ui` serve interactive OpenAPI
  at `/docs` on every service from birth — generated from those same zod schemas, so
  contract, validation, and documentation cannot drift apart.

## 3. Runtime configuration

- Every service validates `process.env` at startup with a zod schema in `src/config.ts`;
  missing/invalid vars crash the process with the field name. No hardcoded secrets.
- `.env.example` committed per app; real `.env` git-ignored; compose injects env vars.
- Key vars (api, phase 1, shipped): `DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`,
  `JWT_SECRET`, `OTP_TTL_SECONDS=600`, `UPLOAD_DIR`, `WEB_ORIGIN`, `OTEL_ENABLED`,
  `OTEL_EXPORTER`, `OTEL_EXPORTER_OTLP_ENDPOINT` (see §8 — traces only, no metrics
  pipeline yet).
- `OTEL_EXPORTER_PROMETHEUS_PORT=9464` — **phase 2**, not a phase 1 var. No metrics
  pipeline exists yet (§8); `packages/otel` in phase 1 only ever exports traces via
  `OTEL_EXPORTER=console|otlp`. Listing it as shipped here was the divergence this
  section fixes.

## 4. API contracts (phase 1 surface)

All responses use the envelope from `packages/shared`:

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: { code: string; message: string }   // code: machine-readable, e.g. OTP_EXPIRED
  meta?: { total: number; page: number; limit: number }
}
```

zod schemas in `packages/shared` are the single source of truth; API validates input
with them, web infers types from them (`z.infer`).

| Method & path | Auth | Body / params | Success data |
|---|---|---|---|
| `POST /auth/otp/request` | no | `{ email }` | `{ requested: true }` (idempotent; always 200 to avoid email enumeration) |
| `POST /auth/otp/verify` | no | `{ email, code }` | `{ token, user }` |
| `GET /auth/me` | yes (`session`) | — | `{ user }` |
| `GET /auth/file-token` | yes (`session`, header only) | — | `{ token }` — 60s `scope: 'file'` token; see §5 |
| `GET /albums` · `POST /albums` | yes | list: `?page&limit` · create: `{ name, description? }` | `Album[]` · `Album` |
| `GET /albums/:id` · `PATCH` · `DELETE` | yes | partial `{ name?, description? }` | `Album` · `Album` · `{}` |
| `POST /images` | yes | multipart: file + `{ albumId }` | `Image` (metadata) |
| `GET /images?albumId=` · `GET /images/:id` | yes | — | `Image[]` · `Image` |
| `GET /images/:id/file` | yes (`session` header **or** `file` via `?token=`) | — | binary (original) |
| `GET /files/*` | yes (`session` header **or** `file` via `?token=`) | wildcard storage path | binary (original or processed) |
| `POST /images/process` | yes | `{ imageId, width, height, filter, quality? }` | `ProcessedImage` (**the heavy route**) |

`POST /images/process` params (zod): `width`/`height` int 16–4096; `filter` enum
`'none' | 'grayscale' | 'blur' | 'sharpen'`; `quality` int 1–100 default 80.
Phase 1–4 the route is **synchronous** (that's the lesson); phase 5 makes it async
(`202 Accepted` + job id) — contract change documented when it happens.

Errors: `401 UNAUTHORIZED`, `404 NOT_FOUND`, `422 VALIDATION_ERROR` (zod issues in
`error.message`), `429 RATE_LIMITED`, `500 INTERNAL` (no stack traces leak; pino logs
carry the detail server-side).

## 5. Auth design

OTP lifecycle:

1. `otp/request`: generate 6-digit code, store **hash** (sha256 + per-code salt) with
   `expires_at = now + 10min`, invalidate previous active codes for the email,
   send via nodemailer → MailHog. Resend cooldown 60s per email (429 inside cooldown).
2. `otp/verify`: max 5 attempts per code, then code invalidated. On success: delete
   code, upsert user, issue token.
3. Rate limiting: `@fastify/rate-limit` on both auth routes (per-IP + per-email).

Session mechanism: **JWT (HS256), 1-hour expiry, no refresh token in MVP** — via
`@fastify/jwt`.

- Why JWT over server-side sessions: stateless — no shared session store between
  services, which matters at phase 3 (processor must not read api's DB) and is the
  whole point of phase 9, where the **gateway validates tokens centrally** without
  calling the auth service per request.
- Gateway-phase implication: HS256 means every validator shares the secret. At phase 9
  the extracted auth service should move to RS256/JWKS (auth signs with private key,
  gateway verifies with public key) — **decide at phase 9**.
- Refresh tokens: out of MVP; re-login via OTP on expiry — **decide at phase 9**.
- Web stores the token in `localStorage` (lab-acceptable; XSS trade-off noted — no
  third-party scripts in this app).

### Scoped file tokens (`GET /auth/file-token`)

The 1h session JWT is header-only by design — but the file-serving GET routes
(`GET /images/:id/file`, `GET /files/*`) are rendered as `<img src="...">` in the
browser, and an `<img>` tag has no way to attach an `Authorization` header. Something
has to travel in the URL for those two routes.

- **`GET /auth/file-token`** (requires a valid `session` token, header only) issues a
  second, narrower JWT: `scope: 'file'`, 60s expiry, payload carries only `sub` (user
  id) — no `email`. 60s is long enough for a page of `<img>` tags to load, short
  enough that a leaked URL is worthless within a minute.
- The two scopes are mutually exclusive by construction: `scope: 'session'` is the
  only scope accepted on every normal route (header only — never via `?token=`);
  `scope: 'file'` is accepted **only** on the file-serving GET routes' `?token=`
  fallback, and nowhere else. Neither guard accepts the other's scope
  (`apps/api/src/plugins/auth-guard.ts`).
- Token values passed via `?token=` are redacted from pino request logs (the URL is
  logged with the token replaced), so the log-leak vector that motivated this design is
  closed at the logging layer too, not just by the short TTL.
- **Known limitation**: the `file` scope is user-scoped, not per-image — a token
  obtained for one image can address any file the same user owns, not just the one it
  was requested for. Accepted trade-off; see `05-decision-log.md` #18.

## 6. Database schemas

### api DB (`snapscale`) — phase 1

| Table | Columns (abridged) |
|---|---|
| `users` | `id uuid pk`, `email text unique`, `created_at` |
| `otp_codes` | `id`, `email`, `code_hash`, `salt`, `attempts int default 0`, `expires_at`, `consumed_at nullable` |
| `albums` | `id`, `owner_id fk`, `name`, `description`, timestamps |
| `images` | `id`, `album_id fk`, `owner_id fk`, `original_filename`, `storage_path`, `mime_type`, `size_bytes`, `width`, `height`, timestamps |
| `processed_images` | `id`, `image_id fk`, `params_hash text`, `width int`, `height int`, `filter text`, `quality int` (discrete columns, not a `params jsonb` blob — unique on `(image_id, params_hash)`), `storage_path`, `duration_ms`, `created_at` |

Migrations via drizzle-kit, committed under `apps/api/migrations/` (not `apps/api/drizzle/`).

### processor DB (`snapscale_processor`) — born phase 3

What **moves**: nothing is moved — `processed_images` rows stay in api DB as the
gallery-facing metadata. The processor gets its **own** operational tables:

| Table | Columns (abridged) |
|---|---|
| `jobs` | `id uuid pk`, `source_image_ref text` (opaque reference, **not** a FK — api's image id), `params jsonb`, `status enum(pending,running,done,failed)`, `attempts`, timestamps |
| `results` | `id`, `job_id fk`, `storage_path`, `duration_ms`, `error nullable` |

Hard rule: cross-service references are **IDs only**, never foreign keys across
databases, never cross-database queries. The api learns results via the processor's
HTTP response (phase 3–4) or completion events (phase 5), and stores what it needs in
its own `processed_images`.

Phase 6 formalizes that copy as a **versioned replica** fed by the transactional
outbox: processor db gains `outbox` (event id, aggregate id, version, payload,
published_at nullable) and the api db gains `processed_events` (consumed event ids —
the idempotency ledger). `processed_images` rows carry the source `version`; a consumer
applies an event only if `event.version > row.version`. Full mechanics in
`02-architecture.md` §phase 6; concrete DDL lands with the phase ADR.

## 7. Image storage

- Local volume (compose named volume; k8s PVC at phase 4) mounted at `UPLOAD_DIR`.
- Paths: `originals/{ownerId}/{imageId}.{ext}` and
  `processed/{imageId}/{paramsHash}.{ext}` — `paramsHash` = sha256 of canonical params
  JSON, which phase 8's cache lookups reuse.
- Upload via `@fastify/multipart`: max 10 MB/file, mime allowlist
  `image/jpeg`, `image/png`, `image/webp`; magic-byte sniff via sharp metadata read
  (reject files whose content doesn't parse as an image).
- Phase 3 note: processor gets its own volume for `processed/`; the api serves
  processed files by proxying or shared-nothing copy — the exact hand-off is a
  phase 3 task detail (`04-implementation-plan.md`).

## 8. Observability wiring

### packages/otel

```typescript
// every service entrypoint, first import:
import { startTelemetry } from '@snapscale/otel'
startTelemetry({ serviceName: 'api' })
```

- Wraps `NodeSDK` with `getNodeAutoInstrumentations()` (http, fastify, pg, dns) plus
  `@opentelemetry/instrumentation-runtime-node` (event-loop lag, heap — the "server is
  melting" signals).
- Metrics: OTel Metrics SDK → `PrometheusExporter` on `:9464/metrics`. **No
  prom-client** — one instrumentation API for metrics and traces, honoring the
  "instrumentation never swapped" principle; prom-client would be a second path to
  maintain and migrate.
- Traces: OTLP/HTTP exporter → Jaeger `:4318`. Wired from day 1 but the whole SDK is
  gated by one env flag (`OTEL_ENABLED`, `packages/otel/src/env.ts`) — off in phase 1–2
  (nothing to receive), on from phase 3. When disabled, every OTel import is a *dynamic*
  import that never runs, not merely "constructed but not started" — zero overhead by
  default, not just an idle exporter.

### Metrics (RED, per route)

OTel semantic conventions: `http.server.request.duration` histogram with attributes
`http.route`, `http.request.method`, `http.response.status_code`. From these,
Grafana derives Rate (count/s), Errors (5xx ratio), Duration (p50/p95/p99).
One custom metric in the processor path: `image_process_duration_seconds` histogram
with `filter` attribute — isolates sharp time from HTTP time.

### Prometheus & Grafana (phase 2)

- `infra/prometheus/prometheus.yml`: 15s scrape of `api:9464` (later `processor:9464`).
- Grafana fully provisioned as code: datasource yaml + dashboard JSONs committed under
  `infra/grafana/`. Core dashboard: per-route p95, requests/s, error rate, event-loop
  lag, CPU per container — the "culprit route" evidence view from the PRD.

### Trace context propagation

- HTTP: automatic (`traceparent` header, W3C TraceContext) via auto-instrumentation.
- Queue (phase 5): inject `traceparent` into the job payload envelope on enqueue,
  extract into the consumer span — the pattern that keeps one trace across
  api → queue → processor.

## 9. Testing strategy

TDD, red-first, both sides of the monorepo. The five anti-false-positive rules
(kickoff agreement, enforced in review):

1. Every test is born **red** before the implementation exists; a test that passes on
   first run against no implementation is deleted or rewritten.
2. Asserts target **observable behavior** (response body, DB row, emitted email),
   never internals (call counts of private helpers, internal state shape).
3. Never mock the unit under test; mock only true externals — and in integration
   tests, not even the DB.
4. No `expect` inside conditionals/try-catch guards; a skipped assert is a silent pass.
5. Error-path tests assert the **error code/type and message**, not just "it threw".

### Pyramid per app

| Level | api / image-processor | web |
|---|---|---|
| Unit | pure logic: OTP hashing/expiry, params hashing, services with repository fakes | components via Testing Library (behavior: "typing code X and submitting calls verify and shows gallery") |
| Integration | route → real Postgres via **Testcontainers**; real Fastify instance via `app.inject()`; MailHog faked at SMTP boundary (nodemailer transport stub) or real via compose in CI-heavy suites | TanStack Query hooks against msw-mocked API contract from `packages/shared` |
| E2E | — | Playwright against full compose stack: request OTP → **fetch code from MailHog REST API** (`GET :8025/api/v2/messages`) → login → create album → upload → process image |

**Hard rule — tests are never deleted.** No test may be deleted, skipped
(`.skip`/`.todo`), commented out, or weakened to make a suite pass — a failing test
means fix the implementation. The only exception is a test provably wrong against the
contract/plan, and then it is rewritten (never plainly removed) with the evidence
recorded in the phase docs. Any violation is a CRITICAL review finding and fails the
gate.

- **Testcontainers over a shared compose test-DB**: each Vitest worker gets an
  isolated Postgres (singleton container per run, schema-per-worker, truncate between
  tests). A shared long-lived test DB invites inter-test coupling — precisely the
  false-positive class this project bans. Cost: ~2s container startup per run;
  acceptable.
- Coverage: `@vitest/coverage-v8`, thresholds in each `vitest.config.ts`
  (`lines/functions/branches/statements: 80`) — **thresholds fail the task**, and
  `turbo run test:coverage` is the gate for every phase merge. HTML reports output to
  `coverage/` per app.

## 10. Load generation (k6)

`infra/k6/` scenarios, run via dockerized k6 on the compose network:

- `baseline.js`: constant 20 VUs, 2 min, hitting auth + albums + images list — proves
  the CRUD surface is healthy alone (`p(95)<300ms` threshold must PASS).
- `hot-route.js`: ramping 0→50 VUs over 3 min on `POST /images/process`
  (1080p resize + blur), **while** `baseline.js` runs — the demo: baseline thresholds
  start failing, Grafana shows every route degrading and the culprit's p95 exploding.
- Thresholds encode the expectation: baseline-alone PASSES, baseline-under-hot-load
  FAILS — the failure is the phase 2 evidence artifact (see `01-prd.md` metrics).

## 11. Local dev workflow

- Phase 1, shipped: a single root `docker-compose.yml` (not `infra/compose/`) with
  postgres, mailhog, a one-shot `migrate` job, api, and web — no profiles;
  `docker compose up -d --build` then, for local dev against the containerized deps,
  `pnpm dev` (turbo runs api + web watch). Profile-based splitting
  (`core`/`observability`/`full`) is a **phase 2+ plan, not shipped**: it lands once
  `infra/prometheus`, `infra/grafana`, and Jaeger (phase 3) exist to make an
  `observability` profile meaningful.
- Root scripts (shipped, `package.json`): `pnpm dev`, `pnpm build`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, `pnpm test:e2e`.
  `pnpm compose:core` / `compose:full` / `k6:baseline` / `k6:hot` do not exist yet —
  **phase 2+ plan**, added alongside the compose profiles and `infra/k6/` above.
- Phase 4 moves runtime to k3d (`infra/k8s/`), compose remains for the
  observability-only profile until those move too — split detailed in
  `04-implementation-plan.md`.

## Decisions introduced here

Choices the kickoff conversation left open, decided in this document:

| Decision | Rejected alternative | Why |
|---|---|---|
| JWT HS256, 1h, no refresh (MVP) | Server-side sessions | Stateless across services; gateway can validate centrally at phase 9; sessions would need a shared store, coupling services |
| OTel Metrics SDK + PrometheusExporter | prom-client | One instrumentation API for metrics + traces; "never swap instrumentation" principle; prom-client would be a parallel path to migrate later |
| Testcontainers for integration DB | Shared compose test-DB | Isolation per worker kills inter-test coupling — the main false-positive vector |
| Drizzle ORM + drizzle-kit | Prisma / raw `pg` | SQL-transparent (learning goal: see the queries), typed, light runtime; Prisma hides SQL behind an engine; raw pg lacks a migration story |
| localStorage for the web token | In-memory only | Survives refresh; XSS surface acceptable in a lab with no third-party scripts |
| Scoped `file`-scope token (60s) for `<img>`-tag URLs, §5 | Session token in `?token=` (shipped first, then superseded); XHR-to-blob | Session token in a URL is logged, kept in browser history, and carries full API authority; XHR-to-blob adds a fetch/revoke lifecycle to every image. See `05-decision-log.md` #18 |

Decided since (owned by the PRD, 2026-08-23): gateway is hand-rolled (`apps/gateway`,
Fastify + `fastify-reply-from`); queue is RabbitMQ (AMQP, ack/prefetch/DLQ semantics,
native Prometheus plugin); queue-depth autoscaling via KEDA (native RabbitMQ scaler,
scale-to-zero); cross-service data replication via transactional outbox + idempotent,
versioned consumers (phase 6). Full rationale per decision: `05-decision-log.md`.

Still open (owned by the PRD): RS256/JWKS migration (phase 9), Go rewrite (deferred —
revisit after the final phase).
