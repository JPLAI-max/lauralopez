import { Router, type IRouter, type Request, type Response } from "express";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { generateSecret, generateURI, verifySync as _totpVerify } from "otplib";
import {
  db,
  usersTable,
  sessionsTable,
  authEventsTable,
  recoveryCodesTable,
} from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { encryptTotpSecret, decryptTotpSecret } from "../lib/crypto";
import {
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  hashIpForAuth,
} from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

// otplib's top-level VerifyResult is TOTPResult | HOTPResult, so .timeStep isn't on the
// union after narrowing. We only ever call this with TOTP secrets, so we use a narrower type.
type TotpValidResult = { valid: true; timeStep: number; delta: number; epoch: number };
type TotpVerifyResult = TotpValidResult | { valid: false };
function totpVerify(opts: { token: string; secret: string }): TotpVerifyResult {
  return _totpVerify(opts) as TotpVerifyResult;
}

// ---------------------------------------------------------------------------
// Crockford base32 recovery code generator (8 chars, ~40 bits of entropy)
// Alphabet: 0123456789ABCDEFGHJKMNPQRSTVWXYZ (no I, L, O, U)
// ---------------------------------------------------------------------------
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function generateRecoveryCode(): string {
  // Take lowest 5 bits of each byte — all 32 values equally likely
  return Array.from(randomBytes(8), (b) => CROCKFORD[b & 31]!).join("");
}

async function generateAndStoreRecoveryCodes(userId: string): Promise<string[]> {
  // Delete any existing codes first
  await db.delete(recoveryCodesTable).where(eq(recoveryCodesTable.userId, userId));
  const codes: string[] = [];
  const rows: Array<{ userId: string; codeHash: string }> = [];
  for (let i = 0; i < 10; i++) {
    const code = generateRecoveryCode();
    codes.push(code);
    rows.push({ userId, codeHash: await argon2.hash(code) });
  }
  await db.insert(recoveryCodesTable).values(rows);
  return codes;
}

// ---------------------------------------------------------------------------
// Rate limiting — in-memory, per email AND per IP
// ---------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL_DEFAULT = 5;
const MAX_PER_EMAIL_KNOWN_IP = 10;
const MAX_PER_IP = 20;
const KNOWN_IP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const emailAttempts = new Map<string, number[]>();
const ipAttempts = new Map<string, number[]>();

function pruneWindow(map: Map<string, number[]>, key: string): number[] {
  const now = Date.now();
  const times = (map.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (times.length === 0) { map.delete(key); } else { map.set(key, times); }
  return times;
}

function recordAttempt(map: Map<string, number[]>, key: string): void {
  const times = map.get(key) ?? [];
  times.push(Date.now());
  map.set(key, times);
}

async function getEmailLimit(email: string, ipHash: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - KNOWN_IP_WINDOW_MS);
    const rows = await db
      .select({ id: authEventsTable.id })
      .from(authEventsTable)
      .where(and(eq(authEventsTable.email, email), eq(authEventsTable.ipHash, ipHash), eq(authEventsTable.action, "login"), eq(authEventsTable.success, true), gt(authEventsTable.createdAt, cutoff)))
      .limit(1);
    return rows.length > 0 ? MAX_PER_EMAIL_KNOWN_IP : MAX_PER_EMAIL_DEFAULT;
  } catch { return MAX_PER_EMAIL_DEFAULT; }
}

async function checkLoginRateLimit(email: string, rawIp: string, ipHash: string): Promise<boolean> {
  const byEmail = pruneWindow(emailAttempts, email);
  const byIp = pruneWindow(ipAttempts, rawIp);
  if (byIp.length >= MAX_PER_IP) return true;
  const emailLimit = await getEmailLimit(email, ipHash);
  return byEmail.length >= emailLimit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of emailAttempts) { if (ts.length === 0 || now - Math.max(...ts) >= LOGIN_WINDOW_MS) emailAttempts.delete(k); }
  for (const [k, ts] of ipAttempts) { if (ts.length === 0 || now - Math.max(...ts) >= LOGIN_WINDOW_MS) ipAttempts.delete(k); }
}, 5 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// DUMMY hash — timing parity for unknown emails
// ---------------------------------------------------------------------------
let _dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (_dummyHash) return _dummyHash;
  _dummyHash = await argon2.hash("dummy-password-for-timing-parity-v1");
  return _dummyHash;
}
getDummyHash().catch(() => {});

