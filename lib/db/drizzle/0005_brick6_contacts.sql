-- Brick 6: Contacts + contact_interactions + contactId on transactions
-- All statements use IF NOT EXISTS guards — idempotent.

-- contacts
CREATE TABLE IF NOT EXISTS "contacts" (
  "id"                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_id"               uuid NOT NULL REFERENCES "users"("id"),
  "office_id"              uuid,
  "first_name"             text NOT NULL,
  "last_name"              text NOT NULL,
  "email"                  text,
  "phone"                  text,
  "company"                text,
  "title"                  text,
  "contact_type"           text NOT NULL DEFAULT 'other',
  "neighborhood"           text,
  "address"                text,
  "source"                 text NOT NULL DEFAULT 'manual',
  "source_inquiry_id"      uuid REFERENCES "inquiries"("id") ON DELETE SET NULL,
  "notes"                  text,
  "tags"                   jsonb NOT NULL DEFAULT '[]',
  "subscribed_intelligence" boolean NOT NULL DEFAULT false,
  "subscribed_at"          timestamptz,
  "unsubscribed_at"        timestamptz,
  "last_contacted_at"      timestamptz,
  "archived"               boolean NOT NULL DEFAULT false,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contacts_owner_id_idx"       ON "contacts"("owner_id");
CREATE INDEX IF NOT EXISTS "contacts_contact_type_idx"   ON "contacts"("contact_type");
CREATE INDEX IF NOT EXISTS "contacts_email_idx"          ON "contacts"("email");

-- Partial unique: prevents duplicate active contacts for the same email+owner.
-- Archived contacts are excluded so a re-import after archiving works cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_owner_email_unique_idx"
  ON "contacts"("owner_id", lower("email"))
  WHERE "email" IS NOT NULL AND "archived" = false;

-- contact_interactions (append-only; never update or delete rows)
CREATE TABLE IF NOT EXISTS "contact_interactions" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"  uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "owner_id"    uuid NOT NULL REFERENCES "users"("id"),
  "kind"        text NOT NULL,   -- note | email | call | meeting | event
  "body"        text NOT NULL,
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "contact_interactions_contact_id_idx" ON "contact_interactions"("contact_id");
CREATE INDEX IF NOT EXISTS "contact_interactions_owner_id_idx"   ON "contact_interactions"("owner_id");

-- Link transactions to a contact (additive; no backfill)
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "transactions_contact_id_idx" ON "transactions"("contact_id");
