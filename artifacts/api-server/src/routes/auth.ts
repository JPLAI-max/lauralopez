import { Router, type IRouter, type Request, type Response } from "express";
import argon2 from "argon2";
import { generateSecret, generateURI, verifySync as _totpVerify } from "otplib";

// otplib's top-level VerifyResult is TOTPResult | HOTPResult, so .timeStep isn't on the
// union after narrowing. We only ever call this with TOTP secrets, so we use the narrower type.
type TotpValidResult = { valid: true; timeStep: number; delta: number; epoch: number };
type TotpVerifyResult = TotpValidResult | { valid: false };
function totpVerify(opts: { token: string; secret: string }): TotpVerifyResult {
  return _totpVerify(opts) as TotpVerifyResult;
}
import { db, usersTable, sessionsTable, authEventsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { encryptTotpSecret, decryptTotpSecret } from "../lib/crypto";
import {
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  hashIpForAuth,
} from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Rate limiting — in-memory, per email AND per IP
// ---------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL_DEFAULT = 5;  // for unknown IPs
const MAX_PER_EMAIL_KNOWN_IP = 10; // for IPs with a successful login in last 30 days
const MAX_PER_IP = 20;
const KNOWN_IP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const emailAttempts = new Map<string, number[]>();
const ipAttempts = new Map<string, number[]>();

function pruneWindow(map: Map<string, number[]>, key: string): number[] {
  const now = Date.now();
  const times = (map.get(key) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (times.length === 0) {
    map.delete(key);
  } else {
    map.set(key, times);
  }
  return times;
}

function recordAttempt(map: Map<string, number[]>, key: string): void {
  const times = map.get(key) ?? [];
  times.push(Date.now());
  map.set(key, times);
}

/**
 * Returns the per-email limit for this IP.
 * Known IPs (successful login for this email in last 30 days) get a higher limit
 * so an attacker who knows the email can't lock out the real user from their own IP.
 */
async function getEmailLimit(email: string, ipHash: string): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - KNOWN_IP_WINDOW_MS);
    const rows = await db
      .select({ id: authEventsTable.id })
      .from(authEventsTable)
      .where(
        and(
          eq(authEventsTable.email, email),
          eq(authEventsTable.ipHash, ipHash),
          eq(authEventsTable.action, "login"),
          eq(authEventsTable.success, true),
          gt(authEventsTable.createdAt, cutoff),
        ),
      )
      .limit(1);
    return rows.length > 0 ? MAX_PER_EMAIL_KNOWN_IP : MAX_PER_EMAIL_DEFAULT;
  } catch {
    return MAX_PER_EMAIL_DEFAULT;
  }
}

async function checkLoginRateLimit(
  email: string,
  rawIp: string,
  ipHash: string,
): Promise<boolean> {
  const byEmail = pruneWindow(emailAttempts, email);
  const byIp = pruneWindow(ipAttempts, rawIp);
  if (byIp.length >= MAX_PER_IP) return true;
  const emailLimit = await getEmailLimit(email, ipHash);
  return byEmail.length >= emailLimit;
}

const sweepLogin = setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of emailAttempts) {
    if (ts.length === 0 || now - Math.max(...ts) >= LOGIN_WINDOW_MS) emailAttempts.delete(k);
  }
  for (const [k, ts] of ipAttempts) {
    if (ts.length === 0 || now - Math.max(...ts) >= LOGIN_WINDOW_MS) ipAttempts.delete(k);
  }
}, 5 * 60 * 1000);
sweepLogin.unref();

// ---------------------------------------------------------------------------
// DUMMY hash — used when email not found to prevent timing-based enumeration
// ---------------------------------------------------------------------------
let _dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (_dummyHash) return _dummyHash;
  _dummyHash = await argon2.hash("dummy-password-for-timing-parity-v1");
  return _dummyHash;
}
getDummyHash().catch(() => {});

// ---------------------------------------------------------------------------
// Totp-pending cookie helpers
// ---------------------------------------------------------------------------
const PENDING_COOKIE_MAX_AGE = 10 * 60 * 1000; // 10 min

function setPendingCookie(res: Response, userId: string): void {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("totp_pending", userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: PENDING_COOKIE_MAX_AGE,
    signed: true,
  });
}

function clearPendingCookie(res: Response): void {
  res.clearCookie("totp_pending", { httpOnly: true, sameSite: "lax", signed: true });
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------
async function logAuthEvent(opts: {
  userId?: string | null;
  email: string;
  // Documented actions: password_fail | password_ok | totp_fail | totp_replay |
  //   totp_enrolled | login | logout | session_expired | rate_limited
  action: string;
  success: boolean;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(authEventsTable).values({
      userId: opts.userId ?? null,
      email: opts.email,
      action: opts.action,
      success: opts.success,
      ipHash: opts.ipHash ?? null,
      userAgent: opts.userAgent ?? null,
    });
  } catch (err) {
    logger.error({ err }, "failed to write auth_event");
  }
}

function getClientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const LoginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
});

const TotpCodeBody = z.object({
  code: z.string().min(6).max(8),
});

// ---------------------------------------------------------------------------
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router: IRouter = Router();

