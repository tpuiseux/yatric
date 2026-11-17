import { all } from "../../db/client.js";
import type { RecordedActivity } from "../trainingLog.js";

/** The user's activities whose local start date falls in [startDate, endDate], by date. */
export function getActivitiesByDate(
  userId: number,
  startDate: string,
  endDate: string
): Record<string, RecordedActivity[]> {
  const rows = all<{
    id: number;
    name: string | null;
    sport_type: string | null;
    start_date_local: string;
    moving_time: number | null;
    elapsed_time: number | null;
    distance: number | null;
    average_heartrate: number | null;
    race: number;
    official_seconds: number | null;
  }>(
    `SELECT a.id, a.name, a.sport_type, a.start_date_local, a.moving_time, a.elapsed_time,
            a.distance, a.average_heartrate, r.official_seconds,
            COALESCE(r.is_race, a.workout_type = 1, 0) AS race
     FROM activities a
     LEFT JOIN race_marks r ON r.activity_id = a.id AND r.user_id = a.user_id
     WHERE a.user_id = ? AND a.start_date_local >= ? AND a.start_date_local < ?
     ORDER BY a.start_date_local`,
    // "<" the day after endDate: start_date_local carries a time part.
    [userId, startDate, nextDay(endDate)]
  );

  const byDate: Record<string, RecordedActivity[]> = {};
  for (const r of rows) {
    const date = r.start_date_local.slice(0, 10);
    (byDate[date] ??= []).push({
      id: r.id,
      name: r.name,
      sportType: r.sport_type,
      startLocal: r.start_date_local,
      movingSeconds: r.moving_time ?? r.elapsed_time,
      distanceMeters: r.distance,
      averageHeartrate: r.average_heartrate,
      race: r.race === 1,
      officialSeconds: r.official_seconds,
    });
  }
  return byDate;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
