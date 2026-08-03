#!/bin/bash
# Post-merge setup — runs after every task merge.
# Must be: idempotent, non-interactive, fast.
set -e

echo "▶ post-merge: installing dependencies…"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "▶ post-merge: pushing DB schema…"
pnpm --filter @workspace/db run push-force

echo "▶ post-merge: rebuilding shared libs…"
pnpm --filter @workspace/db exec tsc --build
pnpm --filter @workspace/integrations-anthropic-ai exec tsc --build 2>/dev/null || true

echo "▶ post-merge: done."
