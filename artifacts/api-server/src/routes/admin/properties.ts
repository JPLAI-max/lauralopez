import { Router, type IRouter, type Request, type Response } from "express";
import { db, propertiesTable, propertyMediaTable, mediaTable } from "@workspace/db";
import { eq, asc, and, desc } from "drizzle-orm";
import { z } from "zod";
import { isConfigured, publicUrl } from "../../lib/storage";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mediaUrl(storageKey: string, derivatives: Record<string, string>): string | null {
  if (!isConfigured()) return null;
  const thumbKey = derivatives["960"] ?? derivatives["480"] ?? storageKey;
  return publicUrl(thumbKey);
}

async function enrichProperty(p: typeof propertiesTable.$inferSelect) {
  let heroUrl: string | null = null;
  if (p.heroMediaId) {
    const [m] = await db.select().from(mediaTable).where(eq(mediaTable.id, p.heroMediaId));
    if (m) heroUrl = mediaUrl(m.storageKey, m.derivatives as Record<string, string>);
  }
  const gallery = await db
    .select({ mediaId: propertyMediaTable.mediaId, sortOrder: propertyMediaTable.sortOrder })
    .from(propertyMediaTable)
    .where(eq(propertyMediaTable.propertyId, p.id))
    .orderBy(asc(propertyMediaTable.sortOrder));
  return { ...p, heroUrl, gallery };
}

// ---------------------------------------------------------------------------
// GET /admin/properties  — all (including archived), sorted
// ---------------------------------------------------------------------------
router.get("/", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(propertiesTable)
    .orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
  res.json({ properties: rows });
});

// ---------------------------------------------------------------------------
// POST /admin/properties
// ---------------------------------------------------------------------------
const CreatePropertyBody = z.object({
  address: z.string().min(1),
  neighborhood: z.string().nullable().optional(),
  status: z.enum(["pick", "listed", "sold"]).default("pick"),
  listPrice: z.number().nullable().optional(),
  soldPrice: z.number().nullable().optional(),
  soldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  beds: z.number().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  lotSqft: z.number().int().nullable().optional(),
  yearBuilt: z.number().int().nullable().optional(),
  architect: z.string().nullable().optional(),
  isLauraListing: z.boolean().default(false),
  listingBrokerage: z.string().nullable().optional(),
  commentary: z.string().nullable().optional(),
  architectureNotes: z.string().nullable().optional(),
  lotNotes: z.string().nullable().optional(),
  valueNotes: z.string().nullable().optional(),
  heroMediaId: z.string().uuid().nullable().optional(),
  featured: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreatePropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const data = parsed.data;
  const user = (req as Request & { user?: { id: string } }).user;
  const ownerId = user?.id ?? "00000000-0000-0000-0000-000000000000";

  const [property] = await db
    .insert(propertiesTable)
    .values({
      ownerId,
      address: data.address,
      neighborhood: data.neighborhood ?? null,
      status: data.status,
      listPrice: data.listPrice != null ? String(data.listPrice) : null,
      soldPrice: data.soldPrice != null ? String(data.soldPrice) : null,
      soldDate: data.soldDate ?? null,
      beds: data.beds != null ? String(data.beds) : null,
      baths: data.baths != null ? String(data.baths) : null,
      sqft: data.sqft ?? null,
      lotSqft: data.lotSqft ?? null,
      yearBuilt: data.yearBuilt ?? null,
      architect: data.architect ?? null,
      isLauraListing: data.isLauraListing,
      listingBrokerage: data.listingBrokerage ?? null,
      commentary: data.commentary ?? null,
      architectureNotes: data.architectureNotes ?? null,
      lotNotes: data.lotNotes ?? null,
      valueNotes: data.valueNotes ?? null,
      heroMediaId: data.heroMediaId ?? null,
      featured: data.featured,
      sortOrder: data.sortOrder,
    })
    .returning();

  res.status(201).json({ property });
});

// ---------------------------------------------------------------------------
// GET /admin/properties/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id));
  if (!property) {
    res.status(404).json({ error: "Property not found." });
    return;
  }
  res.json({ property: await enrichProperty(property) });
});

