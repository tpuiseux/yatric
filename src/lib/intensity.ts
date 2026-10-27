/**
 * How hard a session is, on the design system's five-step scale (z1 calm to
 * z5 hard, plus the race itself): sessions are coloured by intensity, not by
 * sport, so a week reads easy/hard at a glance. Also the step-by-step
 * profile of a structured workout, for the session drawer.
 */

import type {
  IntensityTarget,
  StructuredWorkout,
  Workout,
  WorkoutStep,
} from "../schema/training-plan.js";

export type Intensity = "z1" | "z2" | "z3" | "z4" | "z5" | "race" | "rest";

const BY_TYPE: Record<string, Intensity> = {
  rest: "rest",
  recovery: "z1",
  technique: "z1",
  endurance: "z2",
  long: "z2",
  openwater: "z2",
  tempo: "z3",
  brick: "z3",
  threshold: "z4",
  hills: "z4",
  intervals: "z5",
  vo2max: "z5",
  sprint: "z5",
  race: "race",
};

export function intensityOf(workout: Pick<Workout, "sport" | "type">): Intensity {
  if (workout.sport === "rest") return "rest";
  if (workout.sport === "race") return "race";
  if (workout.sport === "strength") return "z1";
  return BY_TYPE[workout.type] ?? "z2";
}

function clampZone(n: number): Intensity {
  const z = Math.min(5, Math.max(1, Math.round(n)));
  return `z${z}` as Intensity;
}

/** The zone of one step of a structured workout. */
function stepZone(step: WorkoutStep): Intensity {
  if (step.type === "recovery" || step.type === "rest") return "z1";
  const i: IntensityTarget = step.intensity;
  const mid =
    i.valueLow !== undefined && i.valueHigh !== undefined
      ? (i.valueLow + i.valueHigh) / 2
      : i.value;
  switch (i.unit) {
    case "hr_zone":
      return clampZone(i.value);
    case "rpe":
      return mid <= 2 ? "z1" : mid <= 4 ? "z2" : mid <= 6 ? "z3" : mid <= 7 ? "z4" : "z5";
    case "percent_lthr":
      return mid < 81 ? "z1" : mid < 90 ? "z2" : mid < 95 ? "z3" : mid < 100 ? "z4" : "z5";
    case "percent_ftp":
      return mid < 56 ? "z1" : mid < 76 ? "z2" : mid < 91 ? "z3" : mid < 106 ? "z4" : "z5";
    case "pace_zone": {
      const code = (i.description ?? "").trim().toUpperCase();
      const byCode: Record<string, Intensity> = { E: "z2", M: "z3", T: "z4", I: "z5", R: "z5" };
      if (byCode[code]) return byCode[code];
      return step.type === "work" ? "z4" : "z2";
    }
    case "css_offset":
      return mid >= 10 ? "z2" : mid >= 0 ? "z3" : "z5";
  }
  return step.type === "work" ? "z3" : "z2";
}

/** Seconds a step lasts; distances at the step's pace, else a generic one. */
function stepSeconds(step: WorkoutStep): number {
  const { unit, value } = step.duration;
  const i = step.intensity;
  const pace =
    i.unit === "pace_zone" && i.valueLow && i.valueHigh ? (i.valueLow + i.valueHigh) / 2 : 330;
  switch (unit) {
    case "seconds":
      return value;
    case "minutes":
      return value * 60;
    case "hours":
      return value * 3600;
    case "kilometers":
      return value * pace;
    case "miles":
      return value * 1.60934 * pace;
    case "meters":
      return (value / 1000) * pace;
    case "yards":
      return ((value * 0.9144) / 100) * 110; // a swim pace per 100 m
    case "laps":
      return value * 60;
  }
}

export interface ProfileStep {
  zone: Intensity;
  seconds: number;
  step: WorkoutStep;
  /** Which round of its repeat set, e.g. [2, 5]. */
  round?: [number, number];
}

/** The workout as a row of steps the watch will run, repeats unrolled. */
export function workoutProfile(structure: StructuredWorkout | undefined): ProfileStep[] {
  if (!structure) return [];
  const out: ProfileStep[] = [];
  const add = (step: WorkoutStep, round?: [number, number]) =>
    out.push({ zone: stepZone(step), seconds: stepSeconds(step), step, round });
  for (const step of structure.warmup ?? []) add(step);
  for (const item of structure.main ?? []) {
    if ("repeats" in item) {
      for (let r = 0; r < item.repeats; r++) {
        for (const step of item.steps) add(step, [r + 1, item.repeats]);
      }
    } else {
      add(item);
    }
  }
  for (const step of structure.cooldown ?? []) add(step);
  return out.filter((s) => s.seconds > 0);
}
