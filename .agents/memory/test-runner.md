---
name: Test runner for api-server
description: api-server has no tsx devDependency; use scripts package tsx for running ts tests
---

## Problem
`api-server` uses esbuild for its build; it does not have `tsx` in devDependencies.
`node --import tsx/esm` fails from that directory with `ERR_MODULE_NOT_FOUND`.

## Solution
Run TypeScript test files using tsx from the scripts package:
```
/home/runner/workspace/scripts/node_modules/.bin/tsx artifacts/api-server/src/lib/dates.test.ts
```
Or via the `test:dates` script added to api-server/package.json which references the absolute path.

## Date test file style
`dates.test.ts` uses plain `assert` with a custom `test()` helper (not `node:test`'s describe/it) so it can be run with `tsx` directly without the `--test` flag.

**Why:** node:test requires `--test` flag which requires `tsx/esm` loader; that loader isn't resolvable from within api-server's package scope.
