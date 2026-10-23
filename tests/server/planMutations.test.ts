import { describe, it, expect } from "vitest";
import { updatePlanSettings } from "../../src/lib/server/planMutations.js";
import { buildZonesFromSettings, deriveSettingsFromPlan } from "../../src/lib/settings.js";
import type { TrainingPlan } from "../../src/schema/training-plan.js";
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
