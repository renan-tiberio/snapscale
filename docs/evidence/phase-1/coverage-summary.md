# Phase 1 — Coverage Summary

Command: `pnpm exec turbo run test:coverage --force`
Date: 2026-09-02
Commit: `29727cc03c38bc4b7ae7235537d37b34214633ee`
Result: 6/6 tasks successful, 0 cached (4 × `test:coverage` plus the 2 upstream `build`
tasks pulled in through the `^build` edge), exit 0, 9.709s.

`--force` means no table below came from turbo's cache. Thresholds are declared in each
package's `vitest.config.ts` — 80% on lines, branches, functions and statements — and fail
the task, so the exit code is the gate.

## @snapscale/shared

Test Files: 13 passed (13) — Tests: 168 passed (168)

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |     100 |      100 |     100 |     100 |
 envelope          |     100 |      100 |     100 |     100 |
  envelope.ts      |     100 |      100 |     100 |     100 |
 error-codes       |     100 |      100 |     100 |     100 |
  error-codes.ts   |     100 |      100 |     100 |     100 |
 http-status       |     100 |      100 |     100 |     100 |
  http-status.ts   |     100 |      100 |     100 |     100 |
 schemas           |     100 |      100 |     100 |     100 |
  ...ject-rules.ts |     100 |      100 |     100 |     100 |
 schemas/album     |     100 |      100 |     100 |     100 |
  album.ts         |     100 |      100 |     100 |     100 |
 schemas/auth      |     100 |      100 |     100 |     100 |
  auth.ts          |     100 |      100 |     100 |     100 |
 schemas/image     |     100 |      100 |     100 |     100 |
  image.ts         |     100 |      100 |     100 |     100 |
 schemas/process   |     100 |      100 |     100 |     100 |
  process.ts       |     100 |      100 |     100 |     100 |
 ...-objects/email |     100 |      100 |     100 |     100 |
  email.ts         |     100 |      100 |     100 |     100 |
 ...cts/entity-ids |     100 |      100 |     100 |     100 |
  entity-ids.ts    |     100 |      100 |     100 |     100 |
 ...ects/jwt-token |     100 |      100 |     100 |     100 |
  jwt-token.ts     |     100 |      100 |     100 |     100 |
 ...jects/otp-code |     100 |      100 |     100 |     100 |
  otp-code.ts      |     100 |      100 |     100 |     100 |
 ...ts/storage-key |     100 |      100 |     100 |     100 |
  storage-key.ts   |     100 |      100 |     100 |     100 |
 ...e-object-error |     100 |      100 |     100 |     100 |
  ...ject-error.ts |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------
```

The value-object folders (`email`, `entity-ids`, `jwt-token`, `otp-code`, `storage-key`,
`value-object-error`) and `http-status` did not exist in the 2026-08-23 report — they
arrived with the house-standards refactor, and they are why this package's test count went
from 71 to 168 while staying at 100% on every dimension.

## @snapscale/otel

Test Files: 6 passed (6) — Tests: 20 passed (20)

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |     100 |       90 |     100 |     100 |
 env               |     100 |      100 |     100 |     100 |
  env.ts           |     100 |      100 |     100 |     100 |
 exporter          |     100 |       75 |     100 |     100 |
  exporter.ts      |     100 |       75 |     100 |     100 | 15
 instrumentations  |     100 |      100 |     100 |     100 |
  ...mentations.ts |     100 |      100 |     100 |     100 |
 start-telemetry   |     100 |    85.71 |     100 |     100 |
  ...-telemetry.ts |     100 |    85.71 |     100 |     100 | 61
-------------------|---------|----------|---------|---------|-------------------
```

Statements, functions and lines are now 100% (98.49% on 2026-08-23). Branches sit at 90%
overall; the two partial files, `exporter.ts` at 75% and `start-telemetry.ts` at 85.71%,
both clear the 80% floor at the package level, which is where the threshold applies.

## @snapscale/web

