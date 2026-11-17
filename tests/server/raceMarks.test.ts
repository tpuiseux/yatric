import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { TrainingPlan } from "../../src/schema/training-plan.js";

describe("race marks", () => {
  const testDir = mkdtempSync(join(tmpdir(), "yatric-racemarks-test-"));
  let user: number;
  // The prediction reads the last weeks before today: dates relative to it.
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    process.env.YATRIC_DB_PATH = join(testDir, "test.db");
    const { initDatabase, run } = await import("../../src/db/client.js");
    const { migrate } = await import("../../src/db/migrate.js");
    await initDatabase();
    migrate();
    const { createUser } = await import("../../src/auth/users.js");
    user = createUser("race@example.com", "race-password").id;
    const add = (id: number, date: string, km: number, seconds: number, garminRace = false) =>
      run(
        `INSERT INTO activities (id, user_id, sport_type, start_date_local, distance, moving_time, workout_type)
         VALUES (?, ?, 'Run', ?, ?, ?, ?)`,
        [id, user, `${date}T09:00:00`, km * 1000, seconds, garminRace ? 1 : null]
      );
    add(1, day(-20), 10, 2700); // a 10K the athlete marks, chip time 44:30
    add(2, day(-10), 10, 2500, true); // Garmin's "race" the athlete un-marks
    run(
      "INSERT INTO race_marks (activity_id, user_id, is_race, official_seconds) VALUES (1, ?, 1, 2670)",
      [user]
    );
    run("INSERT INTO race_marks (activity_id, user_id, is_race) VALUES (2, ?, 0)", [user]);
    run("INSERT INTO daily_wellness (user_id, date, vo2max) VALUES (?, ?, 55), (?, ?, 55)", [
      user,
      day(-25),
      user,
      day(-2),
    ]);
  });

  afterAll(() => rmSync(testDir, { recursive: true, force: true }));

  it("shows the athlete's marks on the activities", async () => {
    const { getActivitiesByDate } = await import("../../src/lib/server/activities.js");
    const byDate = getActivitiesByDate(user, day(-30), day(0));
    expect(byDate[day(-20)][0]).toMatchObject({ race: true, officialSeconds: 2670 });
    expect(byDate[day(-10)][0]).toMatchObject({ race: false, officialSeconds: null });
  });

  it("calibrates on the race the athlete kept, at its official time", async () => {
    const { getRacePrediction } = await import("../../src/lib/server/racePrediction.js");
    const { vdot } = await import("../../src/lib/racePrediction.js");
    const plan = {
      meta: { planStartDate: day(-30), eventDate: day(60) },
      raceStrategy: { event: { name: "10K", distances: { run: 10 } } },
    } as unknown as TrainingPlan;
    const e = getRacePrediction(user, plan)!.current.estimates.find((x) => x.kind === "vo2max")!;
    expect(e.kind === "vo2max" && e.calibration).toMatchObject({
      raceDate: day(-20),
      raceVdot: vdot(10000, 2670),
    });
  });
});
