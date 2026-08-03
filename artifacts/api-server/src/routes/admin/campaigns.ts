import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  campaignsTable, campaignTasksTable, campaignEventsTable, campaignAssetsTable,
  campaignTemplatesTable, campaignTemplateItemsTable,
  propertiesTable, mediaTable,
  settingsTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { computeMilestoneDate } from "../../lib/dates";
import { logger } from "../../lib/logger";
import { getSettingOrFail } from "./settings";
import { isConfigured, publicUrl, getObjectBuffer } from "../../lib/storage";
import { generateCampaignImage } from "../../lib/campaign-image-gen";
import { generateCampaignCopy, type CopyChannel } from "../../lib/campaign-copy-gen";
import { generateCampaignPdf, type PdfChannel } from "../../lib/campaign-pdf-gen";

const router: IRouter = Router();

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

// ---------------------------------------------------------------------------
// parsePrintCopy — extract HEADLINE/BODY/CTA from structured copy output
// ---------------------------------------------------------------------------
interface PrintCopyFields {
  headline?: string;
  body?:     string;
  cta?:      string;
}

function parsePrintCopy(raw: string): PrintCopyFields {
  const result: PrintCopyFields = {};
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const hlMatch = line.match(/^HEADLINE:\s*(.+)$/i);
    if (hlMatch) { result.headline = hlMatch[1]!.trim(); continue; }

    const bodyMatch = line.match(/^BODY:\s*(.+)$/i);
    if (bodyMatch) { result.body = bodyMatch[1]!.trim(); continue; }

    const ctaMatch = line.match(/^CTA:\s*(.+)$/i);
    if (ctaMatch) { result.cta = ctaMatch[1]!.trim(); continue; }
  }

  // Multi-line BODY: collect everything between BODY: and CTA: labels
  const bodyStart = raw.search(/^BODY:/im);
  const ctaStart  = raw.search(/^CTA:/im);
  if (bodyStart !== -1) {
    const bodySlice = ctaStart !== -1 && ctaStart > bodyStart
      ? raw.slice(bodyStart, ctaStart)
      : raw.slice(bodyStart);
    const bodyText = bodySlice.replace(/^BODY:\s*/i, "").replace(/\nCTA:.*$/is, "").trim();
    if (bodyText) result.body = bodyText;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function logEvent(
  campaignId: string,
  ownerId: string,
  actor: string,
  action: string,
  payload: unknown,
) {
  try {
    await db.insert(campaignEventsTable).values({
      campaignId, ownerId, actor, action,
      payload: payload as Record<string, unknown>,
    });
  } catch (err) {
    logger.error({ err }, "failed to write campaign event");
  }
}

function effectiveDate(task: { computedDate: string | null; overrideDate: string | null }) {
  return task.overrideDate ?? task.computedDate;
}

// ---------------------------------------------------------------------------
// POST /admin/campaigns/preview — compute tasks without saving
// ---------------------------------------------------------------------------
const PreviewBody = z.object({
  propertyId: z.string().uuid(),
  templateId: z.string().uuid(),
  anchorDate: IsoDate,
});

router.post("/campaigns/preview", async (req: Request, res: Response): Promise<void> => {
  const parsed = PreviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const ownerId = req.user!.id;
  const { propertyId, templateId, anchorDate } = parsed.data;

  const [template] = await db
    .select()
    .from(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, templateId), eq(campaignTemplatesTable.ownerId, ownerId)))
    .limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const [property] = await db
    .select({ id: propertiesTable.id, address: propertiesTable.address })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, ownerId)))
    .limit(1);
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }

  const items = await db
    .select()
    .from(campaignTemplateItemsTable)
    .where(eq(campaignTemplateItemsTable.templateId, templateId))
    .orderBy(asc(campaignTemplateItemsTable.sortOrder));

  const tasks = items.map((item) => ({
    templateItemId: item.id,
    label:          item.label,
    channel:        item.channel,
    assetType:      item.assetType,
    offsetDays:     item.offsetDays,
    dayType:        item.dayType,
    sortOrder:      item.sortOrder,
    computedDate:   computeMilestoneDate({
      anchorDate,
      offsetDays: item.offsetDays,
      direction:  "after",
      dayType:    item.dayType as "calendar" | "business",
    }),
  }));

  res.json({
    template: { id: template.id, name: template.name, trigger: template.trigger },
    property: { id: property.id, address: property.address },
    anchorDate,
    tasks,
  });
});

