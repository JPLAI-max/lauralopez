/**
 * scripts/src/seed-content.ts
 *
 * Seeds:
 *   - Media rows for every static image in artifacts/laura-lopez/public/images/
 *   - 16 articles from MarketIntelligence.tsx (draft, no body yet)
 *   - 6 top-pick properties from TopPicks.tsx fallback (status: pick)
 *   - 3 listed  properties (status: listed, isLauraListing: true)
 *   - Sets heroMediaId on all 9 properties
 *   - Image slots (home.hero, about.portrait, and others)
 *   - Slot assignments for home.hero and about.portrait
 *
 * Idempotent — matches media on storageKey, properties on address, slots on slotKey.
 * Reads real PNG dimensions directly from the file header (no extra dependencies).
 * Requires DATABASE_URL.  Falls back to first DB user as ownerId.
 */

import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db } from "@workspace/db";
import {
  usersTable,
  articlesTable,
  propertiesTable,
  imageSlotsTable,
  slotAssignmentsTable,
  mediaTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Resolve to workspace root → artifacts/laura-lopez/public/images
const IMAGES_DIR = path.resolve(__dirname, "../../artifacts/laura-lopez/public/images");

// ---------------------------------------------------------------------------
// PNG dimension reader — reads width/height from IHDR chunk header bytes.
// PNG structure: 8-byte signature + IHDR chunk (4 length, 4 type, 4 width, 4 height …)
// ---------------------------------------------------------------------------
function readPngDimensions(filename: string): { width: number; height: number } {
  const buf = readFileSync(path.join(IMAGES_DIR, filename));
  if (buf.length < 24) throw new Error(`File too small for PNG: ${filename}`);
  const width  = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height) throw new Error(`Zero dimension in PNG: ${filename}`);
  return { width, height };
}

