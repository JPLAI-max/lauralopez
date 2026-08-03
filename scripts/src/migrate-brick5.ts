/**
 * Full migration runner — applies the complete ordered schema.
 *
 * Migration sequence:
 *   0000_woozy_titania.sql          — Brick 1–4 baseline (IF NOT EXISTS, safe on existing DBs)
 *   0001_brick5_campaign_engine.sql — Brick 5 additive  (IF NOT EXISTS, safe on existing DBs)
 *
 * Both files use CREATE TABLE IF NOT EXISTS, so this runner is fully
 * idempotent and safe to apply against:
 *   • a fresh database        — creates every table in order
 *   • an existing Brick 1–4 DB — 0000 is a no-op; 0001 creates the 7 new tables
 *   • an already-migrated DB  — both files are no-ops
 *
 * Run: scripts/node_modules/.bin/tsx src/migrate-brick5.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = path.join(__dirname, "../../lib/db/drizzle");

const MIGRATIONS = [
  "0000_woozy_titania.sql",
  "0001_brick5_campaign_engine.sql",
];

async function run() {
  console.log("▶ migrate: applying schema migrations…");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const filename of MIGRATIONS) {
      const sql = readFileSync(path.join(DRIZZLE_DIR, filename), "utf8");
      console.log(`  ▸ applying ${filename}…`);
      await client.query(sql);
      console.log(`  ✓ ${filename} applied`);
    }
    await client.query("COMMIT");
    console.log("✅ All migrations applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err: unknown) => {
  console.error("❌ Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
