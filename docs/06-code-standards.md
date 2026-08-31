# SnapScale — Code Standards

> House style. Binding from phase 1 onward: phase 1 is retrofitted to it, every later
> phase is born in it. Architecture lives in `02-architecture.md`, stack and folder
> conventions in `03-technical-design.md`, the anti-false-positive test rules in
> `03-technical-design.md` §9. This file governs *how the code is written*.
>
> Every rule below is either **lint-enforced** (the build fails) or **review-enforced**
> (a reviewer blocks the merge). Nothing here is advisory.

## 1. Functions are arrow functions

```ts
// yes
const buildApp = async ({ db, mailer }: BuildAppParams): Promise<FastifyInstance> => { ... }

// no
export async function buildApp(db: Db, mailer: Mailer) { ... }
```

`function` is allowed only where the language forces it: generators, declaration
merging, overload signatures, and code that genuinely needs its own `this`. There is
no such code in this repo today.

**Why:** one declaration form removes the hoisting question entirely — a `const` cannot
be called above its definition, so reading order and execution order match.

**Enforced by:** `func-style: ['error', 'expression', { allowArrowFunctions: true }]`,
`prefer-arrow-callback`.

## 2. `type`, not `interface`

```ts
// yes
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  variant?: ButtonVariant
}

// no
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { ... }
```

`interface` survives only for **declaration merging** — module augmentation of a
third-party type (`declare module 'fastify' { interface FastifyRequest { ... } }`).
That is the one thing `type` cannot do.

**Why:** JS inheritance is a bad default and `interface extends` invites it. Unions,
intersections, mapped and conditional types all need `type`; a codebase that mixes both
forces every author to pick, every time, for no gain.

**Enforced by:** `@typescript-eslint/consistent-type-definitions: ['error', 'type']`.

## 3. Named parameters, always

Every function we declare **and** call takes a single object.

```ts
// yes
type CreateOtpParams = { email: Email; ttlSeconds: number }
const createOtp = ({ email, ttlSeconds }: CreateOtpParams) => { ... }
createOtp({ email, ttlSeconds: config.OTP_TTL_SECONDS })

// no — two strings, and nothing at the call site says which is which
const createOtp = (email: string, code: string) => { ... }
```

This includes single-argument functions: `getUser({ id })`, not `getUser(id)`.

Signatures we do **not** own are out of scope, not exceptions: a callback handed to
`Array.prototype.map`, a Fastify route handler `(request, reply)`, a React event
handler — those shapes are dictated by the caller, which is someone else's code.

**Why:** a positional call site carries no information. Two same-typed parameters can
be swapped silently, and the compiler agrees. A named object also makes adding a
parameter a non-breaking change.

**Enforced by:** `max-params: ['error', 1]`, with narrow overrides where a third-party
signature dictates the shape (each override documented inline).

## 4. Immutability, always

Nothing is mutated: not parameters, not module state, not arrays, not objects.

```ts
// yes
const sorted = albums.toSorted(byCreatedAt)
const next = { ...user, name }
const appended = [...items, item]

// no — every one of these mutates in place
albums.sort(byCreatedAt)
user.name = name
items.push(item)
```

The mutating natives to watch, with their non-mutating replacements (all available on
Node 22 and every browser this project targets):

| Mutates | Use instead |
|---|---|
| `sort` | `toSorted` |
| `reverse` | `toReversed` |
| `splice` | `toSpliced` |
| `arr[i] = x` | `arr.with(i, x)` |
| `push` / `unshift` | `[...arr, x]` / `[x, ...arr]` |
| `pop` / `shift` | `arr.slice(0, -1)` / `arr.slice(1)` |
| `Object.assign(target, …)` | `{ ...target, … }` |
| `Date` setters | build a new `Date` |

Type-level backing: object and array properties on shared types are `readonly`; literal
constant tables end in `as const`.