// ---------------------------------------------------------------------------
// GET /admin/campaigns — list
// ---------------------------------------------------------------------------
router.get("/campaigns", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const today   = new Date().toISOString().slice(0, 10);

  const campaigns = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.ownerId, ownerId))
    .orderBy(desc(campaignsTable.createdAt));

  if (campaigns.length === 0) { res.json({ campaigns: [] }); return; }

  const allTasks = await db
    .select()
    .from(campaignTasksTable)
    .where(and(
      inArray(campaignTasksTable.campaignId, campaigns.map((c) => c.id)),
      eq(campaignTasksTable.ownerId, ownerId),
    ));

  // Enrich each campaign with property address
  const propertyIds = [...new Set(campaigns.map((c) => c.propertyId))];
  const properties  = await db
    .select({ id: propertiesTable.id, address: propertiesTable.address })
    .from(propertiesTable)
    .where(inArray(propertiesTable.id, propertyIds));
  const propMap = new Map(properties.map((p) => [p.id, p.address]));

  const result = campaigns.map((c) => {
    const tasks    = allTasks.filter((t) => t.campaignId === c.id);
    const total    = tasks.length;
    const done     = tasks.filter((t) => t.status === "done" || t.status === "skipped").length;
    const pending  = tasks.filter((t) => t.status === "pending" || t.status === "ready");
    const nextTask = pending
      .filter((t) => effectiveDate(t) != null)
      .sort((a, b) => {
        const ea = effectiveDate(a)!;
        const eb = effectiveDate(b)!;
        return ea < eb ? -1 : ea > eb ? 1 : 0;
      })[0];
    return {
      ...c,
      propertyAddress: propMap.get(c.propertyId) ?? "—",
      tasksDone:  done,
      tasksTotal: total,
      nextDueDate: nextTask ? effectiveDate(nextTask) : null,
    };
  });

  void today;
  res.json({ campaigns: result });
});

// ---------------------------------------------------------------------------
// POST /admin/campaigns — create (from preview confirmation)
// ---------------------------------------------------------------------------
const CreateCampaignBody = z.object({
  propertyId:  z.string().uuid(),
  templateId:  z.string().uuid(),
  anchorDate:  IsoDate,
  trigger:     z.enum(["new_listing", "price_change", "open_house", "sold"]),
});

router.post("/campaigns", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const ownerId = req.user!.id;
  const actor   = req.user!.email;
  const { propertyId, templateId, anchorDate, trigger } = parsed.data;

  // Verify property ownership
  const [property] = await db
    .select({ id: propertiesTable.id, address: propertiesTable.address })
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, propertyId), eq(propertiesTable.ownerId, ownerId)))
    .limit(1);
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }

  // Verify template ownership
  const [template] = await db
    .select()
    .from(campaignTemplatesTable)
    .where(and(eq(campaignTemplatesTable.id, templateId), eq(campaignTemplatesTable.ownerId, ownerId)))
    .limit(1);
  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  // Insert campaign
  const [campaign] = await db
    .insert(campaignsTable)
    .values({ ownerId, propertyId, templateId, trigger, anchorDate })
    .returning();

  // Compute and insert tasks
  const items = await db
    .select()
    .from(campaignTemplateItemsTable)
    .where(eq(campaignTemplateItemsTable.templateId, templateId))
    .orderBy(asc(campaignTemplateItemsTable.sortOrder));

  const taskRows = items.map((item) => ({
    campaignId:   campaign!.id,
    ownerId,
    label:        item.label,
    channel:      item.channel,
    assetType:    item.assetType ?? null,
    computedDate: computeMilestoneDate({
      anchorDate,
      offsetDays: item.offsetDays,
      direction:  "after",
      dayType:    item.dayType as "calendar" | "business",
    }),
    sortOrder: item.sortOrder,
  }));

  const tasks = taskRows.length > 0
    ? await db.insert(campaignTasksTable).values(taskRows).returning()
    : [];

  await logEvent(campaign!.id, ownerId, actor, "campaign_created", {
    propertyAddress: property.address,
    trigger,
    anchorDate,
    taskCount: tasks.length,
  });

  res.status(201).json({ campaign, tasks });
});

