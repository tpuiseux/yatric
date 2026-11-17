import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const bridge = vi.hoisted(() => ({ activities: vi.fn(), vo2max: vi.fn() }));
vi.mock("../../src/lib/server/garminBridge.js", () => ({
  fetchGarminActivities: bridge.activities,
  fetchGarminVo2max: bridge.vo2max,
  fetchGarminWellness: async () => ({ ok: true, data: { days: [] } }),
  fetchGarminActivityDetails: async () => ({ ok: false, status: 503, message: "not in this test" }),
}));

describe("history backfill", () => {
  const testDir = mkdtempSync(join(tmpdir(), "yatric-backfill-test-"));
  let user: number;
  const now = Date.parse("2026-11-17T12:00:00Z");

  beforeAll(async () => {
    process.env.YATRIC_DB_PATH = join(testDir, "test.db");
    const { initDatabase, run } = await import("../../src/db/client.js");
    const { migrate } = await import("../../src/db/migrate.js");
    await initDatabase();
    migrate();
    const { createUser } = await import("../../src/auth/users.js");
    user = createUser("backfill@example.com", "backfill-password").id;
    // A first sync's six weeks are here, and today's VO2max.
    run(
      "INSERT INTO activities (id, user_id, sport_type, start_date_local, distance, moving_time) VALUES (1, ?, 'Run', '2026-10-07T09:00:00', 10000, 3000)",
      [user]
    );
    run("INSERT INTO daily_wellness (user_id, date, vo2max) VALUES (?, '2026-11-16', 55.6)", [
      user,
    ]);
    run(
      "INSERT INTO garmin_sync_state (user_id, status, started_at) VALUES (?, 'success', datetime('now'))",
      [user]
    );
  });

  afterAll(() => rmSync(testDir, { recursive: true, force: true }));

  it("pulls in the year before the first sync, once", async () => {
    bridge.activities.mockImplementation(async (_u: number, start: string, end: string) => ({
      ok: true,
      data: {
        duplicatesRemoved: 0,
        activities:
          start <= "2026-03-01" && end >= "2026-03-01"
            ? [
                {
                  id: 2,
                  sport_type: "Run",
                  start_date_local: "2026-03-01T09:00:00",
                  workout_type: 1,
                },
              ]
            : [],
      },
    }));
    bridge.vo2max.mockResolvedValue({
      ok: true,
      data: {
        days: [
          { date: "2026-02-20", vo2max: 53 },
          { date: "2026-11-16", vo2max: 99 },
        ],
      },
    });
    const { backfillHistory } = await import("../../src/lib/server/garminSync.js");
    const { all, get } = await import("../../src/db/client.js");
    await backfillHistory(user, now);

    // 2025-11-18 to 2026-10-06, in 120-day chunks, newest first.
    const ranges = bridge.activities.mock.calls.map((c) => [c[1], c[2]]);
    expect(ranges[0]).toEqual(["2026-06-09", "2026-10-06"]);
    expect(ranges[ranges.length - 1][0]).toBe("2025-11-18");
    expect(bridge.vo2max).toHaveBeenCalledWith(user, "2025-11-18", "2026-11-17");
    expect(all("SELECT id FROM activities WHERE user_id = ? ORDER BY id", [user])).toEqual([
      { id: 1 },
      { id: 2 },
    ]);
    // Old VO2max added; the daily sync's value kept.
    expect(
      all("SELECT date, vo2max FROM daily_wellness WHERE user_id = ? ORDER BY date", [user])
    ).toEqual([
      { date: "2026-02-20", vo2max: 53 },
      { date: "2026-11-16", vo2max: 55.6 },
    ]);

    const calls = bridge.activities.mock.calls.length;
    await backfillHistory(user, now);
    expect(bridge.activities.mock.calls.length).toBe(calls);
    expect(
      get<{ at: string | null }>(
        "SELECT history_backfilled_at AS at FROM garmin_sync_state WHERE user_id = ?",
        [user]
      )?.at
    ).toBeTruthy();
  });
});