**Enforced by:** `no-param-reassign: ['error', { props: true }]`, `prefer-const`, and a
`no-restricted-syntax` set covering the mutating member calls above.

## 5. Types must actually exist in that package

`Cannot find name 'HTMLImageElement'` and `Cannot find name 'window'` are not type
errors to silence — they are the tsconfig telling the truth: **there is no DOM here.**

- `apps/web` — `lib` includes `DOM`. Browser globals are legal.
- `apps/api`, `packages/otel`, `packages/shared`, `e2e` — Node libs only. `window`,
  `document`, `HTMLImageElement`, `localStorage` do not exist and must not be referenced.

Never widen a Node package's `lib` to make a browser global resolve. That does not fix
the code — it makes server code able to reference a `window` that will be `undefined` at
runtime. Browser code belongs in `apps/web`.

Same rule for any global: before referencing a type, confirm it is in that package's
`lib`/`types`. A type that "the editor knows" in one app may not exist in another.

**Enforced by:** `tsc --noEmit` per package (already the `typecheck` task); review.

## 6. No `import()` in the middle of code

Imports are static and live at the top of the file.

**Two documented exceptions**, both about process bootstrap, neither about business
logic:

1. `apps/api/src/index.ts` — OpenTelemetry's auto-instrumentation patches modules at
   **load** time. ESM evaluates the whole dependency graph, depth-first, before the
   importing module's first statement runs, so a static `import` of the app would load
   `fastify` and `pg` unpatched before `startTelemetry()` could install the loader hook.
   Dynamic `import()` is an expression, resolved after the `await`. Symptom when this is
   broken: telemetry runs, exports, and produces zero `pg`/`fastify` spans, with no error.
2. `packages/otel/src/start-telemetry.ts` — the SDK and its auto-instrumentations must
   never enter the process when `OTEL_ENABLED=false` (the contract in
   `03-technical-design.md` §8). A static import would load them in every process,
   including the whole test suite.

No third exception is added without amending this section.

**Enforced by:** review. Any `import()` outside those two files is a blocking finding.

## 7. Comments earn their place

A comment exists to say **why** something non-obvious is true. Nothing else.

Delete on sight:

- Comments restating the code (`// loop over albums`).
- References to tasks, plan sections, or phases (`// task 10`, `// per §8`) — the plan
  moves, the comment does not, and it rots into a lie.
- Multi-paragraph preambles narrating a design decision. Design rationale belongs in
  `docs/`; a comment may point at a constraint, not retell the story.

Keep: the one-liner that stops the next reader from "fixing" something correct.

```ts
// `once`: a second SIGTERM during a slow drain must still hard-kill.
process.once(signal, handler)
```

**Enforced by:** review.

## 8. One source of truth for types, enums and key values

Before declaring a type, a union, an error code, a storage key, a query key or a
constant: **search for it.** If it exists, import it. If it exists in one app and is
needed in two, it moves to `packages/shared` — it is never copied.

`packages/shared` owns everything that crosses an app boundary: zod schemas (validator
+ TS type + OpenAPI source, all one declaration), error codes, response envelopes,
domain types.

**Enforced by:** review.

## 9. Environment values are quoted strings

```yaml
# yes
environment:
  OTP_TTL_SECONDS: "600"
  POSTGRES_USER: "snapscale"

# no
environment:
  OTP_TTL_SECONDS: 600
  POSTGRES_USER: snapscale
```

Same in `.env` and `.env.example`: `OTP_TTL_SECONDS="600"`.

**Why:** an environment variable is a string at the OS level, always. Bare YAML values
get coerced by the parser — `600` becomes a number, `no`/`off`/`yes` become booleans —
and the mismatch surfaces as a confusing schema error at boot, or worse, does not
surface. Quoting makes the file say what the kernel will actually deliver.

**Enforced by:** review.

## 10. Encapsulate awkward values in a class

A value with rules of its own does not travel as a primitive. It gets a class that
validates at construction, so an invalid instance cannot exist.

