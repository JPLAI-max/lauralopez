import {
  pgTable,
  text,
  uuid,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inquiriesTable = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    affiliation: text("affiliation").notNull(),
    inquiryType: text("inquiry_type").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("new"),
    source: text("source").notNull().default("website"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"), // sha256(ip + INQUIRY_IP_SALT) — raw IP is never stored
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("inquiries_created_at_idx").on(table.createdAt),
    index("inquiries_status_idx").on(table.status),
  ],
);

export const insertInquirySchema = createInsertSchema(inquiriesTable).omit({
  id: true,
  status: true,
  source: true,
  ipHash: true,
  userAgent: true,
  createdAt: true,
  readAt: true,
});

export type InsertInquiry = z.infer<typeof insertInquirySchema>;
export type Inquiry = typeof inquiriesTable.$inferSelect;
