import { type Request, type Response, type NextFunction } from "express";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { logger } from "../lib/logger";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const SLIDING_THRESHOLD = SESSION_DURATION_MS / 2; // extend if > halfway to expiry

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
        role: string;
        totpEnabled: boolean;
      };
      sessionId?: string;
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const sessionId = req.signedCookies?.sid as string | undefined;

  if (!sessionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let session: typeof sessionsTable.$inferSelect | undefined;
  let user: typeof usersTable.$inferSelect | undefined;

  try {
    const rows = await db
      .select({
        session: sessionsTable,
        user: usersTable,
      })
      .from(sessionsTable)
      .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
      .where(eq(sessionsTable.id, sessionId))
      .limit(1);

    if (rows.length === 0) {
      clearSessionCookie(res, req);
      res.status(401).json({ error: "Session not found" });
      return;
    }

    session = rows[0].session;
    user = rows[0].user;
  } catch (err) {
    logger.error({ err }, "requireAuth: DB error looking up session");
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  const now = new Date();

  // Expired session
  if (session.expiresAt <= now) {
    try {
      await db.delete(sessionsTable).where(eq(sessionsTable.id, session.id));
    } catch (err) {
      logger.warn({ err }, "requireAuth: failed to delete expired session");
    }
    clearSessionCookie(res, req);
    res.status(401).json({ error: "Session expired" });
    return;
  }

  // Disabled user
  if (user.disabledAt) {
    clearSessionCookie(res, req);
    res.status(403).json({ error: "Account disabled" });
    return;
  }

  // Sliding expiry: if more than halfway to expiry, extend by full duration
  const msRemaining = session.expiresAt.getTime() - now.getTime();
  if (msRemaining < SLIDING_THRESHOLD) {
    const newExpiry = new Date(now.getTime() + SESSION_DURATION_MS);
    try {
      await db
        .update(sessionsTable)
        .set({ expiresAt: newExpiry })
        .where(eq(sessionsTable.id, session.id));
      setSessionCookie(res, req, session.id);
    } catch (err) {
      logger.warn({ err }, "requireAuth: failed to extend session");
    }
  }

  req.sessionId = session.id;
  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    totpEnabled: user.totpEnabled,
  };

  next();
}

/** Variant that additionally requires TOTP enrollment before allowing access. */
export async function requireTotpEnrolled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // requireAuth must have already run and attached req.user
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!req.user.totpEnabled) {
    res.status(403).json({
      error: "TOTP enrollment required",
      code: "totp_enrollment_required",
    });
    return;
  }
  next();
}

/** Factory that checks a specific role. */
export function requireRole(role: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = _req.user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (user.role !== role) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

function isHttpsContext(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return true;
  const proto = req.headers["x-forwarded-proto"];
  return proto === "https" || (Array.isArray(proto) && proto.includes("https"));
}

export function setSessionCookie(res: Response, req: Request, sessionId: string): void {
  const https = isHttpsContext(req);
  res.cookie("sid", sessionId, {
    httpOnly: true,
    sameSite: https ? "none" : "lax",
    secure:   https,
    maxAge:   SESSION_DURATION_MS,
    signed:   true,
  });
}

export function clearSessionCookie(res: Response, req: Request): void {
  const https = isHttpsContext(req);
  res.clearCookie("sid", { httpOnly: true, sameSite: https ? "none" : "lax", secure: https, signed: true });
}

export function hashIpForAuth(ip: string): string {
  const salt = process.env.INQUIRY_IP_SALT ?? "dev-auth-ip-salt";
  return createHash("sha256").update(ip + salt).digest("hex");
}
