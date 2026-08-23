# Phase 1 — Coverage Summary

Command: `pnpm turbo run test:coverage --filter=@snapscale/api --filter=@snapscale/web --filter=@snapscale/shared --filter=@snapscale/otel --force`
Date: 2026-08-23
Result: 4/4 tasks successful (exit 0)

## @snapscale/otel

Test Files: 6 passed (6) — Tests: 20 passed (20)

```
% Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   98.49 |       90 |     100 |   98.49 |
 env.ts            |     100 |      100 |     100 |     100 |
 exporter.ts        |     100 |       75 |     100 |     100 | 19
 ...umentations.ts  |     100 |      100 |     100 |     100 |
 ...t-telemetry.ts  |   95.23 |    85.71 |     100 |   95.23 | 68-69
-------------------|---------|----------|---------|---------|-------------------
```

## @snapscale/shared

Test Files: 6 passed (6) — Tests: 71 passed (71)

```
% Coverage report from v8
-----------------|---------|----------|---------|---------|-------------------
File             | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-----------------|---------|----------|---------|---------|-------------------
All files        |     100 |      100 |     100 |     100 |
 src             |     100 |      100 |     100 |     100 |
  envelope.ts    |     100 |      100 |     100 |     100 |
  error-codes.ts |     100 |      100 |     100 |     100 |
 src/schemas     |     100 |      100 |     100 |     100 |
  album.ts       |     100 |      100 |     100 |     100 |
  auth.ts        |     100 |      100 |     100 |     100 |
  image.ts       |     100 |      100 |     100 |     100 |
  process.ts     |     100 |      100 |     100 |     100 |
-----------------|---------|----------|---------|---------|-------------------
```

## @snapscale/web

Test Files: 28 passed (28) — Tests: 177 passed (177)

```
All files                    |   98.04 |    93.26 |     100 |   98.04 |
 src                         |     100 |      100 |     100 |     100 |
 src/components/atoms/*      |     100 |      100 |     100 |     100 |
 src/components/molecules/*  |     100 |      100 |     100 |     100 |
 .../CreateAlbumForm         |   95.74 |       90 |     100 |   95.74 | 25-26
 .../ProcessImagePanel       |    97.6 |       92 |     100 |    97.6 | 47-48,68-69
 .../pages/AlbumDetail       |   97.75 |    97.14 |     100 |   97.75 | 63-64
 .../pages/Albums            |     100 |     90.9 |     100 |     100 | 37
 .../pages/Login             |   95.12 |       80 |     100 |   95.12 | 37-38,47-48
 .../ProtectedRoute          |     100 |      100 |     100 |     100 |
 src/context                 |     100 |      100 |     100 |     100 |
 src/hooks                   |     100 |      100 |     100 |     100 |
 src/hooks/queries           |   98.78 |    94.11 |     100 |   98.78 |
 src/services                |   96.63 |       90 |     100 |   96.63 |
 src/utils                   |   97.56 |       96 |     100 |   97.56 |
```
(Every file's own worst dimension stayed at or above 80%; overall statement/branch/function/line
coverage all ≥93%. Full per-file table is in the raw vitest output captured for this run.)

## @snapscale/api

Test Files: 28 passed (28) — Tests: 213 passed (213)

```
All files          |   97.36 |     90.4 |   95.28 |   97.36 |
 src               |    98.4 |    84.61 |     100 |    98.4 |
 src/db            |     100 |      100 |   55.55 |     100 |   (schema.ts has 0% func coverage — a
                                                                  types-only Drizzle schema file, no
                                                                  executable functions to cover)
 src/plugins       |     100 |    97.67 |     100 |     100 |
 src/repositories  |     100 |    93.75 |     100 |     100 |
 src/routes        |   96.67 |    88.37 |     100 |   96.67 |
 src/services      |   95.75 |    89.47 |   97.95 |   95.75 |
```

## Totals across the four packages

| Package | Test Files | Tests | Stmts % | Branch % | Funcs % | Lines % |
|---|---|---|---|---|---|---|
| otel   | 6  | 20  | 98.49 | 90.00 | 100.00 | 98.49 |
| shared | 6  | 71  | 100.00 | 100.00 | 100.00 | 100.00 |
| web    | 28 | 177 | 98.04 | 93.26 | 100.00 | 98.04 |
| api    | 28 | 213 | 97.36 | 90.40 | 95.28 | 97.36 |

All four packages clear the 80% floor on every dimension.