// ---------------------------------------------------------------------------
// PATCH /admin/properties/:id
// ---------------------------------------------------------------------------
const PatchPropertyBody = z.object({
  address: z.string().min(1).optional(),
  neighborhood: z.string().nullable().optional(),
  status: z.enum(["pick", "listed", "sold"]).optional(),
  listPrice: z.number().nullable().optional(),
  soldPrice: z.number().nullable().optional(),
  soldDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  beds: z.number().nullable().optional(),
  baths: z.number().nullable().optional(),
  sqft: z.number().int().nullable().optional(),
  lotSqft: z.number().int().nullable().optional(),
  yearBuilt: z.number().int().nullable().optional(),
  architect: z.string().nullable().optional(),
  isLauraListing: z.boolean().optional(),
  listingBrokerage: z.string().nullable().optional(),
  commentary: z.string().nullable().optional(),
  architectureNotes: z.string().nullable().optional(),
  lotNotes: z.string().nullable().optional(),
  valueNotes: z.string().nullable().optional(),
  heroMediaId: z.string().uuid().nullable().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  archived: z.boolean().optional(),
  // Gallery order: array of mediaIds in new order
  gallery: z.array(z.string().uuid()).optional(),
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const parsed = PatchPropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const [existing] = await db
    .select()
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Property not found." });
    return;
  }

  const { gallery, ...fields } = parsed.data;

  const updates: Partial<typeof propertiesTable.$inferInsert> = { updatedAt: new Date() };
  if (fields.address !== undefined) updates.address = fields.address;
  if (fields.neighborhood !== undefined) updates.neighborhood = fields.neighborhood;
  if (fields.status !== undefined) updates.status = fields.status;
  if (fields.listPrice !== undefined) updates.listPrice = fields.listPrice != null ? String(fields.listPrice) : null;
  if (fields.soldPrice !== undefined) updates.soldPrice = fields.soldPrice != null ? String(fields.soldPrice) : null;
  if (fields.soldDate !== undefined) updates.soldDate = fields.soldDate;
  if (fields.beds !== undefined) updates.beds = fields.beds != null ? String(fields.beds) : null;
  if (fields.baths !== undefined) updates.baths = fields.baths != null ? String(fields.baths) : null;
  if (fields.sqft !== undefined) updates.sqft = fields.sqft;
  if (fields.lotSqft !== undefined) updates.lotSqft = fields.lotSqft;
  if (fields.yearBuilt !== undefined) updates.yearBuilt = fields.yearBuilt;
  if (fields.architect !== undefined) updates.architect = fields.architect;
  if (fields.isLauraListing !== undefined) updates.isLauraListing = fields.isLauraListing;
  if (fields.listingBrokerage !== undefined) updates.listingBrokerage = fields.listingBrokerage;
  if (fields.commentary !== undefined) updates.commentary = fields.commentary;
  if (fields.architectureNotes !== undefined) updates.architectureNotes = fields.architectureNotes;
  if (fields.lotNotes !== undefined) updates.lotNotes = fields.lotNotes;
  if (fields.valueNotes !== undefined) updates.valueNotes = fields.valueNotes;
  if (fields.heroMediaId !== undefined) updates.heroMediaId = fields.heroMediaId;
  if (fields.featured !== undefined) updates.featured = fields.featured;
  if (fields.sortOrder !== undefined) updates.sortOrder = fields.sortOrder;
  if (fields.archived !== undefined) updates.archived = fields.archived;

  const [property] = await db
    .update(propertiesTable)
    .set(updates)
    .where(eq(propertiesTable.id, id))
    .returning();

  // Reorder gallery if provided
  if (gallery !== undefined) {
    await db.delete(propertyMediaTable).where(eq(propertyMediaTable.propertyId, id));
    if (gallery.length > 0) {
      await db.insert(propertyMediaTable).values(
        gallery.map((mediaId, i) => ({
          propertyId: id,
          mediaId,
          sortOrder: i,
        })),
      );
    }
  }

  res.json({ property });
});

// ---------------------------------------------------------------------------
// DELETE /admin/properties/:id  — archive (never hard delete)
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const [existing] = await db
    .select({ id: propertiesTable.id })
    .from(propertiesTable)
    .where(eq(propertiesTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Property not found." });
    return;
  }
  const [property] = await db
    .update(propertiesTable)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(propertiesTable.id, id))
    .returning();
  res.json({ property });
});

// ---------------------------------------------------------------------------
// POST /admin/properties/:id/gallery  — add media to gallery
// ---------------------------------------------------------------------------
router.post("/:id/gallery", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const { mediaId } = req.body;
  if (!mediaId) {
    res.status(400).json({ error: "mediaId is required." });
    return;
  }

  // Get current max sortOrder
  const existing = await db
    .select({ sortOrder: propertyMediaTable.sortOrder })
    .from(propertyMediaTable)
    .where(eq(propertyMediaTable.propertyId, id))
    .orderBy(desc(propertyMediaTable.sortOrder))
    .limit(1);

  const nextOrder = existing[0] ? existing[0].sortOrder + 1 : 0;

  const [row] = await db
    .insert(propertyMediaTable)
    .values({ propertyId: id, mediaId, sortOrder: nextOrder })
    .returning();

  res.status(201).json({ row });
});

// ---------------------------------------------------------------------------
// DELETE /admin/properties/:id/gallery/:mediaId
// ---------------------------------------------------------------------------
router.delete("/:id/gallery/:mediaId", async (req: Request, res: Response) => {
  const id = req.params["id"] as string;
  const mediaId = req.params["mediaId"] as string;
  await db
    .delete(propertyMediaTable)
    .where(
      and(
        eq(propertyMediaTable.propertyId, id),
        eq(propertyMediaTable.mediaId, mediaId),
      ),
    );
  res.json({ ok: true });
});

export default router;
