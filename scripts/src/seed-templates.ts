/**
 * Seed default milestone templates for a given user.
 * Idempotent — skips if default templates already exist for that user.
 *
 * Run: ADMIN_SEED_EMAIL=... pnpm --filter @workspace/scripts seed-templates
 */
import { db, usersTable, milestoneTemplatesTable, milestoneTemplateItemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let adminEmail = process.env.ADMIN_SEED_EMAIL;
if (!adminEmail) {
  // Fall back to the first admin user in the DB
  const admins = await db.select({ email: usersTable.email }).from(usersTable).limit(1);
  if (admins.length === 0) {
    console.error("No users in DB and ADMIN_SEED_EMAIL not set. Run seed-admin first.");
    process.exit(1);
  }
  adminEmail = admins[0]!.email;
  console.log(`ADMIN_SEED_EMAIL not set — using first user: ${adminEmail}`);
}

// ── Standard templates ──────────────────────────────────────────────────────
// All offsets are STARTING GUESSES. Confirm against the executed contract.
const TEMPLATES: Array<{
  name: string;
  side: "buy" | "sell";
  items: Array<{
    label: string;
    offsetDays: number;
    anchor: "acceptance" | "coe";
    direction: "after" | "before";
    dayType: "calendar" | "business";
    category: "contingency" | "disclosure" | "inspection" | "financing" | "admin";
    requiresWrittenRemoval: boolean;
    sortOrder: number;
  }>;
}> = [
  {
    name: "Standard Purchase (Buy)",
    side: "buy",
    items: [
      {
        label: "Earnest Money Deposit",
        offsetDays: 3,
        anchor: "acceptance",
        direction: "after",
        dayType: "business",
        category: "admin",
        requiresWrittenRemoval: false,
        sortOrder: 1,
      },
      {
        label: "Seller Disclosures Delivery Deadline",
        offsetDays: 5,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "disclosure",
        requiresWrittenRemoval: false,
        sortOrder: 2,
      },
      {
        label: "Buyer's Inspection Contingency",
        offsetDays: 10,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "inspection",
        requiresWrittenRemoval: true,
        sortOrder: 3,
      },
      {
        label: "Appraisal Contingency",
        offsetDays: 17,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "financing",
        requiresWrittenRemoval: true,
        sortOrder: 4,
      },
      {
        label: "Loan Contingency",
        offsetDays: 21,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "financing",
        requiresWrittenRemoval: true,
        sortOrder: 5,
      },
      {
        label: "All Contingencies Removal",
        offsetDays: 21,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "contingency",
        requiresWrittenRemoval: false,
        sortOrder: 6,
      },
      {
        label: "Final Walkthrough",
        offsetDays: 1,
        anchor: "coe",
        direction: "before",
        dayType: "calendar",
        category: "admin",
        requiresWrittenRemoval: false,
        sortOrder: 7,
      },
      {
        label: "Close of Escrow",
        offsetDays: 0,
        anchor: "coe",
        direction: "after",
        dayType: "calendar",
        category: "admin",
        requiresWrittenRemoval: false,
        sortOrder: 8,
      },
    ],
  },
  {
    name: "Standard Sale (Sell)",
    side: "sell",
    items: [
      {
        label: "Earnest Money Deposit Receipt",
        offsetDays: 3,
        anchor: "acceptance",
        direction: "after",
        dayType: "business",
        category: "admin",
        requiresWrittenRemoval: false,
        sortOrder: 1,
      },
      {
        label: "Seller Disclosure Delivery",
        offsetDays: 5,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "disclosure",
        requiresWrittenRemoval: false,
        sortOrder: 2,
      },
      {
        label: "Buyer's Inspection Period",
        offsetDays: 10,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "inspection",
        requiresWrittenRemoval: true,
        sortOrder: 3,
      },
      {
        label: "Appraisal Contingency Removal Deadline",
        offsetDays: 17,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "financing",
        requiresWrittenRemoval: true,
        sortOrder: 4,
      },
      {
        label: "Loan Contingency Removal Deadline",
        offsetDays: 21,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "financing",
        requiresWrittenRemoval: true,
        sortOrder: 5,
      },
      {
        label: "Contingency Removal / Release of Contingency",
        offsetDays: 21,
        anchor: "acceptance",
        direction: "after",
        dayType: "calendar",
        category: "contingency",
        requiresWrittenRemoval: false,
        sortOrder: 6,
      },
      {
        label: "Final Walkthrough",
        offsetDays: 1,
        anchor: "coe",
        direction: "before",
        dayType: "calendar",
        category: "admin",
        requiresWrittenRemoval: false,
        sortOrder: 7,
      },
      {
        label: "Close of Escrow",
        offsetDays: 0,
        anchor: "coe",
        direction: "after",
        dayType: "calendar",
        category: "admin",
        requiresWrittenRemoval: false,
        sortOrder: 8,
      },
    ],
  },
];

async function main() {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, adminEmail!))
    .limit(1);

  const user = users[0];
  if (!user) {
    console.error(`User not found: ${adminEmail}`);
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;

  for (const tpl of TEMPLATES) {
    const existing = await db
      .select({ id: milestoneTemplatesTable.id })
      .from(milestoneTemplatesTable)
      .where(
        and(
          eq(milestoneTemplatesTable.ownerId, user.id),
          eq(milestoneTemplatesTable.name, tpl.name),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`Skipping "${tpl.name}" — already exists.`);
      skipped++;
      continue;
    }

    const [template] = await db
      .insert(milestoneTemplatesTable)
      .values({
        ownerId: user.id,
        name: tpl.name,
        side: tpl.side,
        isDefault: true,
      })
      .returning();

    await db.insert(milestoneTemplateItemsTable).values(
      tpl.items.map((item) => ({
        templateId: template!.id,
        ...item,
      })),
    );

    console.log(`Created "${tpl.name}" with ${tpl.items.length} milestones.`);
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped: ${skipped}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
