# SnapScale — Initial Idea

> The origin note. Everything else in `docs/` derives from this.

## The idea in one paragraph

Build a small but **real** image-gallery backend, deliberately give it one endpoint that
crushes the server under load, then walk the same path a real engineering team walks:
**measure → prove which route is the problem → extract it into a true microservice →
autoscale it**. Every stage lives on its own branch so the repo tells the story of the
system evolving, decision by decision.

This is a learning lab. The product (an image gallery) is the excuse; the goal is
hands-on experience with observability, service extraction, and container orchestration —
entirely local, no cloud account.

## What the system is

- **Image gallery** with users, albums, and image upload.
- **Auth via email OTP** — backend "sends" a code, MailHog catches it locally
  (SMTP `:1025`, inbox UI `:8025`), user pastes it in the frontend.
- **Simple React frontend** to exercise the flows end to end.
- **The heavy route**: `POST /images/process` — resize/filter via `sharp`.
  CPU-bound for real, not artificially. This is the route that will melt, get exposed
  by the metrics, and get extracted.

## The journey (branch per phase)

| Phase | Branch | What it proves |
|---|---|---|
| 1 | `phase-1-monolith` | Working monolith: API + frontend + Postgres + MailHog, heavy route inside |
| 2 | `phase-2-observability` | k6 load + Prometheus/Grafana show **which** route kills the server |
| 3 | `phase-3-microservice` | `image-processor` extracted: own DB, own Dockerfile, own lifecycle; Jaeger traces cross-service requests |
| 4 | `phase-4-autoscaling` | Everything on local Kubernetes (k3d); HPA scales the processor up under k6 load and back down after |
| 5 | `phase-5-queue` | Sync HTTP call replaced by a queue; autoscaling driven by queue depth instead of CPU |
| 6 | `phase-6-data-sync` | Cross-service data replication: outbox + events keep each service's DB consistent — service dies, comes back, converges without losing data |
| 7 | `phase-7-resilience` | Circuit breaker, retry, timeout — processor dies, monolith survives |
| 8 | `phase-8-cache` | Redis cache of processed images; watch load collapse in Grafana |
| 9 | `phase-9-gateway` | Auth extracted + gateway in front (routing, rate limit, central token validation) |

Maybe-later: rewrite `image-processor` in Go and compare performance.

## Non-negotiable principles

- **Local only.** No AWS account. Cloud concepts reproduced with open tools
  (CloudWatch/X-Ray → Prometheus + Grafana + Jaeger; ECS autoscaling → k8s HPA).
- **Real microservice or nothing.** Own database, own container, own deploy unit.
  Shared code lives in packages, not shared state.
- **OpenTelemetry from day 1.** Pipelines are added per phase (metrics → traces),
  instrumentation is never swapped — exactly how a real project grows.
- **TDD with zero false positives.** Every test born red first; asserts on behavior,
  never internals; coverage ≥ 80% enforced on frontend and backend.
- **Monorepo (Turborepo + pnpm).** Code organization ≠ deployment coupling.

## Key stack decisions (and what was rejected)

| Decision | Rejected alternative | Why |
|---|---|---|
| Node 22 + TypeScript | Bun | OTel auto-instrumentation depends on Node internals; observability is the core of this project. Runtime speed irrelevant — `sharp` (native) is the bottleneck |
| Fastify | Express | Better hooks/metrics surface, current-generation default |
| MailHog | Real email service | Local inbox, zero external accounts |
| k3d + HPA | LocalStack ECS | ECS emulation is paid-tier and doesn't actually scale containers; k8s is the more valuable skill |
| `sharp` as the heavy load | Fake CPU loop / bcrypt | Credible story — image processing is a classic real-world extraction case |

## Docs map

| File | Purpose |
|---|---|
| `00-initial-idea.md` | This file — the vision and the journey |
| `01-prd.md` | What must be true for success, and why (no implementation detail) |
| `02-architecture.md` | Components, boundaries, data flow, and how the topology evolves per phase |
| `03-technical-design.md` | Concrete stack, contracts, schemas, testing and observability wiring |
| `04-implementation-plan.md` | Phased task breakdown with validation criteria per task |
| `05-decision-log.md` | Every technology chosen, what it was chosen over, and the trade-off accepted |
