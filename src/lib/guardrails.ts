/**
 * Guardrails: a computed second look at the plan, so a week that ramps too
 * fast or stacks hard sessions doesn't rest on the model noticing. Run on
 * each week the plan builder writes (lib/server/planBuilder/) and on every
 * change the coach proposes (lib/server/coach/tools.ts).
 *
 * Adapted from ai-running-coach's arc_guardrails.py (MIT). Its thresholds
 * flagged most weeks of sound plans here, so two are changed: volume is
 * compared with the biggest of the 4 weeks before rather than their mean
 * (coming back from a recovery week isn't a jump), and the long-run share
 * limit is 50% (four-run marathon weeks sit around 45%). All are rules of
 * thumb, not published limits.
 */

import type { TrainingWeek, Workout } from "../schema/training-plan.js";

export type GuardrailRule =
  | "volume_jump"
  | "monotony"
  | "long_run_share"
  | "consecutive_quality"
  | "quality_after_red";

export interface GuardrailFinding {
  rule: GuardrailRule;
  /** A warning is shown; a block refuses the change. */
  severity: "warn" | "block";
  /** Identifies the finding across two versions of the plan. */
  key: string;
  weekNumber: number;
  /** What was measured (percent, ratio), to tell whether a change made it worse. */
  value: number;
  text: string;
}

export interface GuardrailContext {
  today: string;
  /** Minutes recorded each day (all sports), or null when the athlete has no
   * recorded activities - the plan's own weeks are the reference then. */
  actualDailyMinutes: Record<string, number> | null;
  /** Days whose morning read red (lib/load.ts redDays). */
  redDays: string[];
}

export const LIMITS = {
  /** A new weekly high, against the biggest of the 4 weeks before. */
  volumeJumpPct: 10,
  /** Foster's monotony: mean daily load over its standard deviation. */
  monotony: 2,
  longRunSharePct: 50,
  /** Below this many runs, the long run is a big share by construction. */
  longRunMinRuns: 4,
};

/** Sessions that count as hard. */
const HARD_TYPES = ["tempo", "threshold", "intervals", "vo2max", "sprint", "hills", "race"];

