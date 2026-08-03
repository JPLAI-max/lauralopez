import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { db, transactionsTable, transactionMilestonesTable, transactionEventsTable, milestoneTemplatesTable, milestoneTemplateItemsTable } from "@workspace/db";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { computeMilestoneDate, recomputeMilestoneDates } from "../../lib/dates";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function icsToken(): string {
  return randomBytes(32).toString("hex");
}

function getEffectiveDate(m: { computedDate: string | null; overrideDate: string | null }): string | null {
  return m.overrideDate ?? m.computedDate;
}

async function logEvent(transactionId: string, ownerId: string, actor: string, action: string, payload: unknown) {
  try {
    await db.insert(transactionEventsTable).values({ transactionId, ownerId, actor, action, payload: payload as Record<string, unknown> });
  } catch (err) { logger.error({ err }, "failed to write transaction event"); }
}

async function recomputeAndLog(
  transactionId: string,
  ownerId: string,
  acceptanceDate: string | null | undefined,
  coeDate: string | null | undefined,
  actor: string,
): Promise<void> {
  const milestones = await db.select().from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.transactionId, transactionId), eq(transactionMilestonesTable.ownerId, ownerId)));

  const before = milestones.map((m) => ({ id: m.id, label: m.label, computedDate: m.computedDate, effectiveDate: getEffectiveDate(m) }));

  const newDates = recomputeMilestoneDates(milestones, acceptanceDate, coeDate);

  // Only update milestones without overrideDate
  for (const [mid, newDate] of newDates) {
    const m = milestones.find((x) => x.id === mid);
    if (!m || m.overrideDate != null) continue;
    if (m.computedDate === newDate) continue; // no change
    await db.update(transactionMilestonesTable).set({ computedDate: newDate }).where(eq(transactionMilestonesTable.id, mid));
  }

  // Reload for after state
  const after = (await db.select().from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.transactionId, transactionId), eq(transactionMilestonesTable.ownerId, ownerId)))).map((m) => ({ id: m.id, label: m.label, computedDate: m.computedDate, effectiveDate: getEffectiveDate(m) }));

  await logEvent(transactionId, ownerId, actor, "dates_changed", { before, after });
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const CreateTransactionBody = z.object({
  propertyAddress: z.string().min(1).max(500),
  side: z.enum(["buy", "sell"]),
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email().max(254).optional(),
  clientPhone: z.string().max(40).optional(),
  acceptanceDate: IsoDate.optional(),
  closeOfEscrowDate: IsoDate.optional(),
  purchasePrice: z.number().positive().optional(),
  templateId: z.string().uuid().optional(),
  milestoneOverrides: z.record(z.string(), IsoDate).optional(), // templateItemId -> overrideDate
  escrowCompany: z.string().max(200).optional(),
  escrowOfficer: z.string().max(200).optional(),
  escrowOfficerEmail: z.string().email().max(254).optional(),
  lender: z.string().max(200).optional(),
  coopAgent: z.string().max(200).optional(),
  coopBrokerage: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
});

