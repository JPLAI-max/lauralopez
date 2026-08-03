/**
 * transfer-ownership.ts
 *
 * Transfers all owned content from one user to another.
 * Safe, atomic, and opinionated — refuses to do anything partial.
 *
 * Usage:
 *   TRANSFER_FROM_EMAIL=old@domain.com \
 *   TRANSFER_TO_EMAIL=new@domain.com \
 *   TRANSFER_CONFIRM=yes \
 *   tsx src/transfer-ownership.ts
 *
 * Omitting TRANSFER_CONFIRM (or setting it to anything other than "yes")
 * prints a dry-run summary and exits without modifying the database.
 */

import { db } from "@workspace/db";
import { usersTable, authEventsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Owned tables (explicit enumeration — a new table must be added here or
// the script will not transfer its rows, and the omission is obvious).
//
// "ownedVia" marks tables whose ownership is indirect (no owner_id column);
// their counts are reported for transparency but no UPDATE is issued.
// ---------------------------------------------------------------------------
const OWNED_TABLES: Array<{ table: string; ownedVia?: string }> = [
  { table: "media" },
  { table: "properties" },
  { table: "property_media",             ownedVia: "properties" },   // no owner_id column
  { table: "articles" },
  { table: "image_slots" },
  { table: "slot_assignments" },
  { table: "transactions" },
  { table: "transaction_milestones" },
  { table: "transaction_documents" },
  { table: "transaction_events" },
  { table: "milestone_templates" },
  { table: "milestone_template_items" },
  { table: "campaigns" },
  { table: "campaign_tasks" },
  { table: "campaign_assets" },
  { table: "campaign_events" },
  { table: "campaign_templates" },
  { table: "campaign_template_items" },
  { table: "marketing_templates" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function tableExists(tableName: string): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"`,
  );
  return (rows as unknown as { rows: { exists: boolean }[] }).rows[0]?.exists === true;
}

async function countDirectRows(tableName: string, ownerId: string): Promise<number> {
  const rows = await db.execute(
    sql.raw(`SELECT count(*) AS cnt FROM "${tableName}" WHERE owner_id = '${ownerId}'`),
  );
  return parseInt(String((rows as unknown as { rows: { cnt: string }[] }).rows[0]?.cnt ?? "0"), 10);
}

async function countPropertyMediaRows(ownerId: string): Promise<number> {
  const rows = await db.execute(
    sql`SELECT count(*) AS cnt
        FROM property_media pm
        JOIN properties p ON p.id = pm.property_id
        WHERE p.owner_id = ${ownerId}`,
  );
  return parseInt(String((rows as unknown as { rows: { cnt: string }[] }).rows[0]?.cnt ?? "0"), 10);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const fromEmail   = process.env.TRANSFER_FROM_EMAIL?.trim();
  const toEmail     = process.env.TRANSFER_TO_EMAIL?.trim();
  const confirm     = process.env.TRANSFER_CONFIRM?.trim();

  if (!fromEmail || !toEmail) {
    console.error("❌  TRANSFER_FROM_EMAIL and TRANSFER_TO_EMAIL must both be set.");
    process.exit(1);
  }

  // Resolve users
  const [fromUser] = await db.select().from(usersTable).where(eq(usersTable.email, fromEmail));
  const [toUser]   = await db.select().from(usersTable).where(eq(usersTable.email, toEmail));

  if (!fromUser) {
    console.error(`❌  Source user not found: ${fromEmail}`);
    process.exit(1);
  }
  if (!toUser) {
    console.error(`❌  Target user not found: ${toEmail}`);
    process.exit(1);
  }
  if (fromUser.id === toUser.id) {
    console.error("❌  Source and target users are the same. Nothing to transfer.");
    process.exit(1);
  }

  console.log(`\n📋  Ownership Transfer`);
  console.log(`    FROM  ${fromEmail}  (${fromUser.id})`);
  console.log(`    TO    ${toEmail}    (${toUser.id})\n`);

  // ── Table existence check ────────────────────────────────────────────────
  console.log("Verifying all owned tables exist…");
  const missing: string[] = [];
  for (const entry of OWNED_TABLES) {
    const exists = await tableExists(entry.table);
    if (!exists) missing.push(entry.table);
  }
  if (missing.length > 0) {
    console.error(`❌  The following tables do not exist in the database:\n    ${missing.join(", ")}`);
    console.error("    Aborting — add these tables first (or update the OWNED_TABLES list if intentionally removed).");
    process.exit(1);
  }
  console.log("  ✓ All tables present.\n");

  // ── Dry run summary ───────────────────────────────────────────────────────
  console.log("DRY RUN — rows that would move:");
  type TableCount = { table: string; rows: number; note?: string };
  const counts: TableCount[] = [];
  let totalRows = 0;

  for (const entry of OWNED_TABLES) {
    let rowCount: number;
    let note: string | undefined;
    if (entry.ownedVia) {
      rowCount = await countPropertyMediaRows(fromUser.id);
      note = `(no owner_id — owned via ${entry.ownedVia})`;
    } else {
      rowCount = await countDirectRows(entry.table, fromUser.id);
    }
    counts.push({ table: entry.table, rows: rowCount, note });
    if (!entry.ownedVia) totalRows += rowCount;
  }

  for (const c of counts) {
    console.log(`  ${c.rows.toString().padStart(6)}  ${c.table}${c.note ? `  ${c.note}` : ""}`);
  }
  console.log(`  ──────`);
  console.log(`  ${totalRows.toString().padStart(6)}  total rows with direct owner_id\n`);

  if (confirm !== "yes") {
    console.log("ℹ️  Set TRANSFER_CONFIRM=yes to execute the transfer.");
    console.log("   Nothing was changed.\n");
    process.exit(0);
  }

  // ── Execute transfer in a single transaction ────────────────────────────
  console.log("Executing transfer…");
  const moved: TableCount[] = [];

  await db.transaction(async (tx) => {
    for (const entry of OWNED_TABLES) {
      if (entry.ownedVia) {
        // No direct owner_id — rows follow their parent, nothing to UPDATE here
        moved.push({ table: entry.table, rows: 0, note: "(transferred via parent)" });
        continue;
      }

      const result = await tx.execute(
        sql.raw(
          `UPDATE "${entry.table}" SET owner_id = '${toUser.id}' WHERE owner_id = '${fromUser.id}'`,
        ),
      );
      // Drizzle returns rowCount in .rowCount or via .rows.length depending on driver
      const rowsAffected =
        (result as unknown as { rowCount?: number }).rowCount ??
        (result as unknown as { rows?: unknown[] }).rows?.length ??
        0;
      moved.push({ table: entry.table, rows: rowsAffected as number });
    }

    // Log transfer event on BOTH user records
    const now = new Date();
    await tx.insert(authEventsTable).values([
      {
        userId:    fromUser.id,
        email:     fromUser.email,
        action:    "ownership_transferred",
        success:   true,
        userAgent: `transfer-ownership.ts → ${toEmail}`,
        createdAt: now,
      },
      {
        userId:    toUser.id,
        email:     toUser.email,
        action:    "ownership_transferred",
        success:   true,
        userAgent: `transfer-ownership.ts ← ${fromEmail}`,
        createdAt: now,
      },
    ]);
  });

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log("\n✅  Transfer complete. Rows moved:\n");
  let grandTotal = 0;
  for (const c of moved) {
    console.log(`  ${c.rows.toString().padStart(6)}  ${c.table}${c.note ? `  ${c.note}` : ""}`);
    grandTotal += c.rows;
  }
  console.log(`  ──────`);
  console.log(`  ${grandTotal.toString().padStart(6)}  total\n`);
  console.log(`  auth_events row logged for both users.\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("\n❌  Transfer failed — database was NOT modified.");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
