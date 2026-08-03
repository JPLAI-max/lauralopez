#!/bin/bash
# Post-merge setup — runs automatically after every task merge.
# Requirements: idempotent, non-interactive, fast.
set -e

echo "▶ post-merge: installing dependencies…"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "▶ post-merge: applying migrations (Bricks 1–5.2)…"
# All migration files use CREATE TABLE IF NOT EXISTS — idempotent.
pnpm --filter @workspace/scripts exec tsx src/migrate-brick5.ts

echo "▶ post-merge: seeding content (media, properties, slots) (Brick 5.3)…"
pnpm --filter @workspace/scripts exec tsx src/seed-content.ts

echo "▶ post-merge: seeding default campaign template…"
pnpm --filter @workspace/scripts exec tsx src/seed-campaigns.ts

echo "▶ post-merge: seeding marketing templates (Brick 5.2)…"
pnpm --filter @workspace/scripts exec tsx src/seed-marketing-templates.ts

echo "▶ post-merge: rebuilding shared libs…"
pnpm --filter @workspace/db exec tsc --build
pnpm --filter @workspace/integrations-anthropic-ai exec tsc --build 2>/dev/null || true

echo "▶ post-merge: done."
