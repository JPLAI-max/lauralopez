import { Router, type IRouter, type Request, type Response } from "express";
import { db, campaignTemplatesTable, campaignTemplateItemsTable } from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /admin/campaign-templates — list owner's templates with items
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const templates = await db
    .select()
    .from(campaignTemplatesTable)
    .where(eq(campaignTemplatesTable.ownerId, ownerId))
    .orderBy(asc(campaignTemplatesTable.name));

  const items =
    templates.length > 0
      ? await db
          .select()
          .from(campaignTemplateItemsTable)
          .where(
            inArray(
              campaignTemplateItemsTable.templateId,
              templates.map((t) => t.id),
            ),
          )
          .orderBy(asc(campaignTemplateItemsTable.sortOrder))
      : [];

  res.json({
    templates: templates.map((t) => ({
      ...t,
      items: items.filter((i) => i.templateId === t.id),
    })),
  });
});

// ---------------------------------------------------------------------------
// POST /admin/campaign-templates — create template + items
// ---------------------------------------------------------------------------
const CreateTemplateBody = z.object({
  name:      z.string().min(1).max(200),
  trigger:   z.enum(["new_listing", "price_change", "open_house", "sold"]),
  isDefault: z.boolean().default(false),
  items:     z
    .array(
      z.object({
        label:      z.string().min(1).max(200),
        channel:    z.enum(["instagram_post", "instagram_story", "email", "postcard", "mailer", "voicemail", "manual"]),
        offsetDays: z.number().int().min(0),
        dayType:    z.enum(["calendar", "business"]).default("calendar"),
        assetType:  z.string().nullable().optional(),
        sortOrder:  z.number().int().default(0),
      }),
    )
    .optional()
    .default([]),
});

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const ownerId = req.user!.id;
  const { name, trigger, isDefault, items } = parsed.data;

  const [template] = await db
    .insert(campaignTemplatesTable)
    .values({ ownerId, name, trigger, isDefault })
    .returning();

  const insertedItems =
    items.length > 0
      ? await db
          .insert(campaignTemplateItemsTable)
          .values(
            items.map((item, i) => ({
              templateId: template!.id,
              label:      item.label,
              channel:    item.channel,
              offsetDays: item.offsetDays,
              dayType:    item.dayType,
              assetType:  item.assetType ?? null,
              sortOrder:  item.sortOrder ?? i,
            })),
          )
          .returning()
      : [];

  res.status(201).json({ template: { ...template, items: insertedItems } });
});

// ---------------------------------------------------------------------------
// GET /admin/campaign-templates/:id
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [template] = await db
    .select()
    .from(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, id), eq(campaignTemplatesTable.ownerId, ownerId)))
    .limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const items = await db
    .select()
    .from(campaignTemplateItemsTable)
    .where(eq(campaignTemplateItemsTable.templateId, id))
    .orderBy(asc(campaignTemplateItemsTable.sortOrder));

  res.json({ template: { ...template, items } });
});

// ---------------------------------------------------------------------------
// PATCH /admin/campaign-templates/:id
// ---------------------------------------------------------------------------
const PatchTemplateBody = z.object({
  name:      z.string().min(1).max(200).optional(),
  trigger:   z.enum(["new_listing", "price_change", "open_house", "sold"]).optional(),
  isDefault: z.boolean().optional(),
});

router.patch("/:id", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const parsed = PatchTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }

  const [template] = await db
    .update(campaignTemplatesTable)
    .set(parsed.data)
    .where(and(eq(campaignTemplatesTable.id, id), eq(campaignTemplatesTable.ownerId, ownerId)))
    .returning();
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  res.json({ template });
});

// ---------------------------------------------------------------------------
// DELETE /admin/campaign-templates/:id
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [existing] = await db
    .select({ id: campaignTemplatesTable.id })
    .from(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, id), eq(campaignTemplatesTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Template not found" }); return; }

  await db
    .delete(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, id), eq(campaignTemplatesTable.ownerId, ownerId)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /admin/campaign-templates/:id/items — add item
// ---------------------------------------------------------------------------
const CreateItemBody = z.object({
  label:      z.string().min(1).max(200),
  channel:    z.enum(["instagram_post", "instagram_story", "email", "postcard", "mailer", "voicemail", "manual"]),
  offsetDays: z.number().int().min(0),
  dayType:    z.enum(["calendar", "business"]).default("calendar"),
  assetType:  z.string().nullable().optional(),
  sortOrder:  z.number().int().default(0),
});

router.post("/:id/items", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [template] = await db
    .select({ id: campaignTemplatesTable.id })
    .from(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, id), eq(campaignTemplatesTable.ownerId, ownerId)))
    .limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }

  const [item] = await db
    .insert(campaignTemplateItemsTable)
    .values({ templateId: id, ...parsed.data, assetType: parsed.data.assetType ?? null })
    .returning();

  res.status(201).json({ item });
});

// ---------------------------------------------------------------------------
// DELETE /admin/campaign-templates/:id/items/:itemId
// ---------------------------------------------------------------------------
router.delete("/:id/items/:itemId", async (req: Request, res: Response): Promise<void> => {
  const templateId = req.params["id"]     as string;
  const itemId     = req.params["itemId"] as string;
  const ownerId    = req.user!.id;

  // Verify ownership via template
  const [template] = await db
    .select({ id: campaignTemplatesTable.id })
    .from(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, templateId), eq(campaignTemplatesTable.ownerId, ownerId)))
    .limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  await db
    .delete(campaignTemplateItemsTable)
    .where(and(eq(campaignTemplateItemsTable.id, itemId), eq(campaignTemplateItemsTable.templateId, templateId)));
  res.json({ ok: true });
});

export default router;
