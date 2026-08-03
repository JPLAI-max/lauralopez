/**
 * GET /calendar/:icsToken.ics
 * Public route — token-authenticated. Not under /api/admin.
 * Rate limited per token: 60 req/hour.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db, transactionsTable, transactionMilestonesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Rate limiting — per token, 60 req/hour
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_TOKEN = 60;
const tokenAttempts = new Map<string, number[]>();

setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of tokenAttempts) {
    if (now - Math.max(...ts) > WINDOW_MS) tokenAttempts.delete(k);
  }
}, 10 * 60 * 1000).unref();

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const times = (tokenAttempts.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
  times.push(now);
  if (times.length === 0) tokenAttempts.delete(token); else tokenAttempts.set(token, times);
  return times.length > MAX_PER_TOKEN;
}

// ---------------------------------------------------------------------------
// ICS helpers
// ---------------------------------------------------------------------------
function icsDate(iso: string): string {
  // "2026-08-15" → "20260815"
  return iso.replace(/-/g, "");
}

function icsDateNext(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 5545: lines must not exceed 75 octets; fold with CRLF + space
  const LIMIT = 75;
  if (line.length <= LIMIT) return line;
  let result = "";
  let i = 0;
  while (i < line.length) {
    if (i === 0) { result += line.slice(0, LIMIT); i = LIMIT; }
    else { result += "\r\n " + line.slice(i, i + 74); i += 74; }
  }
  return result;
}

// ---------------------------------------------------------------------------
// GET /calendar/:icsToken.ics
// ---------------------------------------------------------------------------
router.get("/calendar/:icsToken.ics", async (req: Request, res: Response): Promise<void> => {
  const token = req.params["icsToken"] as string;

  if (isRateLimited(token)) {
    res.status(429).set("Retry-After", "3600").end();
    return;
  }

  let txn: typeof transactionsTable.$inferSelect | undefined;
  try {
    const rows = await db.select().from(transactionsTable).where(eq(transactionsTable.icsToken, token)).limit(1);
    txn = rows[0];
  } catch (err) {
    logger.error({ err }, "calendar: DB error");
    res.status(500).end();
    return;
  }

  // Unknown token → 404 with no information leak
  if (!txn) {
    res.status(404).end();
    return;
  }

  let milestones: Array<typeof transactionMilestonesTable.$inferSelect> = [];
  try {
    milestones = await db.select().from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.transactionId, txn.id), eq(transactionMilestonesTable.ownerId, txn.ownerId)));
  } catch (err) {
    logger.error({ err }, "calendar: failed to load milestones");
  }

  // Build ICS
  const address = icsEscape(txn.propertyAddress);
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Laura Lopez Estates//Transaction Timeline//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(txn.propertyAddress)} Timeline`,
    "X-WR-TIMEZONE:America/Los_Angeles",
  ];

  for (const m of milestones) {
    const effectiveDate = m.overrideDate ?? m.computedDate;
    if (!effectiveDate) continue;
    if (m.status !== "pending" && m.status !== "complete") continue;

    lines.push("BEGIN:VEVENT");
    // Stable UID per milestone so updates replace rather than duplicate
    lines.push(foldLine(`UID:${m.id}@transactions.lauralopes.com`));
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(effectiveDate)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDateNext(effectiveDate)}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(m.label)} — ${address}`));
    lines.push(`STATUS:${m.status === "complete" ? "CONFIRMED" : "TENTATIVE"}`);

    // VALARM 1 day prior for pending items
    if (m.status === "pending") {
      lines.push("BEGIN:VALARM");
      lines.push("TRIGGER:-P1D");
      lines.push("ACTION:DISPLAY");
      lines.push(foldLine(`DESCRIPTION:Reminder: ${icsEscape(m.label)}`));
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const ics = lines.join("\r\n") + "\r\n";

  res.set({
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `attachment; filename="timeline.ics"`,
    "Cache-Control": "no-cache, no-store",
  }).send(ics);
});

export default router;
