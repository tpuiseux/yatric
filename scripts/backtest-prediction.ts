/**
 * Backtest of the race-time prediction: for every run tagged as a race,
 * the prediction as it stood the day before, from the training before it,
 * against the time actually run. Read-only.
 *
 *   npx tsx scripts/backtest-prediction.ts path/to/coach.db
 *
 * On the server (no sources or tsx in the image), bundle it and pipe it in:
 *   npx esbuild scripts/backtest-prediction.ts --bundle --platform=node --format=esm \
 *     | ssh myvps 'docker exec -i training-web sh -c "cat > /tmp/bt.mjs && node /tmp/bt.mjs /data/coach.db; rm /tmp/bt.mjs"'
 *
 * Prints no names or e-mails: users are numbered, and only race dates,
 * distances and times are shown.
 */
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import type { ActivitySeries } from "../src/lib/activityAnalysis.js";
import {
  predictAt,
  summarizeRun,
  type Estimate,
  type RunSummary,
  type Vo2maxReading,
} from "../src/lib/racePrediction.js";

const RUN_TYPES = ["Run", "TrailRun", "VirtualRun"];

interface Row {
  user_id: number;
  id: number;
  start: string;
  distance: number | null;
  moving_time: number | null;
  elapsed_time: number | null;
  race: number;
  official_seconds: number | null;
  data: string | null;
}

