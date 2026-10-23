import { all } from "../../db/client.js";
import type { TrainingPlan } from "../../schema/training-plan.js";
import type { GuardrailContext } from "../guardrails.js";
import { redDays } from "../load.js";
import { getLoadSeries } from "./load.js";
import { todayLocal } from "./weekReview.js";

/** Weeks of recorded training read before the first week checked. */
const REFERENCE_DAYS = 28;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * What the guardrails need from the database: minutes recorded each day
 * from four weeks before `from`, and, when there's a plan to read recovery
 * against, whether this morning or yesterday's read red.
 */
export function guardrailContext(
  userId: number,
  from: string,
  plan?: TrainingPlan
): GuardrailContext {
  const today = todayLocal();
  const rows = all<{ day: string; minutes: number }>(
    `SELECT substr(COALESCE(start_date_local, start_date), 1, 10) AS day,
            SUM(moving_time) / 60.0 AS minutes
     FROM activities
     WHERE user_id = ? AND COALESCE(start_date_local, start_date) >= ?
       AND COALESCE(start_date_local, start_date) < date(?, '+1 day')
     GROUP BY day`,
    [userId, addDays(from, -REFERENCE_DAYS), today]
  );
  const recorded = all<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE user_id = ?", [
    userId,
  ])[0].n;
  const days = plan ? (getLoadSeries(userId, plan)?.days ?? []) : [];
  return {
    today,
    actualDailyMinutes: recorded
      ? Object.fromEntries(rows.map((r) => [r.day, Math.round(r.minutes)]))
      : null,
    redDays: days.length && days[days.length - 1].date >= addDays(today, -1) ? redDays(days) : [],
  };
}
