/**
 * Distances and activity summaries in the athlete's units and language
 * (lib/i18n formats the numbers: "9,9 km" in French, "9.9 km" in English).
 */

import type { Sport } from "../schema/training-plan.js";
import type { Formatter } from "./i18n/index.js";
import type { Settings } from "./settings.js";
import { activitySport, type RecordedActivity } from "./trainingLog.js";

const METERS_PER_YARD = 0.9144;
const KM_PER_MILE = 1.60934;

/** "9,9 km", "12 km", "1500 m", "6,2 mi", "400 yd". */
export function distance(
  meters: number | null | undefined,
  sport: Sport,
  settings: Settings,
  fmt: Formatter
): string {
  if (!meters) return "";
  if (sport === "swim") {
    return settings.units.swim === "yards"
      ? `${fmt.number(meters / METERS_PER_YARD)} yd`
      : `${fmt.number(meters)} m`;
  }
  const unit = sport === "bike" ? settings.units.bike : settings.units.run;
  if (unit === "miles") {
    const miles = meters / 1000 / KM_PER_MILE;
    return `${fmt.number(miles, miles >= 10 ? 0 : 1)} mi`;
  }
  const km = meters / 1000;
  if (sport !== "bike" && sport !== "run" && km < 1) return `${fmt.number(meters)} m`;
  return `${fmt.number(km, km >= 20 ? 0 : 1)} km`;
}

/** The parts of what the watch recorded: distance, time, average heart rate. */
export function activityParts(
  activity: RecordedActivity,
  settings: Settings,
  fmt: Formatter
): { distance: string; time: string; heartrate: string } {
  const sport = activitySport(activity.sportType) ?? "run";
  return {
    distance: activity.distanceMeters
      ? distance(activity.distanceMeters, sport, settings, fmt)
      : "",
    time: activity.movingSeconds ? fmt.duration(activity.movingSeconds / 60) : "",
    heartrate: activity.averageHeartrate ? `${Math.round(activity.averageHeartrate)} bpm` : "",
  };
}
