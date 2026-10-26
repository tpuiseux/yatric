import { describe, it, expect } from "vitest";
import { addWorkout, moveWorkout, updatePlanSettings } from "../../src/lib/server/planMutations.js";
import { visibleWorkouts } from "../../src/lib/utils.js";
import { buildZonesFromSettings, deriveSettingsFromPlan } from "../../src/lib/settings.js";
import type { TrainingPlan, Workout } from "../../src/schema/training-plan.js";
import sample from "../fixtures/sample-plan.json";

describe("updatePlanSettings", () => {
  it("keeps the goal time the coach wrote beside the run paces", () => {
    const plan = structuredClone(sample) as unknown as TrainingPlan;
    plan.zones.run!.pace = {
      thresholdPace: "4:17/km",
      thresholdPaceSeconds: 257,
      zones: [],
      goalTime: "3:12:00",
    } as unknown as NonNullable<TrainingPlan["zones"]["run"]>["pace"];
    const settings = deriveSettingsFromPlan(plan);

    updatePlanSettings(plan, {
      preferences: plan.preferences,
      zones: buildZonesFromSettings(settings),
    });

    expect((plan.zones.run!.pace as unknown as Record<string, unknown>).goalTime).toBe("3:12:00");
  });
});

function dayPlan(): TrainingPlan {
  const w = (id: string, sport: string, name: string) =>
    ({
      id,
      sport,
      type: sport === "rest" ? "rest" : "endurance",
      name,
      description: "",
      completed: false,
    }) as Workout;
  return {
    meta: { updatedAt: "" },
    weeks: [
      {
        weekNumber: 1,
        days: [
          { date: "2026-10-19", dayOfWeek: "Monday", workouts: [w("r1", "rest", "Rest Day")] },
          { date: "2026-10-20", dayOfWeek: "Tuesday", workouts: [w("b1", "rest", "Badminton")] },
          { date: "2026-10-21", dayOfWeek: "Wednesday", workouts: [w("run", "run", "Easy Run")] },
        ],
      },
    ],
  } as unknown as TrainingPlan;
}

describe("placing a session on a rest day", () => {
  const run = {
    id: "new",
    sport: "run",
    type: "endurance",
    name: "Footing",
    description: "",
    completed: false,
  } as Workout;

  it("replaces the day's rest placeholder, not a named activity", () => {
    const plan = dayPlan();
    addWorkout(plan, "2026-10-19", run);
    expect(plan.weeks[0].days[0].workouts.map((w) => w.id)).toEqual(["new"]);

    moveWorkout(plan, "run", "2026-10-20");
    expect(plan.weeks[0].days[1].workouts.map((w) => w.id)).toEqual(["b1", "run"]);
  });

  it("keeps a rest placeholder added on purpose", () => {
    const plan = dayPlan();
    const rest = { ...run, id: "rest2", sport: "rest", type: "rest", name: "Repos" } as Workout;
    addWorkout(plan, "2026-10-21", rest);
    expect(plan.weeks[0].days[2].workouts.map((w) => w.id)).toEqual(["run", "rest2"]);
  });
});

describe("visibleWorkouts", () => {
  it("hides a rest placeholder next to a session, and only then", () => {
    const [mon, tue] = dayPlan().weeks[0].days;
    expect(visibleWorkouts(mon.workouts).map((w) => w.id)).toEqual(["r1"]);
    const mixed = [
      ...mon.workouts,
      ...tue.workouts,
      { ...mon.workouts[0], id: "x", sport: "run" } as Workout,
    ];
    expect(visibleWorkouts(mixed).map((w) => w.id)).toEqual(["b1", "x"]);
  });
});