// ---------------------------------------------------------------------------
// GET /admin/campaigns/:id
// ---------------------------------------------------------------------------
router.get("/campaigns/:id", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;
  const today   = new Date().toISOString().slice(0, 10);

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.ownerId, ownerId)))
    .limit(1);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const tasks = await db
    .select()
    .from(campaignTasksTable)
    .where(and(eq(campaignTasksTable.campaignId, id), eq(campaignTasksTable.ownerId, ownerId)))
    .orderBy(asc(campaignTasksTable.sortOrder));

  const tasksWithDerived = tasks.map((t) => {
    const eff = effectiveDate(t);
    return { ...t, effectiveDate: eff, overdue: t.status === "pending" && eff != null && eff < today };
  });

  // Enrich with assets
  const taskIds = tasks.map((t) => t.id);
  const assets  = taskIds.length > 0
    ? await db
        .select()
        .from(campaignAssetsTable)
        .where(and(
          inArray(campaignAssetsTable.taskId, taskIds),
          eq(campaignAssetsTable.ownerId, ownerId),
        ))
    : [];

  // Property info
  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, campaign.propertyId), eq(propertiesTable.ownerId, ownerId)))
    .limit(1);

  res.json({ campaign, tasks: tasksWithDerived, assets, property: property ?? null });
});

// ---------------------------------------------------------------------------
// PATCH /admin/campaigns/:id — update status
// ---------------------------------------------------------------------------
const PatchCampaignBody = z.object({
  status: z.enum(["active", "complete", "cancelled"]).optional(),
});

router.patch("/campaigns/:id", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;
  const actor   = req.user!.email;

  const parsed = PatchCampaignBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }

  const [existing] = await db
    .select({ status: campaignsTable.status })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }

  const updates: Partial<typeof campaignsTable.$inferInsert> = {};
  if (parsed.data.status) {
    updates.status      = parsed.data.status;
    if (parsed.data.status === "complete") updates.completedAt = new Date();
  }

  const [campaign] = await db
    .update(campaignsTable)
    .set(updates)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.ownerId, ownerId)))
    .returning();

  if (parsed.data.status && parsed.data.status !== existing.status) {
    await logEvent(id, ownerId, actor, "status_changed", {
      before: existing.status,
      after:  parsed.data.status,
    });
  }

  res.json({ campaign });
});

// ---------------------------------------------------------------------------
// DELETE /admin/campaigns/:id — soft cancel
// ---------------------------------------------------------------------------
router.delete("/campaigns/:id", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;
  const actor   = req.user!.email;

  const [existing] = await db
    .select({ status: campaignsTable.status })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Campaign not found" }); return; }

  await db
    .update(campaignsTable)
    .set({ status: "cancelled" })
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.ownerId, ownerId)));

  await logEvent(id, ownerId, actor, "status_changed", { before: existing.status, after: "cancelled" });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// PATCH /admin/campaign-tasks/:taskId — update overrideDate / status / notes
// ---------------------------------------------------------------------------
const PatchTaskBody = z.object({
  overrideDate: IsoDate.nullable().optional(),
  status:       z.enum(["pending", "ready", "done", "skipped"]).optional(),
  notes:        z.string().max(2000).nullable().optional(),
});

