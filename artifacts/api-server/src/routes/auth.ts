import { Router, type IRouter, type Request, type Response } from "express";
import argon2 from "argon2";
import { generateSecret, generateURI, verifySync as totpVerify } from "otplib";
import { db, usersTable, sessionsTable, authEventsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { encryptTotpSecret, decryptTotpSecret } from "../lib/crypto";
import {
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
  requireTotpEnrolled,
  hashIpForAuth,
} from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// Rate limiting — in-memory, per email AND per IP
// ---------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

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

function isLoginRateLimited(email: string, ip: string): boolean {
  const byEmail = pruneWindow(emailAttempts, email);
  const byIp = pruneWindow(ipAttempts, ip);
  return byEmail.length >= MAX_PER_EMAIL || byIp.length >= MAX_PER_IP;
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
// Pre-computed at module load so the first "unknown email" response isn't slow
let _dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (_dummyHash) return _dummyHash;
  _dummyHash = await argon2.hash("dummy-password-for-timing-parity-v1");
  return _dummyHash;
}
// Kick it off immediately in the background
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
// SESSION_DURATION for creating sessions
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

  if (isLoginRateLimited(email, rawIp)) {
    await logAuthEvent({ email, action: "login", success: false, ipHash, userAgent: ua });
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

  // Password verified — set pending cookie, require TOTP
  setPendingCookie(res, user.id);

  const requiresTotpSetup = !user.totpEnabled;
  await logAuthEvent({ userId: user.id, email, action: "login", success: true, ipHash, userAgent: ua });

  res.json({
    requiresTotp: user.totpEnabled,
    requiresTotpSetup,
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

  const isValid = totpVerify({ token: parsed.data.code, secret });
  if (!isValid) {
    await logAuthEvent({ userId: user.id, email: user.email, action: "totp_fail", success: false, ipHash, userAgent: ua });
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }

  // Issue full session
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const [session] = await db
    .insert(sessionsTable)
    .values({ userId: user.id, expiresAt, userAgent: ua, ipHash })
    .returning();

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));

  clearPendingCookie(res);
  setSessionCookie(res, session.id);

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
  await db.update(usersTable).set({ totpSecret: encrypted }).where(eq(usersTable.id, user.id));

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

  const isValid = totpVerify({ token: parsed.data.code, secret });
  if (!isValid) {
    res.status(401).json({ error: "Invalid TOTP code" });
    return;
  }

  // Mark enrolled
  await db.update(usersTable).set({ totpEnabled: true }).where(eq(usersTable.id, user.id));

  const rawIp = getClientIp(req);
  const ipHash = hashIpForAuth(rawIp);
  const ua = req.headers["user-agent"] ?? null;

  await logAuthEvent({
    userId: user.id,
    email: user.email,
    action: "totp_enrolled",
    success: true,
    ipHash,
    userAgent: ua,
  });

  // Issue full session now that TOTP is enrolled
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
