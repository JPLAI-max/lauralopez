import { Router, type IRouter, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { db, mediaTable, imageSlotsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../../lib/logger";
import {
  isConfigured,
  getPresignedPutUrl,
  getObjectBuffer,
  putObject,
  deleteObject,
  publicUrl,
} from "../../lib/storage";

// sharp is optional — only available when installed
import type { Sharp as SharpType } from "sharp";
type SharpConstructor = (input?: Buffer) => SharpType;
let sharp: SharpConstructor | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  sharp = require("sharp") as SharpConstructor;
} catch {
  logger.info("sharp not available — image processing will fail gracefully");
}

const router: IRouter = Router();

const DERIVATIVE_WIDTHS = [480, 960, 1440, 2400];
const MAX_SIZE_BYTES    = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mediaResponse(m: typeof mediaTable.$inferSelect) {
  const sp             = m.storageProvider as string;
  const derivativeKeys = m.derivatives as Record<string, string>;
  const derivatives: Record<string, string> = {};
  for (const [w, key] of Object.entries(derivativeKeys)) {
    // local files: pass derivative paths through as-is (no R2 prefix needed)
    derivatives[w] = sp === "local" ? key : (isConfigured() ? publicUrl(key) : key);
  }
  return {
    ...m,
    url: sp === "local" ? m.storageKey : (isConfigured() ? publicUrl(m.storageKey) : null),
    derivatives,
  };
}

// ---------------------------------------------------------------------------
// GET /admin/media  — owner-scoped list
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const items = await db
    .select()
    .from(mediaTable)
    .where(eq(mediaTable.ownerId, ownerId))
    .orderBy(desc(mediaTable.createdAt))
    .limit(200);
  res.json({ media: items.map(mediaResponse) });
});

// ---------------------------------------------------------------------------
// POST /admin/media/presign
// ---------------------------------------------------------------------------
const PresignBody = z.object({
  filename:  z.string().min(1).max(255),
  mimeType:  z.string(),
  sizeBytes: z.number().int().positive(),
});

router.post("/presign", async (req: Request, res: Response) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Storage not configured." });
    return;
  }

  const parsed = PresignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { filename, mimeType, sizeBytes } = parsed.data;

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    res.status(400).json({ error: "Only image files are allowed." });
    return;
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    res.status(400).json({ error: "File exceeds 25 MB limit." });
    return;
  }

  const ext        = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const storageKey = `uploads/${randomBytes(16).toString("hex")}.${ext}`;
  const uploadUrl  = await getPresignedPutUrl(storageKey, mimeType, sizeBytes);

  res.json({ uploadUrl, storageKey });
});

// ---------------------------------------------------------------------------
// POST /admin/media/complete
// ---------------------------------------------------------------------------
const CompleteBody = z.object({
  storageKey: z.string().min(1),
  filename:   z.string().min(1),
  mimeType:   z.string(),
});

router.post("/complete", async (req: Request, res: Response) => {
  if (!isConfigured()) {
    res.status(503).json({ error: "Storage not configured." });
    return;
  }
  if (!sharp) {
    res.status(503).json({ error: "Image processing not available." });
    return;
  }

  const parsed = CompleteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { storageKey, filename, mimeType } = parsed.data;
  const ownerId = req.user!.id;

  // Fetch the uploaded object
  let rawBuffer: Buffer;
  try {
    rawBuffer = await getObjectBuffer(storageKey);
  } catch (err) {
    logger.error({ err, storageKey }, "failed to fetch uploaded object");
    res.status(422).json({ error: "Could not read uploaded file." });
    return;
  }

  // Read real dimensions — do NOT trust client-reported values
  let width: number;
  let height: number;
  try {
    const meta = await sharp!(rawBuffer).metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    width  = meta.width;
    height = meta.height;
  } catch (err) {
    logger.error({ err, storageKey }, "sharp failed to read dimensions");
    try { await deleteObject(storageKey); } catch { /* ignore */ }
    res.status(422).json({ error: "Could not read image dimensions." });
    return;
  }

  const aspectRatio = (width / height).toFixed(4);

  // Generate derivatives — never upscale
  const derivatives: Record<string, string> = {};
  const basePath = storageKey.replace(/\.[^.]+$/, "");
  for (const targetWidth of DERIVATIVE_WIDTHS) {
    if (targetWidth > width) continue; // skip upscale
    const derivKey = `${basePath}-${targetWidth}w.webp`;
    try {
      const buf = await sharp!(rawBuffer).resize(targetWidth).webp().toBuffer();
      await putObject(derivKey, buf, "image/webp");
      derivatives[String(targetWidth)] = derivKey;
    } catch (err) {
      logger.warn({ err, derivKey }, "derivative generation failed — skipping width");
    }
  }

  const sizeBytes = rawBuffer.length;

  const [media] = await db
    .insert(mediaTable)
    .values({
      ownerId,
      storageKey,
      filename,
      mimeType,
      sizeBytes,
      width,
      height,
      aspectRatio,
      derivatives,
    })
    .returning();

  res.status(201).json({ media: mediaResponse(media) });
});

