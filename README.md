# SnapScale

An image gallery built to be pushed until it breaks — then measured, split, and
scaled, one branch at a time.

Managed cloud services hide the mechanics of running a system at scale: a console
draws the dashboards, another stitches the traces, another adds containers when load
rises. SnapScale reproduces all of it locally, from the inside, with no cloud account:
OpenTelemetry → Prometheus/Grafana/Jaeger for the measuring, a genuinely CPU-bound
`sharp` endpoint for the pressure, and k3d + KEDA for the scaling.

Each phase is a branch, so the repository reads as a sequence of decisions rather than
a finished snapshot. Why each technology was chosen — and what it was chosen *over* —
is in [`docs/05-decision-log.md`](docs/05-decision-log.md).

## Running it

Requires Docker, Node 22 and pnpm.

```bash
pnpm install                              # once
docker compose up -d                      # postgres + mailhog
cp apps/api/.env.example apps/api/.env    # once
pnpm --filter @snapscale/api db:migrate   # create the tables
pnpm dev                                  # api + web
```

Storybook runs separately: `pnpm --filter @snapscale/web storybook`.

Stopping: `Ctrl+C` on `pnpm dev`, then `docker compose down` (add `-v` to drop the
database volume too).

## Where each service lives

| Service | URL | What it is |
|---|---|---|
| **Web app** | <http://localhost:5173> | The gallery: OTP sign-in, albums, upload, image processing |
| **API** | <http://localhost:4000> | Fastify service — gallery, auth, and the heavy processing route |
| **API docs** | <http://localhost:4000/docs> | Swagger UI, generated from the same zod schemas that validate requests |
| **API health** | <http://localhost:4000/health> | `{"success":true,"data":{"status":"ok"}}` |
| **MailHog** | <http://localhost:8025> | Local inbox — every OTP email lands here, nothing leaves the machine |
| **Storybook** | <http://localhost:6006> | The component kit |
| Postgres | `localhost:5433` | user / password / database all `snapscale` |
| MailHog SMTP | `localhost:1025` | Where the API sends mail; not a page to open |

Port 5432 is deliberately left free for any other local Postgres.

### Signing in

There is no password. Enter any email at <http://localhost:5173>, then open
<http://localhost:8025> and copy the six-digit code from the message that just
arrived — the API "sent" it to MailHog instead of the internet.

Later phases add their own services (Prometheus, Grafana, Jaeger, RabbitMQ, the
extracted image processor); each phase's branch documents the ports it introduces.

## Layout

```
apps/web     React 19 + Vite + Tailwind v4, React Compiler on
apps/api     Fastify 5 + Drizzle + Postgres
packages/    shared contracts (zod), OTel bootstrap, tsconfig and eslint presets
infra/       compose, and — from phase 2 on — prometheus, grafana, k6, k8s
docs/        the idea, the requirements, the architecture, the plan, the decisions
```

## Checks

```bash
pnpm test           # unit + integration (Testcontainers spins real Postgres)
pnpm typecheck
pnpm lint
pnpm test:coverage  # fails under 80%
```

Tests are never deleted, skipped, or weakened to make a suite pass: a red test means
the implementation is wrong. The rare exception — a test provably wrong against the
documented contract — is rewritten, never removed, and recorded with its evidence.

## Documentation

| File | What it answers |
|---|---|
| [`docs/00-initial-idea.md`](docs/00-initial-idea.md) | What this is and where it's going |
| [`docs/01-prd.md`](docs/01-prd.md) | What has to be true for it to have worked |
| [`docs/02-architecture.md`](docs/02-architecture.md) | How the pieces relate, and how the topology changes each phase |
| [`docs/03-technical-design.md`](docs/03-technical-design.md) | How each piece is built — stack, contracts, schemas, conventions |
| [`docs/04-implementation-plan.md`](docs/04-implementation-plan.md) | The phased task breakdown |
| [`docs/05-decision-log.md`](docs/05-decision-log.md) | Every choice, its rejected alternatives, and the trade-off accepted |