const PatchTransactionBody = z.object({
  propertyAddress: z.string().min(1).max(500).optional(),
  status: z.enum(["active", "closed", "cancelled", "pending"]).optional(),
  clientName: z.string().min(1).max(200).optional(),
  clientEmail: z.string().email().max(254).nullable().optional(),
  clientPhone: z.string().max(40).nullable().optional(),
  acceptanceDate: IsoDate.nullable().optional(),
  closeOfEscrowDate: IsoDate.nullable().optional(),
  purchasePrice: z.number().positive().nullable().optional(),
  escrowCompany: z.string().max(200).nullable().optional(),
  escrowOfficer: z.string().max(200).nullable().optional(),
  escrowOfficerEmail: z.string().email().max(254).nullable().optional(),
  lender: z.string().max(200).nullable().optional(),
  coopAgent: z.string().max(200).nullable().optional(),
  coopBrokerage: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const PatchMilestoneBody = z.object({
  status: z.enum(["pending", "complete", "waived"]).optional(),
  overrideDate: IsoDate.nullable().optional(),
  removalDeliveredAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  completedBy: z.string().max(200).nullable().optional(),
});

const CreateMilestoneBody = z.object({
  label: z.string().min(1).max(200),
  category: z.enum(["contingency", "disclosure", "inspection", "financing", "admin"]),
  effectiveDate: IsoDate.optional(),
  requiresWrittenRemoval: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  sortOrder: z.number().int().optional(),
});

const PreviewBody = z.object({
  templateId: z.string().uuid(),
  acceptanceDate: IsoDate.optional(),
  closeOfEscrowDate: IsoDate.optional(),
});

// ---------------------------------------------------------------------------
// GET /admin/transactions/templates — list available templates
// ---------------------------------------------------------------------------
router.get("/transactions/templates", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const templates = await db.select().from(milestoneTemplatesTable).where(eq(milestoneTemplatesTable.ownerId, ownerId)).orderBy(asc(milestoneTemplatesTable.name));
  const items = templates.length > 0
    ? await db.select().from(milestoneTemplateItemsTable).where(inArray(milestoneTemplateItemsTable.templateId, templates.map((t) => t.id))).orderBy(asc(milestoneTemplateItemsTable.sortOrder))
    : [];
  const result = templates.map((t) => ({ ...t, items: items.filter((i) => i.templateId === t.id) }));
  res.json({ templates: result });
});

// ---------------------------------------------------------------------------
// POST /admin/transactions/preview — compute milestones without saving
// ---------------------------------------------------------------------------
router.post("/transactions/preview", async (req: Request, res: Response): Promise<void> => {
  const parsed = PreviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors }); return; }

  const ownerId = req.user!.id;
  const { templateId, acceptanceDate, closeOfEscrowDate } = parsed.data;

  const [template] = await db.select().from(milestoneTemplatesTable).where(and(eq(milestoneTemplatesTable.id, templateId), eq(milestoneTemplatesTable.ownerId, ownerId))).limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const items = await db.select().from(milestoneTemplateItemsTable).where(eq(milestoneTemplateItemsTable.templateId, templateId)).orderBy(asc(milestoneTemplateItemsTable.sortOrder));

  const milestones = items.map((item) => ({
    templateItemId: item.id,
    label: item.label,
    category: item.category,
    offsetDays: item.offsetDays,
    anchor: item.anchor,
    direction: item.direction,
    dayType: item.dayType,
    requiresWrittenRemoval: item.requiresWrittenRemoval,
    sortOrder: item.sortOrder,
    computedDate: computeMilestoneDate({
      anchorDate: item.anchor === "acceptance" ? acceptanceDate : closeOfEscrowDate,
      offsetDays: item.offsetDays,
      direction: item.direction as "after" | "before",
      dayType: item.dayType as "calendar" | "business",
    }),
  }));

  res.json({ template: { id: template.id, name: template.name, side: template.side }, milestones });
});

// ---------------------------------------------------------------------------
// GET /admin/transactions — list
// ---------------------------------------------------------------------------
router.get("/transactions", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const statusFilter = req.query["status"] as string | undefined;
  const today = new Date().toISOString().slice(0, 10);

  let query = db.select().from(transactionsTable).where(eq(transactionsTable.ownerId, ownerId));
  const txns = await (statusFilter ? db.select().from(transactionsTable).where(and(eq(transactionsTable.ownerId, ownerId), eq(transactionsTable.status, statusFilter))) : db.select().from(transactionsTable).where(eq(transactionsTable.ownerId, ownerId)).orderBy(desc(transactionsTable.updatedAt)));

  if (txns.length === 0) { res.json({ transactions: [] }); return; }

  const allMilestones = await db.select().from(transactionMilestonesTable).where(and(inArray(transactionMilestonesTable.transactionId, txns.map((t) => t.id)), eq(transactionMilestonesTable.ownerId, ownerId)));

  const result = txns.map((txn) => {
    const milestones = allMilestones.filter((m) => m.transactionId === txn.id);
    const pendingMilestones = milestones.filter((m) => m.status === "pending");
    const overdueCount = pendingMilestones.filter((m) => { const eff = getEffectiveDate(m); return eff != null && eff < today; }).length;
    const upcoming = pendingMilestones.filter((m) => { const eff = getEffectiveDate(m); return eff != null && eff >= today; }).sort((a, b) => { const ea = getEffectiveDate(a)!; const eb = getEffectiveDate(b)!; return ea < eb ? -1 : ea > eb ? 1 : 0; })[0];
    return {
      ...txn,
      overdueCount,
      nextMilestone: upcoming ? { id: upcoming.id, label: upcoming.label, effectiveDate: getEffectiveDate(upcoming) } : null,
    };
  }).sort((a, b) => {
    const da = a.nextMilestone?.effectiveDate ?? "9999-12-31";
    const db2 = b.nextMilestone?.effectiveDate ?? "9999-12-31";
    return da < db2 ? -1 : da > db2 ? 1 : 0;
  });

  // suppress unused variable warning - reassign query result
  void query;
  res.json({ transactions: result });
});