// POST /auth/login
router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const { email, password } = parsed.data;
  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  if (await checkLoginRateLimit(email, rawIp, ipHash)) {
    // Log the lockout attempt so it is visible in the audit log
    await logAuthEvent({ email, action: "rate_limited", success: false, ipHash, userAgent: ua });
    res.status(429).json({ error: "Too many login attempts. Try again later." });
    return;
  }

  // Record attempt before looking up user (prevents timing bypass)
  recordAttempt(emailAttempts, email);
  recordAttempt(ipAttempts, rawIp);

  // Look up user
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const user = users[0];

  // Always run argon2 verify (even when user not found) to prevent timing attacks
  const hashToVerify = user?.passwordHash ?? (await getDummyHash());
  let passwordOk = false;
  try {
    passwordOk = await argon2.verify(hashToVerify, password);
  } catch (_) {
    passwordOk = false;
  }

  if (!user || !passwordOk || user.disabledAt) {
    await logAuthEvent({
      userId: user?.id ?? null,
      email,
      action: "password_fail",
      success: false,
      ipHash,
      userAgent: ua,
    });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Password verified — set pending cookie, require TOTP next.
  // Log "password_ok" (not "login" — the user is not authenticated yet).
  setPendingCookie(res, user.id);
  await logAuthEvent({ userId: user.id, email, action: "password_ok", success: true, ipHash, userAgent: ua });

  res.json({
    requiresTotp: user.totpEnabled,
    requiresTotpSetup: !user.totpEnabled,
  });
});

// POST /auth/verify-totp
router.post("/auth/verify-totp", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "No pending login session" });
    return;
  }

  const parsed = TotpCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid TOTP code" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];

  if (!user || !user.totpEnabled || !user.totpSecret) {
    res.status(403).json({ error: "TOTP not enrolled" });
    return;
  }

  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  let secret: string;
  try {
    secret = decryptTotpSecret(user.totpSecret);
  } catch (err) {
    logger.error({ err, userId: user.id }, "failed to decrypt TOTP secret");
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  // FIX 1: verifySync returns a VerifyResult object — check .valid, not the object itself
  const result = totpVerify({ token: parsed.data.code, secret });

  if (!result.valid) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "totp_fail", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }

  // FIX 2: Replay protection — reject if this time-step was already used
  if (user.lastTotpEpoch !== null && result.timeStep <= user.lastTotpEpoch) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "totp_replay", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "TOTP code already used. Wait for a new code." });
    return;
  }

  // Update lastTotpEpoch to prevent replay of this code
  await db
    .update(usersTable)
    .set({ lastTotpEpoch: result.timeStep })
    .where(eq(usersTable.id, user.id));

  // Issue full session
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await db
    .insert(sessionsTable)
    .values({ userId: user.id, expiresAt, userAgent: ua, ipHash })
    .returning();

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  clearPendingCookie(res);
  setSessionCookie(res, session.id);

  // FIX 3: "login" success is logged here — after the session is issued — not at password_ok
  await logAuthEvent({ userId: user.id, email: user.email, action: "login", success: true, ipHash, userAgent: ua });
  res.json({ ok: true });
});

// POST /auth/logout
router.post(
  "/auth/logout",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (req.sessionId) {
      try {
        await db.delete(sessionsTable).where(eq(sessionsTable.id, req.sessionId));
      } catch (err) {
        logger.warn({ err }, "logout: failed to delete session");
      }
    }
    if (req.user) {
      await logAuthEvent({
        userId: req.user.id,
        email: req.user.email,
        action: "logout",
        success: true,
        ipHash: hashIpForAuth(getClientIp(req)),
        userAgent: req.headers["user-agent"] ?? null,
      });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  },
);

// GET /auth/me
router.get(
  "/auth/me",
  requireAuth,
  (req: Request, res: Response): void => {
    res.json({ user: req.user });
  },
);

// POST /auth/totp/enroll — accessible with totp_pending cookie (no full session required)
router.post("/auth/totp/enroll", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "No pending login session" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Generate a new TOTP secret
  const secret = generateSecret();
  const encrypted = encryptTotpSecret(secret);

  // Store encrypted secret but leave totpEnabled=false until confirmed
  await db
    .update(usersTable)
    .set({ totpSecret: encrypted, lastTotpEpoch: null })
    .where(eq(usersTable.id, user.id));

  const otpauthUrl = generateURI({ issuer: "Laura Lopez Admin", label: user.email, secret });

  res.json({ otpauthUrl, secret });
});

// POST /auth/totp/confirm — accessible with totp_pending cookie
router.post("/auth/totp/confirm", async (req: Request, res: Response): Promise<void> => {
  const userId = req.signedCookies?.totp_pending as string | undefined;
  if (!userId) {
    res.status(401).json({ error: "No pending login session" });
    return;
  }

  const parsed = TotpCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid TOTP code" });
    return;
  }

  const users = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const user = users[0];
  if (!user || !user.totpSecret) {
    res.status(400).json({ error: "No TOTP secret to confirm. Call /auth/totp/enroll first." });
    return;
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(user.totpSecret);
  } catch (err) {
    logger.error({ err }, "totp/confirm: failed to decrypt secret");
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  // FIX 1: Check .valid, not the object itself
  const result = totpVerify({ token: parsed.data.code, secret });
  if (!result.valid) {
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }

  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  // Mark enrolled and record lastTotpEpoch so the enrollment code cannot be replayed
  await db
    .update(usersTable)
    .set({ totpEnabled: true, lastTotpEpoch: result.timeStep })
    .where(eq(usersTable.id, user.id));

  await logAuthEvent({
    userId: user.id,
    email: user.email,
    action: "totp_enrolled",
    success: true,
    ipHash,
    userAgent: ua,
  });

  // Issue full session
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await db
    .insert(sessionsTable)
    .values({ userId: user.id, expiresAt, userAgent: ua, ipHash })
    .returning();

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  clearPendingCookie(res);
  setSessionCookie(res, session.id);

  res.json({ ok: true });
});

export default router;
