/**
 * GET  /admin/marketing-templates        — list active templates (filter: ?channel=)
 * POST /admin/marketing-templates/:id/preview — render thumbnail without saving
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db, marketingTemplatesTable, propertiesTable, mediaTable, propertyMediaTable, settingsTable } from "@workspace/db";
import { eq, and, or, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  generateMarketingImage,
  selectBestPhoto,
  extractCity,
  extractStreet,
  type GalleryEntry,
} from "../../lib/campaign-marketing-gen";
import { getObjectBuffer } from "../../lib/storage";
import { getSettingOrFail } from "./settings";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /admin/marketing-templates
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const channel = req.query["channel"] as string | undefined;
  const ownerId = req.user!.id;

  // System templates (ownerId null) are visible to all; user-owned templates
  // are visible only to their creator.
  const whereClause = channel
    ? and(
        eq(marketingTemplatesTable.isActive, true),
        eq(marketingTemplatesTable.channel, channel),
        or(isNull(marketingTemplatesTable.ownerId), eq(marketingTemplatesTable.ownerId, ownerId)),
      )
    : and(
        eq(marketingTemplatesTable.isActive, true),
        or(isNull(marketingTemplatesTable.ownerId), eq(marketingTemplatesTable.ownerId, ownerId)),
      );

  const filtered = await db
    .select()
    .from(marketingTemplatesTable)
    .where(whereClause);

  res.json({ templates: filtered });
});

// ---------------------------------------------------------------------------
// POST /admin/marketing-templates/:id/preview
// Renders a 400 px-wide WebP thumbnail using real property data.
// Does NOT upload to R2 — returns base64 data-URI directly.
// ---------------------------------------------------------------------------
const PreviewBody = z.object({
  propertyId: z.string().uuid(),
  // Optional field overrides
  headline: z.string().optional(),
  roleLine: z.string().optional(),
});

router.post("/:id/preview", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const parsed = PreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const { propertyId, headline: headlineOverride, roleLine: roleLineOverride } = parsed.data;

  // Load template — system templates (ownerId null) are visible to everyone;
  // user-owned templates are only visible to their creator.
  const [template] = await db
    .select()
    .from(marketingTemplatesTable)
    .where(and(
      eq(marketingTemplatesTable.id, id),
      or(
        isNull(marketingTemplatesTable.ownerId),
        eq(marketingTemplatesTable.ownerId, ownerId),
      ),
    ))
    .limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }
  if (!template.isActive) { res.status(410).json({ error: "Template is inactive" }); return; }

  // Load property
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, ownerId)))
    .limit(1);
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }

  // Load DRE settings (required for caption generation)
  let dreLicense = "";
  let brokerageName = "";
  try {
    dreLicense    = await getSettingOrFail(ownerId, "dre_license");
    brokerageName = await getSettingOrFail(ownerId, "brokerage_name");
  } catch { /* preview gracefully continues without DRE */ }

  // Load agent name
  let agentName = req.user!.name;
  try {
    const rows = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(and(eq(settingsTable.ownerId, ownerId), eq(settingsTable.key, "agent_name")))
      .limit(1);
    if (rows[0]?.value) agentName = rows[0].value;
  } catch { /* ignore */ }

  // Determine headline from template key if not overridden
  const headline = headlineOverride ?? headlineFromKey(template.key);
  const roleLine = roleLineOverride ?? "LISTED BY";

  const priceStr = property.listPrice ?? property.soldPrice ?? "";
  const city     = extractCity(property.address);
  const fields   = {
    headline,
    address:       extractStreet(property.address),
    city,
    price:         priceStr,
    roleLine,
    agentName,
    brokerageMark: brokerageName,
  };

  // Fetch gallery for best-fit photo selection
  const galleryRows = await db
    .select({
      mediaId:    propertyMediaTable.mediaId,
      sortOrder:  propertyMediaTable.sortOrder,
    })
    .from(propertyMediaTable)
    .where(eq(propertyMediaTable.propertyId, propertyId));

  const mediaIds = galleryRows.length > 0
    ? galleryRows.map((r) => r.mediaId)
    : property.heroMediaId ? [property.heroMediaId] : [];

  if (mediaIds.length === 0) {
    res.status(422).json({ error: "Property has no media — cannot render preview." });
    return;
  }

  // Load media rows
  const mediaRows = await db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.ownerId, ownerId));

  const gallery: GalleryEntry[] = mediaRows
    .filter((m) => mediaIds.includes(m.id))
    .map((m) => ({
      mediaId:    m.id,
      aspectRatio: m.aspectRatio as string,
      width:      m.width,
      height:     m.height,
      focalX:     m.focalX as string,
      focalY:     m.focalY as string,
      storageKey: m.storageKey,
    }));

  const bestPhoto = selectBestPhoto(gallery, parseFloat(template.photoAspect as string));
  if (!bestPhoto) {
    res.status(422).json({ error: "No suitable photo found for this template aspect ratio." });
    return;
  }

  let sourceBuffer: Buffer;
  try {
    sourceBuffer = await getObjectBuffer(bestPhoto.storageKey);
  } catch {
    res.status(503).json({ error: "Could not load photo from storage for preview." });
    return;
  }

  try {
    const result = await generateMarketingImage({
      template,
      fields,
      sourceBuffer,
      srcWidth:    bestPhoto.width,
      srcHeight:   bestPhoto.height,
      focalX:      parseFloat(bestPhoto.focalX),
      focalY:      parseFloat(bestPhoto.focalY),
      dreLicense:  dreLicense || "00000000",   // dummy for preview if not set
      brokerageName: brokerageName || "Beverly Hills Estates",
      previewOnly:  true,
      previewWidth: 400,
    });

    const b64 = result.webpBuffer.toString("base64");
    res.json({
      image:   `data:image/webp;base64,${b64}`,
      caption: result.caption,
    });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; field?: string };
    if (e.code === "MISSING_TEMPLATE_FIELD") {
      res.status(422).json({ error: e.message, code: e.code, field: e.field });
      return;
    }
    res.status(500).json({ error: e.message ?? "Preview render failed." });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function headlineFromKey(key: string): string {
  const map: Record<string, string> = {
    "story.just_sold":      "JUST SOLD",
    "story.just_listed":    "JUST LISTED",
    "story.open_house":     "OPEN TODAY",
    "story.price_improved": "PRICE IMPROVED",
    "story.in_escrow":      "IN ESCROW",
    "post.just_sold":       "JUST SOLD",
    "post.just_listed":     "JUST LISTED",
    "post.open_house":      "OPEN TODAY",
    "post.price_improved":  "PRICE IMPROVED",
    "post.in_escrow":       "IN ESCROW",
  };
  return map[key] ?? "NEW LISTING";
}

export default router;
