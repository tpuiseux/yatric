import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("garminSnapshot (plan form prefill)", () => {
  const testDir = mkdtempSync(join(tmpdir(), "yatric-snapshot-test-"));
  let user: number;
  let empty: number;

  beforeAll(async () => {
    process.env.YATRIC_DB_PATH = join(testDir, "test.db");
    const { initDatabase, run } = await import("../../src/db/client.js");
    const { migrate } = await import("../../src/db/migrate.js");
    await initDatabase();
    migrate();
    const { createUser } = await import("../../src/auth/users.js");
    user = createUser("snap@example.com", "snap-password").id;
    empty = createUser("empty@example.com", "empty-password").id;
    const add = (id: number, date: string, sport: string, km: number, min: number, maxHr = 160) =>
      run(
        `INSERT INTO activities (id, user_id, sport_type, start_date_local, distance, moving_time, max_heartrate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, user, sport, `${date}T08:00:00`, km * 1000, min * 60, maxHr]
      );
    // Last 4 weeks (today 2026-10-31): 8 runs of 10 km, 2 rides of 2 h, a swim.
    for (let i = 0; i < 8; i++)
      add(i + 1, `2026-10-${String(5 + i * 3).padStart(2, "0")}`, "Run", 10, 55);
    add(20, "2026-10-12", "Ride", 60, 120);
    add(21, "2026-10-19", "Ride", 60, 120);
    add(22, "2026-10-20", "Swim", 2, 45);
    // Weeks 5-8: the longest run counts, its volume doesn't. Months ago: only the max HR.
    add(30, "2026-09-20", "TrailRun", 24.5, 170);
    add(31, "2026-03-01", "Run", 5, 25, 192);
    run(
      "INSERT INTO daily_wellness (user_id, date, resting_hr) VALUES (?, '2026-10-28', 48), (?, '2026-10-29', 50)",
      [user, user]
    );
  });

  afterAll(() => rmSync(testDir, { recursive: true, force: true }));

  it("reads the form's current-training fields from the history", async () => {
    const { garminSnapshot } = await import("../../src/lib/server/planBuilder/garmin.js");
    expect(garminSnapshot(user, "2026-10-31")).toEqual({
      activities: 11,
      runsPerWeek: 2,
      currentWeeklyKm: 20,
      longestRecentRunKm: 24.5,
      swimKmPerWeek: 0.5,
      bikeHoursPerWeek: 1,
      skiHoursPerWeek: 0,
      maxHr: 192,
      restingHr: 49,
    });
  });

  it("is null with nothing recorded in 8 weeks", async () => {
    const { garminSnapshot } = await import("../../src/lib/server/planBuilder/garmin.js");
    expect(garminSnapshot(empty, "2026-10-31")).toBeNull();
  });
});
