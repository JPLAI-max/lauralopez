---
name: Adding workspace deps to laura-lopez
description: Steps required when adding a new @workspace/* package as a dependency of artifacts/laura-lopez
---

## Rule
When adding a new `@workspace/*` dependency to `artifacts/laura-lopez/package.json`:
1. Run `pnpm install --frozen-lockfile=false` to create the symlink in `node_modules/@workspace/`
2. Restart the `artifacts/laura-lopez: web` workflow — Vite caches module resolution and the new symlink is not picked up by HMR alone

**Why:** Vite's pre-bundling and import analysis runs at startup. A new symlink created after startup is invisible to the running dev server. The first pnpm install after adding the dep creates the symlink, but Vite still errors with "Cannot find module" until restarted. TypeScript (tsc --noEmit) resolves workspace packages fine without a restart because it follows tsconfig paths/references, not node_modules symlinks.

**How to apply:** Any time you edit `artifacts/laura-lopez/package.json` to add a `workspace:*` dep, include a workflow restart in the same batch of changes. Do not rely on HMR to pick it up.
