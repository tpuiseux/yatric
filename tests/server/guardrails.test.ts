import { describe, it, expect } from "vitest";
import { checkWeeks, newFindings, type GuardrailContext } from "../../src/lib/guardrails.js";
import type { TrainingWeek, Workout } from "../../src/schema/training-plan.js";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type Session = Partial<Workout> & { minutes: number };

/** A week from Monday `start`, sessions given per day (0 = Monday). */
function week(n: number, start: string, sessions: Record<number, Session[]>): TrainingWeek {
  return {
    weekNumber: n,
    startDate: start,
    endDate: addDays(start, 6),
    phase: "",
    focus: "",
    targetHours: 0,
    isRecoveryWeek: false,
    summary: { totalHours: 0, bySport: {} },
    days: Array.from({ length: 7 }, (_, d) => ({
      date: addDays(start, d),
      dayOfWeek: "",
      workouts: (sessions[d] ?? []).map(({ minutes, ...w }, k) => ({
        id: `w${n}-${d}-${k}`,
        sport: "run",
        type: "endurance",
        name: `Run ${n}.${d}`,
        description: "",
        completed: false,
        durationMinutes: minutes,
        ...w,
      })),
    })),
  };
}

const easy = (minutes: number): Session[] => [{ minutes }];
const hard = (minutes: number): Session[] => [{ minutes, type: "intervals", name: "Intervals" }];

const ctx: GuardrailContext = { today: "2026-01-01", actualDailyMinutes: null, redDays: [] };

/** Four runs: 60 + 45 + 45 + `long` minutes. */
function steady(n: number, start: string, long = 90): TrainingWeek {
  return week(n, start, { 1: easy(60), 3: easy(45), 4: easy(45), 6: easy(long) });
}

describe("checkWeeks", () => {
  it("is quiet on a sound build with a recovery week", () => {
    const weeks = [
      steady(1, "2026-01-05", 90),
      steady(2, "2026-01-12", 100),
      week(3, "2026-01-19", { 1: easy(40), 3: easy(40), 6: easy(60) }),
      steady(4, "2026-01-26", 110),
    ];
    expect(checkWeeks(weeks, ctx)).toEqual([]);
  });

  it("flags a new weekly high more than 10% over the biggest of the 4 weeks before", () => {
    const weeks = [steady(1, "2026-01-05", 90), steady(2, "2026-01-12", 140)];
    const [f] = checkWeeks(weeks, ctx);
    expect(f).toMatchObject({ rule: "volume_jump", severity: "warn", weekNumber: 2 });
    expect(f.text).toBe(
      "Week 2: 4.8 h, 21% above the biggest of the 4 weeks before (4 h) - keep a new high within ~10%"
    );
  });

  it("takes recorded training for weeks that are over, before and during the plan", () => {
    // Plan week 1 starts on 2026-01-05; the athlete ran 30 min a day before it.
    const daily: Record<string, number> = {};
    for (let d = 0; d < 28; d++) daily[addDays("2025-12-08", d)] = 30;
    const recorded = { ...ctx, actualDailyMinutes: daily };
    const [f] = checkWeeks([steady(1, "2026-01-05", 90)], recorded);
    expect(f).toMatchObject({ rule: "volume_jump", weekNumber: 1 });
    expect(f.text).toMatch(/14% above .* \(3\.5 h\)/);
    // The plan's week 1 is over and was skipped: week 2 is measured against nothing done.
    const later = { ...recorded, today: "2026-01-13" };
    const found = checkWeeks([steady(1, "2026-01-05"), steady(2, "2026-01-12")], later);
    expect(found.find((x) => x.weekNumber === 2)?.text).toMatch(/above .* \(3\.5 h\)/);
  });

  it("flags hard sessions on consecutive days, across weeks too", () => {
    const weeks = [
      week(1, "2026-01-05", { 1: hard(60), 3: easy(45), 6: hard(60) }),
      week(2, "2026-01-12", { 0: hard(50), 2: easy(45) }),
    ];
    const found = checkWeeks(weeks, ctx).filter((f) => f.rule === "consecutive_quality");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ weekNumber: 2 });
    expect(found[0].text).toContain("on 2026-01-11 and 2026-01-12");
  });

  it("flags a long run over half the week's running, with four runs or more", () => {
    const [f] = checkWeeks([steady(1, "2026-01-05", 160)], ctx);
    expect(f).toMatchObject({ rule: "long_run_share" });
    expect(f.text).toContain("Run 1.6");
    // Three runs: a big share by construction, not flagged.
    const three = week(1, "2026-01-05", { 1: easy(40), 3: easy(40), 6: easy(120) });
    expect(checkWeeks([three], ctx)).toEqual([]);
  });

  it("flags a week with the same load every day", () => {
    const same = week(
      1,
      "2026-01-05",
      Object.fromEntries(Array.from({ length: 7 }, (_, d) => [d, d === 6 ? easy(70) : easy(60)]))
    );
    expect(checkWeeks([same], ctx).map((f) => f.rule)).toContain("monotony");
  });

  it("blocks a hard session on a red day or the day after, from today on", () => {
    const weeks = [week(1, "2026-01-05", { 0: hard(60), 2: hard(60), 3: hard(60) })];
    const red = { ...ctx, today: "2026-01-06", redDays: ["2026-01-06"] };
    const blocks = checkWeeks(weeks, red).filter((f) => f.severity === "block");
    // Monday's is in the past; Wednesday's falls the day after the red Tuesday.
    expect(blocks.map((f) => f.key)).toEqual(["quality_after_red:w1-2-0:2026-01-07"]);
  });
});

describe("newFindings", () => {
  it("keeps what's new or worse", () => {
    const before = checkWeeks([steady(1, "2026-01-05", 90), steady(2, "2026-01-12", 140)], ctx);
    const same = checkWeeks([steady(1, "2026-01-05", 90), steady(2, "2026-01-12", 140)], ctx);
    const worse = checkWeeks([steady(1, "2026-01-05", 90), steady(2, "2026-01-12", 150)], ctx);
    expect(newFindings(before, same)).toEqual([]);
    expect(newFindings(before, worse).map((f) => f.rule)).toEqual(["volume_jump"]);
  });
});
