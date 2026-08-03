-- Brick 5 — Listing Campaign Engine
-- Additive migration: creates only the 7 new Brick 5 tables.
-- Safe to run against any database that already has the Brick 1–4 schema.
-- Uses CREATE TABLE IF NOT EXISTS so it is idempotent.

-- settings ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "settings" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id"   uuid NOT NULL REFERENCES "users"("id"),
  "key"        text NOT NULL,
  "value"      text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "settings_owner_id_idx" ON "settings"("owner_id");
ALTER TABLE "settings"
  DROP CONSTRAINT IF EXISTS "settings_owner_key_unique";
ALTER TABLE "settings"
  ADD CONSTRAINT "settings_owner_key_unique" UNIQUE ("owner_id", "key");

-- campaign_templates ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaign_templates" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id"   uuid NOT NULL REFERENCES "users"("id"),
  "office_id"  uuid,
  "name"       text NOT NULL,
  "trigger"    text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "campaign_templates_owner_id_idx"  ON "campaign_templates"("owner_id");
CREATE INDEX IF NOT EXISTS "campaign_templates_trigger_idx"   ON "campaign_templates"("trigger");

-- campaign_template_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaign_template_items" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "template_id" uuid NOT NULL REFERENCES "campaign_templates"("id") ON DELETE CASCADE,
  "label"       text NOT NULL,
  "channel"     text NOT NULL,
  "offset_days" integer NOT NULL,
  "day_type"    text NOT NULL,
  "asset_type"  text,
  "sort_order"  integer NOT NULL DEFAULT 0
);

-- campaign_assets (declared before campaign_tasks because tasks FK → assets) ──
CREATE TABLE IF NOT EXISTS "campaign_assets" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id"     uuid NOT NULL REFERENCES "users"("id"),
  "campaign_id"  uuid NOT NULL,  -- FK patched below after campaigns
  "task_id"      uuid NOT NULL,  -- FK patched below after campaign_tasks
  "asset_type"   text NOT NULL,
  "storage_key"  text,
  "text_content" text,
  "status"       text NOT NULL DEFAULT 'draft',
  "approved_at"  timestamptz,
  "approved_by"  text,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "campaign_assets_owner_id_idx"    ON "campaign_assets"("owner_id");
CREATE INDEX IF NOT EXISTS "campaign_assets_campaign_id_idx" ON "campaign_assets"("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_assets_task_id_idx"     ON "campaign_assets"("task_id");

-- campaigns ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaigns" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id"     uuid NOT NULL REFERENCES "users"("id"),
  "office_id"    uuid,
  "property_id"  uuid NOT NULL REFERENCES "properties"("id"),
  "template_id"  uuid,
  "trigger"      text NOT NULL,
  "anchor_date"  date NOT NULL,
  "status"       text NOT NULL DEFAULT 'active',
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "campaigns_owner_id_idx"    ON "campaigns"("owner_id");
CREATE INDEX IF NOT EXISTS "campaigns_property_id_idx" ON "campaigns"("property_id");
CREATE INDEX IF NOT EXISTS "campaigns_status_idx"      ON "campaigns"("status");

-- campaign_tasks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaign_tasks" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id"   uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "owner_id"      uuid NOT NULL REFERENCES "users"("id"),
  "label"         text NOT NULL,
  "channel"       text NOT NULL,
  "asset_type"    text,
  "computed_date" date,
  "override_date" date,
  "status"        text NOT NULL DEFAULT 'pending',
  "asset_id"      uuid REFERENCES "campaign_assets"("id") ON DELETE SET NULL,
  "notes"         text,
  "completed_at"  timestamptz,
  "sort_order"    integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "campaign_tasks_campaign_id_idx" ON "campaign_tasks"("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_tasks_owner_id_idx"    ON "campaign_tasks"("owner_id");
CREATE INDEX IF NOT EXISTS "campaign_tasks_status_idx"      ON "campaign_tasks"("status");

-- campaign_events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "campaign_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "owner_id"    uuid NOT NULL REFERENCES "users"("id"),
  "actor"       text NOT NULL,
  "action"      text NOT NULL,
  "payload"     jsonb NOT NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "campaign_events_campaign_id_idx" ON "campaign_events"("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_events_owner_id_idx"    ON "campaign_events"("owner_id");

-- Patch deferred FKs on campaign_assets now that all tables exist ──────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaign_assets_campaign_id_fkey'
      AND table_name = 'campaign_assets'
  ) THEN
    ALTER TABLE "campaign_assets"
      ADD CONSTRAINT "campaign_assets_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'campaign_assets_task_id_fkey'
      AND table_name = 'campaign_assets'
  ) THEN
    ALTER TABLE "campaign_assets"
      ADD CONSTRAINT "campaign_assets_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "campaign_tasks"("id") ON DELETE CASCADE;
  END IF;
END$$;
