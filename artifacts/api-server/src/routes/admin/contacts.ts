import { Router, type IRouter, type Request, type Response } from "express";
import { db, contactsTable, contactInteractionsTable, transactionsTable, inquiriesTable } from "@workspace/db";
import { eq, and, desc, count, ilike, or, sql, isNull } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const PAGE_SIZE = 40;

const VALID_CONTACT_TYPES = new Set([
  "client", "attorney", "wealth_manager", "trust_officer",
  "family_office", "private_banker", "agent", "vendor", "other",
]);

const VALID_KINDS = new Set(["note", "email", "call", "meeting", "event"]);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const CreateContactBody = z.object({
  firstName:  z.string().min(1).max(120),
  lastName:   z.string().max(120).default(""),
  email:      z.string().email().nullable().optional(),
  phone:      z.string().max(40).nullable().optional(),
  company:    z.string().max(200).nullable().optional(),
  title:      z.string().max(120).nullable().optional(),
  contactType: z.string().default("other"),
  neighborhood: z.string().max(120).nullable().optional(),
  address:    z.string().max(300).nullable().optional(),
  source:     z.string().default("manual"),
  notes:      z.string().nullable().optional(),
  tags:       z.array(z.string()).default([]),
});

const UpdateContactBody = CreateContactBody.partial();

const AddInteractionBody = z.object({
  kind:       z.string(),
  body:       z.string().min(1),
  occurredAt: z.string().datetime().optional(),
});

const ImportRowSchema = z.object({
  firstName:   z.string().min(1).max(120),
  lastName:    z.string().max(120).default(""),
  email:       z.string().email().nullable().optional(),
  phone:       z.string().max(40).nullable().optional(),
  company:     z.string().max(200).nullable().optional(),
  contactType: z.string().default("other"),
  notes:       z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET /admin/contacts
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const contactType = typeof req.query.contactType === "string" ? req.query.contactType : undefined;
  const searchQ    = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
  const subscribed  = req.query.subscribed === "true";
  const showArchived = req.query.archived === "true";

  const conditions = [eq(contactsTable.ownerId, ownerId)];
  if (!showArchived) conditions.push(eq(contactsTable.archived, false));
  if (contactType && VALID_CONTACT_TYPES.has(contactType)) {
    conditions.push(eq(contactsTable.contactType, contactType));
  }
  if (subscribed) {
    conditions.push(eq(contactsTable.subscribedIntelligence, true));
    conditions.push(isNull(contactsTable.unsubscribedAt));
  }
  if (searchQ) {
    conditions.push(
      or(
        ilike(contactsTable.firstName, `%${searchQ}%`),
        ilike(contactsTable.lastName,  `%${searchQ}%`),
        ilike(contactsTable.email,     `%${searchQ}%`),
        ilike(contactsTable.company,   `%${searchQ}%`),
      )!,
    );
  }

  const where = and(...conditions);

  const [rows, [{ value: total }], [{ value: intelligenceCount }]] = await Promise.all([
    db.select().from(contactsTable).where(where)
      .orderBy(desc(contactsTable.createdAt))
      .limit(PAGE_SIZE).offset(offset),
    db.select({ value: count() }).from(contactsTable).where(where),
    db.select({ value: count() }).from(contactsTable).where(
      and(
        eq(contactsTable.ownerId, ownerId),
        eq(contactsTable.subscribedIntelligence, true),
        isNull(contactsTable.unsubscribedAt),
        eq(contactsTable.archived, false),
      )
    ),
  ]);

  res.json({
    contacts: rows,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: Number(total),
      totalPages: Math.ceil(Number(total) / PAGE_SIZE),
    },
    intelligenceCount: Number(intelligenceCount),
  });
});

