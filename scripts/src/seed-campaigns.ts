/**
 * scripts/src/seed-campaigns.ts
 * Seeds one default campaign template for `new_listing` trigger.
 * Idempotent — skips if the default template already exists.
 */

import { db, campaignTemplatesTable, campaignTemplateItemsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const TEMPLATE_ITEMS = [
  { label: "Instagram Post (Square)",   channel: "instagram_post",   offsetDays: 0,  dayType: "calendar", assetType: "image_1x1",  sortOrder: 0 },
  { label: "Instagram Story (Vertical)",channel: "instagram_story",  offsetDays: 0,  dayType: "calendar", assetType: "image_9x16", sortOrder: 1 },
  { label: "Announcement Email",         channel: "email",            offsetDays: 1,  dayType: "calendar", assetType: "email_html", sortOrder: 2 },
  { label: "Neighbor Postcard",          channel: "postcard",         offsetDays: 2,  dayType: "calendar", assetType: "print_pdf",  sortOrder: 3 },
  { label: "Instagram Story — 2nd Angle",channel: "instagram_story",  offsetDays: 5,  dayType: "calendar", assetType: "image_9x16", sortOrder: 4 },
  { label: "Farm Mailer",                channel: "mailer",           offsetDays: 7,  dayType: "calendar", assetType: "print_pdf",  sortOrder: 5 },
  { label: "Follow-Up Calls",            channel: "manual",           offsetDays: 10, dayType: "calendar", assetType: null,         sortOrder: 6 },
] as const;

async function main() {
  console.log("▶ seed-campaigns starting…");

  // Get first admin user
  const [firstUser] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .limit(1);

  if (!firstUser) {
    console.error("  No users found — run seed-users first");
    process.exit(1);
  }
  const ownerId = firstUser.id;
  console.log(`  ownerId = ${ownerId} (${firstUser.email})`);

  // Check if default new_listing template already exists
  const [existing] = await db
    .select({ id: campaignTemplatesTable.id })
    .from(campaignTemplatesTable)
    .where(
      and(
        eq(campaignTemplatesTable.ownerId, ownerId),
        eq(campaignTemplatesTable.trigger, "new_listing"),
        eq(campaignTemplatesTable.isDefault, true),
      ),
    )
    .limit(1);

  if (existing) {
    console.log(`  ✅ Default new_listing template already exists (id=${existing.id}) — skipping`);
    process.exit(0);
  }

  const [template] = await db
    .insert(campaignTemplatesTable)
    .values({
      ownerId,
      name:      "New Listing — Default",
      trigger:   "new_listing",
      isDefault: true,
    })
    .returning();

  console.log(`  Inserted template id=${template!.id}`);

  await db.insert(campaignTemplateItemsTable).values(
    TEMPLATE_ITEMS.map((item) => ({
      templateId: template!.id,
      label:      item.label,
      channel:    item.channel,
      offsetDays: item.offsetDays,
      dayType:    item.dayType,
      assetType:  item.assetType ?? null,
      sortOrder:  item.sortOrder,
    })),
  );

  console.log(`  Inserted ${TEMPLATE_ITEMS.length} template items`);
  console.log("✅ seed-campaigns complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