Test Files: 34 passed (34) — Tests: 202 passed (202)

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   97.72 |    92.59 |   98.29 |   97.72 |
 App               |     100 |      100 |     100 |     100 |
  App.tsx          |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...s/atoms/Button |     100 |      100 |     100 |     100 |
  Button.tsx       |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...toms/TextInput |     100 |      100 |     100 |     100 |
  TextInput.tsx    |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...ules/AlbumCard |     100 |      100 |     100 |     100 |
  AlbumCard.tsx    |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...ules/ImageCard |     100 |      100 |     100 |     100 |
  ImageCard.tsx    |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...s/OtpCodeInput |     100 |      100 |     100 |     100 |
  OtpCodeInput.tsx |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...s/UploadButton |     100 |      100 |     100 |     100 |
  UploadButton.tsx |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...reateAlbumForm |   96.15 |    91.66 |     100 |   96.15 |
  ...AlbumForm.tsx |   96.07 |    91.66 |     100 |   96.07 | 24-25
  index.ts         |     100 |      100 |     100 |     100 |
 ...cessImagePanel |    96.7 |    90.32 |     100 |    96.7 |
  ...magePanel.tsx |   96.68 |    90.32 |     100 |   96.68 | 62-63,81-82,91-92
  index.ts         |     100 |      100 |     100 |     100 |
 ...es/AlbumDetail |   97.84 |    97.14 |     100 |   97.84 |
  AlbumDetail.tsx  |   97.82 |    97.14 |     100 |   97.82 | 67-68
  index.ts         |     100 |      100 |     100 |     100 |
 ...s/pages/Albums |     100 |    91.66 |     100 |     100 |
  Albums.tsx       |     100 |    91.66 |     100 |     100 | 37
  index.ts         |     100 |      100 |     100 |     100 |
 ...ts/pages/Login |   95.34 |    81.81 |     100 |   95.34 |
  Login.tsx        |   95.29 |    81.81 |     100 |   95.29 | 36-37,46-47
  index.ts         |     100 |      100 |     100 |     100 |
 ...ProtectedRoute |     100 |      100 |     100 |     100 |
  ...ctedRoute.tsx |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...t/AppProviders |     100 |      100 |     100 |     100 |
  AppProviders.tsx |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...xt/AuthContext |     100 |      100 |     100 |     100 |
  AuthContext.tsx  |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...xt/queryClient |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  queryClient.ts   |     100 |      100 |     100 |     100 |
 ...ries/useAlbums |     100 |    83.33 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  useAlbums.ts     |     100 |    83.33 |     100 |     100 | 73
 ...ueries/useAuth |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  useAuth.ts       |     100 |      100 |     100 |     100 |
 ...s/useFileToken |   95.74 |    92.85 |     100 |   95.74 |
  index.ts         |     100 |      100 |     100 |     100 |
  useFileToken.ts  |   95.65 |    92.85 |     100 |   95.65 | 55-56
 ...ries/useImages |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  useImages.ts     |     100 |      100 |     100 |     100 |
 ...seProcessImage |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  ...ocessImage.ts |     100 |      100 |     100 |     100 |
 hooks/useAppEvent |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  useAppEvent.ts   |     100 |      100 |     100 |     100 |
 ...eEventListener |      96 |     87.5 |   66.66 |      96 |
  index.ts         |       0 |        0 |       0 |       0 | 1
  ...ntListener.ts |     100 |      100 |     100 |     100 |
 services/albums   |     100 |      100 |     100 |     100 |
  albums.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 services/auth     |     100 |      100 |     100 |     100 |
  auth.ts          |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 services/http     |   94.28 |    80.64 |     100 |   94.28 |
  http.ts          |   94.23 |    80.64 |     100 |   94.23 | ...37-138,145-146
  index.ts         |     100 |      100 |     100 |     100 |
 services/images   |     100 |      100 |     100 |     100 |
  images.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 services/storage  |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  storage.ts       |     100 |      100 |     100 |     100 |
 ...ices/telemetry |   88.88 |       75 |      50 |   88.88 |
  index.ts         |       0 |        0 |       0 |       0 | 1
  telemetry.ts     |     100 |      100 |     100 |     100 |
 utils/env         |     100 |      100 |     100 |     100 |
  env.ts           |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 utils/events      |   92.59 |    85.71 |     100 |   92.59 |
  events.ts        |    92.3 |    85.71 |     100 |    92.3 | 53-54
  index.ts         |     100 |      100 |     100 |     100 |
 utils/imageUrls   |     100 |      100 |     100 |     100 |
  imageUrls.ts     |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 utils/jwt         |   93.75 |     90.9 |     100 |   93.75 |
  index.ts         |     100 |      100 |     100 |     100 |
  jwt.ts           |   93.54 |     90.9 |     100 |   93.54 | 39-40
 ...processPresets |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  ...essPresets.ts |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------
