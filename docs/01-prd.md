# SnapScale — Image Gallery Scaling Lab

> Requirements only — implementation lives in `04-implementation-plan.md`.
> Scoped at project kickoff (2026-08-23); unknowns are marked TBD, not invented.

## Problem

Cloud-managed services hide the mechanics of running systems at scale: CloudWatch
draws the dashboards, X-Ray stitches the traces, ECS scales the containers — all
behind consoles that don't show *how*. The only way to own those mechanics is to
operate a system that actually degrades, gets diagnosed, and gets fixed — and a
production system at work is the wrong place to run that experiment.

## Evidence

- Managed-service opacity is first-hand: the AWS toolchain is used through consoles,
  not operated from the inside.
- Assumption — validated by the project itself: a self-built degradation →
  diagnosis → extraction → autoscaling loop makes each moving part inspectable.

## Users

- **Primary**: the author — engineer running a controlled scaling experiment. Trigger:
  wants to reproduce what AWS-style monitoring/scaling services actually do, locally
  and from the inside, without a cloud account.
- **Secondary**: future employers/peers reading the repo — each branch documents an
  architectural decision made for a demonstrated reason.
- **Not for**: production users. No real traffic, no real emails, no cloud deploy.

## Hypothesis

We believe **building an image gallery whose heavy endpoint is measured, extracted into
a real microservice, and autoscaled — all locally** will **expose the full mechanics of
production-grade observability, service extraction, and orchestration** for **any
engineer who has only consumed these as managed services**.
We'll know we're right when **every phase's exit criterion is demonstrated with evidence
(dashboard screenshot, trace, or scaling event) committed to its branch**.

## Success Metrics

| Metric | Target | How measured |
|---|---|---|
| Phase exit criteria demonstrated | 9/9 phases | Evidence artifact (screenshot/trace/report) committed per branch |
| Culprit route provably identified | p95 latency of `/images/process` visibly degrades all routes under k6; dashboard isolates it | Grafana dashboard, phase 2 |
| Real microservice isolation | Processor killed → gallery CRUD keeps working | Manual kill test + E2E suite green, phases 3/7 |
| Autoscaling observed | Pods scale 1→N under load and back to 1 after | `kubectl get hpa` output + Grafana, phase 4 |
| Test coverage (no false positives) | ≥ 80% lines, front and back; every test born red | Vitest coverage reports in CI/turbo; TDD discipline in PR history |

## Scope

**MVP** — Phases 1–2: monolith (gallery CRUD + OTP auth + heavy `sharp` route, React
front, Postgres, MailHog) plus the observability stack proving which route degrades the
system. This alone tests the core hypothesis: "can I make the invisible visible?"

**Out of scope**

- Real email delivery — MailHog only; no external accounts.
- Cloud deploy (AWS/GCP) — everything runs on the local machine.
- Production hardening beyond the lab's teaching goals (no real user data, no GDPR).
- Image storage on S3-alikes — local volume storage is enough for the lesson.
- Go rewrite of the processor — explicitly deferred; maybe-later experiment.
- Mobile frontend.

## Delivery Milestones

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Monolith (`phase-1-monolith`) | Gallery works end-to-end locally: OTP login via MailHog, upload, albums, heavy process route | complete — re-verified 2026-09-02 at `29727cc` after the house-style retrofit; journey 2/2 green under real `docker compose`; evidence in `evidence/phase-1/` | `04-implementation-plan.md` |
| 2 | Observability (`phase-2-observability`) | Grafana dashboard proves `/images/process` is the culprit under k6 load | pending | `04-implementation-plan.md` |
| 3 | Extraction (`phase-3-microservice`) | `image-processor` runs as a true microservice (own DB, container, lifecycle); Jaeger shows cross-service traces | pending | `04-implementation-plan.md` |
| 4 | Autoscaling (`phase-4-autoscaling`) | k3d + HPA scale the processor with load, observed live | pending | `04-implementation-plan.md` |
| 5 | Queue (`phase-5-queue`) | Processing is async via queue; scaling driven by queue depth | pending | `04-implementation-plan.md` |
| 6 | Data sync (`phase-6-data-sync`) | Replicated data across service DBs survives outages: consumer killed, backlog drains on return, replicas converge — no loss, no stale overwrites | pending | `04-implementation-plan.md` |
| 7 | Resilience (`phase-7-resilience`) | Processor outage doesn't take the gallery down (breaker/retry/timeout) | pending | `04-implementation-plan.md` |
| 8 | Cache (`phase-8-cache`) | Repeat processing served from Redis; load visibly collapses | pending | `04-implementation-plan.md` |
| 9 | Gateway (`phase-9-gateway`) | Auth extracted; gateway fronts all services (routing, rate limit, token validation) | pending | `04-implementation-plan.md` |

## Open Questions

- [x] Gateway: **hand-rolled** (decided 2026-08-23). The project's thesis is exposing
  hidden mechanics — a config-driven gateway would hide them again; and Traefik gets
  learned anyway as k3s's default ingress in phase 4. Traefik/Kong rejected.
- [x] Queue tech: **RabbitMQ** (decided 2026-08-23). Broker semantics (ack, prefetch,
  redelivery, DLQ) are the mechanics worth exposing — SQS hides all of them; native
  Prometheus plugin feeds queue-depth autoscaling; AMQP stays language-agnostic for a
  possible Go consumer. Redis+BullMQ rejected: semantics live inside a JS-only library.
- [x] Autoscale mechanism for queue depth: **KEDA** (decided 2026-08-23). HPA internals
  are already learned in phase 4 with CPU + metrics-server; phase 5's new lesson is
  "scale on the right signal, down to zero" — only KEDA does scale-to-zero, its native
  RabbitMQ scaler skips the fragile PromQL-mapping config, and the HPA it generates
  stays inspectable in the cluster. prometheus-adapter rejected for this phase; noted
  as an extra experiment for scaling on arbitrary business metrics.
- [ ] Go rewrite of the processor — deferred by choice; revisit after the final phase.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Local machine can't run full stack (k3d + observability + services) | Medium | High | Resource limits per container; observability stack is compose-only until phase 4; k3d is the lightest k8s option |
| Scope creep (9 phases + frontend + TDD is a lot) | High | Medium | Branch-per-phase gates; each phase has a single exit criterion; extras are explicitly optional |
| False-positive tests corrupt the learning signal | Medium | High | TDD red-first rule; behavior-only asserts; reviewer agent checks test quality per phase |
| OTel setup complexity stalls phase 1 | Medium | Medium | Instrumentation-only in phase 1 (no backends); pipelines land in phase 2 when there's something to see |
| Recipe-following: applying tools without recording the why | Medium | High | Every phase doc must state *why* before *how*; decisions recorded with rejected alternatives |

---
*Status: DRAFT — requirements only. Implementation planning in `04-implementation-plan.md`.*
