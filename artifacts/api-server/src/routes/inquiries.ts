import { Router, type IRouter } from "express";
import { createHash } from "crypto";
import { db, inquiriesTable } from "@workspace/db";
import { CreateInquiryBody, INTEL_CONSENT_TEXT } from "@workspace/api-zod";
import { sendInquiryNotification } from "../lib/mailer";
import { logger } from "../lib/logger";

// ---------------------------------------------------------------------------
// IP salt — read once at module load
// In production, missing salt is a startup-blocking error.
// In dev, allowed but every use logs a WARN.
// ---------------------------------------------------------------------------
const IP_SALT = process.env.INQUIRY_IP_SALT;

if (!IP_SALT) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "INQUIRY_IP_SALT must be set in production — aborting startup. " +
        "Set it to a random 32-byte hex string in your environment secrets.",
    );
  }
  // Dev: warn at load time so it's visible in the startup log
  logger.warn(
    "INQUIRY_IP_SALT is not set — IP hashes are insecure. " +
      "Set INQUIRY_IP_SALT before deploying to production.",
  );
}

function hashIp(ip: string): string {
  if (!IP_SALT) {
    // Dev fallback — warn on every use so the problem is unmistakable
    logger.warn(
      "hashIp called without INQUIRY_IP_SALT — using insecure dev fallback",
    );
    return createHash("sha256").update(ip + "dev-insecure").digest("hex");
  }
  return createHash("sha256").update(ip + IP_SALT).digest("hex");
}

// ---------------------------------------------------------------------------
// Whitelists — must match ContactForm.tsx exactly
// ---------------------------------------------------------------------------
const VALID_AFFILIATIONS = new Set([
  "family-office",
  "investment-advisor",
  "private-client",
  "other",
]);

const VALID_INQUIRY_TYPES = new Set([
  "purchase-advisory",
  "portfolio-review",
  "family-estate-planning",
  "off-market-inquiry",
  "other",
]);

// ---------------------------------------------------------------------------
// In-memory rate limiter: max 5 submissions per IP per hour.
// NOTE: This limiter does not survive autoscale multi-instance deployments.
// Move to a DB-backed counter before real traffic at scale.
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;
const ipSubmissions = new Map<string, number[]>();

// Periodic sweep: remove entries whose newest timestamp is outside the window.
// unref'd so it does not keep the process alive on shutdown.
const sweepInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipSubmissions) {
    const newest = timestamps.length > 0 ? Math.max(...timestamps) : 0;
    if (now - newest >= WINDOW_MS) {
      ipSubmissions.delete(ip);
    }
  }
}, 10 * 60 * 1000); // every 10 minutes
sweepInterval.unref();

function isRateLimited(ip: string): boolean {
  const now = Date.now();

  const timestamps = (ipSubmissions.get(ip) ?? []).filter(
    (t) => now - t < WINDOW_MS,
  );

  // After pruning, clean up the Map entry if it's now empty
  if (timestamps.length === 0) {
    ipSubmissions.delete(ip);
  } else {
    ipSubmissions.set(ip, timestamps);
  }

  if (timestamps.length >= MAX_PER_WINDOW) {
    return true;
  }

  timestamps.push(now);
  ipSubmissions.set(ip, timestamps);
  return false;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const router: IRouter = Router();

router.post("/inquiries", async (req, res): Promise<void> => {
  // 1. Validate body
  const parsed = CreateInquiryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      fields: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  const { fullName, email, phone, affiliation, inquiryType, message, website, subscribeIntelligence } =
    parsed.data;

  // 2. Honeypot: silent discard — bot must not learn it was caught
  if (website && website.trim().length > 0) {
    req.log.info("honeypot triggered — discarding inquiry silently");
    res.status(201).json({ id: crypto.randomUUID(), status: "received" });
    return;
  }

  // 3. Whitelist affiliation and inquiryType
  if (!VALID_AFFILIATIONS.has(affiliation)) {
    res.status(400).json({ error: "Invalid affiliation value" });
    return;
  }
  if (!VALID_INQUIRY_TYPES.has(inquiryType)) {
    res.status(400).json({ error: "Invalid inquiryType value" });
    return;
  }

  // 4. Rate limit
  const rawIp =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (isRateLimited(rawIp)) {
    res.status(429).json({ error: "Too many submissions. Please try again later." });
    return;
  }

  // 5. Insert into DB — must succeed before returning 201
  let row: typeof inquiriesTable.$inferSelect;
  try {
    const [inserted] = await db
      .insert(inquiriesTable)
      .values({
        fullName,
        email,
        phone: phone ?? null,
        affiliation,
        inquiryType,
        message,
        userAgent: req.headers["user-agent"] ?? null,
        ipHash: hashIp(rawIp),
        subscribeIntelligence: subscribeIntelligence === true,
        consentText: subscribeIntelligence === true ? INTEL_CONSENT_TEXT : null,
        consentAt: subscribeIntelligence === true ? new Date() : null,
      })
      .returning();
    row = inserted;
  } catch (err) {
    req.log.error({ err }, "failed to insert inquiry into database");
    res.status(500).json({ error: "Failed to save inquiry. Please try again." });
    return;
  }

  // 6. Attempt email notification — failure must never lose a lead
  try {
    await sendInquiryNotification({
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone,
      affiliation: row.affiliation,
      inquiryType: row.inquiryType,
      message: row.message,
      createdAt: row.createdAt,
    });
  } catch (err) {
    req.log.error(
      { err, inquiryId: row.id },
      "email notification failed — lead is saved, continuing",
    );
  }

  // 7. Return 201
  res.status(201).json({ id: row.id, status: "received" });
});

export default router;