// ---------------------------------------------------------------------------
// POST /admin/contacts/import — CSV rows as JSON; dryRun=true just previews
// ---------------------------------------------------------------------------
router.post("/import", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const dryRun = req.body.dryRun === true;
  const rawRows = req.body.rows;

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    res.status(400).json({ error: "rows must be a non-empty array" });
    return;
  }
  if (rawRows.length > 2000) {
    res.status(400).json({ error: "Max 2000 rows per import" });
    return;
  }

  const parsed = rawRows.map((r, i) => {
    const result = ImportRowSchema.safeParse(r);
    if (!result.success) return { index: i, error: result.error.issues[0]?.message ?? "Invalid row" };
    return { index: i, data: result.data };
  });

  const invalid = parsed.filter((p) => "error" in p);
  if (invalid.length > 0) {
    res.status(400).json({ error: "Validation errors", details: invalid });
    return;
  }

  const validRows = parsed.map((p) => ("data" in p ? p.data : null)).filter(Boolean) as z.infer<typeof ImportRowSchema>[];

  let created = 0;
  let merged = 0;
  const skipped: string[] = [];
  const preview: Array<{ action: "create" | "merge"; email: string | null; name: string }> = [];

  for (const row of validRows) {
    const fullName = `${row.firstName} ${row.lastName}`.trim();
    let existingId: string | null = null;

    if (row.email) {
      const existing = await db
        .select({ id: contactsTable.id })
        .from(contactsTable)
        .where(
          and(
            eq(contactsTable.ownerId, ownerId),
            sql`lower(${contactsTable.email}) = lower(${row.email})`,
            eq(contactsTable.archived, false),
          )
        )
        .limit(1);
      if (existing.length > 0) existingId = existing[0]!.id;
    }

    if (existingId) {
      preview.push({ action: "merge", email: row.email ?? null, name: fullName });
      if (!dryRun) {
        // Append a note interaction; do NOT change subscribedIntelligence
        await db.insert(contactInteractionsTable).values({
          contactId: existingId,
          ownerId,
          kind: "note",
          body: `Imported via CSV import. ${row.notes ?? ""}`.trim(),
        });
      }
      merged++;
    } else {
      preview.push({ action: "create", email: row.email ?? null, name: fullName });
      if (!dryRun) {
        const [contact] = await db.insert(contactsTable).values({
          ownerId,
          firstName: row.firstName,
          lastName: row.lastName ?? "",
          email: row.email ?? null,
          phone: row.phone ?? null,
          company: row.company ?? null,
          contactType: VALID_CONTACT_TYPES.has(row.contactType ?? "") ? row.contactType! : "other",
          source: "import",
          notes: row.notes ?? null,
          // NEVER auto-subscribe imported contacts
          subscribedIntelligence: false,
        }).returning({ id: contactsTable.id });
        if (row.notes && contact) {
          await db.insert(contactInteractionsTable).values({
            contactId: contact.id,
            ownerId,
            kind: "note",
            body: row.notes,
          });
        }
      }
      created++;
    }
  }

  res.json({ dryRun, created, merged, skipped: skipped.length, preview });
});

// ---------------------------------------------------------------------------
// POST /admin/contacts
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const d = parsed.data;

  // Check for duplicate email before inserting
  if (d.email) {
    const dup = await db
      .select({ id: contactsTable.id })
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.ownerId, ownerId),
          sql`lower(${contactsTable.email}) = lower(${d.email})`,
          eq(contactsTable.archived, false),
        )
      )
      .limit(1);
    if (dup.length > 0) {
      res.status(409).json({ error: "A contact with that email already exists", existingId: dup[0]!.id });
      return;
    }
  }

  const [contact] = await db.insert(contactsTable).values({
    ownerId,
    firstName:  d.firstName,
    lastName:   d.lastName,
    email:      d.email ?? null,
    phone:      d.phone ?? null,
    company:    d.company ?? null,
    title:      d.title ?? null,
    contactType: VALID_CONTACT_TYPES.has(d.contactType) ? d.contactType : "other",
    neighborhood: d.neighborhood ?? null,
    address:    d.address ?? null,
    source:     d.source,
    notes:      d.notes ?? null,
    tags:       d.tags,
    subscribedIntelligence: false, // always false on creation; subscribe is explicit
  }).returning();

  res.status(201).json({ contact });
});

// ---------------------------------------------------------------------------
// GET /admin/contacts/:id — detail with interactions + linked transactions
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  const rows = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId)))
    .limit(1);

  if (rows.length === 0) { res.status(404).json({ error: "Contact not found" }); return; }
  const contact = rows[0]!;

  const [interactions, transactions] = await Promise.all([
    db.select().from(contactInteractionsTable)
      .where(and(eq(contactInteractionsTable.contactId, id), eq(contactInteractionsTable.ownerId, ownerId)))
      .orderBy(desc(contactInteractionsTable.occurredAt)),
    db.select({
      id: transactionsTable.id,
      propertyAddress: transactionsTable.propertyAddress,
      status: transactionsTable.status,
      side: transactionsTable.side,
      clientName: transactionsTable.clientName,
      createdAt: transactionsTable.createdAt,
    }).from(transactionsTable)
      .where(and(eq(transactionsTable.contactId, id), eq(transactionsTable.ownerId, ownerId)))
      .orderBy(desc(transactionsTable.createdAt)),
  ]);

  res.json({ contact, interactions, transactions });
});

