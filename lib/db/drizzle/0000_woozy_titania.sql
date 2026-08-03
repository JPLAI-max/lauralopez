CREATE TABLE "inquiries" (
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
CREATE TABLE "auth_events" (
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
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "users" (
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
CREATE TABLE "milestone_template_items" (
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
CREATE TABLE "milestone_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"name" text NOT NULL,
	"side" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_documents" (
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
CREATE TABLE "transaction_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_milestones" (
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
CREATE TABLE "transactions" (
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
CREATE TABLE "articles" (
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
CREATE TABLE "image_slots" (
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
CREATE TABLE "media" (
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
CREATE TABLE "properties" (
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
CREATE TABLE "property_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slot_assignments" (
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
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_owner_key_unique" UNIQUE("owner_id","key")
);
--> statement-breakpoint
CREATE TABLE "campaign_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"asset_type" text NOT NULL,
	"storage_key" text,
	"text_content" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text NOT NULL,
	"channel" text NOT NULL,
	"asset_type" text,
	"computed_date" date,
	"override_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"asset_id" uuid,
	"notes" text,
	"completed_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"label" text NOT NULL,
	"channel" text NOT NULL,
	"offset_days" integer NOT NULL,
	"day_type" text NOT NULL,
	"asset_type" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"office_id" uuid,
	"property_id" uuid NOT NULL,
	"template_id" uuid,
	"trigger" text NOT NULL,
	"anchor_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_template_items" ADD CONSTRAINT "milestone_template_items_template_id_milestone_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."milestone_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_templates" ADD CONSTRAINT "milestone_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_documents" ADD CONSTRAINT "transaction_documents_milestone_id_transaction_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."transaction_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_events" ADD CONSTRAINT "transaction_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_milestones" ADD CONSTRAINT "transaction_milestones_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_milestones" ADD CONSTRAINT "transaction_milestones_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_assets" ADD CONSTRAINT "campaign_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_events" ADD CONSTRAINT "campaign_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tasks" ADD CONSTRAINT "campaign_tasks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tasks" ADD CONSTRAINT "campaign_tasks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tasks" ADD CONSTRAINT "campaign_tasks_asset_id_campaign_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."campaign_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_template_items" ADD CONSTRAINT "campaign_template_items_template_id_campaign_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_templates" ADD CONSTRAINT "campaign_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "milestone_templates_owner_id_idx" ON "milestone_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "milestone_templates_office_id_idx" ON "milestone_templates" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "transaction_documents_transaction_id_idx" ON "transaction_documents" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_documents_owner_id_idx" ON "transaction_documents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transaction_events_transaction_id_idx" ON "transaction_events" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_events_owner_id_idx" ON "transaction_events" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transaction_milestones_transaction_id_idx" ON "transaction_milestones" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_milestones_owner_id_idx" ON "transaction_milestones" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transactions_owner_id_idx" ON "transactions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "transactions_office_id_idx" ON "transactions" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "articles_status_published_idx" ON "articles" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "articles_owner_id_idx" ON "articles" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "image_slots_owner_id_idx" ON "image_slots" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "media_owner_aspect_idx" ON "media" USING btree ("owner_id","aspect_ratio");--> statement-breakpoint
CREATE INDEX "properties_owner_id_idx" ON "properties" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "properties_status_sort_idx" ON "properties" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "property_media_property_idx" ON "property_media" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "slot_assignments_owner_id_idx" ON "slot_assignments" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "slot_assignments_slot_key_idx" ON "slot_assignments" USING btree ("slot_key");--> statement-breakpoint
CREATE INDEX "slot_assignments_slot_owner_idx" ON "slot_assignments" USING btree ("slot_key","owner_id");--> statement-breakpoint
CREATE INDEX "slot_assignments_slot_unassigned_idx" ON "slot_assignments" USING btree ("slot_key","unassigned_at");--> statement-breakpoint
CREATE INDEX "settings_owner_id_idx" ON "settings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_assets_owner_id_idx" ON "campaign_assets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_assets_campaign_id_idx" ON "campaign_assets" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_assets_task_id_idx" ON "campaign_assets" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "campaign_events_campaign_id_idx" ON "campaign_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_events_owner_id_idx" ON "campaign_events" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_tasks_campaign_id_idx" ON "campaign_tasks" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_tasks_owner_id_idx" ON "campaign_tasks" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_tasks_status_idx" ON "campaign_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_templates_owner_id_idx" ON "campaign_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_templates_trigger_idx" ON "campaign_templates" USING btree ("trigger");--> statement-breakpoint
CREATE INDEX "campaigns_owner_id_idx" ON "campaigns" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaigns_property_id_idx" ON "campaigns" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");