export interface Result {
  user: number;
  date: string;
  km: number;
  actual: number;
  /** Seconds predicted by each method; missing when it couldn't predict. */
  predicted: Record<string, number>;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Each race, predicted from what came before it. */
export function backtest(
  runsByUser: Map<number, RunSummary[]>,
  vo2ByUser: Map<number, Vo2maxReading[]>,
  lthrByUser = new Map<number, number>()
): Result[] {
  const results: Result[] = [];
  for (const [user, runs] of runsByUser) {
    const vo2 = vo2ByUser.get(user) ?? [];
    for (const race of runs.filter((r) => r.race && r.distanceMeters >= 3000)) {
      const before = addDays(race.date, -1);
      // Same-day runs are the race's warm-up at best: leave them out.
      const history = runs.filter((r) => r.date <= before);
      const target = {
        distanceMeters: race.distanceMeters,
        goalSeconds: null,
        raceHr: null,
        lthr: lthrByUser.get(user) ?? null,
      };
      const p = predictAt(before, target, history, vo2);
      const of = (kind: Estimate["kind"]) => p.estimates.find((e) => e.kind === kind);
      const predicted: Record<string, number> = {};
      if (p.seconds !== null) predicted.model = p.seconds;
      if (p.estimates.length) {
        predicted.average = p.estimates.reduce((s, e) => s + e.seconds, 0) / p.estimates.length;
      }
      for (const e of p.estimates) predicted[e.kind] = e.seconds;
      const v = of("vo2max");
      if (v?.kind === "vo2max" && v.calibration) {
        // The same reading, uncalibrated, for comparison.
        predicted.vo2maxRaw = predictAt(before, target, [], vo2).estimates[0]?.seconds ?? NaN;
      } else if (v) {
        predicted.vo2maxRaw = v.seconds;
      }
      results.push({
        user,
        date: race.date,
        km: race.distanceMeters / 1000,
        actual: race.movingSeconds,
        predicted,
      });
    }
  }
  return results;
}

export interface Summary {
  method: string;
  band: string;
  n: number;
  /** Mean of (predicted - actual) / actual, in %: negative = too fast. */
  bias: number;
  /** Mean absolute error, in %. */
  mae: number;
}

const band = (km: number) =>
  km < 8 ? "5K" : km < 16 ? "10K" : km < 30 ? "half" : km < 45 ? "marathon" : "ultra";

export function summarize(results: Result[]): Summary[] {
  const groups = new Map<string, number[]>();
  for (const r of results) {
    for (const [method, seconds] of Object.entries(r.predicted)) {
      if (!Number.isFinite(seconds)) continue;
      const err = ((seconds - r.actual) / r.actual) * 100;
      for (const b of ["all", band(r.km)]) {
        const key = `${method}|${b}`;
        groups.set(key, [...(groups.get(key) ?? []), err]);
      }
    }
  }
  return [...groups]
    .map(([key, errs]) => {
      const [method, b] = key.split("|");
      return {
        method,
        band: b,
        n: errs.length,
        bias: errs.reduce((s, e) => s + e, 0) / errs.length,
        mae: errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length,
      };
    })
    .sort((a, b) => a.band.localeCompare(b.band) || a.mae - b.mae);
}

function load(dbPath: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db
    .prepare(
      `SELECT a.user_id, a.id, COALESCE(a.start_date_local, a.start_date) AS start, a.distance,
              a.moving_time, a.elapsed_time, r.official_seconds, d.data,
              COALESCE(r.is_race, a.workout_type = 1, 0) AS race
       FROM activities a
       LEFT JOIN activity_details d ON d.activity_id = a.id AND d.user_id = a.user_id
       LEFT JOIN race_marks r ON r.activity_id = a.id AND r.user_id = a.user_id
       WHERE a.user_id IS NOT NULL AND a.sport_type IN (${RUN_TYPES.map(() => "?").join(", ")})
         AND COALESCE(a.start_date_local, a.start_date) IS NOT NULL`
    )
    .all(...RUN_TYPES) as unknown as Row[];
  const runsByUser = new Map<number, RunSummary[]>();
  for (const row of rows) {
    let series: ActivitySeries | null = null;
    try {
      series = row.data
        ? ((JSON.parse(row.data) as { series?: ActivitySeries }).series ?? null)
        : null;
    } catch {
      series = null;
    }
    const run = summarizeRun(
      {
        id: row.id,
        date: row.start.slice(0, 10),
        distanceMeters: row.distance ?? 0,
        movingSeconds: row.official_seconds ?? row.moving_time ?? row.elapsed_time ?? 0,
        race: row.race === 1,
      },
      series
    );
    runsByUser.set(row.user_id, [...(runsByUser.get(row.user_id) ?? []), run]);
  }
  const vo2ByUser = new Map<number, Vo2maxReading[]>();
  const readings = db
    .prepare("SELECT user_id, date, vo2max AS value FROM daily_wellness WHERE vo2max IS NOT NULL")
    .all() as unknown as (Vo2maxReading & { user_id: number })[];
  for (const { user_id, date, value } of readings) {
    vo2ByUser.set(user_id, [...(vo2ByUser.get(user_id) ?? []), { date, value }]);
  }
  // Threshold heart rate from each athlete's latest plan, to spot all-out efforts.
  const lthrByUser = new Map<number, number>();
  const plans = db
    .prepare("SELECT user_id, data FROM plans WHERE user_id IS NOT NULL ORDER BY updated_at")
    .all() as unknown as { user_id: number; data: string }[];
  for (const { user_id, data } of plans) {
    try {
      const lthr = (JSON.parse(data) as { zones?: { run?: { hr?: { lthr?: unknown } } } }).zones
        ?.run?.hr?.lthr;
      if (typeof lthr === "number" && lthr > 0) lthrByUser.set(user_id, lthr);
    } catch {
      // A plan that isn't JSON says nothing about heart rate.
    }
  }
  db.close();
  return { runsByUser, vo2ByUser, lthrByUser };
}

const clock = (s: number) =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function main() {
  const dbPath = process.argv[2];
  if (!dbPath) throw new Error("Usage: backtest-prediction.ts <coach.db>");
  const { runsByUser, vo2ByUser, lthrByUser } = load(dbPath);
  const results = backtest(runsByUser, vo2ByUser, lthrByUser);

  // Users by number, not id.
  const userNo = new Map([...new Set(results.map((r) => r.user))].map((u, i) => [u, i + 1]));
  const methods = ["model", "average", "effort", "vo2max", "vo2maxRaw", "heartRate", "volume"];
  console.log(`${results.length} races from ${userNo.size} athletes\n`);
  console.log(["athlete", "date", "km", "actual", ...methods].join("\t"));
  for (const r of results.sort((a, b) => a.date.localeCompare(b.date))) {
    console.log(
      [
        `#${userNo.get(r.user)}`,
        r.date,
        r.km.toFixed(1),
        clock(r.actual),
        ...methods.map((m) => (Number.isFinite(r.predicted[m]) ? clock(r.predicted[m]) : "-")),
      ].join("\t")
    );
  }
  console.log("\nerror vs actual (bias < 0: predicted too fast)");
  console.log(["distance", "method", "n", "bias %", "mean abs %"].join("\t"));
  for (const s of summarize(results)) {
    console.log([s.band, s.method, s.n, s.bias.toFixed(1), s.mae.toFixed(1)].join("\t"));
  }
}

// Run as a script, not when imported by the tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