// ---------------------------------------------------------------------------
// PATCH /admin/contacts/:id
// ---------------------------------------------------------------------------
router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  const parsed = UpdateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const exists = await db.select({ id: contactsTable.id }).from(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId))).limit(1);
  if (exists.length === 0) { res.status(404).json({ error: "Contact not found" }); return; }

  const d = parsed.data;
  const updates: Partial<typeof contactsTable.$inferInsert> = { updatedAt: new Date() };
  if (d.firstName   !== undefined) updates.firstName   = d.firstName;
  if (d.lastName    !== undefined) updates.lastName    = d.lastName;
  if (d.email       !== undefined) updates.email       = d.email ?? null;
  if (d.phone       !== undefined) updates.phone       = d.phone ?? null;
  if (d.company     !== undefined) updates.company     = d.company ?? null;
  if (d.title       !== undefined) updates.title       = d.title ?? null;
  if (d.contactType !== undefined) updates.contactType = VALID_CONTACT_TYPES.has(d.contactType) ? d.contactType : "other";
  if (d.neighborhood !== undefined) updates.neighborhood = d.neighborhood ?? null;
  if (d.address     !== undefined) updates.address     = d.address ?? null;
  if (d.notes       !== undefined) updates.notes       = d.notes ?? null;
  if (d.tags        !== undefined) updates.tags        = d.tags;

  const [contact] = await db.update(contactsTable).set(updates)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId)))
    .returning();

  res.json({ contact });
});

// ---------------------------------------------------------------------------
// POST /admin/contacts/:id/archive
// ---------------------------------------------------------------------------
router.post("/:id/archive", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  const [contact] = await db.update(contactsTable)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId)))
    .returning();

  if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }
  res.json({ contact });
});

// ---------------------------------------------------------------------------
// POST /admin/contacts/:id/interactions
// ---------------------------------------------------------------------------
router.post("/:id/interactions", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  const parsed = AddInteractionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  if (!VALID_KINDS.has(parsed.data.kind)) {
    res.status(400).json({ error: "Invalid kind" });
    return;
  }

  const exists = await db.select({ id: contactsTable.id }).from(contactsTable)
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId))).limit(1);
  if (exists.length === 0) { res.status(404).json({ error: "Contact not found" }); return; }

  const [interaction] = await db.insert(contactInteractionsTable).values({
    contactId: id,
    ownerId,
    kind: parsed.data.kind,
    body: parsed.data.body,
    occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date(),
  }).returning();

  // Update lastContactedAt
  await db.update(contactsTable)
    .set({ lastContactedAt: new Date(), updatedAt: new Date() })
    .where(eq(contactsTable.id, id));

  res.status(201).json({ interaction });
});

// ---------------------------------------------------------------------------
// POST /admin/contacts/:id/subscribe
// ---------------------------------------------------------------------------
router.post("/:id/subscribe", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  const [contact] = await db.update(contactsTable)
    .set({ subscribedIntelligence: true, subscribedAt: new Date(), unsubscribedAt: null, updatedAt: new Date() })
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId)))
    .returning();

  if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }
  res.json({ contact });
});

// ---------------------------------------------------------------------------
// POST /admin/contacts/:id/unsubscribe
// ---------------------------------------------------------------------------
router.post("/:id/unsubscribe", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params['id'] as string;

  // Unsubscribe is permanent-by-default: stamps unsubscribedAt, sets false.
  // A resubscribe requires an explicit action (POST /:id/subscribe).
  const [contact] = await db.update(contactsTable)
    .set({ subscribedIntelligence: false, unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(contactsTable.id, id), eq(contactsTable.ownerId, ownerId)))
    .returning();

  if (!contact) { res.status(404).json({ error: "Contact not found" }); return; }
  res.json({ contact });
});

export default router;
