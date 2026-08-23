# `@snapscale/e2e`

The phase-1 exit criterion (`docs/04-implementation-plan.md`, task 12) as an
executable test: **request OTP → read the code from MailHog → sign in → create an
album → upload an image → process it → see the result**, driven through the real
browser against the real stack.

## The stack must already be running

This package **does not start anything**. `playwright.config.ts` has no
`webServer` block on purpose: booting the stack from the test runner would mean
owning Postgres, the migrations and the mail server too, and a run that silently
starts a second api on port 4000 hides more than it proves. The journey is meant
to exercise the same processes a developer already has open.

So bring the stack up first, exactly as the root `README.md` describes:

```bash
docker compose up -d                      # postgres (5433) + mailhog (1025/8025)
pnpm --filter @snapscale/api db:migrate
pnpm dev                                  # api on :4000, web on :5173
```

## Running

```bash
pnpm --filter @snapscale/e2e exec playwright install chromium   # once
pnpm turbo run test:e2e                                         # or: pnpm --filter @snapscale/e2e test:e2e
pnpm --filter @snapscale/e2e test:e2e:report                    # open the HTML report
```

## Pointing it somewhere else

Every origin is read from `src/env.ts`, so the config and the specs can never
disagree:

| Variable | Default |
|---|---|
| `E2E_WEB_URL` | `http://localhost:5173` |
| `E2E_API_URL` | `http://localhost:4000` |
| `E2E_MAILHOG_URL` | `http://localhost:8025` |

## Layout

```
fixtures/gallery-sample.png   a real 512×384 RGB PNG — 4:3, so a 320×240
                              resize with sharp's fit:'inside' lands exactly
src/env.ts                    the three origins, env-overridable
src/mailhog.ts                inbox purge + poll-for-the-6-digit-code helper
tests/gallery-journey.spec.ts the journey, plus one negative check
playwright-report/            HTML report      (git-ignored)
test-results/                 traces, screenshots, videos on failure (git-ignored)
```

Each run uses a unique email address and purges the MailHog inbox first, so a
run can never read a code left behind by an earlier one.
