import { describe, it, expect } from "vitest";
import { backtest, summarize } from "../../scripts/backtest-prediction.js";
import { summarizeRun, type RunSummary } from "../../src/lib/racePrediction.js";

function run(date: string, km: number, pace: number, race = false): RunSummary {
  return summarizeRun(
    {
      id: Number(date.replace(/-/g, "")),
      date,
      distanceMeters: km * 1000,
      movingSeconds: km * pace,
      race,
    },
    null
  );
}

describe("prediction backtest", () => {
  const runs = [
    run("2026-08-01", 10, 300),
    run("2026-08-20", 10, 290),
    run("2026-09-01", 10, 270, true), // 45:00 10K race
    run("2026-09-10", 12, 300),
    run("2026-10-01", 21.1, 290, true), // half in 1:42:00
  ];
  const vo2 = [
    { date: "2026-08-25", value: 52 },
    { date: "2026-09-28", value: 53 },
  ];

  it("predicts each race from the days before it only", () => {
    const results = backtest(new Map([[7, runs]]), new Map([[7, vo2]]));
    expect(results.map((r) => r.date)).toEqual(["2026-09-01", "2026-10-01"]);
    const [tenK, half] = results;
    expect(tenK.actual).toBe(2700);
    // Before the 10K: training efforts and an uncalibrated VO2max.
    expect(tenK.predicted.vo2max).toBe(tenK.predicted.vo2maxRaw);
    // Before the half: calibrated on the 10K, so slower than Garmin's raw value.
    expect(half.predicted.vo2max).toBeGreaterThan(half.predicted.vo2maxRaw);
    expect(half.predicted.model).toBeGreaterThan(0);
  });

  it("sums errors up by method and distance", () => {
    const results = [
      { user: 1, date: "d", km: 10, actual: 3000, predicted: { model: 2850 } },
      { user: 1, date: "d", km: 10, actual: 3000, predicted: { model: 3150 } },
    ];
    const all = summarize(results).find((s) => s.band === "all" && s.method === "model")!;
    expect(all).toMatchObject({ n: 2, bias: 0, mae: 5 });
  });
});
