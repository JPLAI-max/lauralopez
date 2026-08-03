import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  date,
  decimal,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// transactions
// ---------------------------------------------------------------------------
export const transactionsTable = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    officeId: uuid("office_id"), // null today; multi-tenant later
    propertyAddress: text("property_address").notNull(),
    side: text("side").notNull(), // buy | sell
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email"),
    clientPhone: text("client_phone"),
    status: text("status").notNull().default("active"), // active | closed | cancelled | pending
    acceptanceDate: date("acceptance_date", { mode: "string" }),
    closeOfEscrowDate: date("close_of_escrow_date", { mode: "string" }),
    purchasePrice: decimal("purchase_price", { precision: 14, scale: 2 }),
    escrowCompany: text("escrow_company"),
    escrowOfficer: text("escrow_officer"),
    escrowOfficerEmail: text("escrow_officer_email"),
    lender: text("lender"),
    coopAgent: text("coop_agent"),
    coopBrokerage: text("coop_brokerage"),
    notes: text("notes"),
    icsToken: text("ics_token").notNull().unique(), // 32-byte random hex; public calendar auth
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    index("transactions_owner_id_idx").on(t.ownerId),
    index("transactions_office_id_idx").on(t.officeId),
    index("transactions_status_idx").on(t.status),
  ],
);

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;

// ---------------------------------------------------------------------------
// milestone_templates
// ---------------------------------------------------------------------------
export const milestoneTemplatesTable = pgTable(
  "milestone_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    officeId: uuid("office_id"),
    name: text("name").notNull(),
    side: text("side").notNull(), // buy | sell | both
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("milestone_templates_owner_id_idx").on(t.ownerId),
    index("milestone_templates_office_id_idx").on(t.officeId),
  ],
);

export type MilestoneTemplate = typeof milestoneTemplatesTable.$inferSelect;

// ---------------------------------------------------------------------------
// milestone_template_items
// ---------------------------------------------------------------------------
export const milestoneTemplateItemsTable = pgTable("milestone_template_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => milestoneTemplatesTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  offsetDays: integer("offset_days").notNull(),
  anchor: text("anchor").notNull(), // acceptance | coe
  direction: text("direction").notNull(), // after | before
  dayType: text("day_type").notNull(), // calendar | business
  category: text("category").notNull(), // contingency | disclosure | inspection | financing | admin
  requiresWrittenRemoval: boolean("requires_written_removal").notNull().default(false),
  sortOrder: integer("sort_order").notNull(),
});

export type MilestoneTemplateItem = typeof milestoneTemplateItemsTable.$inferSelect;

// ---------------------------------------------------------------------------
// transaction_milestones — live instances
// Date computation params are snapshotted from the template at creation so
// they survive template edits and support ad-hoc milestones.
// ---------------------------------------------------------------------------
export const transactionMilestonesTable = pgTable(
  "transaction_milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    label: text("label").notNull(),
    category: text("category").notNull(),
    // Snapshotted computation params (null for milestones with no anchor logic)
    offsetDays: integer("offset_days"),
    anchor: text("anchor"), // acceptance | coe
    direction: text("direction"), // after | before
    dayType: text("day_type"), // calendar | business
    computedDate: date("computed_date", { mode: "string" }),
    overrideDate: date("override_date", { mode: "string" }), // manual override; survives recompute
    // effectiveDate is DERIVED: overrideDate ?? computedDate (never stored)
    status: text("status").notNull().default("pending"), // pending | complete | waived
    requiresWrittenRemoval: boolean("requires_written_removal").notNull().default(false),
    removalDeliveredAt: timestamp("removal_delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("transaction_milestones_transaction_id_idx").on(t.transactionId),
    index("transaction_milestones_owner_id_idx").on(t.ownerId),
  ],
);

export type TransactionMilestone = typeof transactionMilestonesTable.$inferSelect;
export type InsertTransactionMilestone = typeof transactionMilestonesTable.$inferInsert;

// ---------------------------------------------------------------------------
// transaction_documents
// ---------------------------------------------------------------------------
export const transactionDocumentsTable = pgTable(
  "transaction_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    milestoneId: uuid("milestone_id").references(() => transactionMilestonesTable.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transaction_documents_transaction_id_idx").on(t.transactionId),
    index("transaction_documents_owner_id_idx").on(t.ownerId),
  ],
);

// ---------------------------------------------------------------------------
// transaction_events — APPEND ONLY, never update or delete
// Actions: transaction_created | dates_changed | milestone_completed |
//   milestone_waived | date_overridden | removal_delivered | status_changed |
//   document_uploaded | milestone_added | milestone_deleted
// Payload always contains before/after values, not just the new value.
// ---------------------------------------------------------------------------
export const transactionEventsTable = pgTable(
  "transaction_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactionsTable.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transaction_events_transaction_id_idx").on(t.transactionId),
    index("transaction_events_owner_id_idx").on(t.ownerId),
  ],
);

export type TransactionEvent = typeof transactionEventsTable.$inferSelect;
