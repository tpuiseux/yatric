/**
 * Training load and recovery, day by day: Garmin's acute and chronic load
 * and their ratio (ACWR), HRV, sleep, resting heart rate and readiness - and
 * the fatigue signals worth acting on. Shared by the server
 * (lib/server/load.ts reads the days) and the plan's Load & recovery panel
 * (lib/components/LoadPanel.svelte).
 */

export interface LoadDay {
  date: string;
  /** Last 7 days' load (Garmin's acute training load). */
  acute: number | null;
  /** Last 4 weeks' load, per week (Garmin's chronic training load). */
  chronic: number | null;
  acwr: number | null;
  hrv: number | null;
  hrvWeekly: number | null;
  hrvStatus: string | null;
  sleepScore: number | null;
  restingHr: number | null;
  readiness: number | null;
}

export interface LoadSeries {
  days: LoadDay[];
  /** Where acute/chronic come from: Garmin's own figures, or worked out here
   * from each activity's training load when Garmin's are missing. */
  loadSource: "garmin" | "activities";
}

/** The daily_wellness columns read here. */
export interface WellnessRow {
  date: string;
  acute_training_load: number | null;
  chronic_training_load: number | null;
  acwr: number | null;
  hrv_last_night_avg: number | null;
  hrv_weekly_avg: number | null;
  hrv_status: string | null;
  sleep_score: number | null;
  resting_hr: number | null;
  training_readiness_score: number | null;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Acute and chronic load from each day's summed activity load, for when
 * Garmin's figures are missing: exponentially weighted averages over 7 and
 * 28 days, scaled to a week (Garmin's acute load is a 7-day sum, so the two
 * read alike).
 */
export function loadFromActivities(
  dailyLoad: Record<string, number>,
  start: string,
  end: string
): Record<string, { acute: number; chronic: number }> {
  const first = Object.keys(dailyLoad).sort()[0];
  if (!first) return {};
  const out: Record<string, { acute: number; chronic: number }> = {};
  let acute = 0;
  let chronic = 0;
  // Warm up from the first activity so day one of the range isn't zero.
  for (let date = first < start ? first : start; date <= end; date = addDays(date, 1)) {
    const load = dailyLoad[date] ?? 0;
    acute += (load - acute) * (2 / (7 + 1));
    chronic += (load - chronic) * (2 / (28 + 1));
    if (date >= start) out[date] = { acute: acute * 7, chronic: chronic * 7 };
  }
  return out;
}

export function buildLoadSeries(
  wellness: WellnessRow[],
  dailyLoad: Record<string, number>,
  start: string,
  end: string
): LoadSeries {
  const byDate = new Map(wellness.map((w) => [w.date, w]));
  const garminLoad = wellness.some((w) => w.acute_training_load !== null);
  const computed = garminLoad ? {} : loadFromActivities(dailyLoad, start, end);

  const days: LoadDay[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const w = byDate.get(date);
    const c = computed[date];
    const acute = garminLoad ? (w?.acute_training_load ?? null) : (c?.acute ?? null);
    const chronic = garminLoad ? (w?.chronic_training_load ?? null) : (c?.chronic ?? null);
    days.push({
      date,
      acute,
      chronic,
      acwr: garminLoad
        ? (w?.acwr ?? null)
        : acute !== null && chronic
          ? Math.round((acute / chronic) * 100) / 100
          : null,
      hrv: w?.hrv_last_night_avg ?? null,
      hrvWeekly: w?.hrv_weekly_avg ?? null,
      hrvStatus: w?.hrv_status ?? null,
      sleepScore: w?.sleep_score ?? null,
      restingHr: w?.resting_hr ?? null,
      readiness: w?.training_readiness_score ?? null,
    });
  }
  return { days, loadSource: garminLoad ? "garmin" : "activities" };
}

export interface FatigueSignal {
  key: "acwr" | "hrv" | "readiness" | "sleep" | "restingHr";
  /** Which message it is, for the interface's own wording (lib/i18n). */
  code:
    | "acwr"
    | "hrvStreak"
    | "hrvStress"
    | "readinessStreak"
    | "sleepStreak"
    | "restingHrIllness"
    | "restingHrUp";
  /** The figure the message quotes: ACWR, days, nights or bpm. */
  n: number;
  /** Red: rest or very easy; warn: hold off the intensity. */
  level: "warn" | "red";
  /** In English, for the coach. */
  text: string;
}

const HRV_LOW = ["LOW", "UNBALANCED", "POOR"];

/** How many of the last days, counting back from the end, pass the test. */
function streak(days: LoadDay[], test: (d: LoadDay) => boolean | null): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const r = test(days[i]);
    if (r === null) continue; // no data that day: doesn't break the streak
    if (!r) break;
    n++;
  }
  return n;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Resting heart rate on day i against the median of the 7 days before it,
 * or null without the reading or at least 4 days to compare with.
 */
function restingHrRise(days: LoadDay[], i: number): number | null {
  const hr = days[i]?.restingHr;
  if (hr == null) return null;
  const before = days
    .slice(Math.max(0, i - 7), i)
    .map((d) => d.restingHr)
    .filter((v): v is number => v !== null);
  if (before.length < 4) return null;
  return hr - median(before);
}

