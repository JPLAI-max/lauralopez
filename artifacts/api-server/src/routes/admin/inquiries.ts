import { Router, type IRouter, type Request, type Response } from "express";
import { db, inquiriesTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
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

export default router;