```

Two barrel files are the only genuinely uncovered code: `hooks/useEventListener/index.ts`
and `services/telemetry/index.ts` both report 0% on their single line, which is what drags
their folders to 66.66% and 50% functions respectively. Nothing in either is behavior —
they are re-exports that no test happens to import through.

## @snapscale/api

Test Files: 29 passed (29) — Tests: 240 passed (240)

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   97.14 |    90.25 |   94.95 |   97.14 |   <- branch varies run to run, see note below
 app               |    96.7 |    82.35 |     100 |    96.7 |
  app.ts           |   96.68 |    82.35 |     100 |   96.68 | 141,185-189
  index.ts         |     100 |      100 |     100 |     100 |
 config            |     100 |      100 |     100 |     100 |
  config.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 db                |     100 |      100 |   33.33 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  schema.ts        |     100 |      100 |       0 |     100 |
 db/migrate        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  migrate.ts       |     100 |      100 |     100 |     100 |
 db/rows           |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  rows.ts          |     100 |      100 |     100 |     100 |
 ...ins/auth-guard |     100 |    97.43 |     100 |     100 |
  auth-guard.ts    |     100 |    97.43 |     100 |     100 | 136
  index.ts         |     100 |      100 |     100 |     100 |
 ...itories/albums |     100 |    81.81 |     100 |     100 |
  albums.ts        |     100 |    81.81 |     100 |     100 | 69,111
  index.ts         |     100 |      100 |     100 |     100 |
 ...itories/images |     100 |      100 |     100 |     100 |
  images.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 repositories/otp  |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  otp.ts           |     100 |      100 |     100 |     100 |
 ...ocessed-images |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  ...sed-images.ts |     100 |      100 |     100 |     100 |
 ...sitories/users |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  users.ts         |     100 |      100 |     100 |     100 |
 routes/albums     |     100 |      100 |     100 |     100 |
  albums.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 routes/auth       |   96.72 |    81.25 |     100 |   96.72 |
  auth.ts          |   96.69 |    81.25 |     100 |   96.69 | 110-111,168-169
  index.ts         |     100 |      100 |     100 |     100 |
 routes/file-token |     100 |      100 |     100 |     100 |
  file-token.ts    |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 routes/files      |   95.83 |     87.5 |     100 |   95.83 |
  files.ts         |   95.74 |     87.5 |     100 |   95.74 | 69-70
  index.ts         |     100 |      100 |     100 |     100 |
 routes/health     |     100 |      100 |     100 |     100 |
  health.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 routes/images     |   93.42 |    86.11 |     100 |   93.42 |
  images.ts        |   93.39 |    86.11 |     100 |   93.39 | ...30-231,307-308
  index.ts         |     100 |      100 |     100 |     100 |
 ...images-process |   96.29 |    83.33 |     100 |   96.29 |
  ...es-process.ts |   96.22 |    83.33 |     100 |   96.22 | 78-79
  index.ts         |     100 |      100 |     100 |     100 |
 routes/me         |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  me.ts            |     100 |      100 |     100 |     100 |
 routes/schemas    |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  schemas.ts       |     100 |      100 |     100 |     100 |
 services/albums   |     100 |    85.71 |     100 |     100 |
  albums.ts        |     100 |    85.71 |     100 |     100 | 116-117
  index.ts         |     100 |      100 |     100 |     100 |
 ...es/file-access |   94.36 |    85.71 |     100 |   94.36 |
  file-access.ts   |   94.28 |    85.71 |     100 |   94.28 | 47-48,118-119
  index.ts         |     100 |      100 |     100 |     100 |
 services/hashing  |     100 |      100 |     100 |     100 |
  hashing.ts       |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 services/health   |     100 |      100 |     100 |     100 |
  health.ts        |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
 ...age-processing |   84.32 |     82.6 |   86.66 |   84.32 |
  ...processing.ts |   84.21 |     82.6 |   86.66 |   84.21 | ...89-192,237-247
  index.ts         |     100 |      100 |     100 |     100 |
 services/images   |   97.92 |    89.13 |     100 |   97.92 |
  images.ts        |   97.91 |    89.13 |     100 |   97.91 | 116-119
  index.ts         |     100 |      100 |     100 |     100 |
 services/mailer   |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  mailer.ts        |     100 |      100 |     100 |     100 |
 services/otp      |     100 |    93.33 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  otp.ts           |     100 |    93.33 |     100 |     100 | 121
 ...ces/otp-crypto |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  otp-crypto.ts    |     100 |      100 |     100 |     100 |
 services/storage  |     100 |      100 |     100 |     100 |
  index.ts         |     100 |      100 |     100 |     100 |
  storage.ts       |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------
```

`db/schema.ts` reports 0% functions (dragging the `db` folder to 33.33%): it is a
types-only Drizzle schema with no executable functions to cover, the same reading as the
2026-08-23 report. The weakest real file is `services/image-processing/image-processing.ts`
at 84.32% statements / 82.6% branches — the lowest number anywhere in the workspace, and
still above the floor.

## Totals across the four packages

| Package | Test Files | Tests | Stmts % | Branch % | Funcs % | Lines % |
|---|---|---|---|---|---|---|
| otel   | 6  | 20  | 100.00 | 90.00  | 100.00 | 100.00 |
| shared | 13 | 168 | 100.00 | 100.00 | 100.00 | 100.00 |
| web    | 34 | 202 | 97.72  | 92.59  | 98.29  | 97.72  |
| api    | 29 | 240 | 97.14  | 90.25-90.28 | 94.95  | 97.14  |
| **Total** | **82** | **630** | | | | |

All four packages clear the 80% floor on every dimension. Movement since 2026-08-23
(`f7d061a`, 481 tests): shared 71 → 168, otel 20 → 20, web 177 → 202, api 213 → 240. No
package lost a test.

## api branch coverage is not deterministic

The same command — `pnpm exec turbo run test:coverage --force` — yields **90.28**
and then **90.25** on consecutive runs. Measured back to back on 2026-09-03.

The cause is visible in the run log: `apps/api` carries a concurrency smoke test that
fires ten parallel requests at `/images/process`, and its wall time swings between runs
(avg 37.3 ms in one, 52.3 ms in the next). That timing decides at least one branch.

Statements, functions and lines are stable at 97.14 / 94.95 / 97.14, and lines is the
gated metric, so the 80% floor is unaffected. Any single published branch figure would
be attributing a number to a command that does not reliably produce it, which is why
the tables above carry a range.
