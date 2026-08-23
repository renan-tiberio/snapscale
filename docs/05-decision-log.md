# SnapScale — Decision Log

> Every technology in this project was chosen **against** at least one alternative, and
> every choice buys something by giving something up. This log records both sides, so
> the reasoning survives the code. Format per entry: what was picked, what it was picked
> over, why, and the trade-off knowingly accepted.

## How to read this

A decision without a rejected alternative is not a decision — it's a default. Entries
below are ordered by when they bind: platform first, then per-phase choices. Decisions
marked *(phase N)* only materialize in that phase, but were settled up front so the
architecture could account for them.

---

## 1. Runtime: Node.js 22 — over Bun

**Why**: OpenTelemetry auto-instrumentation works by patching Node's internals
(`http`, `pg`, DNS). Bun reimplements those internals; instrumentation is partially
compatible and fails *silently* — the worst failure mode for a project whose entire
point is observability. Runtime speed is a non-argument here: the bottleneck is `sharp`,
native code that runs identically on both.

**Trade-off accepted**: slower cold starts and package installs than Bun; less
"new-stack" appeal. Irrelevant to the goals.

## 2. API framework: Fastify 5 — over Express

**Why**: first-class async, schema-driven validation that pairs with zod, a hook system
that makes per-route instrumentation natural, and pino as the built-in logger. Express
survives on inertia; its middleware model predates async/await and makes clean error
propagation harder.

**Trade-off accepted**: smaller middleware ecosystem; occasionally an Express-only
example needs translating.

## 3. The heavy endpoint: `sharp` image processing — over synthetic load

**Alternatives rejected**: a fake CPU loop (fibonacci), bcrypt with an absurd cost
factor, PDF generation via headless Chrome.

**Why**: the degradation must be *credible*. Image processing is a textbook real-world
extraction case: genuinely CPU-bound, naturally bursty, and obviously separable from
CRUD traffic. A fibonacci route proves nothing about architecture — it proves you can
write a slow function. PDF generation is heavier still but drags a headless browser
into every container. bcrypt ties the heavy path to auth, which is the one route you
*don't* want to degrade.

**Trade-off accepted**: `sharp` is a native dependency — container builds must match
the target platform (relevant when images move into k3d).

## 4. Local email: MailHog — over Mailpit or a real provider

**Why**: OTP auth needs an inbox, not a delivery service. MailHog pretends to be SMTP,
catches everything, and shows it in a local web UI — zero external accounts, zero
secrets, works offline. A real provider (SES, Resend) adds credentials and network
dependency for no lesson. Mailpit is the maintained successor and was the close
runner-up; MailHog won on familiarity, and for a local lab its unmaintained status
carries no practical risk.

**Trade-off accepted**: MailHog is frozen (last release 2021). If it ever breaks,
Mailpit is a drop-in replacement (same SMTP-plus-web-UI shape).

## 5. Observability: OpenTelemetry + Prometheus + Grafana + Jaeger — grown, never swapped

**Alternatives rejected**: vendor SaaS (Datadog, New Relic) — paid and cloud-bound;
bare `prom-client` without OTel — locks instrumentation to one backend; adding tools
mid-project as needs appear — causes rework.

**Why**: OTel is the instrumentation *standard* — code instrumented once exports to any
backend, which is exactly how the pipeline can grow additively: metrics land in phase 2
(Prometheus scrapes, Grafana draws), traces land in phase 3 (Jaeger), and no
instrumentation is ever rewritten. Each tool has one job: Prometheus answers "how
much / how often / since when", Jaeger answers "where did *this request* spend its
time", Grafana just draws. This maps 1:1 to CloudWatch (metrics/dashboards) and X-Ray
(traces) — the managed services being reproduced.

**Trade-off accepted**: four containers of observability overhead on a laptop, and
OTel's JS API has a learning curve steeper than `prom-client`'s. Both are the point,
not the price.

## 6. Metrics exposure: OTel Prometheus exporter — over `prom-client`

**Why**: one instrumentation layer (rule 5) means metrics flow through the OTel SDK
too. Running `prom-client` beside OTel would create two metric pipelines with two
naming conventions and double per-route counters.

**Trade-off accepted**: OTel's metrics API is more ceremonial than `prom-client`'s
counters, and some Grafana dashboard examples assume `prom-client` naming.

## 7. Orchestration: k3d + HPA — over LocalStack ECS, Docker Swarm, minikube

**Why**: the autoscaling must be *real* — pods observably born under load, killed when
it fades. LocalStack's ECS emulation is a paid tier and doesn't actually schedule
containers. Docker Swarm has no native autoscaler at all. Among local k8s options, k3d
runs k3s inside Docker: lightest footprint, fastest cluster create/destroy, and ships
Traefik as default ingress (a free lesson that pays off in decision 12). Kubernetes
knowledge also transfers everywhere ECS knowledge doesn't.

