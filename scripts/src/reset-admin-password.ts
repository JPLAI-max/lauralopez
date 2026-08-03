/**
 * Reset the password for an admin account without touching TOTP.
 *
 * Usage:
 *   RESET_EMAIL=admin@example.com \
 *   RESET_PASSWORD=<new-password-min-16-chars> \
 *   RESET_CONFIRM=yes \
 *   pnpm --filter @workspace/scripts reset-admin-password
 *
 * The script refuses to run without RESET_CONFIRM=yes to prevent
 * accidental execution. It does NOT reset, disable, or re-enroll TOTP.
 */

import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db, usersTable, authEventsTable } from "@workspace/db";

const email    = process.env.RESET_EMAIL?.trim();
const password = process.env.RESET_PASSWORD ?? "";
const confirm  = process.env.RESET_CONFIRM?.trim();

// ---- guard rails ----
if (!email || !password || confirm !== "yes") {
  console.error(
    "\nUsage:\n" +
    "  RESET_EMAIL=<email> RESET_PASSWORD=<new-password> RESET_CONFIRM=yes \\\n" +
    "  pnpm --filter @workspace/scripts reset-admin-password\n\n" +
    "RESET_CONFIRM must be exactly 'yes'. RESET_PASSWORD must be ≥ 16 characters.",
  );
  process.exit(1);
}

if (password.length < 16) {
  console.error(`✗ RESET_PASSWORD is ${password.length} characters — minimum is 16.`);
  process.exit(1);
}

// ---- look up the user ----
const users = await db
  .select()
  .from(usersTable)
  .where(eq(usersTable.email, email))
  .limit(1);

const user = users[0];
if (!user) {
  console.error(`✗ No account found for email: ${email}`);
  process.exit(1);
}

// ---- hash and update ----
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

await db
  .update(usersTable)
  .set({ passwordHash })
  .where(eq(usersTable.id, user.id));

// ---- audit log ----
await db.insert(authEventsTable).values({
  userId:    user.id,
  email:     user.email,
  action:    "password_reset",
  success:   true,
  ipHash:    "script:reset-admin-password",
  userAgent: "reset-admin-password",
});

console.log(`\n✓ Password updated for ${user.email} (id: ${user.id}).`);
console.log("  TOTP enrollment status is unchanged.");
console.log("  Log in with the new password and complete TOTP if not yet enrolled.\n");

process.exit(0);
