/**
 * intel-public.ts — PUBLIC-RECORD intelligence store
 *
 * PORTABILITY NOTICE
 * This file contains PUBLIC-RECORD data only: deeds, permits, entitlements,
 * parcels, regulatory events, and reports built from those events.
 * PUBLIC data MAY be exported or repurposed in separate products.
 *
 * BOUNDARY RULE (Brick 7):
 * DO NOT join tables from this file with tables from intel-licensed.ts into a
 * single exportable result set. Reports may READ from both stores for display
 * purposes only; no combined export endpoint may be added.
 */

import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// intel_sources — provenance record. Every fact must point here.
// ---------------------------------------------------------------------------
export const intelSourcesTable = pgTable("intel_sources", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     uuid("owner_id").notNull().references(() => usersTable.id),
  officeId:    uuid("office_id"),
  kind:        text("kind").notNull(), // manual | document | url | feed | recorder | permit_portal
  title:       text("title").notNull(),
  url:         text("url"),
  documentKey: text("document_key"), // R2 storage key for uploaded documents
  capturedAt:  timestamp("captured_at", { withTimezone: true }).notNull(),
  notes:       text("notes"),
}, (t) => [
  index("intel_sources_owner_id_idx").on(t.ownerId),
]);

// ---------------------------------------------------------------------------
// parcels — the geographic unit. Parcel events attach to this.
// ---------------------------------------------------------------------------
export const parcelsTable = pgTable("parcels", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull().references(() => usersTable.id),
  officeId:     uuid("office_id"),
  apn:          text("apn"),               // assessor parcel number
  address:      text("address").notNull(),
  city:         text("city"),
  neighborhood: text("neighborhood"),
  zip:          text("zip"),
  lotSqft:      integer("lot_sqft"),
  latitude:     numeric("latitude",  { precision: 10, scale: 7 }),
  longitude:    numeric("longitude", { precision: 10, scale: 7 }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("parcels_owner_id_idx").on(t.ownerId),
  index("parcels_neighborhood_idx").on(t.neighborhood),
  index("parcels_apn_idx").on(t.apn),
]);

// ---------------------------------------------------------------------------
// parcel_events — the portable fact dataset. THIS is the asset.
// ---------------------------------------------------------------------------
export const parcelEventsTable = pgTable("parcel_events", {
  id:          uuid("id").primaryKey().defaultRandom(),
  ownerId:     uuid("owner_id").notNull().references(() => usersTable.id),
  parcelId:    uuid("parcel_id").notNull().references(() => parcelsTable.id, { onDelete: "cascade" }),
  eventType:   text("event_type").notNull(),
  // deed_transfer | permit_filed | permit_issued | entitlement |
  // listing | price_change | sale | withdrawal
  eventDate:   date("event_date", { mode: "string" }).notNull(),
  amount:      numeric("amount", { precision: 14, scale: 2 }),
  description: text("description"),
  sourceId:    uuid("source_id").notNull().references(() => intelSourcesTable.id),
  confidence:  text("confidence").notNull().default("reported"),
  // verified | reported | estimated
  payload:     jsonb("payload").notNull().default({}),
  // payload.sourceSnippet — exact text from source that produced this fact
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("parcel_events_owner_id_idx").on(t.ownerId),
  index("parcel_events_parcel_id_idx").on(t.parcelId),
  index("parcel_events_event_type_idx").on(t.eventType),
  index("parcel_events_event_date_idx").on(t.eventDate),
]);

// ---------------------------------------------------------------------------
// regulatory_events — Prop 19, FIRPTA, FinCEN, AB38, etc.
// ---------------------------------------------------------------------------
export const regulatoryEventsTable = pgTable("regulatory_events", {
  id:            uuid("id").primaryKey().defaultRandom(),
  ownerId:       uuid("owner_id").notNull().references(() => usersTable.id),
  officeId:      uuid("office_id"),
  topic:         text("topic").notNull(),   // Prop 19 | FIRPTA | FinCEN | AB38 | ...
  title:         text("title").notNull(),
  effectiveDate: date("effective_date", { mode: "string" }),
  summary:       text("summary").notNull(),
  sourceId:      uuid("source_id").notNull().references(() => intelSourcesTable.id),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("regulatory_events_owner_id_idx").on(t.ownerId),
]);

// ---------------------------------------------------------------------------
// report_templates — named section templates for generated reports
// ---------------------------------------------------------------------------
export const reportTemplatesTable = pgTable("report_templates", {
  id:        uuid("id").primaryKey().defaultRandom(),
  ownerId:   uuid("owner_id").notNull().references(() => usersTable.id),
  key:       text("key").notNull(), // monthly_intelligence | neighborhood_report | regulatory_alert
  name:      text("name").notNull(),
  sections:  jsonb("sections").notNull().default([]), // [{key, title, prompt}]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("report_templates_owner_id_idx").on(t.ownerId),
]);

// ---------------------------------------------------------------------------
// reports — generated intelligence reports
// ---------------------------------------------------------------------------
export const reportsTable = pgTable("reports", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull().references(() => usersTable.id),
  officeId:     uuid("office_id"),
  templateId:   uuid("template_id"),    // soft ref → report_templates.id
  title:        text("title").notNull(),
  periodStart:  date("period_start", { mode: "string" }).notNull(),
  periodEnd:    date("period_end",   { mode: "string" }).notNull(),
  neighborhood: text("neighborhood"),
  status:       text("status").notNull().default("draft"),
  // draft | in_review | approved | published
  bodyMarkdown: text("body_markdown").notNull().default(""),
  // stored WITH {{fact:uuid}} tokens intact; substitution happens at render time
  factRefs:     jsonb("fact_refs").notNull().default([]),
  // [{factId, table, token, formattedValue}]
  articleId:    uuid("article_id"),     // soft ref → articles.id (set on publish)
  generatedAt:  timestamp("generated_at",  { withTimezone: true }),
  approvedAt:   timestamp("approved_at",   { withTimezone: true }),
  publishedAt:  timestamp("published_at",  { withTimezone: true }),
  createdAt:    timestamp("created_at",    { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("reports_owner_id_idx").on(t.ownerId),
  index("reports_status_idx").on(t.status),
  index("reports_neighborhood_idx").on(t.neighborhood),
]);