router.patch("/campaign-tasks/:taskId", async (req: Request, res: Response): Promise<void> => {
  const taskId  = req.params["taskId"] as string;
  const ownerId = req.user!.id;
  const actor   = req.user!.email;

  const parsed = PatchTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", fields: parsed.error.flatten().fieldErrors });
    return;
  }

  const [task] = await db
    .select()
    .from(campaignTasksTable)
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)))
    .limit(1);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const before = { status: task.status, overrideDate: task.overrideDate, notes: task.notes };

  const updates: Partial<typeof campaignTasksTable.$inferInsert> = {};
  if (parsed.data.overrideDate !== undefined) updates.overrideDate = parsed.data.overrideDate;
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === "done" || parsed.data.status === "skipped") {
      updates.completedAt = new Date();
    }
  }
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  const [updated] = await db
    .update(campaignTasksTable)
    .set(updates)
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)))
    .returning();

  const today = new Date().toISOString().slice(0, 10);
  const eff   = effectiveDate(updated!);

  await logEvent(task.campaignId, ownerId, actor, "task_updated", {
    taskId, label: task.label,
    before,
    after: parsed.data,
  });

  res.json({ task: { ...updated, effectiveDate: eff, overdue: updated!.status === "pending" && eff != null && eff < today } });
});

