/**
 * Date engine for transaction milestone computation.
 *
 * computeMilestoneDate({ anchorDate, offsetDays, direction, dayType })
 *   - calendar: add/subtract calendar days
 *   - business: skip weekends and US federal holidays
 *   - null anchorDate → null (never guess an anchor)
 */

// ---------------------------------------------------------------------------
// US Federal Holiday list — covers 2025–2028
// Observed dates used when the holiday falls on a weekend.
// ---------------------------------------------------------------------------
const US_FEDERAL_HOLIDAYS = new Set<string>([
  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-20", // Martin Luther King Jr. Day
  "2025-02-17", // Presidents' Day
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-10-13", // Columbus Day
  "2025-11-11", // Veterans Day
  "2025-11-27", // Thanksgiving Day
  "2025-12-25", // Christmas Day

  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed; Jul 4 is Saturday)
  "2026-09-07", // Labor Day
  "2026-10-12", // Columbus Day
  "2026-11-11", // Veterans Day
  "2026-11-26", // Thanksgiving Day
  "2026-12-25", // Christmas Day

  // 2027
  "2027-01-01", // New Year's Day
  "2027-01-18", // Martin Luther King Jr. Day
  "2027-02-15", // Presidents' Day
  "2027-05-31", // Memorial Day
  "2027-06-18", // Juneteenth (observed; Jun 19 is Saturday)
  "2027-07-05", // Independence Day (observed; Jul 4 is Sunday)
  "2027-09-06", // Labor Day
  "2027-10-11", // Columbus Day
  "2027-11-11", // Veterans Day
  "2027-11-25", // Thanksgiving Day
  "2027-12-24", // Christmas (observed; Dec 25 is Saturday)

  // 2028
  "2027-12-31", // New Year's Day 2028 observed (Jan 1 2028 is Saturday)
  "2028-01-17", // Martin Luther King Jr. Day
  "2028-02-21", // Presidents' Day
  "2028-05-29", // Memorial Day
  "2028-06-19", // Juneteenth
  "2028-07-04", // Independence Day
  "2028-09-04", // Labor Day
  "2028-10-09", // Columbus Day
  "2028-11-10", // Veterans Day (observed; Nov 11 is Saturday)
  "2028-11-23", // Thanksgiving Day
  "2028-12-25", // Christmas Day
]);

/** Returns ISO date string "YYYY-MM-DD" for a Date object (UTC-safe via toISOString) */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse an ISO date string "YYYY-MM-DD" into a UTC midnight Date */
function parseIsoDate(s: string): Date {
  const [year, month, day] = s.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6; // 0=Sunday, 6=Saturday
}

function isHoliday(d: Date): boolean {
  return US_FEDERAL_HOLIDAYS.has(toIsoDate(d));
}

function isBusinessDay(d: Date): boolean {
  return !isWeekend(d) && !isHoliday(d);
}

export interface ComputeOptions {
  anchorDate: string | null | undefined;
  offsetDays: number;
  direction: "after" | "before";
  dayType: "calendar" | "business";
}

/**
 * Compute a milestone date.
 * Returns null if anchorDate is null/undefined.
 * Returns an ISO date string "YYYY-MM-DD" otherwise.
 */
export function computeMilestoneDate(opts: ComputeOptions): string | null {
  const { anchorDate, offsetDays, direction, dayType } = opts;

  if (!anchorDate) return null;

  const anchor = parseIsoDate(anchorDate);
  const step = direction === "after" ? 1 : -1;

  if (dayType === "calendar") {
    const result = new Date(anchor);
    result.setUTCDate(result.getUTCDate() + step * offsetDays);
    return toIsoDate(result);
  }

  // Business days
  if (offsetDays === 0) return toIsoDate(anchor);

  const result = new Date(anchor);
  let remaining = offsetDays;

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + step);
    if (isBusinessDay(result)) {
      remaining--;
    }
  }

  return toIsoDate(result);
}

/**
 * Recompute milestone dates for a transaction.
 * Returns a map of milestoneId → new computedDate (or null).
 * Milestones with overrideDate set are included in the map but their
 * effectiveDate is still override ?? computed — the caller decides
 * whether to display that.
 */
export function recomputeMilestoneDates(
  milestones: Array<{
    id: string;
    offsetDays: number | null;
    anchor: string | null;
    direction: string | null;
    dayType: string | null;
    overrideDate: string | null;
  }>,
  acceptanceDate: string | null | undefined,
  coeDate: string | null | undefined,
): Map<string, string | null> {
  const result = new Map<string, string | null>();

  for (const m of milestones) {
    if (m.offsetDays == null || !m.anchor || !m.direction || !m.dayType) {
      // Ad-hoc milestone with no computation params
      result.set(m.id, null);
      continue;
    }

    const anchorDate = m.anchor === "acceptance" ? acceptanceDate : coeDate;
    const computed = computeMilestoneDate({
      anchorDate: anchorDate ?? null,
      offsetDays: m.offsetDays,
      direction: m.direction as "after" | "before",
      dayType: m.dayType as "calendar" | "business",
    });
    result.set(m.id, computed);
  }

  return result;
}

// Re-export holiday set for testing
export { US_FEDERAL_HOLIDAYS, isBusinessDay, toIsoDate, parseIsoDate };
