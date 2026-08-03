import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { inquiriesTable } from "./inquiries";

// ---------------------------------------------------------------------------
// contacts
// ---------------------------------------------------------------------------
export const contactsTable = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    officeId: uuid("office_id"), // nullable — multi-tenant later

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    title: text("title"),
    // client | attorney | wealth_manager | trust_officer | family_office |
    // private_banker | agent | vendor | other
    contactType: text("contact_type").notNull().default("other"),

    neighborhood: text("neighborhood"),
    address: text("address"),

    // manual | inquiry | transaction | import
    source: text("source").notNull().default("manual"),
    sourceInquiryId: uuid("source_inquiry_id").references(() => inquiriesTable.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),
    tags: jsonb("tags").notNull().$type<string[]>().default(sql`'[]'::jsonb`),

    // Intelligence mailing list opt-in — never auto-subscribed
    subscribedIntelligence: boolean("subscribed_intelligence").notNull().default(false),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),

    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    archived: boolean("archived").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contacts_owner_id_idx").on(t.ownerId),
    index("contacts_contact_type_idx").on(t.contactType),
    index("contacts_email_idx").on(t.email),
    // Partial unique: (ownerId, lower(email)) where email IS NOT NULL AND archived = false
    // Enforced at DB level via the migration SQL; declared here for documentation.
    uniqueIndex("contacts_owner_email_unique_idx").on(t.ownerId, t.email),
  ],
);

export type Contact = typeof contactsTable.$inferSelect;
export type InsertContact = typeof contactsTable.$inferInsert;

// ---------------------------------------------------------------------------
// contact_interactions — append-only timeline
// ---------------------------------------------------------------------------
export const contactInteractionsTable = pgTable(
  "contact_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contactsTable.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id").notNull().references(() => usersTable.id),
    // note | email | call | meeting | event
    kind: text("kind").notNull(),
    body: text("body").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contact_interactions_contact_id_idx").on(t.contactId),
    index("contact_interactions_owner_id_idx").on(t.ownerId),
  ],
);

export type ContactInteraction = typeof contactInteractionsTable.$inferSelect;
export type InsertContactInteraction = typeof contactInteractionsTable.$inferInsert;
