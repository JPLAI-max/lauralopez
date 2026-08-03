/**
 * Unit tests for the date engine (dates.ts).
 * Run with: pnpm --filter @workspace/api-server test:dates
 * Plain assertion script — exits 0 on pass, 1 on failure.
 */
import assert from "node:assert/strict";
import { computeMilestoneDate, US_FEDERAL_HOLIDAYS, isBusinessDay, parseIsoDate } from "./dates.js";

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ── Calendar days ────────────────────────────────────────────────────────────
console.log("computeMilestoneDate — calendar days");

test("adds calendar days forward", () => {
  assert.equal(computeMilestoneDate({ anchorDate: "2026-08-03", offsetDays: 10, direction: "after", dayType: "calendar" }), "2026-08-13");
});
test("subtracts calendar days backward", () => {
  assert.equal(computeMilestoneDate({ anchorDate: "2026-08-13", offsetDays: 10, direction: "before", dayType: "calendar" }), "2026-08-03");
});
test("handles month boundary (Aug → Sep)", () => {
  assert.equal(computeMilestoneDate({ anchorDate: "2026-08-25", offsetDays: 10, direction: "after", dayType: "calendar" }), "2026-09-04");
});
test("handles year boundary (Dec → Jan)", () => {
  assert.equal(computeMilestoneDate({ anchorDate: "2026-12-28", offsetDays: 10, direction: "after", dayType: "calendar" }), "2027-01-07");
});
test("1 day before COE", () => {
  assert.equal(computeMilestoneDate({ anchorDate: "2026-10-15", offsetDays: 1, direction: "before", dayType: "calendar" }), "2026-10-14");
});
test("zero offset returns anchor date", () => {
  assert.equal(computeMilestoneDate({ anchorDate: "2026-08-03", offsetDays: 0, direction: "after", dayType: "calendar" }), "2026-08-03");
});
test("returns null for null anchorDate", () => {
  assert.equal(computeMilestoneDate({ anchorDate: null, offsetDays: 5, direction: "after", dayType: "calendar" }), null);
});
test("returns null for undefined anchorDate", () => {
  assert.equal(computeMilestoneDate({ anchorDate: undefined, offsetDays: 5, direction: "after", dayType: "calendar" }), null);
});

// ── Business days ────────────────────────────────────────────────────────────
console.log("\ncomputeMilestoneDate — business days");

test("3 biz days after Thursday lands on Tuesday (spec check)", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-08-06", offsetDays: 3, direction: "after", dayType: "business" }),
    "2026-08-11"
  );
});
test("skips weekends going forward (Friday + 1 = Monday)", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-08-07", offsetDays: 1, direction: "after", dayType: "business" }),
    "2026-08-10"
  );
});
test("skips weekends going backward (Monday - 1 = Friday)", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-08-10", offsetDays: 1, direction: "before", dayType: "business" }),
    "2026-08-07"
  );
});
test("skips Thanksgiving 2026 (2026-11-26 in holiday list)", () => {
  assert.ok(US_FEDERAL_HOLIDAYS.has("2026-11-26"), "Thanksgiving 2026 should be in holiday list");
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-11-25", offsetDays: 1, direction: "after", dayType: "business" }),
    "2026-11-27"
  );
});
test("Jul 4 2026 observed (Fri Jul 3) + 1 biz day = Mon Jul 6", () => {
  assert.ok(US_FEDERAL_HOLIDAYS.has("2026-07-03"), "Independence Day 2026 observed should be Jul 3");
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-07-02", offsetDays: 1, direction: "after", dayType: "business" }),
    "2026-07-06"
  );
});
test("month boundary — Aug 28 + 3 biz days = Sep 2", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-08-28", offsetDays: 3, direction: "after", dayType: "business" }),
    "2026-09-02"
  );
});
test("year boundary — Dec 30 + 3 biz days = Jan 5 (skips New Year's)", () => {
  assert.ok(US_FEDERAL_HOLIDAYS.has("2027-01-01"), "New Year's 2027 should be in list");
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-12-30", offsetDays: 3, direction: "after", dayType: "business" }),
    "2027-01-05"
  );
});
test("zero business offset returns anchor", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-08-06", offsetDays: 0, direction: "after", dayType: "business" }),
    "2026-08-06"
  );
});
test("null anchor returns null for business days", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: null, offsetDays: 3, direction: "after", dayType: "business" }),
    null
  );
});
test("1 biz day before Monday = Friday", () => {
  assert.equal(
    computeMilestoneDate({ anchorDate: "2026-10-19", offsetDays: 1, direction: "before", dayType: "business" }),
    "2026-10-16"
  );
});

// ── Holiday list sanity ──────────────────────────────────────────────────────
console.log("\nholiday list sanity checks");

test("has entries for 2025–2028", () => {
  const years = Array.from(US_FEDERAL_HOLIDAYS).map((d) => d.slice(0, 4));
  assert.ok(years.includes("2025"), "should include 2025");
  assert.ok(years.includes("2026"), "should include 2026");
  assert.ok(years.includes("2027"), "should include 2027");
  assert.ok(years.includes("2028"), "should include 2028");
});
test("all entries are valid ISO dates", () => {
  for (const d of US_FEDERAL_HOLIDAYS) {
    const parsed = parseIsoDate(d);
    assert.ok(!isNaN(parsed.getTime()), `${d} should be a valid date`);
  }
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
