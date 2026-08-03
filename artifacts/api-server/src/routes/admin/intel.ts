/**
 * /api/admin/intel — Intelligence fact store & report generator (Brick 7)
 *
 * TWO-STORE BOUNDARY: this file reads from both intel-public and intel-licensed
 * tables for DISPLAY purposes only. No endpoint returns rows from both stores
 * in a single exportable response. See intel-public.ts and intel-licensed.ts
 * for the boundary rule.
 *
 * ownerId filtering: every read/update/delete includes .where(ownerId) before
 * touching data. ownerId reference count is >= query count by design.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db,
  intelSourcesTable, parcelsTable, parcelEventsTable,
  regulatoryEventsTable, reportTemplatesTable, reportsTable,
  mlsTransactionsTable, offMarketNotesTable,
  articlesTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { z } from "zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { noRawDigits } from "../../lib/campaign-copy-gen";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Shared disclosure footer — component constant per spec
// ---------------------------------------------------------------------------
const REPORT_DISCLOSURE =
  "Prepared from public records, MLS data, and market observation. " +
  "Figures are believed accurate as of the date shown. " +
  "Not tax, legal, or investment advice — consult your own advisors.";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtAmount(raw: string | null | undefined): string {
  if (!raw) return "N/A";
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return "$" + Math.round(n).toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// INTEL SOURCES
// ---------------------------------------------------------------------------

// GET /admin/intel/sources
router.get("/sources", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(intelSourcesTable)
    .where(eq(intelSourcesTable.ownerId, ownerId))
    .orderBy(desc(intelSourcesTable.capturedAt));
  res.json({ sources: rows });
});

const CreateSourceBody = z.object({
  kind:        z.enum(["manual", "document", "url", "feed", "recorder", "permit_portal"]),
  title:       z.string().min(1),
  url:         z.string().url().optional().nullable(),
  documentKey: z.string().optional().nullable(),
  capturedAt:  z.string().datetime(),
  notes:       z.string().optional().nullable(),
});

// POST /admin/intel/sources
router.post("/sources", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const { kind, title, url, documentKey, capturedAt, notes } = parsed.data;
  const [source] = await db
    .insert(intelSourcesTable)
    .values({ ownerId, kind, title, url, documentKey, capturedAt: new Date(capturedAt), notes })
    .returning();
  res.status(201).json({ source });
});

// DELETE /admin/intel/sources/:id
router.delete("/sources/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [existing] = await db
    .select({ id: intelSourcesTable.id })
    .from(intelSourcesTable)
    .where(and(eq(intelSourcesTable.id, id), eq(intelSourcesTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Source not found" }); return; }
  await db.delete(intelSourcesTable)
    .where(and(eq(intelSourcesTable.id, id), eq(intelSourcesTable.ownerId, ownerId)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// INGEST — text extraction pipeline (PDF and pasted text)
// ---------------------------------------------------------------------------

const IngestBody = z.object({
  type:           z.enum(["text", "csv"]),
  content:        z.string().min(1),
  sourceTitle:    z.string().min(1),
  sourceKind:     z.enum(["manual", "document", "url", "feed", "recorder", "permit_portal"]),
  sourceCapturedAt: z.string().datetime(),
  sourceUrl:      z.string().url().optional().nullable(),
  sourceNotes:    z.string().optional().nullable(),
});

interface ExtractedFact {
  address:     string;
  eventType:   string;
  eventDate:   string | null;
  amount:      string | null;
  description: string | null;
  confidence:  string;
  sourceSnippet: string;
}

// POST /admin/intel/ingest — extract facts, return review table (NO DB write yet)
router.post("/ingest", async (req: Request, res: Response): Promise<void> => {
  const parsed = IngestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  const { type, content, sourceTitle, sourceKind, sourceCapturedAt, sourceUrl, sourceNotes } = parsed.data;

  if (type === "csv") {
    // CSV: split lines, infer columns, return for user mapping
    const lines = content.split("\n").filter(Boolean);
    const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];
    const preview = lines.slice(1, 6).map((l) => l.split(",").map((c) => c.trim()));
    res.json({
      type: "csv",
      headers,
      preview,
      sourceTitle,
      message: "CSV column mapping — review and map to fact fields before confirming.",
    });
    return;
  }

  // Text path: use Anthropic to structure the content
  const systemPrompt = `You are a data extraction assistant for a real estate intelligence system.
Your ONLY job is to identify facts that are explicitly present in the input text.
CRITICAL RULES:
1. Extract ONLY information that is literally present in the text. Do not infer or guess.
2. Return a JSON array of fact objects. No prose, no commentary.
3. For every field, include the exact verbatim snippet from the source text that supports it in "sourceSnippet".
4. If a field cannot be traced to an explicit snippet in the text, set it to null — never fabricate.
5. eventType must be one of: deed_transfer | permit_filed | permit_issued | entitlement | listing | price_change | sale | withdrawal
6. confidence must be one of: verified | reported | estimated
7. Amount must be a number string (digits and decimal only, no $ or commas), or null.
8. eventDate must be ISO 8601 (YYYY-MM-DD), or null if not clearly stated.

Return ONLY a JSON array, example:
[
  {
    "address": "412 N Mapleton Dr, Beverly Hills",
    "eventType": "sale",
    "eventDate": "2024-03-15",
    "amount": "4500000",
    "description": "Single-family residence sale",
    "confidence": "reported",
    "sourceSnippet": "412 N Mapleton Dr sold for $4,500,000 on March 15, 2024"
  }
]`;

  const message = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 4096,
    system:     systemPrompt,
    messages:   [{ role: "user", content: `Extract all real estate facts from this text:\n\n${content}` }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    res.status(502).json({ error: "AI extraction returned no content" });
    return;
  }

  let facts: ExtractedFact[] = [];
  try {
    const jsonMatch = block.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array found");
    facts = JSON.parse(jsonMatch[0]) as ExtractedFact[];
  } catch {
    res.status(502).json({ error: "AI returned malformed extraction — try rephrasing the input" });
    return;
  }

  res.json({
    type:           "text",
    extractedFacts: facts,
    sourceTitle,
    sourceKind,
    sourceCapturedAt,
    sourceUrl,
    sourceNotes,
    message: `Extracted ${facts.length} fact(s). Review each row and edit before confirming.`,
  });
});

// ---------------------------------------------------------------------------
// INGEST CONFIRM — write source + facts after user review
// ---------------------------------------------------------------------------

const ConfirmSourceBody = z.object({
  kind:        z.enum(["manual", "document", "url", "feed", "recorder", "permit_portal"]),
  title:       z.string().min(1),
  url:         z.string().url().optional().nullable(),
  capturedAt:  z.string().datetime(),
  notes:       z.string().optional().nullable(),
});

const ConfirmFactBody = z.object({
  address:       z.string().min(1),
  neighborhood:  z.string().optional().nullable(),
  city:          z.string().optional().nullable(),
  zip:           z.string().optional().nullable(),
  eventType:     z.enum(["deed_transfer", "permit_filed", "permit_issued", "entitlement", "listing", "price_change", "sale", "withdrawal"]),
  eventDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount:        z.string().optional().nullable(),
  description:   z.string().optional().nullable(),
  confidence:    z.enum(["verified", "reported", "estimated"]).default("reported"),
  sourceSnippet: z.string().optional().nullable(),
  included:      z.boolean().default(true),
});

const IngestConfirmBody = z.object({
  source: ConfirmSourceBody,
  facts:  z.array(ConfirmFactBody),
});

// POST /admin/intel/ingest/confirm
router.post("/ingest/confirm", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = IngestConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", fields: parsed.error.flatten().fieldErrors });
    return;
  }

  const { source: src, facts: rawFacts } = parsed.data;
  const included = rawFacts.filter((f) => f.included !== false);

  if (included.length === 0) {
    res.status(400).json({ error: "No facts selected for import." });
    return;
  }

  // Step 1: create source (REQUIRED — no facts without sourceId)
  const [source] = await db
    .insert(intelSourcesTable)
    .values({
      ownerId,
      kind:       src.kind,
      title:      src.title,
      url:        src.url,
      capturedAt: new Date(src.capturedAt),
      notes:      src.notes,
    })
    .returning();

  const sourceId = source!.id;

  // Step 2: upsert parcels and insert parcel_events
  const writtenFacts = [];
  for (const fact of included) {
    // Find or create a parcel for this address
    let [parcel] = await db
      .select({ id: parcelsTable.id })
      .from(parcelsTable)
      .where(and(eq(parcelsTable.ownerId, ownerId), eq(parcelsTable.address, fact.address)))
      .limit(1);

    if (!parcel) {
      const [created] = await db
        .insert(parcelsTable)
        .values({
          ownerId,
          address:      fact.address,
          neighborhood: fact.neighborhood,
          city:         fact.city,
          zip:          fact.zip,
        })
        .returning({ id: parcelsTable.id });
      parcel = created!;
    }

    const payload: Record<string, unknown> = {};
    if (fact.sourceSnippet) payload["sourceSnippet"] = fact.sourceSnippet;

    const [event] = await db
      .insert(parcelEventsTable)
      .values({
        ownerId,
        parcelId:    parcel.id,
        eventType:   fact.eventType,
        eventDate:   fact.eventDate,
        amount:      fact.amount ?? null,
        description: fact.description ?? null,
        sourceId,
        confidence:  fact.confidence,
        payload,
      })
      .returning();

    writtenFacts.push(event);
  }

  res.status(201).json({ source, facts: writtenFacts });
});

// ---------------------------------------------------------------------------
// PARCELS
// ---------------------------------------------------------------------------

// GET /admin/intel/parcels
router.get("/parcels", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(parcelsTable)
    .where(eq(parcelsTable.ownerId, ownerId))
    .orderBy(asc(parcelsTable.address));
  res.json({ parcels: rows });
});

const CreateParcelBody = z.object({
  address:      z.string().min(1),
  apn:          z.string().optional().nullable(),
  city:         z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  zip:          z.string().optional().nullable(),
  lotSqft:      z.number().int().optional().nullable(),
  latitude:     z.string().optional().nullable(),
  longitude:    z.string().optional().nullable(),
});

// POST /admin/intel/parcels
router.post("/parcels", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateParcelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const [parcel] = await db
    .insert(parcelsTable)
    .values({ ownerId, ...parsed.data })
    .returning();
  res.status(201).json({ parcel });
});

// ---------------------------------------------------------------------------
// FACTS (parcel_events) — with joined parcel address and source title
// ---------------------------------------------------------------------------

// GET /admin/intel/facts?neighborhood=&eventType=&from=&to=
router.get("/facts", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select({
      id:          parcelEventsTable.id,
      ownerId:     parcelEventsTable.ownerId,
      parcelId:    parcelEventsTable.parcelId,
      address:     parcelsTable.address,
      neighborhood: parcelsTable.neighborhood,
      eventType:   parcelEventsTable.eventType,
      eventDate:   parcelEventsTable.eventDate,
      amount:      parcelEventsTable.amount,
      description: parcelEventsTable.description,
      confidence:  parcelEventsTable.confidence,
      payload:     parcelEventsTable.payload,
      sourceId:    parcelEventsTable.sourceId,
      sourceTitle: intelSourcesTable.title,
      sourceCapturedAt: intelSourcesTable.capturedAt,
      createdAt:   parcelEventsTable.createdAt,
    })
    .from(parcelEventsTable)
    .innerJoin(parcelsTable, and(
      eq(parcelEventsTable.parcelId, parcelsTable.id),
      eq(parcelsTable.ownerId, ownerId),
    ))
    .innerJoin(intelSourcesTable, eq(parcelEventsTable.sourceId, intelSourcesTable.id))
    .where(eq(parcelEventsTable.ownerId, ownerId))
    .orderBy(desc(parcelEventsTable.eventDate));
  res.json({ facts: rows });
});

// GET /admin/intel/facts/:id
router.get("/facts/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [row] = await db
    .select({
      id:          parcelEventsTable.id,
      ownerId:     parcelEventsTable.ownerId,
      parcelId:    parcelEventsTable.parcelId,
      address:     parcelsTable.address,
      neighborhood: parcelsTable.neighborhood,
      eventType:   parcelEventsTable.eventType,
      eventDate:   parcelEventsTable.eventDate,
      amount:      parcelEventsTable.amount,
      description: parcelEventsTable.description,
      confidence:  parcelEventsTable.confidence,
      payload:     parcelEventsTable.payload,
      sourceId:    parcelEventsTable.sourceId,
      sourceTitle: intelSourcesTable.title,
      sourceKind:  intelSourcesTable.kind,
      sourceUrl:   intelSourcesTable.url,
      sourceCapturedAt: intelSourcesTable.capturedAt,
      sourceNotes: intelSourcesTable.notes,
      createdAt:   parcelEventsTable.createdAt,
    })
    .from(parcelEventsTable)
    .innerJoin(parcelsTable, and(
      eq(parcelEventsTable.parcelId, parcelsTable.id),
      eq(parcelsTable.ownerId, ownerId),
    ))
    .innerJoin(intelSourcesTable, eq(parcelEventsTable.sourceId, intelSourcesTable.id))
    .where(and(eq(parcelEventsTable.id, id), eq(parcelEventsTable.ownerId, ownerId)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Fact not found" }); return; }
  res.json({ fact: row });
});

const PatchFactBody = z.object({
  eventType:   z.enum(["deed_transfer", "permit_filed", "permit_issued", "entitlement", "listing", "price_change", "sale", "withdrawal"]).optional(),
  eventDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amount:      z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  confidence:  z.enum(["verified", "reported", "estimated"]).optional(),
});

// PATCH /admin/intel/facts/:id
router.patch("/facts/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const parsed = PatchFactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const [existing] = await db
    .select({ id: parcelEventsTable.id })
    .from(parcelEventsTable)
    .where(and(eq(parcelEventsTable.id, id), eq(parcelEventsTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Fact not found" }); return; }

  const [updated] = await db
    .update(parcelEventsTable)
    .set(parsed.data)
    .where(and(eq(parcelEventsTable.id, id), eq(parcelEventsTable.ownerId, ownerId)))
    .returning();
  res.json({ fact: updated });
});

// DELETE /admin/intel/facts/:id
router.delete("/facts/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [existing] = await db
    .select({ id: parcelEventsTable.id })
    .from(parcelEventsTable)
    .where(and(eq(parcelEventsTable.id, id), eq(parcelEventsTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Fact not found" }); return; }
  await db.delete(parcelEventsTable)
    .where(and(eq(parcelEventsTable.id, id), eq(parcelEventsTable.ownerId, ownerId)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// MLS TRANSACTIONS — licensed store
// ---------------------------------------------------------------------------

// GET /admin/intel/mls-transactions
router.get("/mls-transactions", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(mlsTransactionsTable)
    .where(eq(mlsTransactionsTable.ownerId, ownerId))
    .orderBy(desc(mlsTransactionsTable.soldDate));
  res.json({ transactions: rows });
});

const CreateMlsBody = z.object({
  dataSource:       z.enum(["crmls", "brokerage"]),
  mlsNumber:        z.string().optional().nullable(),
  address:          z.string().min(1),
  neighborhood:     z.string().optional().nullable(),
  listPrice:        z.string().optional().nullable(),
  soldPrice:        z.string().optional().nullable(),
  listDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  soldDate:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  daysOnMarket:     z.number().int().optional().nullable(),
  beds:             z.string().optional().nullable(),
  baths:            z.string().optional().nullable(),
  sqft:             z.number().int().optional().nullable(),
  lotSqft:          z.number().int().optional().nullable(),
  yearBuilt:        z.number().int().optional().nullable(),
  listingBrokerage: z.string().optional().nullable(),
  sourceId:         z.string().uuid(),
});

// POST /admin/intel/mls-transactions
router.post("/mls-transactions", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateMlsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  // Verify sourceId belongs to this owner — a fact CANNOT be written without a valid sourceId
  const [src] = await db
    .select({ id: intelSourcesTable.id })
    .from(intelSourcesTable)
    .where(and(eq(intelSourcesTable.id, parsed.data.sourceId), eq(intelSourcesTable.ownerId, ownerId)))
    .limit(1);
  if (!src) {
    res.status(422).json({ error: "sourceId not found — a fact cannot be written without a valid source." });
    return;
  }
  const [tx] = await db
    .insert(mlsTransactionsTable)
    .values({ ownerId, ...parsed.data })
    .returning();
  res.status(201).json({ transaction: tx });
});

// ---------------------------------------------------------------------------
// OFF-MARKET NOTES — licensed, default excluded from reports
// ---------------------------------------------------------------------------

// GET /admin/intel/off-market-notes
router.get("/off-market-notes", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(offMarketNotesTable)
    .where(eq(offMarketNotesTable.ownerId, ownerId))
    .orderBy(desc(offMarketNotesTable.observedAt));
  res.json({ notes: rows });
});

const CreateOffMarketBody = z.object({
  address:      z.string().optional().nullable(),
  neighborhood: z.string().optional().nullable(),
  note:         z.string().min(1),
  signalType:   z.enum(["coming_soon", "quiet_listing", "owner_intent", "distress", "development"]),
  confidence:   z.enum(["verified", "reported", "estimated"]).default("reported"),
  observedAt:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// POST /admin/intel/off-market-notes
router.post("/off-market-notes", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateOffMarketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const [note] = await db
    .insert(offMarketNotesTable)
    .values({ ownerId, ...parsed.data })
    .returning();
  res.status(201).json({ note });
});

// ---------------------------------------------------------------------------
// REGULATORY EVENTS
// ---------------------------------------------------------------------------

// GET /admin/intel/regulatory-events
router.get("/regulatory-events", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(regulatoryEventsTable)
    .where(eq(regulatoryEventsTable.ownerId, ownerId))
    .orderBy(desc(regulatoryEventsTable.effectiveDate));
  res.json({ events: rows });
});

const CreateRegulatoryBody = z.object({
  topic:         z.string().min(1),
  title:         z.string().min(1),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  summary:       z.string().min(1),
  sourceId:      z.string().uuid(),
});

// POST /admin/intel/regulatory-events
router.post("/regulatory-events", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateRegulatoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const [src] = await db
    .select({ id: intelSourcesTable.id })
    .from(intelSourcesTable)
    .where(and(eq(intelSourcesTable.id, parsed.data.sourceId), eq(intelSourcesTable.ownerId, ownerId)))
    .limit(1);
  if (!src) {
    res.status(422).json({ error: "sourceId not found — a fact cannot be written without a valid source." });
    return;
  }
  const [event] = await db
    .insert(regulatoryEventsTable)
    .values({ ownerId, ...parsed.data })
    .returning();
  res.status(201).json({ event });
});

// ---------------------------------------------------------------------------
// REPORT TEMPLATES
// ---------------------------------------------------------------------------

// GET /admin/intel/report-templates
router.get("/report-templates", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(reportTemplatesTable)
    .where(eq(reportTemplatesTable.ownerId, ownerId))
    .orderBy(asc(reportTemplatesTable.name));
  res.json({ templates: rows });
});

const CreateTemplateBody = z.object({
  key:      z.enum(["monthly_intelligence", "neighborhood_report", "regulatory_alert"]),
  name:     z.string().min(1),
  sections: z.array(z.object({ key: z.string(), title: z.string(), prompt: z.string() })).default([]),
});

// POST /admin/intel/report-templates
router.post("/report-templates", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const [template] = await db
    .insert(reportTemplatesTable)
    .values({ ownerId, ...parsed.data })
    .returning();
  res.status(201).json({ template });
});

// ---------------------------------------------------------------------------
// REPORTS — CRUD
// ---------------------------------------------------------------------------

// GET /admin/intel/reports
router.get("/reports", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.ownerId, ownerId))
    .orderBy(desc(reportsTable.createdAt));
  res.json({ reports: rows });
});

const CreateReportBody = z.object({
  title:        z.string().min(1),
  templateId:   z.string().uuid().optional().nullable(),
  periodStart:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  neighborhood: z.string().optional().nullable(),
});

// POST /admin/intel/reports
router.post("/reports", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const [report] = await db
    .insert(reportsTable)
    .values({ ownerId, ...parsed.data })
    .returning();
  res.status(201).json({ report });
});

// GET /admin/intel/reports/:id — with fact refs resolved
router.get("/reports/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .limit(1);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }

  // Resolve fact refs: fetch each referenced parcel_event with its source
  type FactRef = { factId: string; table: string; token: string; formattedValue: string };
  const refs = (report.factRefs as FactRef[]) ?? [];
  const resolvedFacts: Record<string, unknown> = {};

  for (const ref of refs) {
    if (ref.table === "parcel_events") {
      const [fact] = await db
        .select({
          id:          parcelEventsTable.id,
          address:     parcelsTable.address,
          neighborhood: parcelsTable.neighborhood,
          eventType:   parcelEventsTable.eventType,
          eventDate:   parcelEventsTable.eventDate,
          amount:      parcelEventsTable.amount,
          description: parcelEventsTable.description,
          confidence:  parcelEventsTable.confidence,
          payload:     parcelEventsTable.payload,
          sourceTitle: intelSourcesTable.title,
          sourceKind:  intelSourcesTable.kind,
          sourceUrl:   intelSourcesTable.url,
          sourceCapturedAt: intelSourcesTable.capturedAt,
          sourceNotes: intelSourcesTable.notes,
        })
        .from(parcelEventsTable)
        .innerJoin(parcelsTable, eq(parcelEventsTable.parcelId, parcelsTable.id))
        .innerJoin(intelSourcesTable, eq(parcelEventsTable.sourceId, intelSourcesTable.id))
        .where(and(eq(parcelEventsTable.id, ref.factId), eq(parcelEventsTable.ownerId, ownerId)))
        .limit(1);
      if (fact) resolvedFacts[ref.factId] = fact;
    }
  }

  res.json({ report, resolvedFacts, disclosure: REPORT_DISCLOSURE });
});

// DELETE /admin/intel/reports/:id
router.delete("/reports/:id", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [existing] = await db
    .select({ id: reportsTable.id })
    .from(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Report not found" }); return; }
  await db.delete(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// REPORT GENERATION — the core pipeline
// ---------------------------------------------------------------------------

// POST /admin/intel/reports/:id/generate
router.post("/reports/:id/generate", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .limit(1);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (report.status === "published") {
    res.status(409).json({ error: "Published reports cannot be regenerated." });
    return;
  }

  // ── Step 1: assemble fact set for the period ───────────────────────────────
  // NOTE: off_market_notes are excluded by default (per spec)
  const conditions = [
    eq(parcelEventsTable.ownerId, ownerId),
    gte(parcelEventsTable.eventDate, report.periodStart),
    lte(parcelEventsTable.eventDate, report.periodEnd),
  ];

  const factRows = await db
    .select({
      id:          parcelEventsTable.id,
      address:     parcelsTable.address,
      neighborhood: parcelsTable.neighborhood,
      eventType:   parcelEventsTable.eventType,
      eventDate:   parcelEventsTable.eventDate,
      amount:      parcelEventsTable.amount,
      description: parcelEventsTable.description,
      confidence:  parcelEventsTable.confidence,
      sourceTitle: intelSourcesTable.title,
      sourceCapturedAt: intelSourcesTable.capturedAt,
    })
    .from(parcelEventsTable)
    .innerJoin(parcelsTable, and(
      eq(parcelEventsTable.parcelId, parcelsTable.id),
      eq(parcelsTable.ownerId, ownerId),
    ))
    .innerJoin(intelSourcesTable, eq(parcelEventsTable.sourceId, intelSourcesTable.id))
    .where(and(...conditions))
    .orderBy(asc(parcelEventsTable.eventDate));

  // Filter by neighborhood if specified
  const scopedFacts = report.neighborhood
    ? factRows.filter((f) => f.neighborhood === report.neighborhood)
    : factRows;

  // Refuse if insufficient facts (< 3)
  if (scopedFacts.length < 3) {
    res.status(422).json({
      error: "Insufficient facts for this period. Add at least 3 facts covering this date range before generating.",
      code:  "INSUFFICIENT_FACTS",
      count: scopedFacts.length,
    });
    return;
  }

  // ── Step 2: build token map ─────────────────────────────────────────────────
  const tokenMap = new Map<string, (typeof scopedFacts)[0]>();
  for (const fact of scopedFacts) {
    tokenMap.set(fact.id, fact);
  }

  const factSetText = scopedFacts.map((f) => {
    const amount = f.amount ? fmtAmount(f.amount) : null;
    return [
      `TOKEN: {{fact:${f.id}}}`,
      `  Address:     ${f.address}`,
      `  Event:       ${f.eventType} on ${f.eventDate}`,
      amount ? `  Amount:      ${amount}` : "",
      f.description ? `  Description: ${f.description}` : "",
      `  Confidence:  ${f.confidence}`,
      `  Source:      ${f.sourceTitle}`,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  // ── Step 3: call Anthropic ──────────────────────────────────────────────────
  const period = `${report.periodStart} to ${report.periodEnd}`;
  const scope  = report.neighborhood ?? "all neighborhoods";

  const systemPrompt = `You are an analyst writing a luxury real estate intelligence report for a Beverly Hills estate agent.
You are given a set of market facts, each assigned a token.

CRITICAL RULES — VIOLATION CAUSES REJECTION:
1. Every figure, price, date, or statistic in your report MUST be expressed using its exact token (e.g. {{fact:uuid}}).
2. You MUST NOT write any digit (0-9) outside a token. Not in prices, dates, percentages, counts, or any other context.
3. Reference only facts from the provided fact set. Do not invent or extrapolate data.
4. Write professional, analytical prose suitable for family offices and estate attorneys.
5. Output ONLY the report body in Markdown — no commentary, no preamble.`;

  const userMessage = `Write a market intelligence report for the period ${period}, scope: ${scope}.

FACT SET:
${factSetText}

Write the report body in Markdown. Use tokens (e.g. {{fact:${scopedFacts[0]!.id}}}) wherever you reference a figure from the fact set. Do not write any digit outside a token.`;

  type Msg = { role: "user" | "assistant"; content: string };

  async function callModel(messages: Msg[]): Promise<string> {
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 4096,
      system:     systemPrompt,
      messages,
    });
    const block = response.content[0];
    if (!block || block.type !== "text") throw new Error("Anthropic returned no text content");
    return block.text.trim();
  }

  const firstMessages: Msg[] = [{ role: "user", content: userMessage }];
  const draft1 = await callModel(firstMessages);

  let finalDraft: string;

  if (!noRawDigits(draft1)) {
    logger.warn({ reportId: id, draft: draft1 }, "intel-report-gen: digit rejection on attempt 1, retrying");

    const draft2 = await callModel([
      ...firstMessages,
      { role: "assistant", content: draft1 },
      {
        role: "user",
        content:
          "Your previous response contained raw digit characters outside tokens. " +
          "EVERY number must be expressed as a {{fact:uuid}} token from the fact set. " +
          "Rewrite the report now with absolutely no bare digits anywhere.",
      },
    ]);

    if (!noRawDigits(draft2)) {
      logger.warn({ reportId: id, draft: draft2 }, "intel-report-gen: digit rejection on attempt 2, surfacing failure");
      res.status(422).json({
        error:  "Report generation failed: both drafts contained digits outside tokens. Review the fact set.",
        code:   "RAW_DIGIT_IN_REPORT",
        draft1,
        draft2,
      });
      return;
    }

    finalDraft = draft2;
  } else {
    finalDraft = draft1;
  }

  // ── Step 4: build factRefs from tokens actually used ────────────────────────
  const usedTokens = [...finalDraft.matchAll(/\{\{fact:([0-9a-f-]+)\}\}/g)];
  const factRefs = usedTokens
    .map((m) => {
      const factId = m[1]!;
      const fact   = tokenMap.get(factId);
      if (!fact) return null;
      return {
        factId,
        table:          "parcel_events",
        token:          `{{fact:${factId}}}`,
        formattedValue: fact.amount ? fmtAmount(fact.amount) : fact.eventType,
      };
    })
    .filter(Boolean);

  // ── Step 5: persist ────────────────────────────────────────────────────────
  const [updated] = await db
    .update(reportsTable)
    .set({
      bodyMarkdown: finalDraft,
      factRefs:     factRefs,
      status:       "in_review",
      generatedAt:  new Date(),
    })
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .returning();

  res.json({ report: updated, factCount: scopedFacts.length, refsUsed: factRefs.length });
});

// ---------------------------------------------------------------------------
// APPROVE / PUBLISH
// ---------------------------------------------------------------------------

// POST /admin/intel/reports/:id/approve
router.post("/reports/:id/approve", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [report] = await db
    .select({ id: reportsTable.id, status: reportsTable.status })
    .from(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .limit(1);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (!["draft", "in_review"].includes(report.status)) {
    res.status(409).json({ error: `Cannot approve a report in status "${report.status}".` });
    return;
  }
  const [updated] = await db
    .update(reportsTable)
    .set({ status: "approved", approvedAt: new Date() })
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .returning();
  res.json({ report: updated });
});

// POST /admin/intel/reports/:id/publish — creates an articles row
router.post("/reports/:id/publish", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const id = req.params["id"] as string;
  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .limit(1);
  if (!report) { res.status(404).json({ error: "Report not found" }); return; }
  if (report.status !== "approved") {
    res.status(409).json({ error: "Only approved reports can be published." });
    return;
  }
  if (!report.bodyMarkdown.trim()) {
    res.status(422).json({ error: "Report has no generated content — run Generate first." });
    return;
  }

  // Substitute fact tokens with formatted values for the article body
  type FactRef = { factId: string; table: string; token: string; formattedValue: string };
  const refs = (report.factRefs as FactRef[]) ?? [];
  let articleBody = report.bodyMarkdown;
  for (const ref of refs) {
    articleBody = articleBody.replaceAll(ref.token, ref.formattedValue);
  }
  articleBody += `\n\n---\n*${REPORT_DISCLOSURE}*`;

  const slug = report.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    + "-" + Date.now().toString(36);

  const [article] = await db
    .insert(articlesTable)
    .values({
      ownerId,
      slug,
      title:       report.title,
      category:    "market",
      excerpt:     report.bodyMarkdown.slice(0, 200).replace(/\{\{[^}]+\}\}/g, "").trim(),
      body:        articleBody,
      status:      "published",
      publishedAt: new Date(),
    })
    .returning();

  const [updated] = await db
    .update(reportsTable)
    .set({ status: "published", publishedAt: new Date(), articleId: article!.id })
    .where(and(eq(reportsTable.id, id), eq(reportsTable.ownerId, ownerId)))
    .returning();

  res.json({ report: updated, article });
});

export default router;
