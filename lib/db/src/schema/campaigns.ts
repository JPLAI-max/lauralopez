import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  jsonb,
  index,
  // numeric not needed here but imported for symmetry
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { propertiesTable } from "./content";

// ---------------------------------------------------------------------------
// campaign_templates
// trigger: new_listing | price_change | open_house | sold
// ---------------------------------------------------------------------------
export const campaignTemplatesTable = pgTable(
  "campaign_templates",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    ownerId:   uuid("owner_id").notNull().references(() => usersTable.id),
    officeId:  uuid("office_id"),
    name:      text("name").notNull(),
    trigger:   text("trigger").notNull(), // new_listing | price_change | open_house | sold
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_templates_owner_id_idx").on(t.ownerId),
    index("campaign_templates_trigger_idx").on(t.trigger),
  ],
);

export type CampaignTemplate    = typeof campaignTemplatesTable.$inferSelect;
export type InsertCampaignTemplate = typeof campaignTemplatesTable.$inferInsert;

// ---------------------------------------------------------------------------
// campaign_template_items
// channel: instagram_post | instagram_story | email | postcard | mailer | voicemail | manual
// assetType: image_1x1 | image_9x16 | email_html | print_pdf | script_txt | null
// ---------------------------------------------------------------------------
export const campaignTemplateItemsTable = pgTable("campaign_template_items", {
  id:          uuid("id").primaryKey().defaultRandom(),
  templateId:  uuid("template_id")
                 .notNull()
                 .references(() => campaignTemplatesTable.id, { onDelete: "cascade" }),
  label:       text("label").notNull(),
  channel:     text("channel").notNull(),
  offsetDays:  integer("offset_days").notNull(),
  dayType:     text("day_type").notNull(), // calendar | business
  assetType:   text("asset_type"),         // nullable
  sortOrder:   integer("sort_order").notNull().default(0),
});

export type CampaignTemplateItem    = typeof campaignTemplateItemsTable.$inferSelect;
export type InsertCampaignTemplateItem = typeof campaignTemplateItemsTable.$inferInsert;

// ---------------------------------------------------------------------------
// campaign_assets  — declared before campaign_tasks due to FK reference
// status: draft | approved | rejected
// ---------------------------------------------------------------------------
export const campaignAssetsTable = pgTable(
  "campaign_assets",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    ownerId:     uuid("owner_id").notNull().references(() => usersTable.id),
    campaignId:  uuid("campaign_id").notNull(),                 // FK added after campaigns
    taskId:      uuid("task_id").notNull(),                     // FK added after campaign_tasks
    assetType:   text("asset_type").notNull(),
    storageKey:  text("storage_key"),                           // R2 key for images/PDFs
    textContent: text("text_content"),                          // captions, scripts, copy
    status:      text("status").notNull().default("draft"),     // draft | approved | rejected
    approvedAt:       timestamp("approved_at", { withTimezone: true }),
    approvedBy:       text("approved_by"),
    // Brick 5.2 — marketing template provenance (nullable for Brick 5 assets)
    templateId:       uuid("template_id"),
    templateVersion:  integer("template_version"),
    createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_assets_owner_id_idx").on(t.ownerId),
    index("campaign_assets_campaign_id_idx").on(t.campaignId),
    index("campaign_assets_task_id_idx").on(t.taskId),
  ],
);

export type CampaignAsset    = typeof campaignAssetsTable.$inferSelect;
export type InsertCampaignAsset = typeof campaignAssetsTable.$inferInsert;

// ---------------------------------------------------------------------------
// campaigns
// status: active | complete | cancelled
// ---------------------------------------------------------------------------
export const campaignsTable = pgTable(
  "campaigns",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    ownerId:     uuid("owner_id").notNull().references(() => usersTable.id),
    officeId:    uuid("office_id"),
    propertyId:  uuid("property_id")
                   .notNull()
                   .references(() => propertiesTable.id),
    templateId:  uuid("template_id"),
    trigger:     text("trigger").notNull(),
    anchorDate:  date("anchor_date", { mode: "string" }).notNull(),
    roleLine:    text("role_line").notNull().default("LISTED BY"), // LISTED BY | REPRESENTED BUYER | REPRESENTED SELLER
    status:      text("status").notNull().default("active"), // active | complete | cancelled
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("campaigns_owner_id_idx").on(t.ownerId),
    index("campaigns_property_id_idx").on(t.propertyId),
    index("campaigns_status_idx").on(t.status),
  ],
);

export type Campaign    = typeof campaignsTable.$inferSelect;
export type InsertCampaign = typeof campaignsTable.$inferInsert;

// ---------------------------------------------------------------------------
// campaign_tasks
// status: pending | ready | done | skipped
// ---------------------------------------------------------------------------
export const campaignTasksTable = pgTable(
  "campaign_tasks",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    campaignId:   uuid("campaign_id")
                    .notNull()
                    .references(() => campaignsTable.id, { onDelete: "cascade" }),
    ownerId:      uuid("owner_id").notNull().references(() => usersTable.id),
    label:        text("label").notNull(),
    channel:      text("channel").notNull(),
    assetType:    text("asset_type"),
    computedDate: date("computed_date", { mode: "string" }),
    overrideDate: date("override_date", { mode: "string" }),
    status:       text("status").notNull().default("pending"), // pending | ready | done | skipped
    assetId:      uuid("asset_id").references(() => campaignAssetsTable.id, { onDelete: "set null" }),
    notes:        text("notes"),
    completedAt:  timestamp("completed_at", { withTimezone: true }),
    sortOrder:    integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("campaign_tasks_campaign_id_idx").on(t.campaignId),
    index("campaign_tasks_owner_id_idx").on(t.ownerId),
    index("campaign_tasks_status_idx").on(t.status),
  ],
);

export type CampaignTask    = typeof campaignTasksTable.$inferSelect;
export type InsertCampaignTask = typeof campaignTasksTable.$inferInsert;

// ---------------------------------------------------------------------------
// campaign_events  — APPEND ONLY
// Actions: campaign_created | task_updated | task_completed | task_skipped |
//   status_changed | asset_generated | asset_approved | asset_rejected
// Payload always contains before/after values.
// ---------------------------------------------------------------------------
export const campaignEventsTable = pgTable(
  "campaign_events",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
                  .notNull()
                  .references(() => campaignsTable.id, { onDelete: "cascade" }),
    ownerId:    uuid("owner_id").notNull().references(() => usersTable.id),
    actor:      text("actor").notNull(),
    action:     text("action").notNull(),
    payload:    jsonb("payload").notNull(),
    createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("campaign_events_campaign_id_idx").on(t.campaignId),
    index("campaign_events_owner_id_idx").on(t.ownerId),
  ],
);

export type CampaignEvent    = typeof campaignEventsTable.$inferSelect;
export type InsertCampaignEvent = typeof campaignEventsTable.$inferInsert;