// ---------------------------------------------------------------------------
// Pending cookie helpers
// ---------------------------------------------------------------------------
const PENDING_COOKIE_MAX_AGE = 10 * 60 * 1000;
function setPendingCookie(res: Response, userId: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("totp_pending", userId, { httpOnly: true, sameSite: "lax", secure: isProduction, maxAge: PENDING_COOKIE_MAX_AGE, signed: true });
}
function clearPendingCookie(res: Response): void {
  res.clearCookie("totp_pending", { httpOnly: true, sameSite: "lax", signed: true });
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------
async function logAuthEvent(opts: { userId?: string | null; email: string; action: string; success: boolean; ipHash?: string | null; userAgent?: string | null }): Promise<void> {
  try {
    await db.insert(authEventsTable).values({ userId: opts.userId ?? null, email: opts.email, action: opts.action, success: opts.success, ipHash: opts.ipHash ?? null, userAgent: opts.userAgent ?? null });
  } catch (err) { logger.error({ err }, "failed to write auth_event"); }
}

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const LoginBody = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });
const TotpCodeBody = z.object({ code: z.string().min(6).max(8) });
const RecoveryCodeBody = z.object({ code: z.string().min(8).max(8).toUpperCase() });

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router: IRouter = Router();

// POST /auth/login
router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const { email, password } = parsed.data;
  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  if (await checkLoginRateLimit(email, rawIp, ipHash)) {
    await logAuthEvent({ email, action: "rate_limited", success: false, ipHash, userAgent: ua });
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }
  recordAttempt(emailAttempts, email);
  recordAttempt(ipAttempts, rawIp);

  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const user = users[0];
  const hashToVerify = user?.passwordHash ?? (await getDummyHash());
  let passwordOk = false;
  try { passwordOk = await argon2.verify(hashToVerify, password); } catch { passwordOk = false; }

  if (!user || !passwordOk || user.disabledAt) {
    await logAuthEvent({ userId: user?.id ?? null, email, action: "password_fail", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  setPendingCookie(res, user.id);
  await logAuthEvent({ userId: user.id, email, action: "password_ok", success: true, ipHash, userAgent: ua });
  res.json({ requiresTotp: user.totpEnabled, requiresTotpSetup: !user.totpEnabled });
});

// POST /auth/verify-totp
router.post("/auth/verify-totp", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) { res.status(401).json({ error: "No pending login session" }); return; }
  const parsed = TotpCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid TOTP code" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user || !user.totpEnabled || !user.totpSecret) { res.status(403).json({ error: "TOTP not enrolled" }); return; }

  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  let secret: string;
  try { secret = decryptTotpSecret(user.totpSecret); }
  catch (err) { logger.error({ err, userId: user.id }, "failed to decrypt TOTP secret"); res.status(500).json({ error: "Internal server error" }); return; }

  const result = totpVerify({ token: parsed.data.code, secret });
  if (!result.valid) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "totp_fail", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }
  if (user.lastTotpEpoch !== null && result.timeStep <= user.lastTotpEpoch) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "totp_replay", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "TOTP code already used. Wait for a new code." });
    return;
  }

  await db.update(usersTable).set({ lastTotpEpoch: result.timeStep }).where(eq(usersTable.id, user.id));
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await db.insert(sessionsTable).values({ userId: user.id, expiresAt, userAgent: ua, ipHash }).returning();
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  clearPendingCookie(res);
  setSessionCookie(res, session!.id);
  await logAuthEvent({ userId: user.id, email: user.email, action: "login", success: true, ipHash, userAgent: ua });
  res.json({ ok: true });
});