```ts
// yes
const email = new Email(raw)     // throws on invalid; every consumer can trust it
const code = new OtpCode(raw)

// no — every consumer re-validates, or forgets to
const email: string = raw
```

Candidates in this repo: `Email`, `OtpCode`, `JwtToken`, `StorageKey`, entity ids,
image dimensions. A `string` that only some strings are valid for is the signal.

Shape: constructor validates and throws a typed error; the class is immutable
(`readonly` fields, no setters); it exposes the primitive through an explicit accessor,
never implicitly.

**Enforced by:** review.

## 11. No Tailwind class strings in constants

A constant holding Tailwind classes is a variant system reimplemented badly.

```ts
// yes
const button = tv({
  base: 'inline-flex items-center rounded-md',
  variants: { variant: { primary: 'bg-black text-white', secondary: 'bg-white text-black' } },
})

// no
const BUTTON_BASE = 'inline-flex items-center rounded-md'
const BUTTON_PRIMARY = `${BUTTON_BASE} bg-black text-white`
```

Use `tailwind-variants` (`tv`) for variants and slots, `tailwind-merge` for merging a
caller's `className` (it resolves conflicts by Tailwind's own precedence — string
concatenation does not; see the vault note on variant-order bugs), and Tailwind's
animation utilities for animation.

**Enforced by:** review; `no-restricted-syntax` flags string constants that look like
class lists.

## 12. Early return, never `else`

```ts
// yes
if (!otelEnv.OTEL_ENABLED) return NOOP_HANDLE
return startSdk(otelEnv)

// no
if (!otelEnv.OTEL_ENABLED) {
  return NOOP_HANDLE
} else {
  return startSdk(otelEnv)
}
```

**Why:** `else` grows indentation with each condition, and the reader has to hold both
branches in their head. An early return closes a case and removes it from the problem.

**Enforced by:** `no-else-return: ['error', { allowElseIf: false }]` plus a
`no-restricted-syntax` rule on `IfStatement[alternate]`.

## 13. Object literal, not `switch`

```ts
// yes
const FILTER_HANDLERS = {
  blur: applyBlur,
  grayscale: applyGrayscale,
  resize: applyResize,
} as const satisfies Record<ProcessFilter, FilterHandler>

const handler = FILTER_HANDLERS[filter]

// no
switch (filter) {
  case 'blur': ...
}
```

**Why:** the object is exhaustively checked by `satisfies Record<Union, T>` at compile
time — add a member to the union and it fails to compile. A `switch` needs a `default`
that throws to get the same guarantee, and gets fall-through and block-scoping bugs for
free. The micro-optimisation of a jump table is irrelevant at this scale.

**Enforced by:** `no-restricted-syntax` on `SwitchStatement`.

## 14. `useState` is not the default

Before reaching for `useState`, ask: **does this value render?**

| Value | Hook |
|---|---|
| Renders when it changes | `useState` |
| Survives renders, never renders | `useRef` |
| Derived from props/state | plain `const` — React Compiler memoizes it |
| Owned by the server | TanStack Query, not local state |

`useRef` is the right answer for timer and interval ids, DOM nodes, previous values,
in-flight flags that nothing displays, and anything a `useEffect` cleanup needs. Putting
those in `useState` causes a render per change, for a change nobody can see.

**Enforced by:** review.

## 15. Tests use the framework's structure

Vitest gives `describe`, `beforeAll`, `beforeEach`, `afterEach`, `afterAll` — use them.
Shared arrange goes in a hook, not copy-pasted into every `it`. Each test then reads as
Act + Assert, and a reader sees the setup once.

```ts
describe('createOtp', () => {
  let clock: FakeClock

  beforeEach(() => {
    clock = new FakeClock({ now: FIXED_NOW })
  })

  afterEach(() => {
    clock.restore()
  })

  it('expires the code after the configured TTL', () => { ... })
})
```

