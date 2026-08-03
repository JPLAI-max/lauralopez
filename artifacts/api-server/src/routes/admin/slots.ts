import { Router, type IRouter, type Request, type Response } from "express";
import { db, imageSlotsTable, slotAssignmentsTable, mediaTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { isConfigured, publicUrl } from "../../lib/storage";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slotMediaUrl(
  storageKey:      string,
  derivatives:     Record<string, string>,
  storageProvider: string,
): string | null {
  if (storageProvider === "local") return storageKey;
  if (!isConfigured()) return null;
  const thumbKey = derivatives["480"] ?? derivatives["960"] ?? storageKey;
  return publicUrl(thumbKey);
}

// ---------------------------------------------------------------------------
// GET /admin/slots  — owner-scoped slots with resolved current media
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response) => {
  const ownerId = req.user!.id;

  const slots = await db
    .select()
    .from(imageSlotsTable)
    .where(eq(imageSlotsTable.ownerId, ownerId));

  const enriched = await Promise.all(
    slots.map(async (slot) => {
      let currentMedia: { id: string; filename: string; url: string | null } | null = null;
      if (slot.currentMediaId) {
        const [m] = await db
          .select()
          .from(mediaTable)
          .where(eq(mediaTable.id, slot.currentMediaId));
        if (m) {
          const derivs = m.derivatives as Record<string, string>;
          currentMedia = {
            id:       m.id,
            filename: m.filename,
            url:      slotMediaUrl(m.storageKey, derivs, m.storageProvider as string),
          };
        }
      }
      return { ...slot, currentMedia };
    }),
  );

  res.json({ slots: enriched });
});

// ---------------------------------------------------------------------------
// POST /admin/slots/:slotKey/assign
// ---------------------------------------------------------------------------
const AssignBody = z.object({
  mediaId:    z.string().uuid(),
  propertyId: z.string().uuid().optional(),
});

router.post("/:slotKey/assign", async (req: Request, res: Response) => {
  const parsed = AssignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { mediaId, propertyId } = parsed.data;
  const slotKey = req.params["slotKey"] as string;
  const ownerId = req.user!.id;

  // Verify slot exists and belongs to this owner
  const [slot] = await db
    .select()
    .from(imageSlotsTable)
    .where(and(eq(imageSlotsTable.slotKey, slotKey), eq(imageSlotsTable.ownerId, ownerId)));
  if (!slot) {
    res.status(404).json({ error: "Slot not found." });
    return;
  }

  // Verify media exists and belongs to this owner
  const [media] = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.id, mediaId), eq(mediaTable.ownerId, ownerId)));
  if (!media) {
    res.status(404).json({ error: "Media not found." });
    return;
  }

  const now = new Date();

  // Close any open assignment for this slot that belongs to this owner
  await db
    .update(slotAssignmentsTable)
    .set({ unassignedAt: now })
    .where(
      and(
        eq(slotAssignmentsTable.slotKey, slotKey),
        eq(slotAssignmentsTable.ownerId, ownerId),
        isNull(slotAssignmentsTable.unassignedAt),
      ),
    );

  // Open new assignment
  await db.insert(slotAssignmentsTable).values({
    ownerId,
    slotKey,
    mediaId,
    propertyId: propertyId ?? null,
    assignedBy: ownerId,
  });

  // Update image_slots current pointer
  const [updated] = await db
    .update(imageSlotsTable)
    .set({
      currentMediaId:    mediaId,
      currentPropertyId: propertyId ?? null,
      assignedAt:        now,
    })
    .where(and(eq(imageSlotsTable.slotKey, slotKey), eq(imageSlotsTable.ownerId, ownerId)))
    .returning();

  res.json({ slot: updated });
});

// ---------------------------------------------------------------------------
// POST /admin/slots/:slotKey/revert  — restore immediately previous assignment
// ---------------------------------------------------------------------------
router.post("/:slotKey/revert", async (req: Request, res: Response) => {
  const slotKey = req.params["slotKey"] as string;
  const ownerId = req.user!.id;

  // Get the two most recent assignments for this owner+slot
  const recent = await db
    .select()
    .from(slotAssignmentsTable)
    .where(and(eq(slotAssignmentsTable.slotKey, slotKey), eq(slotAssignmentsTable.ownerId, ownerId)))
    .orderBy(desc(slotAssignmentsTable.assignedAt))
    .limit(2);

  if (recent.length < 2) {
    res.status(409).json({ error: "No previous assignment to revert to." });
    return;
  }

  const [current, previous] = recent;
  const now = new Date();

  // Close current open assignment
  if (!current.unassignedAt) {
    await db
      .update(slotAssignmentsTable)
      .set({ unassignedAt: now })
      .where(
        and(
          eq(slotAssignmentsTable.id, current.id),
          eq(slotAssignmentsTable.ownerId, ownerId),
        ),
      );
  }

  // Open a new assignment with the previous media
  await db.insert(slotAssignmentsTable).values({
    ownerId,
    slotKey,
    mediaId:    previous.mediaId,
    propertyId: previous.propertyId ?? null,
    assignedBy: ownerId,
  });

  // Update slot pointer — only if this owner owns the slot
  const [updated] = await db
    .update(imageSlotsTable)
    .set({
      currentMediaId:    previous.mediaId,
      currentPropertyId: previous.propertyId ?? null,
      assignedAt:        now,
    })
    .where(and(eq(imageSlotsTable.slotKey, slotKey), eq(imageSlotsTable.ownerId, ownerId)))
    .returning();

  res.json({ slot: updated });
});

export default router;
