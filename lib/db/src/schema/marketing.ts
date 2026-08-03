import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  numeric,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// marketing_templates — versioned, immutable brand template definitions
// ---------------------------------------------------------------------------
// Templates are DATA, not code.  A new version is always a new row — never
// mutate an existing one.  campaign_assets records templateId + templateVersion
// so approved assets stay reproducible even after a template is superseded.
//
// definition is an array of LayerDef objects (see campaign-marketing-gen.ts):
//   { type: "photo" }
//   { type: "scrim",    fromYPct, toYPct, maxOpacity, position }
//   { type: "text",     field?, format?, yPct, fontSize, fontSizeLong?,
//                       maxCharsNormal?, fontWeight, trackingEm, anchor }
//   { type: "rule",     yPct, widthPx, heightPx, opacity }
//   { type: "wordmark", yPct, widthPct }
//
// requiredFields: string[] — every field in this list must be non-empty
//   before render.  Generation fails with a clear error if any is missing.
//
// photoAspect: used to pick the best-fit image from the property gallery.
// ---------------------------------------------------------------------------

export const marketingTemplatesTable = pgTable(
  "marketing_templates",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    ownerId:       uuid("owner_id"),                          // null = system template
    officeId:      uuid("office_id"),

    key:           text("key").notNull(),                     // "story.just_sold"
    name:          text("name").notNull(),
    channel:       text("channel").notNull(),                 // "instagram_story" | "instagram_post"
    version:       integer("version").notNull().default(1),

    canvasWidth:   integer("canvas_width").notNull(),         // 1080
    canvasHeight:  integer("canvas_height").notNull(),        // 1920 | 1080

    definition:    jsonb("definition").notNull(),             // LayerDef[]
    requiredFields: jsonb("required_fields").notNull(),       // string[]

    // Aspect ratio this template wants (selects best gallery photo)
    photoAspect:   numeric("photo_aspect", { precision: 6, scale: 4 }).notNull(),

    isActive:      boolean("is_active").notNull().default(true),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("marketing_templates_key_version_unique").on(t.key, t.version),
  ],
);

export type MarketingTemplate       = typeof marketingTemplatesTable.$inferSelect;
export type MarketingTemplateInsert = typeof marketingTemplatesTable.$inferInsert;