Setup that must not leak between tests goes in `beforeEach`/`afterEach`, never
`beforeAll` — a container or a fixed clock shared across tests is how coupling starts.

The five anti-false-positive rules (`03-technical-design.md` §9) still apply in full,
including the hard rule that no test is ever deleted, skipped or weakened.

**Enforced by:** review.

## 16. No magic numbers — and say what the value means in human terms

Every literal that means something gets a name, **and** a same-line comment translating
the raw value into human terms.

```ts
// yes
const QUERY_STALE_TIME_MS = 30_000 // 30 seconds
const RESEND_COOLDOWN_MS = 60_000 // 1 minute
const OTP_TTL_SECONDS = 600 // 10 minutes
const REQUEST_TIMEOUT_MS = 15_000 // 15 seconds

// no — the name gives you the unit, so you know these are milliseconds. You still
// cannot tell whether 30_000 is 30 seconds, 30 minutes or 30 days without doing the
// arithmetic yourself, which is exactly the question the rule exists to answer.
const QUERY_STALE_TIME_MS = 30_000

// no — a doc comment above, explaining the CONCEPT, answers a question nobody asked.
// What staleTime means is in the library's documentation; how long THIS one lasts is not.
/** Cached query data is treated as fresh for this long before a refetch is allowed. */
const QUERY_STALE_TIME_MS = 30_000
```

The name carries the **unit**; the same-line comment carries the **magnitude**. Both,
always. A reader must never have to divide by 1000 in their head to find out how long
something waits.

The comment is omitted only when the raw value already states the human quantity at a
glance — `const SALT_BYTES = 16`, `const POLL_INTERVAL_MS = 250`. The test is simple: can
a reader say the human value out loud without doing arithmetic? If not, the comment is
required.

`0`, `1` and `-1` are exempt from needing a name at all.

**Enforced by:** `no-magic-numbers` (`ignore: [0, 1, -1]`, `enforceConst: true`) catches
the unnamed literal; the same-line comment is a review finding, because no linter can
judge whether a magnitude is obvious. Relaxed in test files, where a literal inside an
assertion **is** the specification.

## 17. Test files live in the unit's folder

A module owns a folder named after it. Its test sits inside, next to it.

```
src/routes/albums/
├── albums.ts
├── albums.types.ts      # when the module has types worth splitting out
├── albums.test.ts
└── index.ts             # public export

src/components/atoms/Button/
├── Button.tsx
├── Button.types.ts
├── Button.stories.tsx
├── Button.test.tsx
└── index.ts
```

This is the anatomy `03-technical-design.md` already defines for `apps/web` components,
applied everywhere: routes, services, repositories, hooks, utils, shared schemas.

Where a file cannot own a folder — a fixed entrypoint such as `src/index.ts`, or several
small sibling files at a folder root — that folder gets **one** test file covering them,
named after the folder. Never a scatter of loose `*.test.ts` beside `*.ts`.

**Enforced by:** review.

## Enforcement summary

| # | Rule | Lint | Review |
|---|---|---|---|
| 1 | Arrow functions | ✅ | |
| 2 | `type` over `interface` | ✅ | |
| 3 | Named parameters | ✅ | ✅ |
| 4 | Immutability | ✅ | ✅ |
| 5 | Types exist in that package | ✅ (`tsc`) | ✅ |
| 6 | No mid-code `import()` | | ✅ |
| 7 | Comments earn their place | | ✅ |
| 8 | Single source of truth | | ✅ |
| 9 | Quoted env values | | ✅ |
| 10 | Value objects | | ✅ |
| 11 | No Tailwind constants | ✅ | ✅ |
| 12 | Early return, no `else` | ✅ | |
| 13 | Object literal, no `switch` | ✅ | |
| 14 | `useState` vs `useRef` | | ✅ |
| 15 | Test structure hooks | | ✅ |
| 16 | No magic numbers + human-terms comment | ✅ | ✅ |
| 17 | Test file location | | ✅ |