// ---------------------------------------------------------------------------
// GET /admin/media/:id  — owner-scoped
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [media] = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.id, id), eq(mediaTable.ownerId, ownerId)));
  if (!media) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  res.json({ media: mediaResponse(media) });
});

// ---------------------------------------------------------------------------
// PATCH /admin/media/:id  — owner-scoped; update focal point, altText, credit
// ---------------------------------------------------------------------------
const PatchMediaBody = z.object({
  focalX:  z.number().min(0).max(1).optional(),
  focalY:  z.number().min(0).max(1).optional(),
  altText: z.string().nullable().optional(),
  credit:  z.string().nullable().optional(),
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const parsed = PatchMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const updates: Partial<typeof mediaTable.$inferInsert> = {};
  if (parsed.data.focalX  !== undefined) updates.focalX  = parsed.data.focalX.toFixed(3);
  if (parsed.data.focalY  !== undefined) updates.focalY  = parsed.data.focalY.toFixed(3);
  if (parsed.data.altText !== undefined) updates.altText = parsed.data.altText;
  if (parsed.data.credit  !== undefined) updates.credit  = parsed.data.credit;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update." });
    return;
  }

  const [media] = await db
    .update(mediaTable)
    .set(updates)
    .where(and(eq(mediaTable.id, id), eq(mediaTable.ownerId, ownerId)))
    .returning();

  if (!media) {
    res.status(404).json({ error: "Media not found." });
    return;
  }
  res.json({ media: mediaResponse(media) });
});

// ---------------------------------------------------------------------------
// GET /admin/media/:id/slot-suggestions  — owner-scoped media lookup
// ---------------------------------------------------------------------------
router.get("/:id/slot-suggestions", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [media] = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.id, id), eq(mediaTable.ownerId, ownerId)));
  if (!media) {
    res.status(404).json({ error: "Media not found." });
    return;
  }

  const mediaAspect = parseFloat(media.aspectRatio as string);
  const mediaW      = media.width;

  // Slots are scoped to owner — only show slots this user can assign
  const slots = await db
    .select()
    .from(imageSlotsTable)
    .where(eq(imageSlotsTable.ownerId, ownerId));

  // Filter: width >= minWidth AND ratio within 25% of slot's ratio
  const suggestions = slots
    .filter((slot) => {
      const slotAspect = parseFloat(slot.aspectRatio as string);
      if (mediaW < slot.minWidth) return false;
      const ratioDiff = Math.abs(mediaAspect - slotAspect) / slotAspect;
      return ratioDiff <= 0.25;
    })
    .sort((a, b) => {
      const sa = parseFloat(a.aspectRatio as string);
      const sb = parseFloat(b.aspectRatio as string);
      return Math.abs(mediaAspect - sa) - Math.abs(mediaAspect - sb);
    });

  // Enrich with current image thumbnail URL for each suggested slot
  const enriched = await Promise.all(
    suggestions.map(async (slot) => {
      let currentThumbnail: string | null = null;
      if (slot.currentMediaId) {
        const [cur] = await db
          .select()
          .from(mediaTable)
          .where(eq(mediaTable.id, slot.currentMediaId));
        if (cur) {
          const derivs  = cur.derivatives as Record<string, string>;
          const thumbKey = derivs["480"] ?? derivs["960"] ?? cur.storageKey;
          currentThumbnail = isConfigured() ? publicUrl(thumbKey) : thumbKey;
        }
      }
      return { ...slot, currentThumbnail };
    }),
  );

  res.json({ suggestions: enriched });
});

// ---------------------------------------------------------------------------
// DELETE /admin/media/:id  — owner-scoped
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [media] = await db
    .select()
    .from(mediaTable)
    .where(and(eq(mediaTable.id, id), eq(mediaTable.ownerId, ownerId)));
  if (!media) {
    res.status(404).json({ error: "Media not found." });
    return;
  }

  // Delete from R2 if configured
  if (isConfigured()) {
    try {
      await deleteObject(media.storageKey);
      const derivs = media.derivatives as Record<string, string>;
      for (const key of Object.values(derivs)) {
        try { await deleteObject(key); } catch { /* ignore */ }
      }
    } catch (err) {
      logger.warn({ err, storageKey: media.storageKey }, "failed to delete from R2");
    }
  }

  await db
    .delete(mediaTable)
    .where(and(eq(mediaTable.id, id), eq(mediaTable.ownerId, ownerId)));
  res.json({ ok: true });
});

// Suppress unused import (isNull used via import side-effects for tree shaking)
void isNull;

export default router;
