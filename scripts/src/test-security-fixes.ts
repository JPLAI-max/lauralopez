/**
 * Acceptance test — Brick 2 security fixes.
 * Produces literal HTTP status + body for checks 1 and 2 as required.
 */
import { generateSync as generateTotp } from "otplib";
import { db, authEventsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const BASE = "http://localhost:80/api";

async function apiFetch(
  path: string,
  opts: RequestInit & { cookies?: string } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
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
  const all = headers.getSetCookie?.() ?? [];
  for (const c of Array.isArray(all) ? all : [all]) {
    if (c.startsWith(`${name}=`)) return c.split(";")[0];
  }
  return null;
}

async function getRecentEvents(email: string, limit = 20) {
  return db
    .select()
    .from(authEventsTable)
    .where(eq(authEventsTable.email, email))
    .orderBy(desc(authEventsTable.createdAt))
    .limit(limit);
}

async function waitForNextTimeStep() {
  const period = 30;
  const nowSec = Math.floor(Date.now() / 1000);
  const nextStepSec = (Math.floor(nowSec / period) + 1) * period;
  const waitMs = (nextStepSec - nowSec + 1) * 1000;
  console.log(`  Waiting ${(waitMs / 1000).toFixed(0)}s for TOTP time step to roll over...`);
  await new Promise<void>((r) => setTimeout(r, waitMs));
  console.log("  New time step active.");
}

async function run() {
  let passed = 0; let failed = 0;
  const testEmail = "admin@lauralopez.test";
  const testPassword = "supersecretpassword1234";

  function check(label: string, ok: boolean, detail?: unknown) {
    if (ok) { console.log(`✅ ${label}`); passed++; }
    else { console.error(`❌ ${label}`, detail ?? ""); failed++; }
  }

  // ── Setup: fresh TOTP enrollment ──────────────────────────────────────────
  console.log("\n=== SETUP: Fresh TOTP enrollment ===");

  const loginRes = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const pendingCookie = extractCookie(loginRes.headers, "totp_pending");
  if (!pendingCookie) { console.error("FATAL: could not log in"); process.exit(1); }

  // Force re-enroll (resets secret + clears lastTotpEpoch)
  const enrollRes = await apiFetch("/auth/totp/enroll", {
    method: "POST",
    cookies: pendingCookie,
  });
  if (enrollRes.status !== 200) { console.error("FATAL: enroll failed", enrollRes.body); process.exit(1); }

  const { secret } = enrollRes.body as { otpauthUrl: string; secret: string };
  console.log("  New TOTP secret enrolled, secret length:", secret.length);

  // Confirm enrollment with a valid code
  const confirmCode = generateTotp({ secret });
  const confirmRes = await apiFetch("/auth/totp/confirm", {
    method: "POST",
    cookies: pendingCookie,
    body: JSON.stringify({ code: confirmCode }),
  });
  if (confirmRes.status !== 200) { console.error("FATAL: confirm failed", confirmRes.body); process.exit(1); }
  const sidAfterEnroll = extractCookie(confirmRes.headers, "sid");
  console.log("  Enrollment confirmed. sid cookie set:", !!sidAfterEnroll);

  // Wait for the current 30-second TOTP time step to expire.
  // The enrollment confirmation just consumed one code; the next code in the same
  // 30-second window would correctly be rejected as a replay. We wait for the step
  // to roll over so checks 1-6 get a fresh time step to work with.
  await waitForNextTimeStep();

  // ── CHECK 7: No other call site tests the object directly ─────────────────
  console.log("\n=== CHECK 7: No raw object truthiness check on verifySync ===");
  const { execSync } = await import("child_process");
  const grepOutput = execSync(
    `grep -rn "totpVerify\\|verifySync\\|authenticator.verify" /home/runner/workspace/artifacts/api-server/src/ 2>/dev/null || true`,
    { encoding: "utf8" }
  );
  console.log("  Call sites found:\n  " + grepOutput.trim().split("\n").join("\n  "));
  // Every call site must NOT do `if (!totpVerify(...))` directly — they should check .valid
  const hasBadPattern = /if\s*\(\s*!totpVerify\s*\(/.test(grepOutput) ||
    /if\s*\(\s*!verifySync\s*\(/.test(grepOutput);
  check("No raw object truthiness check (all check .valid)", !hasBadPattern, grepOutput);

  // ── Fresh login to get a pending cookie for the verify tests ──────────────
  const login2 = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const pending2 = extractCookie(login2.headers, "totp_pending");
  if (!pending2) { console.error("FATAL: second login failed"); process.exit(1); }

  // ── CHECK 1: Code "000000" → 401 ──────────────────────────────────────────
  console.log("\n=== CHECK 1: Verify with code 000000 ===");
  const r1 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending2,
    body: JSON.stringify({ code: "000000" }),
  });
  console.log(`  HTTP ${r1.status}: ${JSON.stringify(r1.body)}`);
  check("000000 → 401", r1.status === 401, `got ${r1.status}`);

  // ── CHECK 2: Code "123456" → 401 ──────────────────────────────────────────
  console.log("\n=== CHECK 2: Verify with code 123456 ===");
  const r2 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending2,
    body: JSON.stringify({ code: "123456" }),
  });
  console.log(`  HTTP ${r2.status}: ${JSON.stringify(r2.body)}`);
  check("123456 → 401", r2.status === 401, `got ${r2.status}`);

  // ── CHECK 3: Valid code → 200, session issued ──────────────────────────────
  console.log("\n=== CHECK 3: Verify with valid code ===");
  const validCode = generateTotp({ secret });
  console.log(`  Generated code: ${validCode}`);
  const r3 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending2,
    body: JSON.stringify({ code: validCode }),
  });
  console.log(`  HTTP ${r3.status}: ${JSON.stringify(r3.body)}`);
  const sidCookie = extractCookie(r3.headers, "sid");
  check("Valid code → 200", r3.status === 200, `got ${r3.status}`);
  check("sid cookie issued", !!sidCookie);

  // ── CHECK 4: Replay the same code → 401, totp_replay event written ─────────
  console.log("\n=== CHECK 4: Replay same code → rejected ===");

  // Need a fresh pending cookie (old one was consumed)
  const login3 = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const pending3 = extractCookie(login3.headers, "totp_pending");
  if (!pending3) { console.error("FATAL: third login failed"); process.exit(1); }

  // Submit the same validCode again
  const r4 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending3,
    body: JSON.stringify({ code: validCode }),
  });
  console.log(`  HTTP ${r4.status}: ${JSON.stringify(r4.body)}`);
  check("Replay → 401", r4.status === 401, `got ${r4.status}`);

  const replayEvents = await getRecentEvents(testEmail);
  const hasReplayEvent = replayEvents.some((e) => e.action === "totp_replay" && !e.success);
  check("totp_replay event written to auth_events", hasReplayEvent);
  if (!hasReplayEvent) {
    console.log("  Recent events:", replayEvents.slice(0, 5).map((e) => `${e.action}/${e.success}`));
  }

  // ── CHECK 5: password_ok + totp_fail, no login success ──────────────────────
  console.log("\n=== CHECK 5: Correct password + wrong TOTP → event audit ===");
  const before5 = new Date();

  const login4 = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const pending4 = extractCookie(login4.headers, "totp_pending");

  await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending4 ?? "",
    body: JSON.stringify({ code: "999999" }),
  });

  const events5 = await db
    .select()
    .from(authEventsTable)
    .where(
      and(
        eq(authEventsTable.email, testEmail),
        // filter to events after check started
      )
    )
    .orderBy(desc(authEventsTable.createdAt))
    .limit(10);

  const recentActions = events5
    .filter((e) => e.createdAt >= before5)
    .map((e) => `${e.action}/${e.success}`);
  console.log("  Events since check start:", recentActions);

  const hasPasswordOk = recentActions.includes("password_ok/true");
  const hasTotpFail = recentActions.includes("totp_fail/false");
  const hasLoginSuccess = recentActions.includes("login/true");

  check("password_ok/true event written", hasPasswordOk);
  check("totp_fail/false event written", hasTotpFail);
  check("NO login/true event (auth incomplete)", !hasLoginSuccess, recentActions.join(", "));

  // ── CHECK 6: Full successful login → exactly ONE login/true event ──────────
  // Check 3 consumed the current time step. Wait for it to roll over before issuing
  // a fresh code, otherwise it would be correctly rejected as a replay.
  await waitForNextTimeStep();
  console.log("\n=== CHECK 6: Full successful login → exactly one login/true ===");
  const before6 = new Date();

  const login5 = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const pending5 = extractCookie(login5.headers, "totp_pending");

  const code6 = generateTotp({ secret });
  const r6 = await apiFetch("/auth/verify-totp", {
    method: "POST",
    cookies: pending5 ?? "",
    body: JSON.stringify({ code: code6 }),
  });
  console.log(`  verify-totp: HTTP ${r6.status}: ${JSON.stringify(r6.body)}`);

  const events6 = await db
    .select()
    .from(authEventsTable)
    .where(eq(authEventsTable.email, testEmail))
    .orderBy(desc(authEventsTable.createdAt))
    .limit(10);

  const recentActions6 = events6
    .filter((e) => e.createdAt >= before6)
    .map((e) => `${e.action}/${e.success}`);
  console.log("  Events since check start:", recentActions6);

  const loginSuccessCount = recentActions6.filter((a) => a === "login/true").length;
  check("Exactly ONE login/true event on full login", loginSuccessCount === 1, `found ${loginSuccessCount}`);
  check("No spurious extra events", recentActions6.length <= 3,
    `${recentActions6.length} events: ${recentActions6.join(", ")}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(48)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