**Trade-off accepted**: k8s manifests and kubectl are their own learning curve, and the
lab diverges from literal AWS services (concepts map, consoles don't).

## 8. Monorepo: Turborepo + pnpm — over multi-repo

**Why**: one clone, shared TypeScript packages (schemas, OTel bootstrap) without
publishing, task caching, and — the part that matters — proof that *code organization
is not deployment coupling*. Each app keeps its own Dockerfile, database, and
lifecycle; the microservice extraction stays honest inside a single repo, the way large
engineering orgs actually run microservices.

**Trade-off accepted**: monorepo tooling (workspace resolution, turbo pipelines) is one
more thing to configure before the first feature exists.

## 9. Database access: Drizzle ORM — over Prisma and raw `pg`

**Why**: Drizzle is SQL-transparent — the query you write is the query that runs, which
serves the goal of *seeing* the mechanics (an N+1 should be visible, not abstracted).
Typed schema, real migration story via drizzle-kit, tiny runtime. Prisma hides SQL
behind a query engine binary — the exact opacity this project exists to avoid. Raw `pg`
shows everything but has no migration or type story, and this lab needs schema
evolution across nine phases.

**Trade-off accepted**: Drizzle's ecosystem is younger than Prisma's; fewer
StackOverflow answers when stuck.

## 10. Sessions: JWT (HS256, 1h, no refresh) — over server-side sessions

**Why**: stateless tokens keep phase 1 simple and set up the phase-9 lesson: with a
shared secret (HS256), *every* service can validate tokens, which is exactly the
coupling the gateway phase then fixes (central validation at the edge; RS256/JWKS noted
as the production-grade upgrade). Server-side sessions would need shared session
storage across services — a coupling with no teaching payoff.

**Trade-off accepted**: no revocation before expiry (mitigated by the 1h lifetime), and
the token lives in `localStorage` — an XSS-readable surface that is acceptable only
because this lab serves no third-party scripts. A production system would use httpOnly
cookies.

## 11. Integration tests: Testcontainers — over a shared compose test database

**Why**: each test worker gets its own throwaway Postgres, so tests cannot couple
through shared state — inter-test coupling being the main source of false positives
(tests that pass because of leftover data, then "flake" when reordered). A shared
compose DB is faster to start but couples every test run to cleanup discipline.

**Trade-off accepted**: slower test startup (container pull + boot per suite) and a
hard dependency on Docker being up to run integration tests.

## 12. Gateway: hand-rolled — over Traefik or Kong *(phase 9)*

**Why**: the project's thesis is exposing mechanics that managed tools hide. A
config-driven gateway hides them again — routing, header forwarding, timeout
propagation, and edge token-validation become someone else's YAML. Writing a thin
Fastify + `fastify-reply-from` gateway (~200 lines) makes each of those a visible,
testable decision. The "but learn a real tool" argument dissolves because k3s ships
Traefik as its default ingress — it gets learned in phase 4 regardless. Kong was
rejected outright: corporate API-management weight with a database of its own, wrong
scale for a local lab.

**Trade-off accepted**: hand-rolled code must be tested and maintained like any other
app, and the universally correct production answer remains "don't write your own
gateway" — this one exists to be understood, not shipped.

## 13. Queue: RabbitMQ — over Redis + BullMQ *(phase 5)*

**Why**: RabbitMQ is a real broker speaking AMQP, and its semantics are the lesson:
explicit acks (a worker dying mid-job puts the message back), prefetch (the throughput
tuning knob), redelivery, and dead-letter queues (which phase 7's resilience work
consumes directly). Its management UI and native Prometheus plugin expose queue depth —
the exact signal phase 5's autoscaling needs. AMQP is language-agnostic, keeping a
possible non-Node consumer open. BullMQ implements queue semantics inside a JS library
on top of Redis: simpler to run, but the mechanics live in `node_modules`, invisible —
and it locks consumers to JavaScript. SQS, the managed equivalent, hides all of the
above behind a console; that's the opacity being escaped.

**Trade-off accepted**: one more stateful container (~150MB) and AMQP's
exchange/queue/binding model to learn. Redis still enters in phase 8 — as a cache. One
Redis playing both queue and cache is a common anti-pattern; keeping them separate is
deliberate.

## 14. Queue-depth autoscaling: KEDA — over prometheus-adapter *(phase 5)*

**Why**: HPA extensibility internals are not new material by phase 5 — plain HPA + CPU
+ metrics-server is already operated in phase 4. Phase 5's new lesson is *scale on the
right signal, all the way down*: KEDA's native RabbitMQ scaler reads the queue directly
(no PromQL-mapping config in the critical path), and scale-to-zero — impossible with
HPA alone, which floors at 1 replica — demonstrates what Lambda/Fargate do behind the
curtain: empty queue, zero pods; first job, a pod is born. The HPA object KEDA
generates stays inspectable via kubectl, so the mechanics remain visible.
prometheus-adapter's PromQL bridge is the right tool for scaling on arbitrary business
metrics; noted as an optional extra experiment, not this phase's path.

**Trade-off accepted**: another controller and CRD set in the cluster, and the
metric-to-decision translation happens inside KEDA rather than in hand-written mapping
rules.

## 15. Cross-service data consistency: transactional outbox — over CDC, dual writes, or read-time calls *(phase 6)*

**The problem**: once each service owns its database, related data gets duplicated —
and a replica must never end up permanently stale, even when its consumer is down.

**Alternatives rejected**: plain **dual write** (update DB, then publish to the broker)
is the bug, not a solution — a crash between the two operations desynchronizes DB and
event stream forever. **CDC (Debezium)** tails Postgres's WAL and publishes changes
automatically — the production-grade automation of this exact pattern, but it hides the
mechanics in connector config; noted as the evolution, not the lesson. **No duplication
(call the owner's API on every read)** couples read availability to the owner — the
very coupling phases 3–4 exist to demonstrate as a limitation. **Event sourcing** makes
events the source of truth — a conceptual leap this lab doesn't need.

**Why the outbox**: the owner writes the business change *and* the event row in the
same local Postgres transaction — atomicity without distributed transactions. A relay
publishes outbox rows to RabbitMQ (at-least-once); consumers deduplicate by event id
and apply version-gated upserts, so replays and out-of-order deliveries are no-ops and
old data can never overwrite new. Durable queues make outage recovery automatic:
backlog waits, consumer returns, replicas converge. AWS equivalent: DynamoDB Streams /
EventBridge — same pattern, console-shaped.

**Trade-off accepted**: eventual consistency is now a *feature the UI must express*
("processing…" states, read-your-writes gaps), plus outbox/ledger tables and a relay to
maintain. Ordering is guaranteed per aggregate only — cross-aggregate ordering is
explicitly not promised.

## 16. Go rewrite of the processor — deferred, not rejected

The comparison only means something once the processor exists in isolation with a load
harness around it (post phase 5): same queue in, same images, same dashboards —
language vs language on equal terms. Decision intentionally parked until after the
final phase.

## 17. Frontend architecture: atomic components + conventional folders, hook-per-domain data layer

**Alternatives rejected**: **Feature-Sliced Design** — seriously considered (it gives
ownership and an enforceable import direction), then dropped: for an app this size its
layer ceremony (app/pages/features/entities/shared before the first screen exists)
costs more readability than it buys — a conventional layout reads instantly, FSD needs
onboarding. Bare `useQuery`/`fetch` calls spread through components — query keys and
invalidations scatter, cache bugs become untraceable. Native `fetch` over axios — no
interceptors, so auth injection and envelope unwrapping would repeat in every call.
Manual memoization discipline — replaced by the React Compiler.

**Why**: one goal, stated at decision time: *anyone opens the repo and knows where
everything lives.* `components/` (atomic design: atoms/molecules/organisms, every
component a folder with component/types/story/test), `pages/`, `hooks/`, `context/`,
`services/`, `utils/` — the layout every React developer already knows. UI stays
separated from logic by rule, not by layer: components only render; pages wire hooks;
a component importing `services/` fails review. Data access is two thin layers:
`services/` holds the axios instance (interceptors own auth + error normalization) and
plain typed API functions per domain — no React, trivially testable; `hooks/queries/`
holds one TanStack Query hook per domain (`useUser` bundles the query, mutations, and
invalidations), so every cache interaction lives in one reviewable file. The **React
Compiler** is on: memoization is automatic, and hand-written `useMemo`/`useCallback`
becomes flagged noise instead of required discipline. Storybook documents the kit;
Tailwind v4 + Prettier class sorting + a lint ban on inline styles keep styling in one
system. ESLint/Prettier rules ship from one shared package with per-app presets —
shared what's universal, local what isn't.

**Trade-off accepted**: folder-by-type layouts can decay into junk drawers as apps
grow large — accepted consciously: this app's domain count is small and known (user,
album, image), and the hook-per-domain rule keeps data logic owned even without FSD's
layers. React Compiler adds a build-time dependency on its heuristics; Storybook is
one more build to maintain.

---

*Additions to this log follow the same shape: decision, rejected alternatives, why, and
the trade-off accepted. Per-phase ADRs in the phase docs reference these entries rather
than restating them.*
