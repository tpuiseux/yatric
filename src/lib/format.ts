/**
 * Distances and activity summaries in the athlete's units and language
 * (lib/i18n formats the numbers: "9,9 km" in French, "9.9 km" in English).
 */

import type { IntensityTarget, Sport, WorkoutStep } from "../schema/training-plan.js";
import type { Formatter, Messages } from "./i18n/index.js";
import { paceToSeconds, runPaceBounds, secondsToPace, type Settings } from "./settings.js";
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

/** "45 s", "90 s", "12 min", "1 h 05". */
function seconds(value: number, fmt: Formatter): string {
  const s = Math.round(value);
  return s < 60 || (s < 180 && s % 60) ? `${s} s` : fmt.duration(s / 60);
}

/** How long a step of a structured workout lasts, as the plan sets it. */
function stepLength(step: WorkoutStep, fmt: Formatter, m: Messages): string {
  const { unit, value } = step.duration;
  switch (unit) {
    case "seconds":
      return seconds(value, fmt);
    case "minutes":
      return seconds(value * 60, fmt);
    case "hours":
      return seconds(value * 3600, fmt);
    case "meters":
      return value >= 1000 && value % 100 === 0
        ? `${fmt.number(value / 1000, value % 1000 ? 1 : 0)} km`
        : `${fmt.number(value)} m`;
    case "kilometers":
      return `${fmt.number(value, Number.isInteger(value) ? 0 : 1)} km`;
    case "miles":
      return `${fmt.number(value, Number.isInteger(value) ? 0 : 1)} mi`;
    case "yards":
      return `${fmt.number(value)} yd`;
    case "laps":
      return m.drawer.laps(value);
  }
}

/** "4:25–4:40/km", from the fast bound to the slow one, in seconds per km. */
function paceRange(fast: number, slow: number, settings: Settings): string {
  const miles = settings.units.run === "miles";
  const per = (s: number) => secondsToPace(Math.round(miles ? s * 1.60934 : s));
  const a = per(fast);
  const b = per(slow);
  return `${a === b ? a : `${a}–${b}`}/${miles ? "mi" : "km"}`;
}

/** A pace target as the watch will follow it (see garminConnect resolveTarget):
 * the athlete's current zone when the step names one, else its own bounds
 * moved with the threshold pace. */
function paceTarget(i: IntensityTarget, settings: Settings): string {
  const code = i.description?.trim();
  const zone = code
    ? settings.run.paceZones.find((z) => String(z.zone) === code || z.name === code)
    : undefined;
  let range: string;
  if (zone) {
    const bounds = runPaceBounds(zone);
    range =
      bounds.low && bounds.high
        ? paceRange(paceToSeconds(bounds.high), paceToSeconds(bounds.low), settings)
        : paceRange(paceToSeconds(zone.pace), paceToSeconds(zone.pace), settings);
  } else if (i.valueLow && i.valueHigh) {
    const then = i.thresholdPaceSeconds;
    const now = paceToSeconds(settings.run.thresholdPace);
    const ratio = then && now ? now / then : 1;
    range = paceRange(i.valueLow * ratio, i.valueHigh * ratio, settings);
  } else {
    return code ?? "";
  }
  const label = zone?.name ?? code;
  return label ? `${range} · ${label}` : range;
}

/** What a step asks for: a pace, a heart rate, a power, an effort. */
function stepTarget(step: WorkoutStep, sport: Sport, settings: Settings): string {
  const i = step.intensity;
  const lo = i.valueLow ?? i.value;
  const hi = i.valueHigh ?? i.value;
  const span = (a: number | string, b: number | string) => (a === b ? `${a}` : `${a}–${b}`);
  const hr = sport === "bike" ? settings.bike : settings.run;
  switch (i.unit) {
    case "pace_zone":
      return paceTarget(i, settings);
    case "hr_zone": {
      const zone = hr.hrZones.find((z) => String(z.zone) === String(i.value));
      return zone ? `Zone ${i.value} · ${zone.low}–${zone.high} bpm` : `Zone ${i.value}`;
    }
    case "percent_lthr": {
      const bpm = (p: number) => Math.round((hr.lthr * p) / 100);
      return hr.lthr ? `${span(bpm(lo), bpm(hi))} bpm` : `${span(lo, hi)} % LTHR`;
    }
    case "percent_ftp": {
      const watts = (p: number) => Math.round((settings.bike.ftp * p) / 100);
      const ftp = `${span(lo, hi)} % FTP`;
      return settings.bike.ftp ? `${span(watts(lo), watts(hi))} W · ${ftp}` : ftp;
    }
    case "rpe":
      return `RPE ${span(lo, hi)}`;
    case "css_offset": {
      const css = settings.swim.cssSeconds;
      if (!css) return i.description ?? "";
      return `${span(secondsToPace(css + lo), secondsToPace(css + hi))}/100 m`;
    }
  }
}

/** One step of the session's profile, for the drawer: its name, how long
 * (with the time it takes when the plan sets a distance), and its target. */
export function stepParts(
  step: WorkoutStep,
  estimatedSeconds: number,
  sport: Sport,
  settings: Settings,
  fmt: Formatter,
  m: Messages
): { name: string; length: string; time: string; target: string } {
  const byDistance = !["seconds", "minutes", "hours"].includes(step.duration.unit);
  return {
    name: step.name || m.drawer.stepType[step.type],
    length: stepLength(step, fmt, m),
    time: byDistance && estimatedSeconds > 0 ? seconds(estimatedSeconds, fmt) : "",
    target: stepTarget(step, sport, settings),
  };
}