/** Effort of a session when it doesn't give its own RPE. */
const RPE_BY_TYPE: Record<string, number> = {
  rest: 0,
  recovery: 2,
  endurance: 3,
  technique: 3,
  openwater: 3,
  long: 4,
  brick: 5,
  tempo: 6,
  hills: 7,
  threshold: 7,
  intervals: 8,
  vo2max: 8,
  sprint: 8,
  race: 9,
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} h`;
}

function sessions(week: TrainingWeek): { date: string; workout: Workout }[] {
  return (week.days ?? []).flatMap((d) =>
    (d.workouts ?? [])
      .filter((w) => w.sport !== "rest")
      .map((workout) => ({ date: d.date, workout }))
  );
}

function isHard(w: Workout): boolean {
  return HARD_TYPES.includes(w.type) || w.sport === "race";
}

/** Planned training time in the week, the race itself left out. */
export function plannedMinutes(week: TrainingWeek): number {
  return sessions(week)
    .filter(({ workout }) => workout.sport !== "race")
    .reduce((sum, { workout }) => sum + (workout.durationMinutes ?? 0), 0);
}

function actualMinutes(daily: Record<string, number>, start: string): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += daily[addDays(start, i)] ?? 0;
  return sum;
}

/** The week's volume as it stands: recorded once it's over, planned until then. */
function weekVolume(
  start: string,
  weeks: Map<string, TrainingWeek>,
  ctx: GuardrailContext
): number | null {
  const week = weeks.get(start);
  const over = addDays(start, 6) < ctx.today;
  if (ctx.actualDailyMinutes && (over || !week)) {
    return over ? actualMinutes(ctx.actualDailyMinutes, start) : null;
  }
  return week ? plannedMinutes(week) : null;
}

function volumeJump(
  week: TrainingWeek,
  weeks: Map<string, TrainingWeek>,
  ctx: GuardrailContext
): GuardrailFinding | null {
  const reference = [1, 2, 3, 4]
    .map((k) => weekVolume(addDays(week.startDate, -7 * k), weeks, ctx))
    .filter((v): v is number => v !== null);
  const biggest = Math.max(0, ...reference);
  const planned = plannedMinutes(week);
  if (!biggest) return null;
  const pct = (planned / biggest - 1) * 100;
  if (pct <= LIMITS.volumeJumpPct) return null;
  return {
    rule: "volume_jump",
    severity: "warn",
    key: `volume_jump:${week.startDate}`,
    weekNumber: week.weekNumber,
    value: pct,
    text: `Week ${week.weekNumber}: ${hours(planned)}, ${Math.round(pct)}% above the biggest of the 4 weeks before (${hours(biggest)}) - keep a new high within ~${LIMITS.volumeJumpPct}%`,
  };
}

function monotony(week: TrainingWeek): GuardrailFinding | null {
  const daily = (week.days ?? []).map((d) =>
    (d.workouts ?? []).reduce(
      (sum, w) => sum + (w.durationMinutes ?? 0) * (w.rpe ?? RPE_BY_TYPE[w.type] ?? 3),
      0
    )
  );
  if (daily.length < 7) return null;
  const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
  const sd = Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / daily.length);
  if (!mean || !sd) return null;
  const value = mean / sd;
  if (value <= LIMITS.monotony) return null;
  return {
    rule: "monotony",
    severity: "warn",
    key: `monotony:${week.startDate}`,
    weekNumber: week.weekNumber,
    value,
    text: `Week ${week.weekNumber}: every day carries about the same load (monotony ${value.toFixed(1)}, keep it under ${LIMITS.monotony}) - make the easy days easier or add a rest day`,
  };
}

function longRunShare(week: TrainingWeek): GuardrailFinding | null {
  const runs = sessions(week)
    .map(({ workout }) => workout)
    .filter((w) => w.sport === "run" && w.durationMinutes);
  if (runs.length < LIMITS.longRunMinRuns) return null;
  const total = runs.reduce((sum, w) => sum + w.durationMinutes!, 0);
  const longest = runs.reduce((a, b) => (b.durationMinutes! > a.durationMinutes! ? b : a));
  const pct = (longest.durationMinutes! / total) * 100;
  if (pct <= LIMITS.longRunSharePct) return null;
  return {
    rule: "long_run_share",
    severity: "warn",
    key: `long_run_share:${week.startDate}`,
    weekNumber: week.weekNumber,
    value: pct,
    text: `Week ${week.weekNumber}: "${longest.name}" is ${Math.round(pct)}% of the week's running (keep it under ${LIMITS.longRunSharePct}%) - the rest of the week doesn't support it`,
  };
}

/**
 * Checks the weeks (in any order). Hard sessions on consecutive days are
 * looked for across week boundaries too, and charged to the later week.
 */
export function checkWeeks(weeks: TrainingWeek[], ctx: GuardrailContext): GuardrailFinding[] {
  const byStart = new Map(weeks.map((w) => [w.startDate, w]));
  const out: GuardrailFinding[] = [];
  for (const week of weeks) {
    for (const f of [volumeJump(week, byStart, ctx), monotony(week), longRunShare(week)]) {
      if (f) out.push(f);
    }
  }

  const hard = weeks
    .flatMap((week) => sessions(week).map((s) => ({ ...s, week })))
    .filter(({ workout }) => isHard(workout))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < hard.length; i++) {
    const a = hard[i - 1];
    const b = hard[i];
    if (b.date > addDays(a.date, 1)) continue;
    // Two hard sessions already done are history, not a plan to fix.
    if (a.workout.completed && b.workout.completed) continue;
    const when = a.date === b.date ? `both on ${b.date}` : `on ${a.date} and ${b.date}`;
    out.push({
      rule: "consecutive_quality",
      severity: "warn",
      key: `consecutive_quality:${a.workout.id}:${b.workout.id}`,
      weekNumber: b.week.weekNumber,
      value: 1,
      text: `"${a.workout.name}" and "${b.workout.name}" are hard sessions ${when} - put an easy day between them`,
    });
  }

  for (const red of ctx.redDays) {
    for (const { date, workout, week } of hard) {
      if (workout.completed || date < ctx.today) continue;
      if (date !== red && date !== addDays(red, 1)) continue;
      out.push({
        rule: "quality_after_red",
        severity: "block",
        key: `quality_after_red:${workout.id}:${date}`,
        weekNumber: week.weekNumber,
        value: 1,
        text: `"${workout.name}" is a hard session on ${date}, right after a red morning (${red}: HRV low with resting heart rate up, or readiness poor) - make it easy or rest`,
      });
    }
  }
  return out;
}

/** What `after` flags that `before` didn't, or flags worse. */
export function newFindings(
  before: GuardrailFinding[],
  after: GuardrailFinding[]
): GuardrailFinding[] {
  const was = new Map(before.map((f) => [f.key, f]));
  return after.filter((f) => {
    const old = was.get(f.key);
    return !old || f.value > old.value + 0.01;
  });
}
