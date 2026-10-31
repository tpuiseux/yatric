import { all, get } from "../../../db/client.js";
import type { PlanForm } from "../../planDraft.js";
import { activitySport } from "../../trainingLog.js";
import { addDays } from "./form.js";

/** The form's "current training" fields, read from the synced Garmin history. */
export type GarminSnapshot = Pick<
  PlanForm,
  | "runsPerWeek"
  | "currentWeeklyKm"
  | "longestRecentRunKm"
  | "swimKmPerWeek"
  | "bikeHoursPerWeek"
  | "skiHoursPerWeek"
  | "maxHr"
  | "restingHr"
> & { activities: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Weekly averages over the last 4 weeks, the longest run over 8, the highest
 * heart rate seen in a year (a floor for the max), resting HR over 2 weeks.
 * Null when nothing was recorded in the last 8 weeks. */
export function garminSnapshot(userId: number, today: string): GarminSnapshot | null {
  const rows = all<{ date: string; sport_type: string; km: number; h: number; max_hr: number }>(
    `SELECT substr(COALESCE(start_date_local, start_date), 1, 10) AS date, sport_type,
            COALESCE(distance, 0) / 1000.0 AS km, COALESCE(moving_time, 0) / 3600.0 AS h,
            COALESCE(max_heartrate, 0) AS max_hr
     FROM activities WHERE user_id = ? AND COALESCE(start_date_local, start_date) >= ?`,
    [userId, addDays(today, -365)]
  );
  const since4 = addDays(today, -28);
  const since8 = addDays(today, -56);
  if (!rows.some((r) => r.date >= since8)) return null;

  const recent = rows.filter((r) => r.date >= since4);
  const of = (sport: string) => recent.filter((r) => activitySport(r.sport_type) === sport);
  const sum = (list: typeof rows, key: "km" | "h") => list.reduce((t, r) => t + r[key], 0);
  const runs = of("run");
  const longest = Math.max(
    0,
    ...rows
      .filter((r) => r.date >= since8 && activitySport(r.sport_type) === "run")
      .map((r) => r.km)
  );
  const maxHr = Math.max(0, ...rows.map((r) => r.max_hr));
  const resting = get<{ hr: number | null }>(
    "SELECT ROUND(AVG(resting_hr)) AS hr FROM daily_wellness WHERE user_id = ? AND date >= ? AND resting_hr > 0",
    [userId, addDays(today, -14)]
  )?.hr;

  return {
    activities: recent.length,
    runsPerWeek: Math.min(7, Math.max(2, Math.round(runs.length / 4))),
    currentWeeklyKm: Math.round(sum(runs, "km") / 4),
    longestRecentRunKm: round1(longest),
    swimKmPerWeek: round1(sum(of("swim"), "km") / 4),
    bikeHoursPerWeek: round1(sum(of("bike"), "h") / 4),
    skiHoursPerWeek: round1(sum(of("ski"), "h") / 4),
    maxHr: maxHr >= 120 && maxHr <= 230 ? Math.round(maxHr) : null,
    restingHr: resting && resting >= 30 && resting <= 100 ? resting : null,
  };
}
