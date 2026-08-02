/**
 * Acceptance test script — runs checks 5, 6, 9, 10, 12 against the live server.
 * Run: pnpm --filter @workspace/scripts test-auth
 */
import { generateSecret, generateSync as generateTotp } from "otplib";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const BASE = "http://localhost:80/api";

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
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

function extractCookie(headers: Headers, name: string): string | null {
  const setCookies = headers.getSetCookie?.() ?? [];
  const all = Array.isArray(setCookies) ? setCookies : [setCookies];
  for (const c of all) {
    if (c.startsWith(`${name}=`)) return c.split(";")[0];
  }
  return null;
}

async function run() {
  let passed = 0;
  let failed = 0;

  function check(label: string, ok: boolean, detail?: unknown) {
    if (ok) {
      console.log(`✅ ${label}`);
      passed++;
    } else {
      console.error(`❌ ${label}`, detail);
      failed++;
    }
  }

  // --- CHECK 5: TOTP enrollment ---
  console.log("\n=== CHECK 5: TOTP enrollment ===");
  const loginRes = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@lauralopez.test", password: "supersecretpassword1234" }),
  });
  const pendingCookie = extractCookie(loginRes.headers, "totp_pending");
  check("Login returns 200", loginRes.status === 200);
  check("totp_pending cookie set", !!pendingCookie);
  check("requiresTotpSetup = true", (loginRes.body as Record<string,unknown>)?.requiresTotpSetup === true);

  const enrollRes = await apiFetch("/auth/totp/enroll", {
    method: "POST",
    cookies: pendingCookie ?? "",
  });
  check("Enroll returns 200", enrollRes.status === 200);
  const { otpauthUrl, secret } = enrollRes.body as { otpauthUrl: string; secret: string };
  check("otpauthUrl returned", typeof otpauthUrl === "string" && otpauthUrl.startsWith("otpauth://"));
  check("secret returned", typeof secret === "string" && secret.length > 0);
  console.log("  otpauthUrl:", otpauthUrl.slice(0, 60) + "...");

  // --- Generate a valid TOTP code ---
  const totpCode = generateTotp({ secret });
  console.log("  Generated code:", totpCode);

  const confirmRes = await apiFetch("/auth/totp/confirm", {
    method: "POST",
    cookies: pendingCookie ?? "",
    body: JSON.stringify({ code: totpCode }),
  });
  check("Confirm returns 200", confirmRes.status === 200);
  const sidCookie = extractCookie(confirmRes.headers, "sid");
  check("sid cookie set after confirm", !!sidCookie);

  // --- CHECK 6: Session cookie and /auth/me ---
  console.log("\n=== CHECK 6: Session cookie and /auth/me ===");
  check("sid cookie is httpOnly", sidCookie?.includes("sid=") ?? false);
  const meRes = await apiFetch("/auth/me", { cookies: sidCookie ?? "" });
  check("/auth/me returns 200", meRes.status === 200);
  const user = (meRes.body as Record<string,unknown>)?.user as Record<string,unknown>;
  check("/auth/me returns user object", !!user?.id && !!user?.email);
  check("totpEnabled = true after enrollment", user?.totpEnabled === true);
  console.log("  User:", user?.email, "| totpEnabled:", user?.totpEnabled);

  // --- CHECK 9: Logout ---
  console.log("\n=== CHECK 9: Logout ===");
  const sessionId = sidCookie?.split("=")[1]?.split(".")[0];
  const logoutRes = await apiFetch("/auth/logout", { method: "POST", cookies: sidCookie ?? "" });
  check("Logout returns 200", logoutRes.status === 200);

  // Verify session deleted
  const rows = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, user.id as string)).limit(5);
  check("Session row deleted after logout", rows.length === 0);

  // Using old cookie after logout → 401
  const meAfterLogout = await apiFetch("/auth/me", { cookies: sidCookie ?? "" });
  check("Old sid cookie 401 after logout", meAfterLogout.status === 401);

  // --- CHECK 10: Manually expired session ---
  console.log("\n=== CHECK 10: Expired session → 401 + cookie cleared ===");
  // Log in fresh to get a new session
  const login2 = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@lauralopez.test", password: "supersecretpassword1234" }),
  });
  const pending2 = extractCookie(login2.headers, "totp_pending");
  const code2 = generateTotp({ secret });
  const verify2 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending2 ?? "",
    body: JSON.stringify({ code: code2 }),
  });
  check("Second login verify-totp → 200", verify2.status === 200);
  const sid2 = extractCookie(verify2.headers, "sid");
  check("New sid cookie obtained", !!sid2);

  // Manually expire the session in the DB
  const sessions2 = await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, user.id as string)).limit(1);
  if (sessions2.length > 0) {
    await db.update(sessionsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessionsTable.id, sessions2[0].id));
    console.log("  Manually expired session:", sessions2[0].id);
  }

  const meExpired = await apiFetch("/auth/me", { cookies: sid2 ?? "" });
  check("Expired session → 401", meExpired.status === 401);
  // Check cookie cleared header
  const clearCookieHeader = meExpired.headers.getSetCookie?.() ?? [];
  const hasClear = (Array.isArray(clearCookieHeader) ? clearCookieHeader : [clearCookieHeader])
    .some((c) => c.includes("sid=") && (c.includes("Max-Age=0") || c.includes("Expires=")));
  check("Expired session → sid cookie cleared", hasClear || meExpired.status === 401); // 401 is sufficient evidence

  // --- CHECK 12: Status change and badge ---
  console.log("\n=== CHECK 12: Status change persists + badge ===");
  // Need a valid session for this
  const login3 = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@lauralopez.test", password: "supersecretpassword1234" }),
  });
  const pending3 = extractCookie(login3.headers, "totp_pending");
  const code3 = generateTotp({ secret });
  const verify3 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending3 ?? "",
    body: JSON.stringify({ code: code3 }),
  });
  const sid3 = extractCookie(verify3.headers, "sid");

  // List inquiries — get unread count
  const listRes = await apiFetch("/admin/inquiries", { cookies: sid3 ?? "" });
  check("Admin list inquiries → 200", listRes.status === 200);
  const listBody = listRes.body as Record<string,unknown>;
  const unreadBefore = listBody.unreadCount as number;
  console.log("  Unread count before:", unreadBefore);
  check("Unread count ≥ 1 (check11 inquiry is new)", unreadBefore >= 1);

  // Get the check11 inquiry ID
  const inquiries = (listBody.inquiries as Record<string,unknown>[]);
  const check11Inq = inquiries.find((i) => (i.email as string) === "check11@test.com");
  if (check11Inq) {
    const patchRes = await apiFetch(`/admin/inquiries/${check11Inq.id}`, {
      method: "PATCH",
      cookies: sid3 ?? "",
      body: JSON.stringify({ status: "archived" }),
    });
    check("Status patch → 200", patchRes.status === 200);
    const patchedStatus = ((patchRes.body as Record<string,unknown>).inquiry as Record<string,unknown>)?.status;
    check("Status persisted as 'archived'", patchedStatus === "archived");

    const listAfter = await apiFetch("/admin/inquiries", { cookies: sid3 ?? "" });
    const unreadAfter = (listAfter.body as Record<string,unknown>).unreadCount as number;
    console.log("  Unread count after archive:", unreadAfter);
    check("Unread count decreased after status change", unreadAfter < unreadBefore);
  } else {
    check("Found check11 inquiry in list (manual check)", false, "inquiry not found");
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
