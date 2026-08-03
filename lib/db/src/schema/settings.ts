import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ---------------------------------------------------------------------------
// settings  — owner-scoped key/value store
// Keys used by Brick 5:
//   dre_license      — DRE license number; required on every generated asset
//   brokerage_name   — Brokerage name;     required on every generated asset
//   agent_name       — Display name for asset overlays (falls back to user.name)
// ---------------------------------------------------------------------------
export const settingsTable = pgTable(
  "settings",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    ownerId:   uuid("owner_id").notNull().references(() => usersTable.id),
    key:       text("key").notNull(),
    value:     text("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("settings_owner_id_idx").on(t.ownerId),
    unique("settings_owner_key_unique").on(t.ownerId, t.key),
  ],
);

export type Setting    = typeof settingsTable.$inferSelect;
export type InsertSetting = typeof settingsTable.$inferInsert;
