/**
 * Lightweight 5-field cron matcher (minute hour dayOfMonth month dayOfWeek).
 * Supports: star, star-slash-N, comma-separated lists, and numeric ranges.
 */
export function cronMatches(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [min, hour, dom, month, dow] = parts;
  const dateMin = date.getUTCMinutes();
  const dateHour = date.getUTCHours();
  const dateDom = date.getUTCDate();
  const dateMonth = date.getUTCMonth() + 1; // 1-indexed
  const dateDow = date.getUTCDay(); // 0=Sun

  return (
    fieldMatches(min, 0, 59, dateMin) &&
    fieldMatches(hour, 0, 23, dateHour) &&
    fieldMatches(dom, 1, 31, dateDom) &&
    fieldMatches(month, 1, 12, dateMonth) &&
    fieldMatches(dow, 0, 6, dateDow)
  );
}

function fieldMatches(field: string, min: number, max: number, value: number): boolean {
  for (const segment of field.split(",")) {
    if (segment === "*") return true;

    // */N — every N steps
    if (segment.startsWith("*/")) {
      const step = parseInt(segment.slice(2), 10);
      if (isNaN(step) || step <= 0) continue;
      if (value % step === 0) return true;
      continue;
    }

    // A-B — range (inclusive)
    if (segment.includes("-")) {
      const [lo, hi] = segment.split("-").map((s) => parseInt(s, 10));
      if (isNaN(lo) || isNaN(hi)) continue;
      if (value >= lo && value <= hi) return true;
      continue;
    }

    // Plain number
    const n = parseInt(segment, 10);
    if (!isNaN(n) && n === value) return true;
  }
  return false;
}

/**
 * Returns true when the cron expression matches the current 1-minute window
 * AND has NOT already fired since the lastScheduledRunAt time.
 *
 * We detect "not yet fired" by ensuring the previous minute's cron match
 * was either false or the lastScheduledRunAt is more than 1 minute ago.
 */
export function shouldFireNow(
  cronExpr: string,
  now: Date,
  lastFiredAt: Date | null,
): boolean {
  if (!cronMatches(cronExpr, now)) return false;

  // If never fired, fire now.
  if (!lastFiredAt) return true;

  // If already fired within the current minute window, skip.
  const windowStart = new Date(now);
  windowStart.setUTCSeconds(0, 0);
  if (lastFiredAt.getTime() >= windowStart.getTime()) return false;

  return true;
}