// ---------------------------------------------------------------------------
// POST /admin/transactions — create
// ---------------------------------------------------------------------------
router.post("/transactions", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors }); return; }

  const ownerId = req.user!.id;
  const actor = req.user!.email;
  const data = parsed.data;

  // Insert transaction
  const [txn] = await db.insert(transactionsTable).values({
    ownerId,
    propertyAddress: data.propertyAddress,
    side: data.side,
    clientName: data.clientName,
    clientEmail: data.clientEmail ?? null,
    clientPhone: data.clientPhone ?? null,
    status: "active",
    acceptanceDate: data.acceptanceDate ?? null,
    closeOfEscrowDate: data.closeOfEscrowDate ?? null,
    purchasePrice: data.purchasePrice?.toString() ?? null,
    escrowCompany: data.escrowCompany ?? null,
    escrowOfficer: data.escrowOfficer ?? null,
    escrowOfficerEmail: data.escrowOfficerEmail ?? null,
    lender: data.lender ?? null,
    coopAgent: data.coopAgent ?? null,
    coopBrokerage: data.coopBrokerage ?? null,
    notes: data.notes ?? null,
    icsToken: icsToken(),
    updatedAt: new Date(),
  }).returning();

  const milestones: Array<typeof transactionMilestonesTable.$inferSelect> = [];

  // Apply template if provided
  if (data.templateId) {
    const templates = await db.select().from(milestoneTemplatesTable).where(and(eq(milestoneTemplatesTable.id, data.templateId), eq(milestoneTemplatesTable.ownerId, ownerId))).limit(1);
    if (templates.length > 0) {
      const items = await db.select().from(milestoneTemplateItemsTable).where(eq(milestoneTemplateItemsTable.templateId, data.templateId)).orderBy(asc(milestoneTemplateItemsTable.sortOrder));
      const overrides = data.milestoneOverrides ?? {};

      const milestoneRows = items.map((item) => {
        const computedDate = computeMilestoneDate({
          anchorDate: item.anchor === "acceptance" ? (data.acceptanceDate ?? null) : (data.closeOfEscrowDate ?? null),
          offsetDays: item.offsetDays,
          direction: item.direction as "after" | "before",
          dayType: item.dayType as "calendar" | "business",
        });
        return {
          transactionId: txn!.id,
          ownerId,
          label: item.label,
          category: item.category,
          offsetDays: item.offsetDays,
          anchor: item.anchor,
          direction: item.direction,
          dayType: item.dayType,
          computedDate,
          overrideDate: overrides[item.id] ?? null,
          requiresWrittenRemoval: item.requiresWrittenRemoval,
          sortOrder: item.sortOrder,
        };
      });

      if (milestoneRows.length > 0) {
        const inserted = await db.insert(transactionMilestonesTable).values(milestoneRows).returning();
        milestones.push(...inserted);
      }
    }
  }

  await logEvent(txn!.id, ownerId, actor, "transaction_created", {
    propertyAddress: txn!.propertyAddress,
    side: txn!.side,
    acceptanceDate: txn!.acceptanceDate,
    closeOfEscrowDate: txn!.closeOfEscrowDate,
    milestoneCount: milestones.length,
  });

  res.status(201).json({ transaction: txn, milestones });
});