/** Wrist resting HR moves 3-5 bpm from day to day on its own: it only
 * counts as up past +7 on the week's median, or +5 two days running. */
const RHR_CLEARLY_UP = 7;
const RHR_UP_TWO_DAYS = 5;
/** Garmin's "poor" training readiness band. */
const READINESS_POOR = 25;

export interface MorningRead {
  date: string;
  /** HRV status low last night; null without a status. */
  hrvLow: boolean | null;
  /** Resting HR against the week before, in bpm; null without enough data. */
  restingHrRise: number | null;
  /** Clearly up: past the noise of a single wrist reading. */
  restingHrUp: boolean | null;
  /** HRV low and resting HR up, or readiness poor: no hard session today or tomorrow. */
  red: boolean;
}

/**
 * How the body reads on day i, from HRV and resting heart rate together:
 * HRV says whether training is getting on top of the athlete, resting HR
 * whether something else is (illness, heat, alcohol, dehydration) - it
 * stays flat or drops when training alone is the cause.
 */
export function morningRead(days: LoadDay[], i: number): MorningRead {
  const d = days[i];
  const hrvLow = d.hrvStatus ? HRV_LOW.includes(d.hrvStatus.toUpperCase()) : null;
  const rise = restingHrRise(days, i);
  const prev = i > 0 ? restingHrRise(days, i - 1) : null;
  const restingHrUp =
    rise === null
      ? null
      : rise > RHR_CLEARLY_UP || (rise >= RHR_UP_TWO_DAYS && (prev ?? 0) >= RHR_UP_TWO_DAYS);
  const poorReadiness = d.readiness !== null && d.readiness < READINESS_POOR;
  return {
    date: d.date,
    hrvLow,
    restingHrRise: rise === null ? null : Math.round(rise),
    restingHrUp,
    red: (hrvLow === true && restingHrUp === true) || poorReadiness,
  };
}

/** The days, among the last `last`, that read red (see morningRead). */
export function redDays(days: LoadDay[], last = 2): string[] {
  const out: string[] = [];
  for (let i = Math.max(0, days.length - last); i < days.length; i++) {
    if (morningRead(days, i).red) out.push(days[i].date);
  }
  return out;
}

/**
 * Signs the body is behind the training, as of the last day: load ramping
 * faster than fitness, HRV below its normal range, readiness or sleep low
 * several days running, resting heart rate clearly up on the week before -
 * read together with HRV to tell training fatigue from something else.
 */
export function fatigueSignals(days: LoadDay[]): FatigueSignal[] {
  const recent = days.slice(-7);
  const out: FatigueSignal[] = [];
  const last = [...recent].reverse().find((d) => d.acwr !== null);
  if (last?.acwr && last.acwr > 1.5) {
    out.push({
      key: "acwr",
      code: "acwr",
      n: last.acwr,
      level: "warn",
      text: `Load ramping fast: ACWR ${last.acwr.toFixed(2)} (keep under ~1.5)`,
    });
  }
  const hrv = streak(recent, (d) =>
    d.hrvStatus ? HRV_LOW.includes(d.hrvStatus.toUpperCase()) : null
  );
  // This morning (or the latest morning with a reading, at most a day back).
  let latest = -1;
  for (let i = days.length - 1; i >= Math.max(0, days.length - 2); i--) {
    if (days[i].restingHr !== null || days[i].hrvStatus !== null) {
      latest = i;
      break;
    }
  }
  const today = latest >= 0 ? morningRead(days, latest) : null;

  if (hrv >= 3) {
    out.push({
      key: "hrv",
      code: "hrvStreak",
      n: hrv,
      level: "warn",
      text: `HRV below your normal range ${hrv} days running`,
    });
  } else if (today?.hrvLow && today.restingHrUp === false) {
    out.push({
      key: "hrv",
      code: "hrvStress",
      n: 0,
      level: "warn",
      text: "HRV low with resting heart rate steady: stress or short sleep rather than illness - easy running is fine, skip the intensity",
    });
  }
  const readiness = streak(recent, (d) => (d.readiness === null ? null : d.readiness < 40));
  if (readiness >= 3)
    out.push({
      key: "readiness",
      code: "readinessStreak",
      n: readiness,
      level: "warn",
      text: `Low training readiness ${readiness} days running`,
    });
  const sleep = streak(recent, (d) => (d.sleepScore === null ? null : d.sleepScore < 60));
  if (sleep >= 3) {
    out.push({
      key: "sleep",
      code: "sleepStreak",
      n: sleep,
      level: "warn",
      text: `Poor sleep ${sleep} nights running`,
    });
  }

  if (today?.restingHrUp) {
    const up = `Resting heart rate up ${today.restingHrRise} bpm on the week before`;
    out.push({
      key: "restingHr",
      code: today.hrvLow ? "restingHrIllness" : "restingHrUp",
      n: today.restingHrRise ?? 0,
      level: today.hrvLow ? "red" : "warn",
      text: today.hrvLow
        ? `${up}, with HRV low: more likely illness, heat, alcohol or dehydration than training - rest or keep it very easy`
        : `${up}: hold off hard sessions and check again tomorrow`,
    });
  }
  return out;
}
