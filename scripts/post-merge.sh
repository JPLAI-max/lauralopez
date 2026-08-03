#!/bin/bash
# Post-merge setup — runs automatically after every task merge.
# Requirements: idempotent, non-interactive, fast.
set -e

echo "▶ post-merge: installing dependencies…"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "▶ post-merge: applying Brick 5 additive migration…"
# Paths are relative to scripts/ (pnpm exec changes cwd to the package root).
# 0001_brick5_campaign_engine.sql uses CREATE TABLE IF NOT EXISTS — idempotent.
pnpm --filter @workspace/scripts exec tsx src/migrate-brick5.ts

echo "▶ post-merge: seeding default campaign template…"
pnpm --filter @workspace/scripts exec tsx src/seed-campaigns.ts

echo "▶ post-merge: rebuilding shared libs…"
pnpm --filter @workspace/db exec tsc --build
pnpm --filter @workspace/integrations-anthropic-ai exec tsc --build 2>/dev/null || true

echo "▶ post-merge: done."
