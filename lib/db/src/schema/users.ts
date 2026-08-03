import {
  pgTable,
  text,
  uuid,
  timestamp,
  boolean,
  integer,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // argon2id
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"), // admin | staff
  totpSecret: text("totp_secret"), // AES-256-GCM encrypted; null until enrolled
  totpSecretSetAt: timestamp("totp_secret_set_at", { withTimezone: true }), // when totpSecret was last written; used to detect fresh unconfirmed secrets
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  lastTotpEpoch: integer("last_totp_epoch"), // TOTP time-step used on last successful verify; null until first use
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;

// ---------------------------------------------------------------------------
// sessions
// ---------------------------------------------------------------------------
export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export type Session = typeof sessionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// auth_events — append-only audit log
// ---------------------------------------------------------------------------
export const authEventsTable = pgTable("auth_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"), // nullable — may not exist for unknown email attempts
  email: text("email").notNull(),
  action: text("action").notNull(), // password_fail | password_ok | totp_fail | totp_replay | totp_enrolled | login | logout | session_expired | rate_limited
  success: boolean("success").notNull(),
  ipHash: text("ip_hash"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuthEvent = typeof authEventsTable.$inferSelect;

// ---------------------------------------------------------------------------
// recovery_codes — single-use TOTP account recovery
// ---------------------------------------------------------------------------
export const recoveryCodesTable = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(), // argon2id of the plaintext code
    usedAt: timestamp("used_at", { withTimezone: true }), // null = not yet used
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recovery_codes_user_id_idx").on(t.userId)],
);

export type RecoveryCode = typeof recoveryCodesTable.$inferSelect;