// POST /auth/verify-recovery — recovery code in place of TOTP
router.post("/auth/verify-recovery", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) { res.status(401).json({ error: "No pending login session" }); return; }

  const parsed = RecoveryCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid recovery code format" }); return; }
  const code = parsed.data.code;

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  // Apply same rate limiting as TOTP (re-use email+ip tracking)
  if (await checkLoginRateLimit(user.email, rawIp, ipHash)) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "rate_limited", success: false, ipHash, userAgent: ua });
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  recordAttempt(emailAttempts, user.email);
  recordAttempt(ipAttempts, rawIp);

  // Fetch all unused recovery codes for this user
  const codes = await db.select().from(recoveryCodesTable).where(and(eq(recoveryCodesTable.userId, userId), isNull(recoveryCodesTable.usedAt)));
  let matched: (typeof codes)[0] | undefined;
  for (const row of codes) {
    try {
      const ok = await argon2.verify(row.codeHash, code);
      if (ok) { matched = row; break; }
    } catch { /* continue */ }
  }

  if (!matched) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "recovery_fail", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "Invalid or already-used recovery code" });
    return;
  }

  // Mark code used
  await db.update(recoveryCodesTable).set({ usedAt: new Date() }).where(eq(recoveryCodesTable.id, matched.id));

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await db.insert(sessionsTable).values({ userId: user.id, expiresAt, userAgent: ua, ipHash }).returning();
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  clearPendingCookie(res);
  setSessionCookie(res, session!.id);

  await logAuthEvent({ userId: user.id, email: user.email, action: "recovery_used", success: true, ipHash, userAgent: ua });
  await logAuthEvent({ userId: user.id, email: user.email, action: "login", success: true, ipHash, userAgent: ua });
  res.json({ ok: true });
});

// POST /auth/logout
router.post("/auth/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (req.sessionId) {
    try { await db.delete(sessionsTable).where(eq(sessionsTable.id, req.sessionId)); }
    catch (err) { logger.warn({ err }, "logout: failed to delete session"); }
  }
  if (req.user) {
    await logAuthEvent({ userId: req.user.id, email: req.user.email, action: "logout", success: true, ipHash: hashIpForAuth(getClientIp(req)), userAgent: req.headers["user-agent"] ?? null });
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /auth/me
router.get("/auth/me", requireAuth, (req: Request, res: Response): void => {
  res.json({ user: req.user });
});

// GET /auth/recovery-codes/count — remaining unused codes
router.get("/auth/recovery-codes/count", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const codes = await db.select({ id: recoveryCodesTable.id }).from(recoveryCodesTable).where(and(eq(recoveryCodesTable.userId, req.user!.id), isNull(recoveryCodesTable.usedAt)));
  res.json({ remaining: codes.length });
});

// POST /auth/recovery-codes/regenerate — invalidate all, generate 10 new
router.post("/auth/recovery-codes/regenerate", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const newCodes = await generateAndStoreRecoveryCodes(req.user!.id);
  await logAuthEvent({ userId: req.user!.id, email: req.user!.email, action: "recovery_codes_regenerated", success: true, ipHash: hashIpForAuth(getClientIp(req)), userAgent: req.headers["user-agent"] ?? null });
  res.json({ recoveryCodes: newCodes });
});

// POST /auth/totp/enroll
router.post("/auth/totp/enroll", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) { res.status(401).json({ error: "No pending login session" }); return; }
  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) { res.status(401).json({ error: "User not found" }); return; }

  const secret = generateSecret();
  const encrypted = encryptTotpSecret(secret);
  await db.update(usersTable).set({ totpSecret: encrypted, lastTotpEpoch: null }).where(eq(usersTable.id, user.id));
  const otpauthUrl = generateURI({ issuer: "Laura Lopez Admin", label: user.email, secret });
  res.json({ otpauthUrl, secret });
});

// POST /auth/totp/confirm
router.post("/auth/totp/confirm", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) { res.status(401).json({ error: "No pending login session" }); return; }
  const parsed = TotpCodeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid TOTP code" }); return; }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user || !user.totpSecret) { res.status(400).json({ error: "No TOTP secret. Call /auth/totp/enroll first." }); return; }

  let secret: string;
  try { secret = decryptTotpSecret(user.totpSecret); }
  catch (err) { logger.error({ err }, "totp/confirm: failed to decrypt secret"); res.status(500).json({ error: "Internal server error" }); return; }

  const result = totpVerify({ token: parsed.data.code, secret });
  if (!result.valid) { res.status(401).json({ error: "Invalid TOTP code" }); return; }

  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  await db.update(usersTable).set({ totpEnabled: true, lastTotpEpoch: result.timeStep }).where(eq(usersTable.id, user.id));

  // Generate and store 10 recovery codes; return plaintext (shown once only)
  const recoveryCodes = await generateAndStoreRecoveryCodes(userId);

  await logAuthEvent({ userId: user.id, email: user.email, action: "totp_enrolled", success: true, ipHash, userAgent: ua });

  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await db.insert(sessionsTable).values({ userId: user.id, expiresAt, userAgent: ua, ipHash }).returning();
  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  clearPendingCookie(res);
  setSessionCookie(res, session!.id);
  res.json({ ok: true, recoveryCodes });
});

export default router;
