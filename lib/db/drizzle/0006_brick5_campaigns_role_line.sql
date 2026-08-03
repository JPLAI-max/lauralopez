-- Brick 5: add role_line column to campaigns table
-- LISTED BY | REPRESENTED BUYER | REPRESENTED SELLER
ALTER TABLE "campaigns"
  ADD COLUMN IF NOT EXISTS "role_line" text NOT NULL DEFAULT 'LISTED BY';
