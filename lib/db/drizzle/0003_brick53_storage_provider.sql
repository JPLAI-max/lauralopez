-- Brick 5.3 — Reconnect Images + Ownership Transfer
-- Adds storage_provider to media so local public/images/ files can coexist
-- with R2-hosted uploads. Default 'r2' keeps all existing rows unchanged.

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "storage_provider" text NOT NULL DEFAULT 'r2';
