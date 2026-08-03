-- Brick 1–4 baseline schema.
-- Contains every table introduced before Brick 5 (the Listing Campaign Engine).
-- Uses CREATE TABLE IF NOT EXISTS and idempotent constraint/index helpers so it
-- is safe to apply against a fresh database OR one already provisioned via
-- drizzle-kit push.  Brick 5 tables live in 0001_brick5_campaign_engine.sql.

CREATE TABLE IF NOT EXISTS "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"affiliation" text NOT NULL,
	"inquiry_type" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"action" text NOT NULL,
	"success" boolean NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'admin' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"last_totp_epoch" integer,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestone_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"label" text NOT NULL,
	"offset_days" integer NOT NULL,
	"anchor" text NOT NULL,
	"direction" text NOT NULL,
	"day_type" text NOT NULL,
	"category" text NOT NULL,
	"requires_written_removal" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestone_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"name" text NOT NULL,
	"side" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"milestone_id" uuid,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text NOT NULL,
	"category" text NOT NULL,
	"offset_days" integer,
	"anchor" text,
	"direction" text,
	"day_type" text,
	"computed_date" date,
	"override_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"requires_written_removal" boolean DEFAULT false NOT NULL,
	"removal_delivered_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"property_address" text NOT NULL,
	"side" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"client_phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"acceptance_date" date,
	"close_of_escrow_date" date,
	"purchase_price" numeric(14, 2),
	"escrow_company" text,
	"escrow_officer" text,
	"escrow_officer_email" text,
	"lender" text,
	"coop_agent" text,
	"coop_brokerage" text,
	"notes" text,
	"ics_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "transactions_ics_token_unique" UNIQUE("ics_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"excerpt" text NOT NULL,
	"body" text NOT NULL,
	"hero_media_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "image_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slot_key" text NOT NULL,
	"label" text NOT NULL,
	"aspect_ratio" numeric(6, 4) NOT NULL,
	"min_width" integer NOT NULL,
	"current_media_id" uuid,
	"current_property_id" uuid,
	"assigned_at" timestamp with time zone,
	CONSTRAINT "image_slots_slot_key_unique" UNIQUE("slot_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"aspect_ratio" numeric(6, 4) NOT NULL,
	"focal_x" numeric(4, 3) DEFAULT '0.500' NOT NULL,
	"focal_y" numeric(4, 3) DEFAULT '0.500' NOT NULL,
	"alt_text" text,
	"credit" text,
	"derivatives" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"address" text NOT NULL,
	"neighborhood" text,
	"status" text DEFAULT 'pick' NOT NULL,
	"list_price" numeric(14, 2),
	"sold_price" numeric(14, 2),
	"sold_date" date,
	"beds" numeric,
	"baths" numeric,
	"sqft" integer,
	"lot_sqft" integer,
	"year_built" integer,
	"architect" text,
	"is_laura_listing" boolean DEFAULT false NOT NULL,
	"listing_brokerage" text,
	"commentary" text,
	"architecture_notes" text,
	"lot_notes" text,
	"value_notes" text,
	"hero_media_id" uuid,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "slot_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slot_key" text NOT NULL,
	"media_id" uuid NOT NULL,
	"property_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" uuid NOT NULL,
	"unassigned_at" timestamp with time zone
);
--> statement-breakpoint
-- Foreign keys (idempotent via DO block) ───────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_codes_user_id_users_id_fk') THEN
    ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_user_id_users_id_fk') THEN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'milestone_template_items_template_id_milestone_templates_id_fk') THEN
    ALTER TABLE "milestone_template_items" ADD CONSTRAINT "milestone_template_items_template_id_milestone_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."milestone_templates"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'milestone_templates_owner_id_users_id_fk') THEN
    ALTER TABLE "milestone_templates" ADD CONSTRAINT "milestone_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_documents_transaction_id_transactions_id_fk') THEN
    ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_documents_owner_id_users_id_fk') THEN
    ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_documents_milestone_id_transaction_milestones_id_fk') THEN
    ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_milestone_id_transaction_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."transaction_milestones"("id") ON DELETE set null ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_events_transaction_id_transactions_id_fk') THEN
    ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_events_owner_id_users_id_fk') THEN
    ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_milestones_transaction_id_transactions_id_fk') THEN
    ALTER TABLE "transaction_milestones" ADD CONSTRAINT "transaction_milestones_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transaction_milestones_owner_id_users_id_fk') THEN
    ALTER TABLE "transaction_milestones" ADD CONSTRAINT "transaction_milestones_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_owner_id_users_id_fk') THEN
    ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_media_property_id_properties_id_fk') THEN
    ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_media_media_id_media_id_fk') THEN
    ALTER TABLE "property_media" ADD CONSTRAINT "property_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
-- Indexes (IF NOT EXISTS) ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "inquiries_status_idx" ON "inquiries" USING btree ("status");
CREATE INDEX IF NOT EXISTS "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");
CREATE INDEX IF NOT EXISTS "milestone_templates_owner_id_idx" ON "milestone_templates" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "milestone_templates_office_id_idx" ON "milestone_templates" USING btree ("office_id");
CREATE INDEX IF NOT EXISTS "transaction_documents_transaction_id_idx" ON "transaction_documents" USING btree ("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_documents_owner_id_idx" ON "transaction_documents" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "transaction_events_transaction_id_idx" ON "transaction_events" USING btree ("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_events_owner_id_idx" ON "transaction_events" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "transaction_milestones_transaction_id_idx" ON "transaction_milestones" USING btree ("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_milestones_owner_id_idx" ON "transaction_milestones" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "transactions_owner_id_idx" ON "transactions" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "transactions_office_id_idx" ON "transactions" USING btree ("office_id");
CREATE INDEX IF NOT EXISTS "transactions_status_idx" ON "transactions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "articles_status_published_idx" ON "articles" USING btree ("status","published_at");
CREATE INDEX IF NOT EXISTS "articles_owner_id_idx" ON "articles" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "image_slots_owner_id_idx" ON "image_slots" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "media_owner_aspect_idx" ON "media" USING btree ("owner_id","aspect_ratio");
CREATE INDEX IF NOT EXISTS "properties_owner_id_idx" ON "properties" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "properties_status_sort_idx" ON "properties" USING btree ("status","sort_order");
CREATE INDEX IF NOT EXISTS "property_media_property_idx" ON "property_media" USING btree ("property_id");
CREATE INDEX IF NOT EXISTS "slot_assignments_owner_id_idx" ON "slot_assignments" USING btree ("owner_id");
CREATE INDEX IF NOT EXISTS "slot_assignments_slot_key_idx" ON "slot_assignments" USING btree ("slot_key");
CREATE INDEX IF NOT EXISTS "slot_assignments_slot_owner_idx" ON "slot_assignments" USING btree ("slot_key","owner_id");
CREATE INDEX IF NOT EXISTS "slot_assignments_slot_unassigned_idx" ON "slot_assignments" USING btree ("slot_key","unassigned_at");
