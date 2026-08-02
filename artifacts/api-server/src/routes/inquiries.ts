import { Router, type IRouter } from "express";
import { createHash } from "crypto";
import { db, inquiriesTable } from "@workspace/db";
import { CreateInquiryBody } from "@workspace/api-zod";
import { sendInquiryNotification } from "../lib/mailer";

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
const ipSubmissions = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxPerWindow = 5;

  const timestamps = (ipSubmissions.get(ip) ?? []).filter(
    (t) => now - t < windowMs,
  );

  if (timestamps.length >= maxPerWindow) {
    return true;
  }

  timestamps.push(now);
  ipSubmissions.set(ip, timestamps);
  return false;
}

function hashIp(ip: string): string {
  const salt = process.env.INQUIRY_IP_SALT ?? "default-dev-salt";
  return createHash("sha256").update(ip + salt).digest("hex");
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

  const { fullName, email, phone, affiliation, inquiryType, message, website } =
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
    req.log.error({ err, inquiryId: row.id }, "email notification failed — lead is saved, continuing");
  }

  // 7. Return 201
  res.status(201).json({ id: row.id, status: "received" });
});

export default router;
