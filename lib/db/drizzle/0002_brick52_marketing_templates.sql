-- Brick 5.2 — Marketing Template System
-- Additive migration: creates marketing_templates and adds two nullable columns
-- to campaign_assets.  Safe to run against any database with Bricks 1–5.
-- All statements use IF NOT EXISTS / IF NOT EXISTS guards — idempotent.

-- marketing_templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "marketing_templates" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id"        uuid,
  "office_id"       uuid,
  "key"             text NOT NULL,
  "name"            text NOT NULL,
  "channel"         text NOT NULL,
  "version"         integer NOT NULL DEFAULT 1,
  "canvas_width"    integer NOT NULL,
  "canvas_height"   integer NOT NULL,
  "definition"      jsonb NOT NULL,
  "required_fields" jsonb NOT NULL,
  "photo_aspect"    numeric(6,4) NOT NULL,
  "is_active"       boolean NOT NULL DEFAULT true,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: a template key+version pair must be immutable.
-- Guard prevents failure on re-run and avoids the exclusive-lock cost of
-- dropping + recreating an existing constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_templates_key_version_unique'
      AND conrelid = 'marketing_templates'::regclass
  ) THEN
    ALTER TABLE "marketing_templates"
      ADD CONSTRAINT "marketing_templates_key_version_unique"
      UNIQUE ("key", "version");
  END IF;
END
$$;

-- Add template tracking columns to campaign_assets (nullable for backward compat)
ALTER TABLE "campaign_assets"
  ADD COLUMN IF NOT EXISTS "template_id"      uuid,
  ADD COLUMN IF NOT EXISTS "template_version" integer;
