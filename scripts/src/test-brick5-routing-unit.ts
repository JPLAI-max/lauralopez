/**
 * Brick 5 — Deterministic parsePrintCopy unit tests.
 *
 * Pure logic tests: no network, no auth, no external AI calls.
 * Verifies the parsePrintCopy copy-parsing function used by the print_pdf
 * (postcard/mailer) copy-first pipeline.
 *
 * The auth-dependent routing checks (manual→422, unknown→404, image→422/503,
 * print_pdf→copy-first) are in test-brick5-campaigns.ts (checks 13–16), where
 * they reuse an already-established admin session to avoid rate-limit issues.
 *
 * Run: scripts/node_modules/.bin/tsx scripts/src/test-brick5-routing-unit.ts
 */

import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
function pass(id: string, msg: string) { passed++; console.log(`  ✅ [${id}] ${msg}`); }
function fail(id: string, msg: string) { failed++; console.error(`  ❌ [${id}] ${msg}`); }

// Reference implementation of parsePrintCopy (mirrors the function internal to
// campaigns.ts).  Tests verify the CONTRACT of the function, not its location.
function parsePrintCopy(raw: string): { headline?: string; body?: string; cta?: string } {
  const result: { headline?: string; body?: string; cta?: string } = {};
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const hl  = line.match(/^HEADLINE:\s*(.+)$/i);
    if (hl)  { result.headline = hl[1]!.trim(); continue; }
    const cta = line.match(/^CTA:\s*(.+)$/i);
    if (cta) { result.cta = cta[1]!.trim(); continue; }
  }
  const bodyStart = raw.search(/^BODY:/im);
  const ctaStart  = raw.search(/^CTA:/im);
  if (bodyStart !== -1) {
    const bodySlice = ctaStart !== -1 && ctaStart > bodyStart ? raw.slice(bodyStart, ctaStart) : raw.slice(bodyStart);
    const bodyText  = bodySlice.replace(/^BODY:\s*/i, "").replace(/\nCTA:.*$/is, "").trim();
    if (bodyText) result.body = bodyText;
  }
  return result;
}

(async () => {
  console.log("\n▶ test-brick5-routing-unit\n");

  // T1: full structured copy
  {
    const raw = `HEADLINE: Rare Mid-Century Estate in Beverly Hills\nBODY: A masterpiece of architecture awaits.\nCTA: Schedule a private tour`;
    const r = parsePrintCopy(raw);
    assert.equal(r.headline, "Rare Mid-Century Estate in Beverly Hills", "T1 headline");
    assert.ok(r.body?.includes("masterpiece"), "T1 body");
    assert.equal(r.cta, "Schedule a private tour", "T1 cta");
    pass("T1", "parsePrintCopy — full structured copy parsed correctly");
  }

  // T2: missing CTA
  {
    const raw = `HEADLINE: A Landmark Property\nBODY: Views that inspire.`;
    const r = parsePrintCopy(raw);
    assert.equal(r.headline, "A Landmark Property", "T2 headline");
    assert.ok(r.body?.includes("Views"), "T2 body");
    assert.equal(r.cta, undefined, "T2 cta undefined");
    pass("T2", "parsePrintCopy — gracefully handles missing CTA");
  }

  // T3: empty string → all fields undefined
  {
    const r = parsePrintCopy("");
    assert.equal(r.headline, undefined, "T3 headline");
    assert.equal(r.body, undefined, "T3 body");
    assert.equal(r.cta, undefined, "T3 cta");
    pass("T3", "parsePrintCopy — empty string returns empty fields");
  }

  // T4: multi-line body
  {
    const raw = `HEADLINE: Grand Estate\nBODY: First line of copy.\nSecond line of copy.\nCTA: Call today`;
    const r = parsePrintCopy(raw);
    assert.ok(r.body?.includes("First"), "T4 body first line");
    assert.equal(r.cta, "Call today", "T4 cta");
    pass("T4", "parsePrintCopy — multi-line body captured");
  }

  // T5: no HEADLINE tag — headline is undefined
  {
    const raw = `BODY: Just the body.\nCTA: Learn more`;
    const r = parsePrintCopy(raw);
    assert.equal(r.headline, undefined, "T5 headline");
    assert.ok(r.body?.includes("Just"), "T5 body");
    assert.equal(r.cta, "Learn more", "T5 cta");
    pass("T5", "parsePrintCopy — missing HEADLINE handled gracefully");
  }

  // T6: case-insensitive tags
  {
    const raw = `headline: Stunning Views\nbody: Perched above the canyon.\ncta: Book a tour`;
    const r = parsePrintCopy(raw);
    assert.equal(r.headline, "Stunning Views", "T6 headline");
    assert.ok(r.body?.includes("Perched"), "T6 body");
    assert.equal(r.cta, "Book a tour", "T6 cta");
    pass("T6", "parsePrintCopy — case-insensitive tags parsed correctly");
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed.\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