// ---------------------------------------------------------------------------
// POST /admin/campaign-tasks/:taskId/generate — generate asset
// ---------------------------------------------------------------------------
router.post("/campaign-tasks/:taskId/generate", async (req: Request, res: Response): Promise<void> => {
  const taskId  = req.params["taskId"] as string;
  const ownerId = req.user!.id;
  const actor   = req.user!.email;

  // Load task + campaign + property
  const [task] = await db
    .select()
    .from(campaignTasksTable)
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)))
    .limit(1);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, task.campaignId), eq(campaignsTable.ownerId, ownerId)))
    .limit(1);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const [property] = await db
    .select()
    .from(propertiesTable)
    .where(and(eq(propertiesTable.id, campaign.propertyId), eq(propertiesTable.ownerId, ownerId)))
    .limit(1);
  if (!property) { res.status(404).json({ error: "Property not found" }); return; }

  // Fetch required settings BEFORE any generation attempt
  let dreLicense:    string;
  let brokerageName: string;
  try {
    dreLicense    = await getSettingOrFail(ownerId, "dre_license");
    brokerageName = await getSettingOrFail(ownerId, "brokerage_name");
  } catch (err: unknown) {
    const e = err as { code?: string; key?: string };
    res.status(422).json({
      error: `DRE compliance setting "${e.key ?? "?"}" is required but not configured. ` +
             `Go to Settings and fill in your DRE license number and brokerage name before generating assets.`,
      code:  e.code,
    });
    return;
  }

  // Resolve agent name from settings or user
  let agentName = req.user!.name;
  try {
    const rows = await db.select({ value: settingsTable.value }).from(settingsTable)
      .where(and(eq(settingsTable.ownerId, ownerId), eq(settingsTable.key, "agent_name"))).limit(1);
    if (rows[0]?.value) agentName = rows[0].value;
  } catch { /* ignore */ }

  const priceStr  = property.listPrice ?? property.soldPrice ?? null;
  const facts = {
    address:    property.address,
    price:      priceStr,
    beds:       property.beds,
    baths:      property.baths,
    sqft:       property.sqft,
    yearBuilt:  property.yearBuilt,
    commentary: property.commentary,
  };

  let storageKey:  string | null = null;
  let textContent: string | null = null;
  let assetType:   string        = task.assetType ?? task.channel;

  try {
    // ── IMAGE ─────────────────────────────────────────────────────────────
    if (task.assetType === "image_1x1" || task.assetType === "image_9x16") {
      if (!isConfigured()) {
        res.status(503).json({ error: "Storage not configured — cannot generate images." });
        return;
      }
      if (!property.heroMediaId) {
        res.status(422).json({ error: "Property has no hero media set — cannot generate image." });
        return;
      }
      const [media] = await db
        .select()
        .from(mediaTable)
        .where(and(eq(mediaTable.id, property.heroMediaId), eq(mediaTable.ownerId, ownerId)))
        .limit(1);
      if (!media) {
        res.status(422).json({ error: "Hero media not found or not owned by you." });
        return;
      }
      const sourceBuffer = await getObjectBuffer(media.storageKey);
      const [tw, th]     = task.assetType === "image_1x1" ? [1080, 1080] : [1080, 1920];
      const result = await generateCampaignImage({
        sourceBuffer,
        srcWidth:  media.width,
        srcHeight: media.height,
        focalX:    parseFloat(media.focalX as string),
        focalY:    parseFloat(media.focalY as string),
        targetWidth:  tw,
        targetHeight: th,
        address:   property.address,
        price:     priceStr,
        agentName,
        dreLicense,
        brokerageName,
        listingBrokerage: property.isLauraListing ? null : property.listingBrokerage,
      });
      storageKey = result.storageKey;

    // ── PRINT PDF — copy-first pipeline ────────────────────────────────────
    // Must be checked BEFORE the generic channel-based copy branch because
    // postcard/mailer tasks can have assetType "print_pdf".  We generate copy
    // (Anthropic call), parse HEADLINE/BODY/CTA, then render the PDF.  If R2
    // is not configured the copy is still preserved as textContent.
    } else if (task.assetType === "print_pdf") {
      const pdfChannel: PdfChannel =
        task.channel === "mailer" ? "mailer" : "postcard";

      // Step 1 — generate copy (works without R2)
      const copyResult = await generateCampaignCopy(pdfChannel as CopyChannel, facts);
      const parsedCopy = parsePrintCopy(copyResult.raw);
      textContent      = copyResult.raw;   // always stored, even if PDF fails

      // Step 2 — render PDF (requires R2; gracefully skipped if not configured)
      if (!isConfigured()) {
        // R2 absent: persist copy-only asset so the content is not lost.
        // storageKey remains null; the asset still carries textContent.
        logger.warn({ taskId }, "R2 not configured — print_pdf copy stored without PDF binary");
      } else {
        const result = await generateCampaignPdf({
          channel:         pdfChannel,
          address:         property.address,
          price:           priceStr,
          agentName,
          dreLicense,
          brokerageName,
          listingBrokerage: property.isLauraListing ? null : property.listingBrokerage,
          headline:        parsedCopy.headline,
          body:            parsedCopy.body,
          cta:             parsedCopy.cta,
        });
        storageKey = result.storageKey;
      }
      assetType = "print_pdf";

    // ── COPY (email / social / voicemail) ──────────────────────────────────
    // Note: postcard and mailer WITHOUT assetType "print_pdf" also route here
    // (e.g. a copy-only override item).  print_pdf is excluded by the branch
    // above.
    } else if (
      task.assetType === "email_html" || task.channel === "email" ||
      task.channel === "instagram_post" || task.channel === "instagram_story" ||
      task.channel === "postcard" || task.channel === "mailer" ||
      task.channel === "voicemail"
    ) {
      const copyChannel: CopyChannel =
        task.assetType === "email_html" ? "email"
        : task.channel as CopyChannel;
      const result = await generateCampaignCopy(copyChannel, facts);
      textContent  = result.raw;
      storageKey   = result.storageKey;
      assetType    = task.assetType ?? "script_txt";

    } else {
      res.status(422).json({
        error: `No generator for channel "${task.channel}" / assetType "${task.assetType ?? "none"}"`,
      });
      return;
    }
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    logger.error({ err, taskId }, "asset generation failed");
    if (e.code === "RAW_DIGIT_IN_COPY") {
      res.status(422).json({ error: e.message ?? "Generated copy contained a raw digit — rejected.", code: e.code });
      return;
    }
    if (e.code === "SETTING_MISSING") {
      res.status(422).json({ error: e.message, code: e.code });
      return;
    }
    res.status(500).json({ error: e.message ?? "Asset generation failed." });
    return;
  }

  // Insert campaign_assets row as draft (NEVER auto-approve)
  const [asset] = await db
    .insert(campaignAssetsTable)
    .values({
      ownerId,
      campaignId:  task.campaignId,
      taskId:      task.id,
      assetType,
      storageKey:  storageKey ?? null,
      textContent: textContent ?? null,
      status:      "draft",            // never auto-approve
    })
    .returning();

  // Update task status to ready + link assetId
  await db
    .update(campaignTasksTable)
    .set({ status: "ready", assetId: asset!.id })
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)));

  await logEvent(task.campaignId, ownerId, actor, "asset_generated", {
    taskId, label: task.label, channel: task.channel, assetType, assetId: asset!.id,
  });

  // Enrich response with public URL
  const assetWithUrl = {
    ...asset,
    url: storageKey && isConfigured() ? publicUrl(storageKey) : null,
  };

  res.status(201).json({ asset: assetWithUrl });
});

