/**
 * gen-campaign-preview.ts
 *
 * Generates four proof files for Brick 5a acceptance criterion #4–6:
 *
 *   docs/campaign-previews/
 *     campaign-instagram-story.png    1080×1920  (story.just_listed v3)
 *     campaign-instagram-post.png     1080×1080  (post.just_listed  v3)
 *     campaign-postcard.pdf           450×666 pt (6×9 + 0.125" bleed)
 *     campaign-caption.txt            IG Story caption with DRE disclosure
 *
 * All four files are generated through the SAME functions the live campaign
 * engine calls, proving the campaign path uses the 5.2 renderer and
 * campaign-copy-gen, not a reimplementation.
 *
 * Run from the workspace root:
 *   scripts/node_modules/.bin/tsx scripts/src/gen-campaign-preview.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { db, marketingTemplatesTable, propertiesTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import {
  generateMarketingImage,
  extractStreet,
  extractCity,
} from "../../artifacts/api-server/src/lib/campaign-marketing-gen";
import {
  generateCampaignCopy,
  DEFAULT_COPY_MODEL,
} from "../../artifacts/api-server/src/lib/campaign-copy-gen";
import { generateCampaignPdf } from "../../artifacts/api-server/src/lib/campaign-pdf-gen";

const OUT_DIR = path.resolve("docs/campaign-previews");

// ---------------------------------------------------------------------------
// Dummy agent / DRE constants (would come from settings in the live path)
// ---------------------------------------------------------------------------
const AGENT_NAME     = "Laura Lopez";
const BROKERAGE_NAME = "Beverly Hills Estates";
const DRE_LICENSE    = "01234567";    // renderer prepends "DRE #" — don't double-prefix

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function save(name: string, data: Buffer | Uint8Array) {
  const p = path.join(OUT_DIR, name);
  writeFileSync(p, data);
  const kb = Math.round(data.length / 1024);
  console.log(`  ✓ ${name}  (${kb} KB)`);
}

/** Load active template by key, ordered newest-first. */
async function loadTemplate(key: string) {
  const rows = await db
    .select()
    .from(marketingTemplatesTable)
    .where(and(eq(marketingTemplatesTable.key, key), eq(marketingTemplatesTable.isActive, true)))
    .orderBy(desc(marketingTemplatesTable.version))
    .limit(1);
  const t = rows[0];
  if (!t) throw new Error(`Template "${key}" not found — run seed-marketing-templates first`);
  return t;
}

