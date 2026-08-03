-- Brick 7: Intelligence fact store & report generator
-- PUBLIC STORE (portable, exportable)

CREATE TABLE "intel_sources" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"     uuid NOT NULL REFERENCES "users"("id"),
  "office_id"    uuid,
  "kind"         text NOT NULL,
  "title"        text NOT NULL,
  "url"          text,
  "document_key" text,
  "captured_at"  timestamptz NOT NULL,
  "notes"        text
);
CREATE INDEX "intel_sources_owner_id_idx" ON "intel_sources"("owner_id");

CREATE TABLE "parcels" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"     uuid NOT NULL REFERENCES "users"("id"),
  "office_id"    uuid,
  "apn"          text,
  "address"      text NOT NULL,
  "city"         text,
  "neighborhood" text,
  "zip"          text,
  "lot_sqft"     integer,
  "latitude"     numeric(10,7),
  "longitude"    numeric(10,7),
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "parcels_owner_id_idx"    ON "parcels"("owner_id");
CREATE INDEX "parcels_neighborhood_idx" ON "parcels"("neighborhood");
CREATE INDEX "parcels_apn_idx"         ON "parcels"("apn");

CREATE TABLE "parcel_events" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"    uuid NOT NULL REFERENCES "users"("id"),
  "parcel_id"   uuid NOT NULL REFERENCES "parcels"("id") ON DELETE CASCADE,
  "event_type"  text NOT NULL,
  "event_date"  date NOT NULL,
  "amount"      numeric(14,2),
  "description" text,
  "source_id"   uuid NOT NULL REFERENCES "intel_sources"("id"),
  "confidence"  text NOT NULL DEFAULT 'reported',
  "payload"     jsonb NOT NULL DEFAULT '{}',
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "parcel_events_owner_id_idx"   ON "parcel_events"("owner_id");
CREATE INDEX "parcel_events_parcel_id_idx"  ON "parcel_events"("parcel_id");
CREATE INDEX "parcel_events_event_type_idx" ON "parcel_events"("event_type");
CREATE INDEX "parcel_events_event_date_idx" ON "parcel_events"("event_date");

CREATE TABLE "regulatory_events" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"       uuid NOT NULL REFERENCES "users"("id"),
  "office_id"      uuid,
  "topic"          text NOT NULL,
  "title"          text NOT NULL,
  "effective_date" date,
  "summary"        text NOT NULL,
  "source_id"      uuid NOT NULL REFERENCES "intel_sources"("id"),
  "created_at"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "regulatory_events_owner_id_idx" ON "regulatory_events"("owner_id");

CREATE TABLE "report_templates" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"   uuid NOT NULL REFERENCES "users"("id"),
  "key"        text NOT NULL,
  "name"       text NOT NULL,
  "sections"   jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "report_templates_owner_id_idx" ON "report_templates"("owner_id");

CREATE TABLE "reports" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"      uuid NOT NULL REFERENCES "users"("id"),
  "office_id"     uuid,
  "template_id"   uuid,
  "title"         text NOT NULL,
  "period_start"  date NOT NULL,
  "period_end"    date NOT NULL,
  "neighborhood"  text,
  "status"        text NOT NULL DEFAULT 'draft',
  "body_markdown" text NOT NULL DEFAULT '',
  "fact_refs"     jsonb NOT NULL DEFAULT '[]',
  "article_id"    uuid,
  "generated_at"  timestamptz,
  "approved_at"   timestamptz,
  "published_at"  timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "reports_owner_id_idx"     ON "reports"("owner_id");
CREATE INDEX "reports_status_idx"       ON "reports"("status");
CREATE INDEX "reports_neighborhood_idx" ON "reports"("neighborhood");

-- LICENSED STORE (Laura-only, not exportable)

CREATE TABLE "mls_transactions" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"           uuid NOT NULL REFERENCES "users"("id"),
  "office_id"          uuid,
  "data_source"        text NOT NULL,
  "license_restricted" boolean NOT NULL DEFAULT true,
  "mls_number"         text,
  "address"            text NOT NULL,
  "neighborhood"       text,
  "list_price"         numeric(14,2),
  "sold_price"         numeric(14,2),
  "list_date"          date,
  "sold_date"          date,
  "days_on_market"     integer,
  "beds"               numeric(4,1),
  "baths"              numeric(4,1),
  "sqft"               integer,
  "lot_sqft"           integer,
  "year_built"         integer,
  "listing_brokerage"  text,
  "source_id"          uuid NOT NULL REFERENCES "intel_sources"("id"),
  "created_at"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "mls_transactions_owner_id_idx"     ON "mls_transactions"("owner_id");
CREATE INDEX "mls_transactions_neighborhood_idx" ON "mls_transactions"("neighborhood");
CREATE INDEX "mls_transactions_sold_date_idx"    ON "mls_transactions"("sold_date");

CREATE TABLE "off_market_notes" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"     uuid NOT NULL REFERENCES "users"("id"),
  "office_id"    uuid,
  "address"      text,
  "neighborhood" text,
  "note"         text NOT NULL,
  "signal_type"  text NOT NULL,
  "confidence"   text NOT NULL DEFAULT 'reported',
  "observed_at"  date NOT NULL,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "off_market_notes_owner_id_idx"     ON "off_market_notes"("owner_id");
CREATE INDEX "off_market_notes_neighborhood_idx" ON "off_market_notes"("neighborhood");
