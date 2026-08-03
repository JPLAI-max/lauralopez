/**
 * scripts/src/seed-content.ts
 *
 * Seeds:
 *   - 16 articles from MarketIntelligence.tsx (draft, no body yet)
 *   - 6 properties from TopPicks.tsx (status: pick)
 *   - image_slots — named positions used by the public site
 *
 * Idempotent — skips records that already exist by slug / address.
 * Requires DATABASE_URL.  Falls back to first DB user as ownerId.
 */

import { db } from "@workspace/db";
import { usersTable, articlesTable, propertiesTable, imageSlotsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Seed data
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

const PROPERTIES = [
  {
    address: "Beverly Hills North of Sunset",
    neighborhood: "Beverly Hills",
    status: "pick" as const,
    beds: "7",
    baths: "9",
    listPrice: "27500000",          // midpoint of $25M-$30M
    isLauraListing: false,
    listingBrokerage: "Various",
    architect: "Classic Revival",
    commentary: "An exceptionally rare flat acre in the city's most established corridor. The architectural pedigree provides a foundation for generational holding. The scale of the public rooms cannot be replicated under current hillside ordinances.",
    sortOrder: 0,
  },
  {
    address: "Trousdale Estates",
    neighborhood: "Trousdale Estates",
    status: "pick" as const,
    beds: "4",
    baths: "5",
    listPrice: "20000000",          // midpoint of $18M-$22M
    isLauraListing: false,
    listingBrokerage: "Various",
    architect: "Mid-Century Modernist",
    commentary: "Perfectly sited to capture explosive city-to-ocean views while maintaining profound privacy. A prime candidate for meticulous restoration. The roofline and terrazzo detailing remain intact from the original 1968 commission.",
    sortOrder: 1,
  },
  {
    address: "Holmby Hills",
    neighborhood: "Holmby Hills",
    status: "pick" as const,
    beds: "9",
    baths: "12",
    listPrice: "50000000",          // midpoint of $45M-$55M
    isLauraListing: false,
    listingBrokerage: "Various",
    architect: "Traditional Compound",
    commentary: "Estate-sized acreage offering immediate proximity to the Platinum Triangle's core. Represents significant land value protected by neighborhood scale. Includes separate dual guest structures and championship tennis court.",
    sortOrder: 2,
  },
  {
    address: "Pacific Palisades",
    neighborhood: "Pacific Palisades",
    status: "pick" as const,
    beds: "6",
    baths: "8",
    listPrice: "25000000",          // midpoint of $22M-$28M
    isLauraListing: false,
    listingBrokerage: "Various",
    architect: "Contemporary Luxury",
    commentary: "Unobstructed views of the Pacific with a flawless indoor-outdoor flow. The engineering required to achieve these cantilevered volumes is extraordinary, representing a sunk cost that benefits the next steward.",
    sortOrder: 3,
  },
  {
    address: "Beverly Park",
    neighborhood: "Beverly Park",
    status: "pick" as const,
    beds: "10",
    baths: "14",
    listPrice: "67500000",          // midpoint of $60M-$75M
    isLauraListing: false,
    listingBrokerage: "Various",
    architect: "European Villa",
    commentary: "Positioned within the most secure enclave in Los Angeles. This asset provides the scale necessary for significant entertaining while offering the privacy demanded by high-profile principals.",
    sortOrder: 4,
  },
  {
    address: "Bel Air",
    neighborhood: "Bel Air",
    status: "pick" as const,
    beds: "5",
    baths: "7",
    listPrice: "35000000",          // midpoint of $30M-$40M
    isLauraListing: false,
    listingBrokerage: "Various",
    architect: "Modern Architectural",
    commentary: "A rare lower Bel Air offering with a private gate and long drive. The integration of the structure into the natural canyon topography exemplifies the best of contemporary California design.",
    sortOrder: 5,
  },
];

// Named slot positions on the public site
// aspectRatio = width/height stored to 4dp
const IMAGE_SLOTS = [
  { slotKey: "home.hero",        label: "Homepage Hero",              aspectRatio: "1.7778", minWidth: 1440 },
  { slotKey: "home.featured",    label: "Homepage Featured Property", aspectRatio: "1.3333", minWidth: 960 },
  { slotKey: "about.portrait",   label: "About Portrait",             aspectRatio: "0.7500", minWidth: 600 },
  { slotKey: "about.hero",       label: "About Hero Banner",          aspectRatio: "3.2000", minWidth: 1440 },
  { slotKey: "picks.banner",     label: "Top Picks Banner",           aspectRatio: "3.2000", minWidth: 1440 },
  { slotKey: "market.banner",    label: "Market Intelligence Banner", aspectRatio: "3.2000", minWidth: 1440 },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🌱 seed-content starting…");

  // Resolve owner — use ADMIN_SEED_EMAIL or first user
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

  // --- Articles ---
  let articleSeeded = 0;
  let articleSkipped = 0;
  for (const a of ARTICLES) {
    const [existing] = await db
      .select({ id: articlesTable.id })
      .from(articlesTable)
      .where(eq(articlesTable.slug, a.slug));
    if (existing) { articleSkipped++; continue; }
    await db.insert(articlesTable).values({
      ownerId,
      slug: a.slug,
      title: a.title,
      category: a.category,
      excerpt: a.excerpt,
      body: a.body,
      status: "draft",
    });
    articleSeeded++;
  }
  console.log(`  articles: ${articleSeeded} seeded, ${articleSkipped} skipped`);

  // --- Properties ---
  let propSeeded = 0;
  let propSkipped = 0;
  for (const p of PROPERTIES) {
    const [existing] = await db
      .select({ id: propertiesTable.id })
      .from(propertiesTable)
      .where(eq(propertiesTable.address, p.address));
    if (existing) { propSkipped++; continue; }
    await db.insert(propertiesTable).values({
      ownerId,
      address: p.address,
      neighborhood: p.neighborhood,
      status: p.status,
      beds: p.beds,
      baths: p.baths,
      listPrice: p.listPrice,
      isLauraListing: p.isLauraListing,
      listingBrokerage: p.listingBrokerage,
      architect: p.architect,
      commentary: p.commentary,
      sortOrder: p.sortOrder,
    });
    propSeeded++;
  }
  console.log(`  properties: ${propSeeded} seeded, ${propSkipped} skipped`);

  // --- Image slots ---
  let slotSeeded = 0;
  let slotSkipped = 0;
  for (const s of IMAGE_SLOTS) {
    const [existing] = await db
      .select({ id: imageSlotsTable.id })
      .from(imageSlotsTable)
      .where(eq(imageSlotsTable.slotKey, s.slotKey));
    if (existing) { slotSkipped++; continue; }
    await db.insert(imageSlotsTable).values(s);
    slotSeeded++;
  }
  console.log(`  image_slots: ${slotSeeded} seeded, ${slotSkipped} skipped`);

  // --- Summary ---
  const [ac] = await db.select({ count: sql<number>`count(*)` }).from(articlesTable);
  const [pc] = await db.select({ count: sql<number>`count(*)` }).from(propertiesTable);
  const [sc] = await db.select({ count: sql<number>`count(*)` }).from(imageSlotsTable);
  console.log(`\n✅ Done. DB totals — articles: ${ac.count}, properties: ${pc.count}, slots: ${sc.count}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