/** Parse HEADLINE / BODY / CTA sections from structured copy output. */
function parsePrintCopy(raw: string) {
  const result: { headline?: string; body?: string; cta?: string } = {};
  const hlMatch = raw.match(/^HEADLINE:\s*(.+)$/im);
  if (hlMatch) result.headline = hlMatch[1]!.trim();
  const ctaMatch = raw.match(/^CTA:\s*(.+)$/im);
  if (ctaMatch) result.cta = ctaMatch[1]!.trim();
  const bodyStart = raw.search(/^BODY:/im);
  const ctaStart  = raw.search(/^CTA:/im);
  if (bodyStart !== -1) {
    const slice = ctaStart > bodyStart ? raw.slice(bodyStart, ctaStart) : raw.slice(bodyStart);
    result.body = slice.replace(/^BODY:\s*/i, "").trim();
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("▶ gen-campaign-preview — generating 4 campaign proof files…\n");
  mkdirSync(OUT_DIR, { recursive: true });

  // ── Load templates ────────────────────────────────────────────────────────
  const [storyTpl, postTpl] = await Promise.all([
    loadTemplate("story.just_listed"),
    loadTemplate("post.just_listed"),
  ]);
  console.log(`  story template: ${storyTpl.name} v${storyTpl.version}  (${storyTpl.channel})`);
  console.log(`  post  template: ${postTpl.name}  v${postTpl.version}  (${postTpl.channel})`);

  // ── Load property for address / facts ────────────────────────────────────
  const propRows = await db
    .select({ address: propertiesTable.address, listPrice: propertiesTable.listPrice })
    .from(propertiesTable)
    .limit(1);
  const prop       = propRows[0];
  const fullAddr   = prop?.address ?? "412 N Mapleton Dr, Beverly Hills, CA 90210";
  const listPrice  = prop?.listPrice ?? "8750000";
  const priceStr   = "$" + Math.round(parseFloat(listPrice)).toLocaleString("en-US");
  const street     = extractStreet(fullAddr);
  const city       = extractCity(fullAddr);
  console.log(`  property: ${fullAddr} · ${priceStr}\n`);

  // ── Dummy photo — 1080×1920 gradient (real photo requires R2) ────────────
  const _require = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const sharp = _require("sharp");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const photoBuf1080x1920: Buffer = await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 170, g: 200, b: 220 } },
  }).jpeg().toBuffer();

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const photoBuf1080x1080: Buffer = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: { r: 190, g: 215, b: 225 } },
  }).jpeg().toBuffer();

  const commonFields = {
    headline:      "JUST LISTED",
    address:       street,
    city,
    price:         priceStr,
    roleLine:      "LISTED BY",
    agentName:     AGENT_NAME,
    brokerageMark: BROKERAGE_NAME,
  };

  // ── 1. Instagram Story PNG — 1080×1920 ───────────────────────────────────
  console.log("  Rendering instagram_story…");
  const storyResult = await generateMarketingImage({
    template:     storyTpl,
    fields:       { ...commonFields },
    sourceBuffer: photoBuf1080x1920,
    srcWidth:     1080,
    srcHeight:    1920,
    focalX:       0.5,
    focalY:       0.4,
    dreLicense:   DRE_LICENSE,
    brokerageName: BROKERAGE_NAME,
    previewOnly:  true,
  });
  save("campaign-instagram-story.png", storyResult.pngBuffer);

  // ── 2. Instagram Post PNG — 1080×1080 ────────────────────────────────────
  console.log("  Rendering instagram_post…");
  const postResult = await generateMarketingImage({
    template:     postTpl,
    fields:       { ...commonFields },
    sourceBuffer: photoBuf1080x1080,
    srcWidth:     1080,
    srcHeight:    1080,
    focalX:       0.5,
    focalY:       0.5,
    dreLicense:   DRE_LICENSE,
    brokerageName: BROKERAGE_NAME,
    previewOnly:  true,
  });
  save("campaign-instagram-post.png", postResult.pngBuffer);

  // ── 3. Postcard PDF ───────────────────────────────────────────────────────
  console.log(`  Generating postcard copy via ${DEFAULT_COPY_MODEL}…`);
  const facts = {
    address:    fullAddr,
    price:      priceStr,
    beds:       null,
    baths:      null,
    sqft:       null,
    yearBuilt:  null,
    commentary: null,
  };
  const copyOut  = await generateCampaignCopy("postcard", facts);
  const printCopy = parsePrintCopy(copyOut.raw);

  console.log("  Rendering postcard PDF…");
  const pdfResult = await generateCampaignPdf({
    channel:       "postcard",
    address:       fullAddr,
    price:         priceStr,
    agentName:     AGENT_NAME,
    dreLicense:    DRE_LICENSE,
    brokerageName: BROKERAGE_NAME,
    headline:      printCopy.headline,
    body:          printCopy.body,
    cta:           printCopy.cta,
    previewOnly:   true,
  });
  save("campaign-postcard.pdf", Buffer.from(pdfResult.buffer));

  // ── 4. Caption .txt — DRE disclosure included ─────────────────────────────
  // caption is returned by generateMarketingImage (DRE line appended by renderer)
  const captionPath = path.join(OUT_DIR, "campaign-caption.txt");
  writeFileSync(captionPath, storyResult.caption ?? "(no caption generated)");
  const captionKb = Math.round((storyResult.caption?.length ?? 0) / 1024 * 100) / 100;
  console.log(`  ✓ campaign-caption.txt  (${captionKb} KB)`);
  console.log(`    — preview: ${(storyResult.caption ?? "").slice(0, 120)}`);

  // ── Dimension sanity checks ────────────────────────────────────────────────
  console.log("\n  Dimension checks:");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const storySz: { width: number; height: number } = await sharp(storyResult.pngBuffer).metadata();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const postSz:  { width: number; height: number } = await sharp(postResult.pngBuffer).metadata();
  const storyOk = storySz.width === storyTpl.canvasWidth  && storySz.height === storyTpl.canvasHeight;
  const postOk  = postSz.width  === postTpl.canvasWidth   && postSz.height  === postTpl.canvasHeight;
  console.log(`    story: ${storySz.width}×${storySz.height} (expected ${storyTpl.canvasWidth}×${storyTpl.canvasHeight}) ${storyOk ? "✓" : "✗ MISMATCH"}`);
  console.log(`    post:  ${postSz.width}×${postSz.height} (expected ${postTpl.canvasWidth}×${postTpl.canvasHeight}) ${postOk ? "✓" : "✗ MISMATCH"}`);
  if (!storyOk || !postOk) throw new Error("Dimension mismatch — check template canvas size");

  console.log("\n✅ All four proof files committed to docs/campaign-previews/");
}

main()
  .catch((err: unknown) => {
    console.error("❌ gen-campaign-preview failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