// ---------------------------------------------------------------------------
// POST /admin/campaign-tasks/:taskId/approve
// ---------------------------------------------------------------------------
router.post("/campaign-tasks/:taskId/approve", async (req: Request, res: Response): Promise<void> => {
  const taskId  = req.params["taskId"] as string;
  const ownerId = req.user!.id;
  const actor   = req.user!.email;

  const [task] = await db
    .select()
    .from(campaignTasksTable)
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)))
    .limit(1);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (!task.assetId) { res.status(422).json({ error: "No asset to approve" }); return; }

  const [asset] = await db
    .update(campaignAssetsTable)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: actor })
    .where(and(eq(campaignAssetsTable.id, task.assetId), eq(campaignAssetsTable.ownerId, ownerId)))
    .returning();

  await logEvent(task.campaignId, ownerId, actor, "asset_approved", { taskId, assetId: task.assetId });
  res.json({ asset });
});

// ---------------------------------------------------------------------------
// POST /admin/campaign-tasks/:taskId/reject
// ---------------------------------------------------------------------------
router.post("/campaign-tasks/:taskId/reject", async (req: Request, res: Response): Promise<void> => {
  const taskId  = req.params["taskId"] as string;
  const ownerId = req.user!.id;
  const actor   = req.user!.email;

  const [task] = await db
    .select()
    .from(campaignTasksTable)
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)))
    .limit(1);
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }
  if (!task.assetId) { res.status(422).json({ error: "No asset to reject" }); return; }

  const [asset] = await db
    .update(campaignAssetsTable)
    .set({ status: "rejected" })
    .where(and(eq(campaignAssetsTable.id, task.assetId), eq(campaignAssetsTable.ownerId, ownerId)))
    .returning();

  // Reset task to pending so it can be regenerated
  await db
    .update(campaignTasksTable)
    .set({ status: "pending", assetId: null })
    .where(and(eq(campaignTasksTable.id, taskId), eq(campaignTasksTable.ownerId, ownerId)));

  await logEvent(task.campaignId, ownerId, actor, "asset_rejected", { taskId, assetId: task.assetId });
  res.json({ asset });
});

// ---------------------------------------------------------------------------
// GET /admin/campaign-tasks/:taskId/events
// ---------------------------------------------------------------------------
router.get("/campaigns/:id/events", async (req: Request, res: Response): Promise<void> => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [campaign] = await db
    .select({ id: campaignsTable.id })
    .from(campaignsTable)
    .where(and(eq(campaignsTable.id, id), eq(campaignsTable.ownerId, ownerId)))
    .limit(1);
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

  const events = await db
    .select()
    .from(campaignEventsTable)
    .where(and(eq(campaignEventsTable.campaignId, id), eq(campaignEventsTable.ownerId, ownerId)))
    .orderBy(desc(campaignEventsTable.createdAt));

  res.json({ events });
});

// Suppress unused import
void isNull;

export default router;
