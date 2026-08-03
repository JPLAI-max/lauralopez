/**
 * scripts/src/seed-campaigns.ts
 * Seeds two default campaign templates:
 *   1. new_listing  — Just Listed sequence (7 items)
 *   2. sold         — Just Sold sequence  (5 items)
 * Idempotent — skips any template whose trigger+isDefault row already exists.
 */

import { db, campaignTemplatesTable, campaignTemplateItemsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── New Listing ──────────────────────────────────────────────────────────────
const NEW_LISTING_ITEMS = [
  { label: "Instagram Post — Just Listed",     channel: "instagram_post",  offsetDays: 0,  dayType: "calendar", assetType: "image_1x1",  sortOrder: 0 },
  { label: "Instagram Story — Just Listed",    channel: "instagram_story", offsetDays: 0,  dayType: "calendar", assetType: "image_9x16", sortOrder: 1 },
  { label: "Just Listed Announcement Email",   channel: "email",           offsetDays: 1,  dayType: "calendar", assetType: "email_html", sortOrder: 2 },
  { label: "Neighbor Postcard",                channel: "postcard",        offsetDays: 2,  dayType: "calendar", assetType: "print_pdf",  sortOrder: 3 },
  { label: "Instagram Story — 2nd Angle",      channel: "instagram_story", offsetDays: 5,  dayType: "calendar", assetType: "image_9x16", sortOrder: 4 },
  { label: "Farm Mailer",                      channel: "mailer",          offsetDays: 7,  dayType: "calendar", assetType: "print_pdf",  sortOrder: 5 },
  { label: "Follow-Up Calls",                  channel: "manual",          offsetDays: 10, dayType: "calendar", assetType: null,         sortOrder: 6 },
] as const;

// ── Sold ─────────────────────────────────────────────────────────────────────
// Voicemail intentionally excluded — added manually per campaign.
const SOLD_ITEMS = [
  { label: "Instagram Post — Just Sold",       channel: "instagram_post",  offsetDays: 0, dayType: "calendar", assetType: "image_1x1",  sortOrder: 0 },
  { label: "Instagram Story — Just Sold",      channel: "instagram_story", offsetDays: 0, dayType: "calendar", assetType: "image_9x16", sortOrder: 1 },
  { label: "Just Sold Announcement Email",     channel: "email",           offsetDays: 1, dayType: "calendar", assetType: "email_html", sortOrder: 2 },
  { label: "Just Sold Postcard",               channel: "postcard",        offsetDays: 2, dayType: "calendar", assetType: "print_pdf",  sortOrder: 3 },
  { label: "Farm Mailer — Sold",               channel: "mailer",          offsetDays: 7, dayType: "calendar", assetType: "print_pdf",  sortOrder: 4 },
] as const;

interface TemplateSpec {
  name:      string;
  trigger:   "new_listing" | "sold";
  isDefault: boolean;
  items:     ReadonlyArray<{
    label:      string;
    channel:    string;
    offsetDays: number;
    dayType:    string;
    assetType:  string | null;
    sortOrder:  number;
  }>;
}

const TEMPLATES: TemplateSpec[] = [
  { name: "New Listing — Default", trigger: "new_listing", isDefault: true, items: NEW_LISTING_ITEMS },
  { name: "Just Sold — Default",   trigger: "sold",        isDefault: true, items: SOLD_ITEMS },
];

async function main() {
  console.log("▶ seed-campaigns starting…");

  const [firstUser] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .limit(1);

  if (!firstUser) {
    console.error("  No users found — run seed-admin first");
    process.exit(1);
  }
  const ownerId = firstUser.id;
  console.log(`  ownerId = ${ownerId} (${firstUser.email})`);

  let inserted = 0;
  let skipped  = 0;

  for (const spec of TEMPLATES) {
    const [existing] = await db
      .select({ id: campaignTemplatesTable.id })
      .from(campaignTemplatesTable)
      .where(
        and(
          eq(campaignTemplatesTable.ownerId,   ownerId),
          eq(campaignTemplatesTable.trigger,   spec.trigger),
          eq(campaignTemplatesTable.isDefault, true),
        ),
      )
      .limit(1);

    if (existing) {
      console.log(`  ↓ ${spec.trigger} default already exists (id=${existing.id}) — skipping`);
      skipped++;
      continue;
    }

    const [template] = await db
      .insert(campaignTemplatesTable)
      .values({ ownerId, name: spec.name, trigger: spec.trigger, isDefault: spec.isDefault })
      .returning();

    await db.insert(campaignTemplateItemsTable).values(
      spec.items.map((item) => ({
        templateId: template!.id,
        label:      item.label,
        channel:    item.channel,
        offsetDays: item.offsetDays,
        dayType:    item.dayType,
        assetType:  item.assetType,
        sortOrder:  item.sortOrder,
      })),
    );

    console.log(`  ✓ seeded "${spec.name}" (${spec.items.length} items)`);
    inserted++;
  }

  console.log(`✅ seed-campaigns done — ${inserted} inserted, ${skipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
