# Review criteria — SnapScale

Applied by every reviewer on top of standard quality/conformance lenses.

## Test integrity (violations are CRITICAL, fail the gate)

- No test may be deleted, skipped, or weakened to make a suite pass. A failing
  test means fix the implementation. If a test itself is provably wrong, the
  report must say so explicitly with evidence, and the test is rewritten to be
  correct — never removed.
- No false positives: every test must be able to fail. Asserting a mock returns
  the mock, `expect(true).toBe(true)`, tests that pass with the feature broken,
  `expect` inside conditionals — all CRITICAL.
- Red-first evidence: units marked TDD in docs/04 must show a red commit before
  the green commit.
- Error tests assert type/message, not just "throws".

## Conventions (docs/03-technical-design.md §2 — HIGH unless noted)

- No inline `style=` in web (lint-enforced; reviewer confirms no disables).
- No `eslint-disable` without a justifying comment.
- Aliases `@/`→src, `~/`→app root; no `../../` climbing.
- Web: components render only — no `services/` imports in components; TanStack
  hooks only in `hooks/queries/` (one hook per domain); axios only in
  `services/http.ts`.
- API: routes → services → repositories layering; zod schemas from
  `@snapscale/shared` are the single source (validation + types + OpenAPI).
- Every new UI component: folder with component/types/stories/test/index.
- Immutability, early returns, no magic numbers (MEDIUM).

## Git

- Commits under user authorship only; no Co-Authored-By/AI attribution
  (CRITICAL if violated). No pushes, no remotes.
