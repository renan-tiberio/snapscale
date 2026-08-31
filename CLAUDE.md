# SnapScale

Learning lab: an image gallery whose heavy endpoint is measured, extracted into a real
microservice, and autoscaled — all local, no cloud account. One branch per phase; the
repo history is the deliverable.

## Read before writing code

| Doc | What it settles |
|---|---|
| `docs/06-code-standards.md` | **House style. Binding.** How every line is written. |
| `review.md` | **How to review a diff against the house style.** Read before any review. |
| `docs/03-technical-design.md` | Stack versions, folder layout, API contracts, schemas, testing strategy |
| `docs/04-implementation-plan.md` | Phase-by-phase task breakdown and Definition of Done |
| `docs/02-architecture.md` | Topology and the rules services must obey |
| `docs/05-decision-log.md` | What was decided and what was discarded |

`docs/06-code-standards.md` is not a style preference sheet — every rule in it is either
lint-enforced or a blocking review finding. Read it before the first edit, not after.

## Hard rules

- **Tests are never deleted, skipped, commented out or weakened** to make a suite pass.
  A failing test means the implementation is wrong. The only exception is a test provably
  wrong against the contract, which is *rewritten* with the evidence recorded in the phase
  docs — never removed.
- **Every test is born red.** A test that passes before the implementation exists proves
  nothing and is rewritten.
- **Real microservice or nothing.** A service owns its database, its image, its lifecycle.
  No service reads another service's tables.
- **OTel from day 1.** Instrumentation is never retrofitted; only the backends arrive per
  phase.
- **All commits authored by the user.** No automated commits or pushes without explicit
  go-ahead, and no Claude attribution lines.

## Gates before claiming done

```bash
turbo run lint typecheck    # both green
turbo run test              # green
turbo run test:coverage     # >= 80% lines on every app/package touched
```

Coverage thresholds fail the task — they are not honor-system.
