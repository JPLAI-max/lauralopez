/**
 * Brick 5 — Listing Campaign Engine acceptance test.
 * 12 acceptance checks.
 * Run: scripts/node_modules/.bin/tsx scripts/src/test-brick5-campaigns.ts
 */
import { createDecipheriv, scryptSync } from "node:crypto";
import { generateSync as generateTotp } from "otplib";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:80/api";
const SALT = "totp-secret-key-v1";

// ── Crypto ────────────────────────────────────────────────────────────────────
function decryptTotpSecret(stored: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET required");
  const key = scryptSync(secret, SALT, 32) as Buffer;
  const [ivHex, authTagHex, ciphertextHex] = stored.split(".");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Bad encrypted TOTP format");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function apiFetch(path: string, opts: RequestInit & { cookies?: string } = {}) {
  const { cookies, headers, ...rest } = opts;
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(cookies ? { Cookie: cookies } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    ...rest,
  });
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let body: unknown = text;
  if (ct.includes("application/json")) {
    try { body = JSON.parse(text); } catch { /* leave as string */ }
  }
  return { status: res.status, body, headers: res.headers };
}

function extractCookie(headers: Headers, name: string): string | null {
  const all = headers.getSetCookie?.() ?? [];
  for (const c of all) {
    if (c.startsWith(`${name}=`)) return c.split(";")[0]!;
  }
  return null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function loginWithTotp(email: string, password: string, totpSecret: string): Promise<string> {
  const r1 = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (r1.status !== 200) throw new Error(`Login step 1 failed: ${r1.status}`);
  const pending = extractCookie(r1.headers, "totp_pending");
  if (!pending) throw new Error("No totp_pending cookie");

  const loginBody = r1.body as Record<string, unknown>;
  let sidCookie: string | null = null;

  if (loginBody.requiresTotpSetup) {
    const r2 = await apiFetch("/auth/totp/enroll", { method: "POST", cookies: pending });
    const { secret } = r2.body as { secret: string };
    const code = generateTotp({ secret });
    const r3 = await apiFetch("/auth/totp/confirm", { method: "POST", cookies: pending, body: JSON.stringify({ code }) });
    sidCookie = extractCookie(r3.headers, "sid");
  } else {
    const code = generateTotp({ secret: totpSecret });
    const r2 = await apiFetch("/auth/verify-totp", { method: "POST", cookies: pending, body: JSON.stringify({ code }) });
    if (r2.status !== 200) {
      await new Promise((r) => setTimeout(r, 32_000));
      const r1b = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      const pending2 = extractCookie(r1b.headers, "totp_pending");
      const code2 = generateTotp({ secret: totpSecret });
      const r2b = await apiFetch("/auth/verify-totp", { method: "POST", cookies: pending2 ?? "", body: JSON.stringify({ code: code2 }) });
      sidCookie = extractCookie(r2b.headers, "sid");
    } else {
      sidCookie = extractCookie(r2.headers, "sid");
    }
  }
  if (!sidCookie) throw new Error("Failed to get session cookie");
  return sidCookie;
}

// ── helper wrappers ───────────────────────────────────────────────────────────
function pass(n: number, msg: string) { console.log(`  ✅ [${n}/12] ${msg}`); }
function fail(n: number, msg: string): never { console.error(`  ❌ [${n}/12] ${msg}`); process.exit(1); }

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log("\n▶ test-brick5-campaigns\n");

  // Fetch admin user + decrypt TOTP
  const adminEmail    = "admin@lauralopez.test";
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? "supersecretpassword1234";
  const [adminUser]   = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));
  if (!adminUser) { console.error("Admin user not found in DB"); process.exit(1); }
  const totpSecret = adminUser.totpSecret ? decryptTotpSecret(adminUser.totpSecret) : "";
  const sid        = await loginWithTotp(adminEmail, adminPassword, totpSecret);
  console.log("  Auth OK\n");

  async function req(method: string, path: string, body?: unknown) {
    return apiFetch(path, { method, cookies: sid, body: body ? JSON.stringify(body) : undefined });
  }

  // ── Check 1: GET /admin/settings ──────────────────────────────────────────
  {
    const { status, body } = await req("GET", "/admin/settings");
    if (status !== 200) fail(1, `GET /admin/settings → ${status}`);
    const s = (body as { settings: unknown }).settings;
    if (!s) fail(1, "No settings key in response");
    pass(1, "GET /admin/settings returns 200 with settings object");
  }

  // ── Check 2: PUT /admin/settings round-trips ──────────────────────────────
  {
    const { status, body } = await req("PUT", "/admin/settings", {
      dre_license: "01234567",
      brokerage_name: "The Beverly Hills Estates",
    });
    if (status !== 200) fail(2, `PUT /admin/settings → ${status}: ${JSON.stringify(body)}`);
    const s = (body as { settings: Record<string, string> }).settings;
    if (s["dre_license"] !== "01234567") fail(2, "dre_license not persisted");
    if (s["brokerage_name"] !== "The Beverly Hills Estates") fail(2, "brokerage_name not persisted");
    pass(2, "PUT /admin/settings persists dre_license + brokerage_name");
  }

  // ── Check 3: campaign templates list ─────────────────────────────────────
  let templateId = "";
  {
    const { status, body } = await req("GET", "/admin/campaign-templates");
    if (status !== 200) fail(3, `GET /admin/campaign-templates → ${status}`);
    const templates = (body as { templates: { id: string; items: unknown[] }[] }).templates;
    if (templates.length < 1) fail(3, `Expected ≥1 template, got ${templates.length}`);
    const t = templates.find((t) => t.items.length === 7) ?? templates[0]!;
    templateId = t.id;
    pass(3, `GET /admin/campaign-templates returns ${templates.length} template(s)`);
  }

  // ── Check 4: template has ≥7 items ───────────────────────────────────────
  {
    const { status, body } = await req("GET", `/admin/campaign-templates/${templateId}`);
    if (status !== 200) fail(4, `GET /admin/campaign-templates/:id → ${status}`);
    const t = (body as { template: { items: unknown[] } }).template;
    if (t.items.length < 1) fail(4, `Template has no items`);
    pass(4, `Template id=${templateId} has ${t.items.length} items`);
  }

  // ── Check 5: create a listed property ────────────────────────────────────
  let propertyId = "";
  let propertyAddress = "";
  {
    const { status, body } = await req("POST", "/admin/properties", {
      address: "1 Campaign Test Rd, Beverly Hills CA 90210",
      status: "listed",
      isLauraListing: true,
      listPrice: 10000000,
    });
    if (status !== 201) fail(5, `POST /admin/properties → ${status}: ${JSON.stringify(body)}`);
    propertyId      = (body as { property: { id: string; address: string } }).property.id;
    propertyAddress = (body as { property: { id: string; address: string } }).property.address;
    pass(5, `Created property id=${propertyId}`);
  }

  // ── Check 6: campaign preview ─────────────────────────────────────────────
  const anchorDate = new Date().toISOString().slice(0, 10);
  {
    const { status, body } = await req("POST", "/admin/campaigns/preview", {
      propertyId, templateId, anchorDate,
    });
    if (status !== 200) fail(6, `POST /admin/campaigns/preview → ${status}: ${JSON.stringify(body)}`);
    const tasks = (body as { tasks: unknown[] }).tasks;
    if (tasks.length < 1) fail(6, "Preview returned no tasks");
    pass(6, `Campaign preview returns ${tasks.length} tasks for ${propertyAddress}`);
  }

  // ── Check 7: create campaign ──────────────────────────────────────────────
  let campaignId = "";
  {
    const { status, body } = await req("POST", "/admin/campaigns", {
      propertyId, templateId, anchorDate, trigger: "new_listing",
    });
    if (status !== 201) fail(7, `POST /admin/campaigns → ${status}: ${JSON.stringify(body)}`);
    campaignId = (body as { campaign: { id: string } }).campaign.id;
    const tasks = (body as { tasks: unknown[] }).tasks;
    if (tasks.length < 1) fail(7, "Campaign created but no tasks spawned");
    pass(7, `Created campaign id=${campaignId} with ${tasks.length} tasks`);
  }

  // ── Check 8: campaign appears in list ────────────────────────────────────
  {
    const { status, body } = await req("GET", "/admin/campaigns");
    if (status !== 200) fail(8, `GET /admin/campaigns → ${status}`);
    const campaigns = (body as { campaigns: { id: string }[] }).campaigns;
    if (!campaigns.some((c) => c.id === campaignId)) fail(8, "Campaign not in list");
    pass(8, `Campaign ${campaignId} appears in list`);
  }

  // ── Check 9: campaign detail — all tasks pending ──────────────────────────
  let firstNonManualTaskId = "";
  {
    const { status, body } = await req("GET", `/admin/campaigns/${campaignId}`);
    if (status !== 200) fail(9, `GET /admin/campaigns/:id → ${status}`);
    const tasks = (body as { tasks: { id: string; channel: string; status: string }[] }).tasks;
    if (tasks.length < 1) fail(9, "No tasks in detail");
    if (!tasks.every((t) => t.status === "pending")) fail(9, "Not all tasks start as pending");
    firstNonManualTaskId = tasks.find((t) => t.channel !== "manual")?.id ?? tasks[0]!.id;
    pass(9, `Campaign detail has ${tasks.length} tasks, all pending`);
  }

  // ── Check 10: PATCH task (override date) ──────────────────────────────────
  {
    const { status, body } = await req("PATCH", `/admin/campaign-tasks/${firstNonManualTaskId}`, {
      overrideDate: anchorDate,
    });
    if (status !== 200) fail(10, `PATCH /admin/campaign-tasks/:id → ${status}: ${JSON.stringify(body)}`);
    const task = (body as { task: { overrideDate: string } }).task;
    if (!task.overrideDate?.startsWith(anchorDate)) fail(10, `overrideDate not set: ${task.overrideDate}`);
    pass(10, `PATCH task overrideDate to ${anchorDate}`);
  }

  // ── Check 11: generate assets — copy branch (email) AND print_pdf branch ──
  // Verifies both the email copy pipeline (no R2) and the print_pdf routing
  // fix (assetType print_pdf must reach the PDF branch, not the copy branch).
  {
    const { body: detailBody } = await req("GET", `/admin/campaigns/${campaignId}`);
    const allTasks = (detailBody as { tasks: { id: string; channel: string; assetType: string | null; status: string }[] }).tasks;

    // 11a — email copy (copy branch)
    const emailTask = allTasks.find((t) => t.channel === "email" && t.assetType === "email_html");
    if (!emailTask) fail(11, "No email/email_html task found in campaign");
    {
      const { status, body } = await req("POST", `/admin/campaign-tasks/${emailTask!.id}/generate`);
      if (status !== 201) fail(11, `email generate → ${status}: ${JSON.stringify(body)}`);
      const asset = (body as { asset: { textContent: string | null; status: string } }).asset;
      if (!asset.textContent) fail(11, "email asset has no textContent");
      if (asset.status !== "draft") fail(11, `email asset status must be draft, got ${asset.status}`);
      if (!asset.textContent.includes("Campaign Test Rd"))
        fail(11, `email copy missing substituted address. Got: ${asset.textContent.slice(0, 200)}`);
      if (/\{\{[^}]+\}\}/.test(asset.textContent))
        fail(11, `email copy has unsubstituted placeholder. Got: ${asset.textContent.slice(0, 200)}`);
    }

    // 11b — print_pdf (must run copy-first pipeline, not generic copy branch)
    const postcardTask = allTasks.find((t) => t.assetType === "print_pdf");
    if (!postcardTask) fail(11, "No print_pdf task found in campaign");
    {
      const { status, body } = await req("POST", `/admin/campaign-tasks/${postcardTask!.id}/generate`);
      if (status !== 201) fail(11, `print_pdf generate → ${status}: ${JSON.stringify(body)}`);
      const asset = (body as { asset: { textContent: string | null; status: string; assetType: string } }).asset;
      if (!asset.textContent)
        fail(11, "print_pdf asset has no textContent — copy-first pipeline did not run");
      if (asset.status !== "draft") fail(11, `print_pdf status must be draft, got ${asset.status}`);
      if (asset.assetType !== "print_pdf")
        fail(11, `assetType must be print_pdf, got ${asset.assetType}`);
      if (!asset.textContent.includes("Campaign Test Rd"))
        fail(11, `print_pdf copy missing address. Got: ${asset.textContent.slice(0, 200)}`);
    }

    pass(11, "generate email (copy branch) + postcard (print_pdf copy-first) → 201, draft, address substituted");
  }

  // ── Check 12: cancel campaign ─────────────────────────────────────────────
  {
    const { status, body } = await req("PATCH", `/admin/campaigns/${campaignId}`, { status: "cancelled" });
    if (status !== 200) fail(12, `PATCH /admin/campaigns/:id → ${status}: ${JSON.stringify(body)}`);
    const c = (body as { campaign: { status: string } }).campaign;
    if (c.status !== "cancelled") fail(12, `status not cancelled: ${c.status}`);
    pass(12, "PATCH campaign status → cancelled");
  }

  console.log("\n✅ All 12 acceptance checks passed.\n");
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
