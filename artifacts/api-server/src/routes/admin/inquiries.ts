import { Router, type IRouter, type Request, type Response } from "express";
import { db, inquiriesTable, contactsTable, contactInteractionsTable } from "@workspace/db";
import { eq, desc, count, and, sql } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const VALID_STATUSES = new Set(["new", "read", "archived"]);
const PAGE_SIZE = 25;

// GET /admin/inquiries?status=new&page=1
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
    res.status(400).json({ error: "Invalid status filter" });
    return;
  }

  const where = statusFilter
    ? eq(inquiriesTable.status, statusFilter)
    : undefined;

  const [rows, [{ value: total }], [{ value: unreadCount }]] = await Promise.all([
    db
      .select()
      .from(inquiriesTable)
      .where(where)
      .orderBy(desc(inquiriesTable.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(inquiriesTable).where(where),
    db
      .select({ value: count() })
      .from(inquiriesTable)
      .where(eq(inquiriesTable.status, "new")),
  ]);

  res.json({
    inquiries: rows,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / PAGE_SIZE),
    },
    unreadCount: Number(unreadCount),
  });
});

// GET /admin/inquiries/:id
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const rows = await db
    .select()
    .from(inquiriesTable)
    .where(eq(inquiriesTable.id, id))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Inquiry not found" });
    return;
  }

  const inquiry = rows[0];

  // Auto-mark as read on first view
  if (inquiry.status === "new") {
    await db
      .update(inquiriesTable)
      .set({ status: "read", readAt: new Date() })
      .where(eq(inquiriesTable.id, id));
    inquiry.status = "read";
    inquiry.readAt = new Date();
  }

  res.json({ inquiry });
});

// PATCH /admin/inquiries/:id
const PatchBody = z.object({
  status: z.enum(["new", "read", "archived"]),
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const parsed = PatchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid status value" });
    return;
  }

  const rows = await db
    .select({ id: inquiriesTable.id, status: inquiriesTable.status })
    .from(inquiriesTable)
    .where(eq(inquiriesTable.id, id))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Inquiry not found" });
    return;
  }

  const updates: Partial<typeof inquiriesTable.$inferInsert> = {
    status: parsed.data.status,
  };

  // Set readAt on first read transition
  if (parsed.data.status === "read" && rows[0].status === "new") {
    updates.readAt = new Date();
  }

  const [updated] = await db
    .update(inquiriesTable)
    .set(updates)
    .where(eq(inquiriesTable.id, id))
    .returning();

  res.json({ inquiry: updated });
});

// ---------------------------------------------------------------------------
// POST /admin/inquiries/:id/to-contact
// Converts an inquiry into a contact (or links to existing by email).
// ---------------------------------------------------------------------------
const AFFILIATION_TO_CONTACT_TYPE: Record<string, string> = {
  buyer:     "client",
  seller:    "client",
  both:      "client",
  investor:  "client",
  agent:     "agent",
  attorney:  "attorney",
  developer: "vendor",
};

router.post("/:id/to-contact", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  const rows = await db.select().from(inquiriesTable).where(eq(inquiriesTable.id, id)).limit(1);
  if (rows.length === 0) { res.status(404).json({ error: "Inquiry not found" }); return; }
  const inquiry = rows[0]!;

  // Split fullName: last word is lastName; everything else is firstName
  const nameParts = inquiry.fullName.trim().split(/\s+/);
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : nameParts[0]!;
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : "";

  const contactType = AFFILIATION_TO_CONTACT_TYPE[inquiry.affiliation.toLowerCase()] ?? "other";

  // Check for existing non-archived contact with same email (dedupe)
  let existingContact: typeof contactsTable.$inferSelect | null = null;
  if (inquiry.email) {
    const existing = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.ownerId, ownerId),
          sql`lower(${contactsTable.email}) = lower(${inquiry.email})`,
          eq(contactsTable.archived, false),
        )
      )
      .limit(1);
    if (existing.length > 0) existingContact = existing[0]!;
  }

  if (existingContact) {
    // Append message as a new interaction
    await db.insert(contactInteractionsTable).values({
      contactId: existingContact.id,
      ownerId,
      kind: "note",
      body: `From inquiry (${inquiry.inquiryType}): ${inquiry.message}`,
    });

    // Consent can only turn subscription ON, never off.
    // Never clear an existing unsubscribedAt — rule 6 from spec.
    if (inquiry.subscribeIntelligence && !existingContact.unsubscribedAt && !existingContact.subscribedIntelligence) {
      await db.update(contactsTable)
        .set({
          subscribedIntelligence: true,
          subscribedAt: inquiry.consentAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(contactsTable.id, existingContact.id));
      existingContact.subscribedIntelligence = true;
      existingContact.subscribedAt = inquiry.consentAt ?? new Date();
    }

    res.json({ contact: existingContact, merged: true });
    return;
  }

  // Create new contact — carry consent through if the inquiry had opt-in
  const [contact] = await db.insert(contactsTable).values({
    ownerId,
    firstName,
    lastName,
    email:          inquiry.email,
    phone:          inquiry.phone ?? null,
    contactType,
    source:         "inquiry",
    sourceInquiryId: inquiry.id,
    subscribedIntelligence: inquiry.subscribeIntelligence === true,
    subscribedAt:   inquiry.subscribeIntelligence === true ? (inquiry.consentAt ?? new Date()) : null,
  }).returning();

  // Copy message as a note interaction
  await db.insert(contactInteractionsTable).values({
    contactId: contact!.id,
    ownerId,
    kind: "note",
    body: `From inquiry (${inquiry.inquiryType}): ${inquiry.message}`,
  });

  res.status(201).json({ contact, merged: false });
});

export default router;