// ---------------------------------------------------------------------------
// GET /admin/transactions/:id — detail
// ---------------------------------------------------------------------------
router.get("/transactions/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [txn] = await db.select().from(transactionsTable).where(and(eq(transactionsTable.id, id), eq(transactionsTable.ownerId, ownerId))).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  const milestones = await db.select().from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.transactionId, id), eq(transactionMilestonesTable.ownerId, ownerId))).orderBy(asc(transactionMilestonesTable.sortOrder));

  // Attach effectiveDate as derived field
  const today = new Date().toISOString().slice(0, 10);
  const milestonesWithDerived = milestones.map((m) => {
    const effectiveDate = getEffectiveDate(m);
    const overdue = m.status === "pending" && effectiveDate != null && effectiveDate < today;
    return { ...m, effectiveDate, overdue };
  });

  res.json({ transaction: txn, milestones: milestonesWithDerived });
});

// ---------------------------------------------------------------------------
// PATCH /admin/transactions/:id — update
// ---------------------------------------------------------------------------
router.patch("/transactions/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const ownerId = req.user!.id;
  const actor = req.user!.email;

  const parsed = PatchTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors }); return; }

  const [txn] = await db.select().from(transactionsTable).where(and(eq(transactionsTable.id, id), eq(transactionsTable.ownerId, ownerId))).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  const updates = parsed.data;
  const anchorChanged = ("acceptanceDate" in updates && updates.acceptanceDate !== txn.acceptanceDate) || ("closeOfEscrowDate" in updates && updates.closeOfEscrowDate !== txn.closeOfEscrowDate);

  // Handle status change to closed
  const closedAt: { closedAt?: Date | null } = {};
  if (updates.status === "closed" && txn.status !== "closed") closedAt.closedAt = new Date();
  if (updates.status === "active" || updates.status === "pending") closedAt.closedAt = null;

  // Convert purchasePrice from number to decimal string for DB
  const { purchasePrice: pp, ...restUpdates } = updates;
  const setData = {
    ...restUpdates,
    ...(pp !== undefined ? { purchasePrice: pp != null ? String(pp) : null } : {}),
    ...closedAt,
    updatedAt: new Date(),
  } as Partial<typeof transactionsTable.$inferInsert> & { updatedAt: Date };

  const [updated] = await db.update(transactionsTable).set(setData).where(and(eq(transactionsTable.id, id), eq(transactionsTable.ownerId, ownerId))).returning();

  if (anchorChanged) {
    await recomputeAndLog(id, ownerId, updated!.acceptanceDate, updated!.closeOfEscrowDate, actor);
  }

  if (updates.status && updates.status !== txn.status) {
    await logEvent(id, ownerId, actor, "status_changed", { before: txn.status, after: updates.status });
  }

  res.json({ transaction: updated });
});

// ---------------------------------------------------------------------------
// DELETE /admin/transactions/:id — soft delete (status = cancelled)
// ---------------------------------------------------------------------------
router.delete("/transactions/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const ownerId = req.user!.id;
  const actor = req.user!.email;

  const [txn] = await db.select({ status: transactionsTable.status }).from(transactionsTable).where(and(eq(transactionsTable.id, id), eq(transactionsTable.ownerId, ownerId))).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  await db.update(transactionsTable).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(transactionsTable.id, id), eq(transactionsTable.ownerId, ownerId)));
  await logEvent(id, ownerId, actor, "status_changed", { before: txn.status, after: "cancelled" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /admin/transactions/:id/milestones/:mid
// ---------------------------------------------------------------------------
router.patch("/transactions/:id/milestones/:mid", async (req: Request, res: Response): Promise<void> => {
  const txId = req.params["id"] as string;
  const mid = req.params["mid"] as string;
  const ownerId = req.user!.id;
  const actor = req.user!.email;

  const parsed = PatchMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors }); return; }

  const [m] = await db.select().from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.id, mid), eq(transactionMilestonesTable.transactionId, txId), eq(transactionMilestonesTable.ownerId, ownerId))).limit(1);
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  const updates: Record<string, unknown> = { ...parsed.data };

  // Determine action to log
  let action = "milestone_updated";
  if (parsed.data.status === "complete" && m.status !== "complete") { updates["completedAt"] = new Date(); updates["completedBy"] = parsed.data.completedBy ?? actor; action = "milestone_completed"; }
  if (parsed.data.status === "waived") action = "milestone_waived";
  if ("overrideDate" in parsed.data && parsed.data.overrideDate !== m.overrideDate) action = "date_overridden";
  if (parsed.data.removalDeliveredAt != null && m.removalDeliveredAt == null) action = "removal_delivered";

  const [updated] = await db.update(transactionMilestonesTable).set(updates).where(eq(transactionMilestonesTable.id, mid)).returning();

  const today = new Date().toISOString().slice(0, 10);
  const effectiveDate = getEffectiveDate(updated!);

  await logEvent(txId, ownerId, actor, action, { milestoneId: mid, label: m.label, before: { status: m.status, overrideDate: m.overrideDate }, after: parsed.data });

  res.json({ milestone: { ...updated, effectiveDate, overdue: updated!.status === "pending" && effectiveDate != null && effectiveDate < today } });
});

