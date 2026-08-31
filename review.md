# Review criteria — SnapScale

Applied by every reviewer, human or agent, on top of standard quality/conformance
lenses. Read `docs/06-code-standards.md` before reviewing a diff: it is the house
style, all 17 rules are binding, and this file only says **how to review against
it** — it does not restate it.

## What lint already covers — do not spend review time here

Rules 1, 2, 3, 4, 11, 12, 13 and 16 are enforced by `packages/eslint-config`
(`func-style`, `consistent-type-definitions: type`, `max-params: 1`,
`no-param-reassign`, `no-else-return`, `no-restricted-syntax` for `switch`/`else`/
mutating array methods, `no-magic-numbers`). A green `turbo run lint` is the
evidence. Three things still need a human:

- **An `eslint-disable` is a finding, not a fix.** Every one must name the
  third-party signature that forces it. A disable without that justification is HIGH.
- **`packages/eslint-config/` must not appear in the diff.** Weakening a rule to make
  lint pass is CRITICAL. Diff it against `HEAD` and confirm.
- `max-params: 1` cannot see a single positional primitive. `getUser(id)` passes lint
  and still breaks rule 3 — check single-argument functions by hand.

## What only a reviewer can catch (rules 5–10, 14, 15, 17)

| Rule | What to look for | Severity if broken |
|---|---|---|
| 5 | A Node-side package (`apps/api`, `packages/*`, `e2e`) referencing a DOM global (`window`, `document`, `HTMLImageElement`), or a tsconfig `lib` widened to make one resolve | HIGH |
| 6 | Any `import()` in the middle of code — **except the two sanctioned bootstrap sites below** | HIGH |
| 7 | Comments that restate the code, cite a task or plan section (`// task 10`, `// per §8`), or narrate a design decision across paragraphs. Also the inverse: a load-bearing one-liner deleted | MEDIUM |
| 8 | The same type, union, error code, storage key, query key or constant declared twice instead of imported. A value needed in two apps belongs in `packages/shared`, never copied | HIGH when the copies can drift into a behavior difference, else MEDIUM |
| 9 | An unquoted env value in `docker-compose.yml` or any `.env` file — YAML coerces bare `600` to a number and bare `no`/`off` to a boolean | MEDIUM |
| 10 | A `string` that only some strings are valid for, passed as a primitive instead of a value object; or a value object created and then never used | MEDIUM |
| 14 | A `useState` holding a value that never renders (timer id, DOM node, in-flight flag, a discarded setter) — that is a `useRef`. And the inverse: a `useRef` conversion that removed a render the UI depended on | HIGH for the inverse, MEDIUM otherwise |
| 15 | Shared arrange copy-pasted per `it` instead of hoisted into `beforeEach`; a spy restored at the end of an `it` instead of in `afterEach` (a failing assertion then leaks the stub into every later test); anything shared via `beforeAll` that must be per-test | MEDIUM, HIGH if it makes the suite order-dependent |
| 17 | A loose `*.test.ts` beside a `*.ts`; a module given a folder whose sibling stayed flat; two test files inside one module's folder | MEDIUM |

### Rule 6 — the two sanctioned `import()` sites

`apps/api/src/index.ts` and `packages/otel/src/start-telemetry/` use dynamic
`import()` **deliberately**, and `docs/06-code-standards.md` §6 documents why. ESM
evaluates the whole dependency graph depth-first before the importing module's first
statement runs, so a static import would load `fastify` and `pg` before OpenTelemetry
installs its module-loader hook — and the failure is silent: telemetry starts,
exports, and produces zero `pg`/`fastify` spans with no error anywhere.

**Converting either to a static import is CRITICAL.** Do not file them as findings; do
flag any *third* site.

## Test integrity (violations are CRITICAL, fail the gate)

- No test may be deleted, skipped (`.skip`/`.todo`), commented out, or weakened to
  make a suite pass. A failing test means fix the implementation. If a test itself is
  provably wrong, the report must say so explicitly with evidence, and the test is
  rewritten to be correct — never removed.
- No false positives: every test must be able to fail. Asserting a mock returns the
  mock, `expect(true).toBe(true)`, tests that pass with the feature broken, `expect`
  inside conditionals — all CRITICAL.
- **Watch for an assertion that lost a claim.** Replacing
  `expect(collected).toEqual([x])` with `expect(scalar).toBe(x)` drops the "exactly one
  call happened" half, so the test passes vacuously when the code path never runs.
  Count what each assertion proves before and after.
- **Watch for a rule conflict resolved by weakening the test.** When immutability
  (rule 4) collides with a test that accumulates into an array, the fix is a counter,
  not a shorter assertion. Test integrity outranks every style rule.
- Red-first evidence: units marked TDD in `docs/04` must show a red commit before the
  green commit.
- Error tests assert the error type **and** message, not just "it threw".
- Compare test counts against the baseline recorded in the phase's evidence. A lower
  count is a hard failure even when the suite is green.

## Architecture and layering (HIGH unless noted)

- **API**: `routes/` → `services/` → `repositories/`. Zod schemas from
  `@snapscale/shared` are the single source of validation + types + OpenAPI. A route
  reaching a repository directly, or a service importing Fastify, is a finding.
- **Web**: components render only — no `services/` import inside a component; TanStack
  hooks only in `hooks/queries/`, one hook per domain; axios only inside
  `services/http/`. A bare `useQuery` in a component or page is a finding.
- No inline `style=` in web (lint-enforced; reviewer confirms no disables).
- Aliases `@/` → src, `~/` → app root. No `../../` climbing.
- Browser APIs stay behind their abstractions: no raw `localStorage.` outside
  `services/storage/`, no raw `addEventListener` outside `hooks/useEventListener/` or
  `utils/events/`, custom events only through the typed `AppEventMap` emitter.
- Zero `any` and zero `as Type` casts in `services/`, `hooks/` and `components/`
  (`as const` and `satisfies` are fine).
- Real microservice or nothing: a service owns its database, image and lifecycle, and
  never reads another service's tables.

## Behavior preservation (CRITICAL when broken)

On any refactor the burden is on the diff to prove it changed nothing observable:

- Same routes, status codes, zod request/response schemas and response envelope.
- A named-parameter conversion that silently dropped or swapped an argument.
- A value object adopted on a path that previously accepted the value, so input that
  used to work now throws.
- An object literal replacing a `switch` that lost a case or a `default`.
- An early-return rewrite that inverted a condition.
- A `tv()`/tailwind-variants adoption that changed a rendered class, the DOM structure
  or an accessible name. Same-specificity Tailwind utilities resolve by stylesheet
  order, not by class-attribute order, so a reordering is a real change.
- If a test needed editing to accommodate a refactor, that is the signal behavior
  changed — treat it as a finding, not as housekeeping.

## Git

- Commits under user authorship only; no `Co-Authored-By` or AI attribution lines
  (CRITICAL if violated). No pushes, no branch changes, no remotes.
- Before any commit involving a move or an extraction, check
  `git status --porcelain` for untracked (`??`) paths. `git commit -a` never stages new
  files, so a commit can ship imports of a module that is not in the repo — and `tsc`
  cannot see it, because it resolves from disk rather than from the index.
