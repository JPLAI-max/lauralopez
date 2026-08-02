/**
 * seed-admin.ts — creates the first admin user
 *
 * Usage:
 *   ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... ADMIN_SEED_NAME=... pnpm --filter @workspace/scripts seed-admin
 *
 * Idempotent: exits without changes if the email already exists.
 * Requires ADMIN_SEED_PASSWORD >= 16 characters.
 */
import argon2 from "argon2";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = process.env.ADMIN_SEED_EMAIL?.trim();
const password = process.env.ADMIN_SEED_PASSWORD;
const name = process.env.ADMIN_SEED_NAME?.trim();

if (!email || !password || !name) {
  console.error("Missing required env vars: ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, ADMIN_SEED_NAME");
  process.exit(1);
}

if (password.length < 16) {
  console.error("ADMIN_SEED_PASSWORD must be at least 16 characters. Refusing to create a weak admin password.");
  process.exit(1);
}

const existing = await db
  .select({ id: usersTable.id })
  .from(usersTable)
  .where(eq(usersTable.email, email))
  .limit(1);

if (existing.length > 0) {
  console.log(`Admin user ${email} already exists — nothing to do.`);
  process.exit(0);
}

const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

const [user] = await db
  .insert(usersTable)
  .values({
    email,
    passwordHash,
    name,
    role: "admin",
    totpEnabled: false, // first login forces enrollment
  })
  .returning({ id: usersTable.id });

console.log(`Created admin user ${email} (id: ${user.id}). TOTP enrollment will be required on first login.`);
process.exit(0);
