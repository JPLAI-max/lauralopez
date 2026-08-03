/**
 * One-time migration: add owner_id to image_slots and slot_assignments.
 * Safe to re-run — uses IF NOT EXISTS and skips if already NOT NULL.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

async function main() {
  console.log("▶ migrate-slot-owner starting…");

  // ── image_slots ────────────────────────────────────────────────────────────
  await db.execute(sql`ALTER TABLE image_slots ADD COLUMN IF NOT EXISTS owner_id UUID`);
  console.log("  image_slots.owner_id column added (or already exists)");

  // Backfill with the first user (the site's admin owner)
  const updated = await db.execute(
    sql`UPDATE image_slots SET owner_id = (SELECT id FROM users LIMIT 1) WHERE owner_id IS NULL`,
  );
  console.log(`  image_slots rows backfilled: ${(updated as { rowCount?: number }).rowCount ?? 0}`);

  await db.execute(sql`ALTER TABLE image_slots ALTER COLUMN owner_id SET NOT NULL`);
  console.log("  image_slots.owner_id set NOT NULL");

  // ── slot_assignments ───────────────────────────────────────────────────────
  await db.execute(sql`ALTER TABLE slot_assignments ADD COLUMN IF NOT EXISTS owner_id UUID`);
  console.log("  slot_assignments.owner_id column added (or already exists)");

  // No existing rows to backfill — set NOT NULL directly
  await db.execute(sql`ALTER TABLE slot_assignments ALTER COLUMN owner_id SET NOT NULL`);
  console.log("  slot_assignments.owner_id set NOT NULL");

  // ── Indexes ────────────────────────────────────────────────────────────────
  await db.execute(sql`CREATE INDEX IF NOT EXISTS image_slots_owner_id_idx ON image_slots(owner_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS slot_assignments_owner_id_idx ON slot_assignments(owner_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS slot_assignments_slot_owner_idx ON slot_assignments(slot_key, owner_id)`);
  console.log("  indexes created (or already exist)");

  console.log("\n✅ Migration complete.");
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
