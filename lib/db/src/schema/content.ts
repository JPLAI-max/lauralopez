import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  decimal,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------
export const mediaTable = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    officeId: uuid("office_id"),
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    aspectRatio: decimal("aspect_ratio", { precision: 6, scale: 4 }).notNull(),
    focalX: decimal("focal_x", { precision: 4, scale: 3 }).notNull().default("0.500"),
    focalY: decimal("focal_y", { precision: 4, scale: 3 }).notNull().default("0.500"),
    altText: text("alt_text"),
    credit: text("credit"),
    derivatives: jsonb("derivatives").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_owner_aspect_idx").on(t.ownerId, t.aspectRatio)],
);

export type Media = typeof mediaTable.$inferSelect;
export type InsertMedia = typeof mediaTable.$inferInsert;

// ---------------------------------------------------------------------------
// properties  — Top Picks + Listed + Sold, never hard-deleted
// ---------------------------------------------------------------------------
export const propertiesTable = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    officeId: uuid("office_id"),
    address: text("address").notNull(),
    neighborhood: text("neighborhood"),
    // pick | listed | sold
    status: text("status").notNull().default("pick"),
    listPrice: decimal("list_price", { precision: 14, scale: 2 }),
    soldPrice: decimal("sold_price", { precision: 14, scale: 2 }),
    soldDate: date("sold_date"),
    beds: decimal("beds"),
    baths: decimal("baths"),
    sqft: integer("sqft"),
    lotSqft: integer("lot_sqft"),
    yearBuilt: integer("year_built"),
    architect: text("architect"),
    // false = curated pick she does NOT represent
    isLauraListing: boolean("is_laura_listing").notNull().default(false),
    // required when isLauraListing = false
    listingBrokerage: text("listing_brokerage"),
    commentary: text("commentary"),
    architectureNotes: text("architecture_notes"),
    lotNotes: text("lot_notes"),
    valueNotes: text("value_notes"),
    heroMediaId: uuid("hero_media_id"),
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("properties_owner_id_idx").on(t.ownerId),
    index("properties_status_sort_idx").on(t.status, t.sortOrder),
  ],
);

export type Property = typeof propertiesTable.$inferSelect;
export type InsertProperty = typeof propertiesTable.$inferInsert;

// ---------------------------------------------------------------------------
// property_media  — ordered gallery per property
// ---------------------------------------------------------------------------
export const propertyMediaTable = pgTable(
  "property_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => propertiesTable.id, { onDelete: "cascade" }),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaTable.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("property_media_property_idx").on(t.propertyId)],
);

export type PropertyMedia = typeof propertyMediaTable.$inferSelect;

// ---------------------------------------------------------------------------
// articles
// ---------------------------------------------------------------------------
export const articlesTable = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    officeId: uuid("office_id"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    // neighborhood | regulatory | architecture | insurance | market
    category: text("category").notNull(),
    excerpt: text("excerpt").notNull(),
    body: text("body").notNull(),
    heroMediaId: uuid("hero_media_id"),
    // draft | published
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("articles_status_published_idx").on(t.status, t.publishedAt),
    index("articles_owner_id_idx").on(t.ownerId),
  ],
);

export type Article = typeof articlesTable.$inferSelect;
export type InsertArticle = typeof articlesTable.$inferInsert;

// ---------------------------------------------------------------------------
// image_slots  — named fixed positions on the public site
// ---------------------------------------------------------------------------
export const imageSlotsTable = pgTable(
  "image_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    slotKey: text("slot_key").notNull().unique(),
    label: text("label").notNull(),
    aspectRatio: decimal("aspect_ratio", { precision: 6, scale: 4 }).notNull(),
    minWidth: integer("min_width").notNull(),
    currentMediaId: uuid("current_media_id"),
    currentPropertyId: uuid("current_property_id"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
  },
  (t) => [index("image_slots_owner_id_idx").on(t.ownerId)],
);

export type ImageSlot = typeof imageSlotsTable.$inferSelect;
export type InsertImageSlot = typeof imageSlotsTable.$inferInsert;

// ---------------------------------------------------------------------------
// slot_assignments  — append-only history
// ---------------------------------------------------------------------------
export const slotAssignmentsTable = pgTable(
  "slot_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull(),
    slotKey: text("slot_key").notNull(),
    mediaId: uuid("media_id").notNull(),
    propertyId: uuid("property_id"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    assignedBy: uuid("assigned_by").notNull(),
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
  },
  (t) => [
    index("slot_assignments_owner_id_idx").on(t.ownerId),
    index("slot_assignments_slot_key_idx").on(t.slotKey),
    index("slot_assignments_slot_owner_idx").on(t.slotKey, t.ownerId),
    index("slot_assignments_slot_unassigned_idx").on(t.slotKey, t.unassignedAt),
  ],
);

export type SlotAssignment = typeof slotAssignmentsTable.$inferSelect;
