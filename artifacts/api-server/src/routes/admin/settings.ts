import { Router, type IRouter, type Request, type Response } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helper — used by asset generators
// ---------------------------------------------------------------------------
export async function getSettingOrFail(
  ownerId: string,
  key: string,
): Promise<string> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(and(eq(settingsTable.ownerId, ownerId), eq(settingsTable.key, key)))
    .limit(1);
  if (!row || !row.value.trim()) {
    throw Object.assign(
      new Error(`Setting "${key}" is required but not configured.`),
      { code: "SETTING_MISSING", key, status: 422 },
    );
  }
  return row.value;
}

// ---------------------------------------------------------------------------
// GET /admin/settings — list all settings for owner
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response): Promise<void> => {
  const ownerId = req.user!.id;
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.ownerId, ownerId));

  // Return as object map
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

// ---------------------------------------------------------------------------
// PUT /admin/settings — upsert one or more key/value pairs
// ---------------------------------------------------------------------------
const PutSettingsBody = z.record(z.string().min(1), z.string());

router.put("/", async (req: Request, res: Response): Promise<void> => {
  const parsed = PutSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Body must be a key/value object." });
    return;
  }
  const ownerId = req.user!.id;
  const now = new Date();
  for (const [key, value] of Object.entries(parsed.data)) {
    await db
      .insert(settingsTable)
      .values({ ownerId, key, value, updatedAt: now })
      .onConflictDoUpdate({
        target: [settingsTable.ownerId, settingsTable.key],
        set: { value, updatedAt: now },
      });
  }
  // Return updated map
  const rows = await db
    .select({ key: settingsTable.key, value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.ownerId, ownerId));
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

export default router;
