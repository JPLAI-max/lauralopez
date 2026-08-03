/**
 * Brick 5 additive migration runner.
 *
 * Applies lib/db/drizzle/0001_brick5_campaign_engine.sql using the project's
 * pg Pool connection from @workspace/db.  Uses CREATE TABLE IF NOT EXISTS
 * throughout, so it is safe to run against any state — fresh DB or an
 * already-populated Brick 1–4 database.  Idempotent.
 *
 * Run: scripts/node_modules/.bin/tsx scripts/src/migrate-brick5.ts
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const migrationPath = path.join(
  __dirname,
  "../../lib/db/drizzle/0001_brick5_campaign_engine.sql",
);

const migrationSql = readFileSync(migrationPath, "utf8");

async function run() {
  console.log("▶ migrate-brick5: applying additive migration…");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Execute the full migration as a single transaction.
    // The SQL uses CREATE TABLE IF NOT EXISTS throughout, so duplicate runs
    // are no-ops.  Drizzle statement-breakpoints are comments only; we can
    // execute the whole file at once.
    await client.query(migrationSql);

    await client.query("COMMIT");
    console.log("✅ migrate-brick5: migration applied successfully.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("❌ migrate-brick5 failed:", err.message ?? err);
  process.exit(1);
});
