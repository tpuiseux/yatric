import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { get, run } from "../../../../db/client.js";
import { readJsonBody, ValidationError } from "$lib/server/validation.js";

/** Marks one of the athlete's runs as a race (or not), with its official time. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const userId = locals.user!.id;
  const activityId = Number(params.id);
  const activity = Number.isSafeInteger(activityId)
    ? get<{ moving_time: number | null }>(
        "SELECT moving_time FROM activities WHERE id = ? AND user_id = ?",
        [activityId, userId]
      )
    : undefined;
  if (!activity) throw error(404, "Activity not found");

  let body: { race?: unknown; officialSeconds?: unknown } | null;
  try {
    body = (await readJsonBody(request)) as typeof body;
  } catch (err) {
    if (err instanceof ValidationError) throw error(400, err.message);
    throw err;
  }
  if (typeof body?.race !== "boolean") throw error(400, "race must be true or false");
  const official = body.officialSeconds ?? null;
  // 1 min to 2 days: anything else is a typo.
  if (
    official !== null &&
    (typeof official !== "number" ||
      !Number.isInteger(official) ||
      official < 60 ||
      official > 172800)
  ) {
    throw error(400, "officialSeconds must be a time in seconds");
  }

  run(
    `INSERT INTO race_marks (activity_id, user_id, is_race, official_seconds) VALUES (?, ?, ?, ?)
     ON CONFLICT(activity_id) DO UPDATE SET is_race = excluded.is_race,
       official_seconds = excluded.official_seconds, updated_at = datetime('now')`,
    [activityId, userId, body.race ? 1 : 0, body.race ? official : null]
  );
  return json({ ok: true });
};