// ---------------------------------------------------------------------------
// POST /admin/transactions/:id/milestones — add ad-hoc milestone
// ---------------------------------------------------------------------------
router.post("/transactions/:id/milestones", async (req: Request, res: Response): Promise<void> => {
  const txId = req.params["id"] as string;
  const ownerId = req.user!.id;
  const actor = req.user!.email;

  const parsed = CreateMilestoneBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors }); return; }

  const [txn] = await db.select({ id: transactionsTable.id }).from(transactionsTable).where(and(eq(transactionsTable.id, txId), eq(transactionsTable.ownerId, ownerId))).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  const maxOrder = (await db.select({ sortOrder: transactionMilestonesTable.sortOrder }).from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.transactionId, txId), eq(transactionMilestonesTable.ownerId, ownerId))).orderBy(desc(transactionMilestonesTable.sortOrder)).limit(1))[0]?.sortOrder ?? 0;

  const [m] = await db.insert(transactionMilestonesTable).values({
    transactionId: txId,
    ownerId,
    label: parsed.data.label,
    category: parsed.data.category,
    computedDate: parsed.data.effectiveDate ?? null,
    requiresWrittenRemoval: parsed.data.requiresWrittenRemoval ?? false,
    notes: parsed.data.notes ?? null,
    sortOrder: parsed.data.sortOrder ?? maxOrder + 10,
  }).returning();

  await logEvent(txId, ownerId, actor, "milestone_added", { label: parsed.data.label, category: parsed.data.category });
  res.status(201).json({ milestone: m });
});

// ---------------------------------------------------------------------------
// DELETE /admin/transactions/:id/milestones/:mid
// ---------------------------------------------------------------------------
router.delete("/transactions/:id/milestones/:mid", async (req: Request, res: Response): Promise<void> => {
  const txId = req.params["id"] as string;
  const mid = req.params["mid"] as string;
  const ownerId = req.user!.id;
  const actor = req.user!.email;

  const [m] = await db.select({ id: transactionMilestonesTable.id, label: transactionMilestonesTable.label }).from(transactionMilestonesTable).where(and(eq(transactionMilestonesTable.id, mid), eq(transactionMilestonesTable.transactionId, txId), eq(transactionMilestonesTable.ownerId, ownerId))).limit(1);
  if (!m) { res.status(404).json({ error: "Milestone not found" }); return; }

  await db.delete(transactionMilestonesTable).where(eq(transactionMilestonesTable.id, mid));
  await logEvent(txId, ownerId, actor, "milestone_deleted", { milestoneId: mid, label: m.label });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /admin/transactions/:id/events — audit trail
// ---------------------------------------------------------------------------
router.get("/transactions/:id/events", async (req: Request, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [txn] = await db.select({ id: transactionsTable.id }).from(transactionsTable).where(and(eq(transactionsTable.id, id), eq(transactionsTable.ownerId, ownerId))).limit(1);
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }

  const events = await db.select().from(transactionEventsTable).where(and(eq(transactionEventsTable.transactionId, id), eq(transactionEventsTable.ownerId, ownerId))).orderBy(desc(transactionEventsTable.createdAt));
  res.json({ events });
});

export default router;
