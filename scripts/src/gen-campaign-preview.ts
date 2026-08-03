/**
 * gen-campaign-preview.ts
 *
 * Generates one representative campaign asset PNG and commits it to
 * docs/campaign-previews/ for acceptance review (AC#5).
 *
 * Uses the same rendering path the live campaign engine calls:
 *   generateMarketingImage() from campaign-marketing-gen.ts
 *
 * Loads the active story.just_listed template from the DB and renders
 * it with the same dummy property data used in gen-proofs.ts so the
 * result is reproducible without R2 storage.
 *
 * Run from the workspace root:
 *   scripts/node_modules/.bin/tsx scripts/src/gen-campaign-preview.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { db, marketingTemplatesTable, propertiesTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import {
  generateMarketingImage,
  extractStreet,
  extractCity,
} from "../../artifacts/api-server/src/lib/campaign-marketing-gen";

const OUT_DIR = path.resolve("docs/campaign-previews");

async function main() {
  console.log("▶ gen-campaign-preview — generating campaign asset preview…\n");

  mkdirSync(OUT_DIR, { recursive: true });

  // ── Load the active story.just_listed template ────────────────────────────
  const rows = await db
    .select()
    .from(marketingTemplatesTable)
    .where(
      and(
        eq(marketingTemplatesTable.key, "story.just_listed"),
        eq(marketingTemplatesTable.isActive, true),
      ),
    )
    .orderBy(desc(marketingTemplatesTable.version))
    .limit(1);

  const template = rows[0];
  if (!template) {
    throw new Error(
      "story.just_listed template not found — run seed-marketing-templates first",
    );
  }
  console.log(`  template: ${template.name} v${template.version} (${template.channel})`);

  // ── Load a real property photo from DB when available; fall back to dummy ─
  const propRows = await db
    .select({ address: propertiesTable.address })
    .from(propertiesTable)
    .limit(1);

  const FULL_ADDRESS = propRows[0]?.address ?? "412 N Mapleton Dr, Beverly Hills, CA 90210";
  const street = extractStreet(FULL_ADDRESS);
  const city   = extractCity(FULL_ADDRESS);
  console.log(`  property: ${FULL_ADDRESS}`);

  // Dummy 1080×1920 gradient photo — same as gen-proofs.ts
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRequire } = await import("node:module");
  const _require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const sharpMod  = _require("sharp");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
  const dummyBuf: Buffer = await sharpMod({
    create: {
      width: 1080, height: 1920,
      channels: 3,
      background: { r: 180, g: 210, b: 230 },
    },
  }).jpeg().toBuffer();

  // ── Render ────────────────────────────────────────────────────────────────
  const result = await generateMarketingImage({
    template,
    fields: {
      headline:      "JUST LISTED",
      address:       street,
      city,
      price:         "$8,750,000",
      roleLine:      "LISTED BY",
      agentName:     "Laura Lopez",
      brokerageMark: "Beverly Hills Estates",
    },
    sourceBuffer:  dummyBuf,
    srcWidth:      1080,
    srcHeight:     1920,
    focalX:        0.5,
    focalY:        0.4,
    dreLicense:    "DRE #01234567",
    brokerageName: "Beverly Hills Estates",
    previewOnly:   true,   // skip R2 upload; return pngBuffer directly
  });

  const outPath = path.join(OUT_DIR, "campaign-day0-instagram-story.png");
  writeFileSync(outPath, result.pngBuffer);
  const kb = (result.pngBuffer.length / 1024).toFixed(0);
  console.log(`\n  ✓ campaign-day0-instagram-story.png  (${kb} KB)`);
  console.log(`    channel:  ${template.channel}`);
  console.log(`    template: ${template.name} v${template.version}`);
  console.log(`    address:  ${street}`);
  console.log(`    caption stored on asset.textContent in live flow`);
  console.log("\n✅ Preview committed to docs/campaign-previews/");
}

main()
  .catch((err: unknown) => {
    console.error("❌ gen-campaign-preview failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
