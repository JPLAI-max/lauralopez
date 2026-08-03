import { Router, type IRouter, type Request, type Response } from "express";
import { db, articlesTable } from "@workspace/db";
import { eq, desc, and, ne, SQL } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Slug generation helper
// ---------------------------------------------------------------------------
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// GET /admin/articles  — all (draft + published), newest first, scoped by owner
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const status   = typeof req.query.status   === "string" ? req.query.status   : undefined;

  const wheres: SQL[] = [eq(articlesTable.ownerId, ownerId)];
  if (category) wheres.push(eq(articlesTable.category, category));
  if (status)   wheres.push(eq(articlesTable.status,   status));

  const articles = await db
    .select()
    .from(articlesTable)
    .where(and(...wheres))
    .orderBy(desc(articlesTable.updatedAt))
    .limit(500);

  res.json({ articles });
});

// ---------------------------------------------------------------------------
// POST /admin/articles
// ---------------------------------------------------------------------------
const CreateArticleBody = z.object({
  title:       z.string().min(1).max(500),
  slug:        z.string().min(1).max(200).optional(),
  category:    z.enum(["neighborhood", "regulatory", "architecture", "insurance", "market"]),
  excerpt:     z.string().min(1),
  body:        z.string().min(1),
  heroMediaId: z.string().uuid().nullable().optional(),
  status:      z.enum(["draft", "published"]).default("draft"),
});

router.post("/", async (req: Request, res: Response) => {
  const parsed = CreateArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const data    = parsed.data;
  const ownerId = req.user!.id;
  const slug    = data.slug ?? titleToSlug(data.title);

  // Slug uniqueness is site-wide (public URLs must be globally unique)
  const [existing] = await db
    .select({ id: articlesTable.id })
    .from(articlesTable)
    .where(eq(articlesTable.slug, slug));
  if (existing) {
    res.status(409).json({ error: "Slug already exists. Choose a different slug." });
    return;
  }

  const publishedAt = data.status === "published" ? new Date() : null;

  const [article] = await db
    .insert(articlesTable)
    .values({
      ownerId,
      slug,
      title:       data.title,
      category:    data.category,
      excerpt:     data.excerpt,
      body:        data.body,
      heroMediaId: data.heroMediaId ?? null,
      status:      data.status,
      publishedAt,
    })
    .returning();

  res.status(201).json({ article });
});

// ---------------------------------------------------------------------------
// GET /admin/articles/slug-check?slug=xxx&excludeId=xxx
// Scoped to owner's articles — slug constraint is still global via DB unique index
// ---------------------------------------------------------------------------
router.get("/slug-check", async (req: Request, res: Response) => {
  const slug      = typeof req.query.slug      === "string" ? req.query.slug      : undefined;
  const excludeId = typeof req.query.excludeId === "string" ? req.query.excludeId : undefined;
  if (!slug) {
    res.status(400).json({ error: "slug is required" });
    return;
  }
  // Check global uniqueness (slug is a site-wide unique key)
  const wheres: SQL[] = [eq(articlesTable.slug, slug)];
  if (excludeId) wheres.push(ne(articlesTable.id, excludeId));

  const [existing] = await db
    .select({ id: articlesTable.id })
    .from(articlesTable)
    .where(and(...wheres));
  res.json({ available: !existing, suggested: existing ? `${slug}-${Date.now()}` : slug });
});

// ---------------------------------------------------------------------------
// GET /admin/articles/:id  — owner-scoped
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [article] = await db
    .select()
    .from(articlesTable)
    .where(and(eq(articlesTable.id, id), eq(articlesTable.ownerId, ownerId)));
  if (!article) {
    res.status(404).json({ error: "Article not found." });
    return;
  }
  res.json({ article });
});

// ---------------------------------------------------------------------------
// PATCH /admin/articles/:id  — owner-scoped
// ---------------------------------------------------------------------------
const PatchArticleBody = z.object({
  title:       z.string().min(1).max(500).optional(),
  slug:        z.string().min(1).max(200).optional(),
  category:    z.enum(["neighborhood", "regulatory", "architecture", "insurance", "market"]).optional(),
  excerpt:     z.string().min(1).optional(),
  body:        z.string().min(1).optional(),
  heroMediaId: z.string().uuid().nullable().optional(),
  status:      z.enum(["draft", "published"]).optional(),
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const parsed = PatchArticleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }

  // Check slug uniqueness if slug is being changed (global — site-wide unique)
  if (parsed.data.slug) {
    const [existing] = await db
      .select({ id: articlesTable.id })
      .from(articlesTable)
      .where(and(eq(articlesTable.slug, parsed.data.slug), ne(articlesTable.id, id)));
    if (existing) {
      res.status(409).json({ error: "Slug already exists." });
      return;
    }
  }

  const [current] = await db
    .select()
    .from(articlesTable)
    .where(and(eq(articlesTable.id, id), eq(articlesTable.ownerId, ownerId)));
  if (!current) {
    res.status(404).json({ error: "Article not found." });
    return;
  }

  const updates: Partial<typeof articlesTable.$inferInsert> = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  if (parsed.data.status === "published" && current.status === "draft") {
    updates.publishedAt = new Date();
  }
  if (parsed.data.status === "draft") {
    updates.publishedAt = null;
  }

  const [article] = await db
    .update(articlesTable)
    .set(updates)
    .where(and(eq(articlesTable.id, id), eq(articlesTable.ownerId, ownerId)))
    .returning();

  res.json({ article });
});

// ---------------------------------------------------------------------------
// DELETE /admin/articles/:id  — owner-scoped
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response) => {
  const id      = req.params["id"] as string;
  const ownerId = req.user!.id;

  const [article] = await db
    .select({ id: articlesTable.id })
    .from(articlesTable)
    .where(and(eq(articlesTable.id, id), eq(articlesTable.ownerId, ownerId)));
  if (!article) {
    res.status(404).json({ error: "Article not found." });
    return;
  }
  await db
    .delete(articlesTable)
    .where(and(eq(articlesTable.id, id), eq(articlesTable.ownerId, ownerId)));
  res.json({ ok: true });
});

export default router;
