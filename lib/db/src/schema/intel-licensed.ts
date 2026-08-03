/**
 * intel-licensed.ts — MLS-LICENSED intelligence store
 *
 * LICENSE RESTRICTION NOTICE
 * This file contains MLS-LICENSED data: transaction records and off-market
 * intelligence notes. This data is LAURA-ONLY and may NOT be exported or
 * repurposed in any separate commercial product.
 *
 * BOUNDARY RULE (Brick 7):
 * DO NOT join tables from this file with tables from intel-public.ts into a
 * single exportable result set. No export endpoint may return rows from both
 * stores in a single response. Reports may display licensed data; they may not
 * expose it in machine-readable export form.
 *
 * Every table carries:
 *   dataSource       text notNull  — 'crmls' | 'brokerage'
 *   licenseRestricted boolean notNull default true
 */

import {
  pgTable, uuid, text, integer, numeric, date,
  timestamp, boolean, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { intelSourcesTable } from "./intel-public";

// ---------------------------------------------------------------------------
// mls_transactions — licensed sold/listed transaction records
// ---------------------------------------------------------------------------
export const mlsTransactionsTable = pgTable("mls_transactions", {
  id:                uuid("id").primaryKey().defaultRandom(),
  ownerId:           uuid("owner_id").notNull().references(() => usersTable.id),
  officeId:          uuid("office_id"),
  dataSource:        text("data_source").notNull(),        // 'crmls' | 'brokerage'
  licenseRestricted: boolean("license_restricted").notNull().default(true),
  mlsNumber:         text("mls_number"),
  address:           text("address").notNull(),
  neighborhood:      text("neighborhood"),
  listPrice:         numeric("list_price",  { precision: 14, scale: 2 }),
  soldPrice:         numeric("sold_price",  { precision: 14, scale: 2 }),
  listDate:          date("list_date",  { mode: "string" }),
  soldDate:          date("sold_date",  { mode: "string" }),
  daysOnMarket:      integer("days_on_market"),
  beds:              numeric("beds",  { precision: 4, scale: 1 }),
  baths:             numeric("baths", { precision: 4, scale: 1 }),
  sqft:              integer("sqft"),
  lotSqft:           integer("lot_sqft"),
  yearBuilt:         integer("year_built"),
  listingBrokerage:  text("listing_brokerage"),
  sourceId:          uuid("source_id").notNull().references(() => intelSourcesTable.id),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("mls_transactions_owner_id_idx").on(t.ownerId),
  index("mls_transactions_neighborhood_idx").on(t.neighborhood),
  index("mls_transactions_sold_date_idx").on(t.soldDate),
]);

// ---------------------------------------------------------------------------
// off_market_notes — Laura's proprietary deal flow. Highest value.
//
// RULE: these records NEVER appear in a published report without explicit
// per-item inclusion. isDefault = excluded from all generation queries.
// ---------------------------------------------------------------------------
export const offMarketNotesTable = pgTable("off_market_notes", {
  id:           uuid("id").primaryKey().defaultRandom(),
  ownerId:      uuid("owner_id").notNull().references(() => usersTable.id),
  officeId:     uuid("office_id"),
  address:      text("address"),
  neighborhood: text("neighborhood"),
  note:         text("note").notNull(),
  signalType:   text("signal_type").notNull(),
  // coming_soon | quiet_listing | owner_intent | distress | development
  confidence:   text("confidence").notNull().default("reported"),
  // verified | reported | estimated
  observedAt:   date("observed_at", { mode: "string" }).notNull(),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("off_market_notes_owner_id_idx").on(t.ownerId),
  index("off_market_notes_neighborhood_idx").on(t.neighborhood),
]);
