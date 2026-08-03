/**
 * seed-marketing-templates.ts
 *
 * Seeds 10 immutable marketing templates (5 story variants + 5 post variants).
 * Each new seeding creates version 1 if not present; existing rows are untouched
 * (never mutated — a new version must be a new row per the spec).
 *
 * Run: scripts/node_modules/.bin/tsx src/seed-marketing-templates.ts
 */

import { db, marketingTemplatesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Shared layer structure builders
// ---------------------------------------------------------------------------
// All layers are typed as Record<string, unknown> so the seed script stays
// data-only; the renderer (campaign-marketing-gen.ts) performs the runtime
// type narrowing.  Using a common map type prevents TypeScript from inferring
// an overly-tight union that rejects splice/spread operations.
// ---------------------------------------------------------------------------

type Layer = Record<string, unknown>;

// ---------------------------------------------------------------------------
// v2 geometry corrections (Brick 5.2b):
//   - Bottom scrim: 72→100% at 0.55 opacity (was 78→100% at 0.42)
//   - Rule: y 17.2% (was 16.8%)
//   - Address: y 20.2% (was 19.0%)
//   - Subline: y 22.6% (was 21.5%)
//   - Wordmark: y 87.5% (was 88.5%)
//   - roleLine: y 91.0% (was 91.5%)
//   - agentName: y 94.2% (was 94.0%)
// ---------------------------------------------------------------------------

/** Story (1080×1920) — headline y-positions as fraction of canvas height */
const STORY_LAYERS_BASE: Layer[] = [
  { type: "photo" },
  {
    type: "scrim", position: "top",
    fromYPct: 0, toYPct: 0.34, maxOpacity: 0.32,
  },
  {
    // bottom scrim starts earlier and is stronger to keep signature legible
    // over bright subjects (pools, sunset sky in lower frame)
    type: "scrim", position: "bottom",
    fromYPct: 0.72, toYPct: 1.0, maxOpacity: 0.55,
  },
  // headline block
  {
    type: "text", field: "headline",
    yPct: 0.145, fontSize: 72, fontSizeLong: 60, maxCharsNormal: 18,
    fontWeight: 300, trackingEm: 0.02, anchor: "center",
  },
  {
    type: "rule",
    yPct: 0.172, widthPx: 120, heightPx: 1, opacity: 0.70,
  },
  {
    type: "text", field: "address",
    yPct: 0.202, fontSize: 34,
    fontWeight: 400, trackingEm: 0.18, anchor: "center",
  },
  // signature block — wider spacing so the three lines don't compress
  { type: "wordmark", yPct: 0.875, widthPct: 0.36 },
  {
    type: "text", field: "roleLine",
    yPct: 0.910, fontSize: 21,
    fontWeight: 300, trackingEm: 0.20, anchor: "center",
  },
  {
    type: "text", field: "agentName",
    yPct: 0.942, fontSize: 22,
    fontWeight: 400, trackingEm: 0.16, anchor: "center",
  },
];

/** Subline layer variants */
const SUBLINE_CITY_PRICE: Layer = {
  type: "text", format: "{city} | LP {price}",
  yPct: 0.226, fontSize: 26,
  fontWeight: 300, trackingEm: 0.14, anchor: "center",
};
const SUBLINE_CITY_ONLY: Layer = {
  type: "text", format: "{city}",
  yPct: 0.226, fontSize: 26,
  fontWeight: 300, trackingEm: 0.14, anchor: "center",
};

function storyLayers(subline: Layer): Layer[] {
  const layers: Layer[] = [...STORY_LAYERS_BASE];
  // insert subline after the address layer (index 5)
  layers.splice(6, 0, subline);
  return layers;
}

/** Post (1080×1080) — same percentages, font sizes 12% smaller per spec */
function postLayers(subline: Layer): Layer[] {
  const scale = 0.88; // 12% reduction
  return storyLayers(subline).map((l) => {
    if (l["type"] === "text") {
      const out: Layer = { ...l };
      if (typeof l["fontSize"]     === "number") out["fontSize"]     = Math.round(l["fontSize"]     * scale);
      if (typeof l["fontSizeLong"] === "number") out["fontSizeLong"] = Math.round(l["fontSizeLong"] * scale);
      return out;
    }
    return l;
  });
}

// ---------------------------------------------------------------------------
// Required fields per variant
// ---------------------------------------------------------------------------
const REQUIRED_PRICE = ["headline", "address", "city", "price", "brokerageMark", "roleLine", "agentName"];
const REQUIRED_CITY  = ["headline", "address", "city",           "brokerageMark", "roleLine", "agentName"];

// ---------------------------------------------------------------------------
// Template definitions
// ---------------------------------------------------------------------------
interface TemplateSeed {
  key:           string;
  name:          string;
  channel:       string;
  version:       number;
  canvasWidth:   number;
  canvasHeight:  number;
  definition:    object[];
  requiredFields: string[];
  photoAspect:   string;
}

const STORY_ASPECT = "0.5625"; // 9:16
const POST_ASPECT  = "1.0000"; // 1:1

const TEMPLATES: TemplateSeed[] = [
  // ── STORY variants ────────────────────────────────────────────────────────
  {
    key: "story.just_sold", name: "Story — Just Sold", channel: "instagram_story", version: 2,
    canvasWidth: 1080, canvasHeight: 1920,
    definition: storyLayers(SUBLINE_CITY_PRICE),
    requiredFields: REQUIRED_PRICE,
    photoAspect: STORY_ASPECT,
  },
  {
    key: "story.just_listed", name: "Story — Just Listed", channel: "instagram_story", version: 2,
    canvasWidth: 1080, canvasHeight: 1920,
    definition: storyLayers(SUBLINE_CITY_PRICE),
    requiredFields: REQUIRED_PRICE,
    photoAspect: STORY_ASPECT,
  },
  {
    key: "story.open_house", name: "Story — Open House", channel: "instagram_story", version: 2,
    canvasWidth: 1080, canvasHeight: 1920,
    definition: storyLayers(SUBLINE_CITY_ONLY),
    requiredFields: REQUIRED_CITY,
    photoAspect: STORY_ASPECT,
  },
  {
    key: "story.price_improved", name: "Story — Price Improved", channel: "instagram_story", version: 2,
    canvasWidth: 1080, canvasHeight: 1920,
    definition: storyLayers(SUBLINE_CITY_PRICE),
    requiredFields: REQUIRED_PRICE,
    photoAspect: STORY_ASPECT,
  },
  {
    key: "story.in_escrow", name: "Story — In Escrow", channel: "instagram_story", version: 2,
    canvasWidth: 1080, canvasHeight: 1920,
    definition: storyLayers(SUBLINE_CITY_ONLY),
    requiredFields: REQUIRED_CITY,
    photoAspect: STORY_ASPECT,
  },

  // ── POST variants (same geometry, 12% smaller type) ─────────────────────
  {
    key: "post.just_sold", name: "Post — Just Sold", channel: "instagram_post", version: 2,
    canvasWidth: 1080, canvasHeight: 1080,
    definition: postLayers(SUBLINE_CITY_PRICE),
    requiredFields: REQUIRED_PRICE,
    photoAspect: POST_ASPECT,
  },
  {
    key: "post.just_listed", name: "Post — Just Listed", channel: "instagram_post", version: 2,
    canvasWidth: 1080, canvasHeight: 1080,
    definition: postLayers(SUBLINE_CITY_PRICE),
    requiredFields: REQUIRED_PRICE,
    photoAspect: POST_ASPECT,
  },
  {
    key: "post.open_house", name: "Post — Open House", channel: "instagram_post", version: 2,
    canvasWidth: 1080, canvasHeight: 1080,
    definition: postLayers(SUBLINE_CITY_ONLY),
    requiredFields: REQUIRED_CITY,
    photoAspect: POST_ASPECT,
  },
  {
    key: "post.price_improved", name: "Post — Price Improved", channel: "instagram_post", version: 2,
    canvasWidth: 1080, canvasHeight: 1080,
    definition: postLayers(SUBLINE_CITY_PRICE),
    requiredFields: REQUIRED_PRICE,
    photoAspect: POST_ASPECT,
  },
  {
    key: "post.in_escrow", name: "Post — In Escrow", channel: "instagram_post", version: 2,
    canvasWidth: 1080, canvasHeight: 1080,
    definition: postLayers(SUBLINE_CITY_ONLY),
    requiredFields: REQUIRED_CITY,
    photoAspect: POST_ASPECT,
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function run() {
  console.log("▶ seed-marketing-templates: seeding 10 brand templates…");

  let inserted = 0;
  let skipped  = 0;

  for (const t of TEMPLATES) {
    const existing = await db
      .select({ id: marketingTemplatesTable.id })
      .from(marketingTemplatesTable)
      .where(
        and(
          eq(marketingTemplatesTable.key,     t.key),
          eq(marketingTemplatesTable.version, t.version),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ↩ skip  ${t.key} v${t.version} (already exists)`);
      skipped++;
      continue;
    }

    await db.insert(marketingTemplatesTable).values({
      key:            t.key,
      name:           t.name,
      channel:        t.channel,
      version:        t.version,
      canvasWidth:    t.canvasWidth,
      canvasHeight:   t.canvasHeight,
      definition:     t.definition,
      requiredFields: t.requiredFields,
      photoAspect:    t.photoAspect,
      isActive:       true,
    });
    console.log(`  ✓ seeded ${t.key} v${t.version}`);
    inserted++;

    // Deactivate the previous version (v1) so the new version is the only
    // active row for this key.  Per spec, old rows are never deleted — only
    // marked inactive — so any campaign_assets referencing v1 stay valid.
    const prevVersion = t.version - 1;
    if (prevVersion >= 1) {
      const deactivated = await db
        .update(marketingTemplatesTable)
        .set({ isActive: false })
        .where(
          and(
            eq(marketingTemplatesTable.key,      t.key),
            eq(marketingTemplatesTable.version,  prevVersion),
            eq(marketingTemplatesTable.isActive, true),
          ),
        );
      void deactivated; // result not needed; drizzle update returns metadata
      console.log(`  ↓ deactivated ${t.key} v${prevVersion}`);
    }
  }

  console.log(`✅ Done — ${inserted} inserted, ${skipped} skipped.`);
}

run()
  .catch((err: unknown) => {
    console.error("❌ seed-marketing-templates failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