function pngSizeBytes(filename: string): number {
  return statSync(path.join(IMAGES_DIR, filename)).size;
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------
const ARTICLES = [
  // Neighborhood Intelligence
  {
    slug: "beverly-park-guard-gated-community-overview",
    title: "Beverly Park: Guard-gated community overview, lot sizes, comp analysis",
    category: "neighborhood",
    excerpt: "A comprehensive analysis of the enduring premium associated with Los Angeles' most secure enclave.",
    body: "# Beverly Park: Guard-gated community overview, lot sizes, comp analysis\n\n*Full report coming soon.*",
  },
  {
    slug: "trousdale-estates-mid-century-modernist-architecture-guide",
    title: "Trousdale Estates: Mid-century modernist architecture guide",
    category: "neighborhood",
    excerpt: "Understanding the preservation value and renovation constraints of Trousdale's architectural heritage.",
    body: "# Trousdale Estates: Mid-century modernist architecture guide\n\n*Full report coming soon.*",
  },
  {
    slug: "holmby-hills-estate-sized-lots-proximity-ucla-historic-value",
    title: "Holmby Hills: Estate-sized lots, proximity to UCLA, historic value",
    category: "neighborhood",
    excerpt: "The structural advantages of Holmby Hills' rare flat acreage and platinum triangle positioning.",
    body: "# Holmby Hills: Estate-sized lots, proximity to UCLA, historic value\n\n*Full report coming soon.*",
  },
  {
    slug: "beverly-hills-flats-post-war-traditional-inventory-analysis",
    title: "Beverly Hills Flats: Post-war traditional inventory analysis",
    category: "neighborhood",
    excerpt: "Assessing the generational turnover and redevelopment potential within the Flats.",
    body: "# Beverly Hills Flats: Post-war traditional inventory analysis\n\n*Full report coming soon.*",
  },
  {
    slug: "bel-air-canyon-privacy-compound-potential",
    title: "Bel Air: Canyon privacy, compound potential",
    category: "neighborhood",
    excerpt: "Evaluating topographic constraints and privacy premiums in Bel Air's upper and lower canyons.",
    body: "# Bel Air: Canyon privacy, compound potential\n\n*Full report coming soon.*",
  },
  // Regulatory Intelligence
  {
    slug: "proposition-19-property-tax-implications-inherited-real-estate",
    title: "Proposition 19: Property tax implications for inherited real estate",
    category: "regulatory",
    excerpt: "Strategic planning required to navigate the reassessment of legacy assets upon transfer.",
    body: "# Proposition 19: Property tax implications for inherited real estate\n\n*Full report coming soon.*",
  },
  {
    slug: "firpta-foreign-buyer-requirements-withholding-rules",
    title: "FIRPTA: Foreign buyer requirements and withholding rules",
    category: "regulatory",
    excerpt: "Essential compliance frameworks for international principals acquiring or divesting U.S. property.",
    body: "# FIRPTA: Foreign buyer requirements and withholding rules\n\n*Full report coming soon.*",
  },
  {
    slug: "fincen-beneficial-ownership-reporting-requirements-llcs",
    title: "FinCEN Beneficial Ownership: Reporting requirements for LLCs",
    category: "regulatory",
    excerpt: "Navigating new transparency mandates while maintaining appropriate corporate veils.",
    body: "# FinCEN Beneficial Ownership: Reporting requirements for LLCs\n\n*Full report coming soon.*",
  },
  {
    slug: "ab38-fire-hardening-disclosure-requirements",
    title: "AB38: Fire hardening disclosure requirements",
    category: "regulatory",
    excerpt: "Understanding the liability and compliance landscape for hillside properties.",
    body: "# AB38: Fire hardening disclosure requirements\n\n*Full report coming soon.*",
  },
  // Architecture
  {
    slug: "paul-williams-dean-beverly-hills-residential-design",
    title: "Paul Williams: The dean of Beverly Hills residential design",
    category: "architecture",
    excerpt: "The enduring market premium commanded by verified Williams commissions.",
    body: "# Paul Williams: The dean of Beverly Hills residential design\n\n*Full report coming soon.*",
  },
  {
    slug: "wallace-neff-spanish-colonial-revival-mastery",
    title: "Wallace Neff: Spanish Colonial Revival mastery",
    category: "architecture",
    excerpt: "Identifying and preserving the hallmark details of Neff's most significant estates.",
    body: "# Wallace Neff: Spanish Colonial Revival mastery\n\n*Full report coming soon.*",
  },
  {
    slug: "richard-neutra-case-study-modernism-hills",
    title: "Richard Neutra: Case Study modernism in the hills",
    category: "architecture",
    excerpt: "The unique valuation metrics applied to historically significant modernist structures.",
    body: "# Richard Neutra: Case Study modernism in the hills\n\n*Full report coming soon.*",
  },
  {
    slug: "buff-hensman-desert-modernism-influence",
    title: "Buff & Hensman: Desert modernism influence",
    category: "architecture",
    excerpt: "The resurgence of post and beam architecture and its impact on hillside valuations.",
    body: "# Buff & Hensman: Desert modernism influence\n\n*Full report coming soon.*",
  },
  // Insurance & Risk
  {
    slug: "fire-hardening-strategies-brush-zone-properties",
    title: "Fire hardening strategies for brush-zone properties",
    category: "insurance",
    excerpt: "Proactive structural enhancements to maintain insurability in high-risk zones.",
    body: "# Fire hardening strategies for brush-zone properties\n\n*Full report coming soon.*",
  },
  {
    slug: "brush-clearance-compliance-guides",
    title: "Brush clearance compliance guides",
    category: "insurance",
    excerpt: "Annual mitigation requirements for estate properties abutting natural topography.",
    body: "# Brush clearance compliance guides\n\n*Full report coming soon.*",
  },
  {
    slug: "insurance-optimization-high-value-homes",
    title: "Insurance optimization for high-value homes",
    category: "insurance",
    excerpt: "Navigating the constricted California luxury insurance market.",
    body: "# Insurance optimization for high-value homes\n\n*Full report coming soon.*",
  },
];

// ---------------------------------------------------------------------------
// Properties — top picks (status: pick) — copied verbatim from TopPicks.tsx fallback
// ---------------------------------------------------------------------------
const TOP_PICKS = [
  {
    address:         "Beverly Hills North of Sunset",
    neighborhood:    "Beverly Hills",
    status:          "pick"  as const,
    beds:            "7",
    baths:           "9",
    listPrice:       "27500000",
    isLauraListing:  false,
    listingBrokerage: "Various",
    architect:       "Classic Revival",
    commentary:      "An exceptionally rare flat acre in the city's most established corridor. The architectural pedigree provides a foundation for generational holding. The scale of the public rooms cannot be replicated under current hillside ordinances.",
    sortOrder:       0,
    imageFile:       "top-pick-1.png",
  },
  {
    address:         "Trousdale Estates",
    neighborhood:    "Trousdale Estates",
    status:          "pick"  as const,
    beds:            "4",
    baths:           "5",
    listPrice:       "20000000",
    isLauraListing:  false,
    listingBrokerage: "Various",
    architect:       "Mid-Century Modernist",
    commentary:      "Perfectly sited to capture explosive city-to-ocean views while maintaining profound privacy. A prime candidate for meticulous restoration. The roofline and terrazzo detailing remain intact from the original 1968 commission.",
    sortOrder:       1,
    imageFile:       "top-pick-2.png",
  },
  {
    address:         "Holmby Hills",
    neighborhood:    "Holmby Hills",
    status:          "pick"  as const,
    beds:            "9",
    baths:           "12",
    listPrice:       "50000000",
    isLauraListing:  false,
    listingBrokerage: "Various",
    architect:       "Traditional Compound",
    commentary:      "Estate-sized acreage offering immediate proximity to the Platinum Triangle's core. Represents significant land value protected by neighborhood scale. Includes separate dual guest structures and championship tennis court.",
    sortOrder:       2,
    imageFile:       "top-pick-3.png",
  },
  {
    address:         "Pacific Palisades",
    neighborhood:    "Pacific Palisades",
    status:          "pick"  as const,
    beds:            "6",
    baths:           "8",
    listPrice:       "25000000",
    isLauraListing:  false,
    listingBrokerage: "Various",
    architect:       "Contemporary Luxury",
    commentary:      "Unobstructed views of the Pacific with a flawless indoor-outdoor flow. The engineering required to achieve these cantilevered volumes is extraordinary, representing a sunk cost that benefits the next steward.",
    sortOrder:       3,
    imageFile:       "top-pick-4.png",
  },
  {
    address:         "Beverly Park",
    neighborhood:    "Beverly Park",
    status:          "pick"  as const,
    beds:            "10",
    baths:           "14",
    listPrice:       "67500000",
    isLauraListing:  false,
    listingBrokerage: "Various",
    architect:       "European Villa",
    commentary:      "Positioned within the most secure enclave in Los Angeles. This asset provides the scale necessary for significant entertaining while offering the privacy demanded by high-profile principals.",
    sortOrder:       4,
    imageFile:       "top-pick-5.png",
  },
  {
    address:         "Bel Air",
    neighborhood:    "Bel Air",
    status:          "pick"  as const,
    beds:            "5",
    baths:           "7",
    listPrice:       "35000000",
    isLauraListing:  false,
    listingBrokerage: "Various",
    architect:       "Modern Architectural",
    commentary:      "A rare lower Bel Air offering with a private gate and long drive. The integration of the structure into the natural canyon topography exemplifies the best of contemporary California design.",
    sortOrder:       5,
    imageFile:       "top-pick-6.png",
  },
];

// ---------------------------------------------------------------------------
// Properties — active listings (status: listed, isLauraListing: true)
// Paired to listing-1/2/3 images.
// ---------------------------------------------------------------------------
const LISTINGS = [
  {
    address:        "143 S Carolwood Drive, Holmby Hills",
    neighborhood:   "Holmby Hills",
    status:         "listed" as const,
    beds:           "6",
    baths:          "8",
    listPrice:      "42000000",
    isLauraListing: true,
    architect:      "Traditional Estate",
    commentary:     "A classic Holmby Hills estate set behind private gates on an exceptional flat lot. Formal and informal entertaining rooms flow seamlessly to the motor court and loggia. The address is among the most coveted on the Westside.",
    sortOrder:      0,
    imageFile:      "listing-1.png",
  },
  {
    address:        "1200 Laurel Way, Beverly Hills",
    neighborhood:   "Beverly Hills",
    status:         "listed" as const,
    beds:           "5",
    baths:          "6",
    listPrice:      "18500000",
    isLauraListing: true,
    architect:      "Contemporary Mediterranean",
    commentary:     "Set above the flats in prime Beverly Hills, this updated Mediterranean commands sweeping canyon views. Designer interiors and a resort-scale pool make this an exceptional value in a market where similar offerings seldom appear.",
    sortOrder:      1,
    imageFile:      "listing-2.png",
  },
  {
    address:        "750 Bel Air Road, Bel Air",
    neighborhood:   "Bel Air",
    status:         "listed" as const,
    beds:           "7",
    baths:          "9",
    listPrice:      "29500000",
    isLauraListing: true,
    architect:      "Modern Compound",
    commentary:     "A fully reimagined Bel Air compound offering complete privacy and an unmatched indoor-outdoor lifestyle. The structural engineering supporting these volumes is rarely achieved on a private commission of this scale.",
    sortOrder:      2,
    imageFile:      "listing-3.png",
  },
];

// ---------------------------------------------------------------------------
// Named slot positions on the public site
// ---------------------------------------------------------------------------
const IMAGE_SLOTS = [
  { slotKey: "home.hero",      label: "Homepage Hero",              aspectRatio: "1.7778", minWidth: 1440 },
  { slotKey: "home.featured",  label: "Homepage Featured Property", aspectRatio: "1.3333", minWidth: 960  },
  { slotKey: "about.portrait", label: "About Portrait",             aspectRatio: "0.7500", minWidth: 600  },
  { slotKey: "about.hero",     label: "About Hero Banner",          aspectRatio: "3.2000", minWidth: 1440 },
  { slotKey: "picks.banner",   label: "Top Picks Banner",           aspectRatio: "3.2000", minWidth: 1440 },
  { slotKey: "market.banner",  label: "Market Intelligence Banner", aspectRatio: "3.2000", minWidth: 1440 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🌱 seed-content starting…");

  // Resolve owner
  let ownerId: string;
  const adminEmail = process.env.ADMIN_SEED_EMAIL;
  if (adminEmail) {
    const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, adminEmail));
    if (!u) throw new Error(`User not found: ${adminEmail}`);
    ownerId = u.id;
  } else {
    const [first] = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (!first) throw new Error("No users in DB. Create an admin user first.");
    ownerId = first.id;
  }
  console.log(`  ownerId: ${ownerId}`);

  // ── Media ─────────────────────────────────────────────────────────────────
  // Create one media row per image file (storageProvider = 'local').
  // Match on storageKey for idempotency.
  // altText is set later when we know the property address; keep a map here.
  console.log("  seeding media from public/images…");

  const allImageFiles = [
    "laura-portrait.png",
    "listing-1.png",
    "listing-2.png",
    "listing-3.png",
    "top-pick-1.png",
    "top-pick-2.png",
    "top-pick-3.png",
    "top-pick-4.png",
    "top-pick-5.png",
    "top-pick-6.png",
  ];

  // Build media ID map: imageFile → uuid
  const mediaIdByFile: Record<string, string> = {};
  let mediaSeeded = 0, mediaSkipped = 0;

  for (const filename of allImageFiles) {
    const storageKey = `/images/${filename}`;
    const [existing] = await db
      .select({ id: mediaTable.id })
      .from(mediaTable)
      .where(eq(mediaTable.storageKey, storageKey));

    if (existing) {
      mediaIdByFile[filename] = existing.id;
      mediaSkipped++;
      continue;
    }

    const { width, height } = readPngDimensions(filename);
    const sizeBytes  = pngSizeBytes(filename);
    const aspectRatio = (width / height).toFixed(4);

    const [inserted] = await db
      .insert(mediaTable)
      .values({
        ownerId,
        storageKey,
        filename,
        mimeType:        "image/png",
        sizeBytes,
        width,
        height,
        aspectRatio,
        focalX:          "0.500",
        focalY:          "0.500",
        altText:         filename.replace(".png", "").replace(/-/g, " "), // updated below
        storageProvider: "local",
        derivatives:     {},
      })
      .returning({ id: mediaTable.id });

    mediaIdByFile[filename] = inserted.id;
    mediaSeeded++;
  }
  console.log(`  media: ${mediaSeeded} seeded, ${mediaSkipped} skipped`);

  // ── Articles ─────────────────────────────────────────────────────────────
  let articleSeeded = 0, articleSkipped = 0;
  for (const a of ARTICLES) {
    const [existing] = await db
      .select({ id: articlesTable.id })
      .from(articlesTable)
      .where(eq(articlesTable.slug, a.slug));
    if (existing) { articleSkipped++; continue; }
    await db.insert(articlesTable).values({
      ownerId,
      slug:     a.slug,
      title:    a.title,
      category: a.category,
      excerpt:  a.excerpt,
      body:     a.body,
      status:   "draft",
    });
    articleSeeded++;
  }
  console.log(`  articles: ${articleSeeded} seeded, ${articleSkipped} skipped`);

  // ── Properties (top picks) ────────────────────────────────────────────────
  let propSeeded = 0, propSkipped = 0, propUpdated = 0;
  for (const p of TOP_PICKS) {
    const mediaId = mediaIdByFile[p.imageFile];
    if (!mediaId) throw new Error(`No media ID found for ${p.imageFile}`);

    // Update altText to match property address
    await db.update(mediaTable).set({ altText: p.address }).where(eq(mediaTable.id, mediaId));

    const [existing] = await db
      .select({ id: propertiesTable.id, heroMediaId: propertiesTable.heroMediaId })
      .from(propertiesTable)
      .where(eq(propertiesTable.address, p.address));

    if (existing) {
      // Backfill heroMediaId if not yet set
      if (!existing.heroMediaId) {
        await db.update(propertiesTable).set({ heroMediaId: mediaId }).where(eq(propertiesTable.id, existing.id));
        propUpdated++;
      }
      propSkipped++;
      continue;
    }

    await db.insert(propertiesTable).values({
      ownerId,
      address:          p.address,
      neighborhood:     p.neighborhood,
      status:           p.status,
      beds:             p.beds,
      baths:            p.baths,
      listPrice:        p.listPrice,
      isLauraListing:   p.isLauraListing,
      listingBrokerage: p.listingBrokerage,
      architect:        p.architect,
      commentary:       p.commentary,
      sortOrder:        p.sortOrder,
      heroMediaId:      mediaId,
    });
    propSeeded++;
  }

  // ── Properties (listings) ─────────────────────────────────────────────────
  for (const l of LISTINGS) {
    const mediaId = mediaIdByFile[l.imageFile];
    if (!mediaId) throw new Error(`No media ID found for ${l.imageFile}`);

    await db.update(mediaTable).set({ altText: l.address }).where(eq(mediaTable.id, mediaId));

    const [existing] = await db
      .select({ id: propertiesTable.id, heroMediaId: propertiesTable.heroMediaId })
      .from(propertiesTable)
      .where(eq(propertiesTable.address, l.address));

    if (existing) {
      if (!existing.heroMediaId) {
        await db.update(propertiesTable).set({ heroMediaId: mediaId }).where(eq(propertiesTable.id, existing.id));
        propUpdated++;
      }
      propSkipped++;
      continue;
    }

    await db.insert(propertiesTable).values({
      ownerId,
      address:        l.address,
      neighborhood:   l.neighborhood,
      status:         l.status,
      beds:           l.beds,
      baths:          l.baths,
      listPrice:      l.listPrice,
      isLauraListing: l.isLauraListing,
      architect:      l.architect,
      commentary:     l.commentary,
      sortOrder:      l.sortOrder,
      heroMediaId:    mediaId,
    });
    propSeeded++;
  }
  console.log(`  properties: ${propSeeded} seeded, ${propSkipped} skipped, ${propUpdated} heroMediaId backfilled`);

  // ── Image slots ────────────────────────────────────────────────────────────
  let slotSeeded = 0, slotSkipped = 0;
  for (const s of IMAGE_SLOTS) {
    const [existing] = await db
      .select({ id: imageSlotsTable.id })
      .from(imageSlotsTable)
      .where(eq(imageSlotsTable.slotKey, s.slotKey));
    if (existing) { slotSkipped++; continue; }
    await db.insert(imageSlotsTable).values({ ...s, ownerId });
    slotSeeded++;
  }
  console.log(`  image_slots: ${slotSeeded} seeded, ${slotSkipped} skipped`);

  // ── Populate home.hero and about.portrait ─────────────────────────────────
  // Use top-pick-1 image for home.hero; laura-portrait.png for about.portrait.
  const heroImageId    = mediaIdByFile["top-pick-1.png"];
  const portraitId     = mediaIdByFile["laura-portrait.png"];

  const slotUpdates: Array<{ slotKey: string; mediaId: string }> = [
    { slotKey: "home.hero",      mediaId: heroImageId },
    { slotKey: "about.portrait", mediaId: portraitId  },
  ];

  for (const { slotKey, mediaId } of slotUpdates) {
    const [slot] = await db
      .select()
      .from(imageSlotsTable)
      .where(and(eq(imageSlotsTable.slotKey, slotKey), eq(imageSlotsTable.ownerId, ownerId)));
    if (!slot) continue;

    // Only assign if not already set to a media row
    if (slot.currentMediaId) {
      console.log(`  slot ${slotKey}: already assigned, skipping`);
      continue;
    }

    const now = new Date();
    await db.update(imageSlotsTable).set({
      currentMediaId: mediaId,
      assignedAt:     now,
    }).where(eq(imageSlotsTable.id, slot.id));

    // Append to assignment history
    await db.insert(slotAssignmentsTable).values({
      ownerId,
      slotKey,
      mediaId,
      assignedAt:  now,
      assignedBy:  ownerId,
    });
    console.log(`  slot ${slotKey}: assigned → ${mediaId}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const [ac] = await db.select({ count: sql<number>`count(*)` }).from(articlesTable);
  const [pc] = await db.select({ count: sql<number>`count(*)` }).from(propertiesTable);
  const [sc] = await db.select({ count: sql<number>`count(*)` }).from(imageSlotsTable);
  const [mc] = await db.select({ count: sql<number>`count(*)` }).from(mediaTable);
  console.log(`\n✅ Done. DB totals — media: ${mc.count}, articles: ${ac.count}, properties: ${pc.count}, slots: ${sc.count}`);
}

main().then(() => process.exit(0)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
