/**
 * Public content routes — no auth required.
 * Served under /api/content
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db, articlesTable, propertiesTable, imageSlotsTable, mediaTable } from "@workspace/db";
import { eq, and, desc, asc, lte } from "drizzle-orm";
import { isConfigured, publicUrl } from "../lib/storage";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a media row's primary URL.
 * - local: storageKey IS the public path (e.g. "/images/top-pick-1.png")
 * - r2:    prefix with R2_PUBLIC_BASE_URL; return null when R2 not configured
 */
function resolveMediaUrl(
  storageKey:      string,
  derivatives:     Record<string, string>,
  storageProvider: string,
  preferWidth = 960,
): string | null {
  if (storageProvider === "local") return storageKey;
  if (!isConfigured()) return null;
  const widths = [preferWidth, 480, 960, 1440, 2400];
  for (const w of widths) {
    if (derivatives[String(w)]) return publicUrl(derivatives[String(w)]);
  }
  return publicUrl(storageKey);
}

/**
 * Build a srcset string for responsive images.
 * Local files have no derivatives — srcset is always null for them.
 */
function resolvedSrcset(
  derivatives:     Record<string, string>,
  storageProvider: string,
): string | null {
  if (storageProvider === "local") return null;
  if (!isConfigured()) return null;
  const entries = Object.entries(derivatives)
    .map(([w, key]) => `${publicUrl(key)} ${w}w`)
    .join(", ");
  return entries || null;
}

async function attachMediaToProperty(p: typeof propertiesTable.$inferSelect) {
  let heroUrl: string | null = null;
  let heroAlt: string | null = null;
  let heroFocalX: string | null = null;
  let heroFocalY: string | null = null;
  let heroSrcset: string | null = null;
  if (p.heroMediaId) {
    const [m] = await db.select().from(mediaTable).where(eq(mediaTable.id, p.heroMediaId));
    if (m) {
      const derivs = m.derivatives as Record<string, string>;
      const sp     = m.storageProvider as string;
      heroUrl    = resolveMediaUrl(m.storageKey, derivs, sp);
      heroSrcset = resolvedSrcset(derivs, sp);
      heroAlt    = m.altText ?? p.address;
      heroFocalX = m.focalX as string;
      heroFocalY = m.focalY as string;
    }
  }
  return { ...p, heroUrl, heroSrcset, heroAlt, heroFocalX, heroFocalY };
}

// ---------------------------------------------------------------------------
// GET /api/content/articles  — published only, paginated
// ---------------------------------------------------------------------------
router.get("/articles", async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(50, parseInt(req.query.pageSize as string) || 20);
  const category = req.query.category as string | undefined;
  const offset = (page - 1) * pageSize;

  const baseConditions = [eq(articlesTable.status, "published")];
  if (category) baseConditions.push(eq(articlesTable.category, category));

  const articles = await db
    .select({
      id: articlesTable.id,
      slug: articlesTable.slug,
      title: articlesTable.title,
      category: articlesTable.category,
      excerpt: articlesTable.excerpt,
      heroMediaId: articlesTable.heroMediaId,
      publishedAt: articlesTable.publishedAt,
    })
    .from(articlesTable)
    .where(and(...baseConditions))
    .orderBy(desc(articlesTable.publishedAt))
    .limit(pageSize)
    .offset(offset);

  res.json({ articles, page, pageSize });
});

// ---------------------------------------------------------------------------
// GET /api/content/articles/:slug
// ---------------------------------------------------------------------------
router.get("/articles/:slug", async (req: Request, res: Response) => {
  const slug = req.params["slug"] as string;
  const [article] = await db
    .select()
    .from(articlesTable)
    .where(
      and(
        eq(articlesTable.slug, slug),
        eq(articlesTable.status, "published"),
      ),
    );

  if (!article) {
    res.status(404).json({ error: "Article not found." });
    return;
  }

  let heroUrl: string | null = null;
  let heroAlt: string | null = null;
  if (article.heroMediaId) {
    const [m] = await db.select().from(mediaTable).where(eq(mediaTable.id, article.heroMediaId));
    if (m) {
      heroUrl = resolveMediaUrl(m.storageKey, m.derivatives as Record<string, string>, m.storageProvider as string);
      heroAlt = m.altText ?? article.title;
    }
  }

  res.json({ article: { ...article, heroUrl, heroAlt } });
});

// ---------------------------------------------------------------------------
// GET /api/content/properties  — public, filter by status
// ---------------------------------------------------------------------------
router.get("/properties", async (req: Request, res: Response) => {
  const statusParam = req.query.status as string | undefined;

  // Default: show picks and listed (not sold, not archived)
  let rows: (typeof propertiesTable.$inferSelect)[];
  if (statusParam) {
    const statuses = statusParam.split(",").map((s) => s.trim());
    rows = await db
      .select()
      .from(propertiesTable)
      .where(and(eq(propertiesTable.archived, false)))
      .orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
    rows = rows.filter((r) => statuses.includes(r.status));
  } else {
    rows = await db
      .select()
      .from(propertiesTable)
      .where(and(eq(propertiesTable.archived, false)))
      .orderBy(asc(propertiesTable.sortOrder), desc(propertiesTable.createdAt));
    rows = rows.filter((r) => r.status === "pick" || r.status === "listed");
  }

  const enriched = await Promise.all(rows.map(attachMediaToProperty));
  res.json({ properties: enriched });
});

// ---------------------------------------------------------------------------
// GET /api/content/slots  — all slots with resolved current media
// ---------------------------------------------------------------------------
router.get("/slots", async (_req: Request, res: Response) => {
  const slots = await db.select().from(imageSlotsTable);

  const enriched = await Promise.all(
    slots.map(async (slot) => {
      let currentMedia: {
        id: string;
        url: string | null;
        srcset: string | null;
        alt: string | null;
        focalX: string;
        focalY: string;
      } | null = null;

      if (slot.currentMediaId) {
        const [m] = await db
          .select()
          .from(mediaTable)
          .where(eq(mediaTable.id, slot.currentMediaId));
        if (m) {
          const derivs = m.derivatives as Record<string, string>;
          const sp     = m.storageProvider as string;
          currentMedia = {
            id:     m.id,
            url:    resolveMediaUrl(m.storageKey, derivs, sp),
            srcset: resolvedSrcset(derivs, sp),
            alt:    m.altText ?? "",
            focalX: m.focalX as string,
            focalY: m.focalY as string,
          };
        }
      }

      return { ...slot, currentMedia };
    }),
  );

  res.json({ slots: enriched });
});

export default router;
