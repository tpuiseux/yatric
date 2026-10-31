import type { PageServerLoad } from "./$types";
import { all } from "../db/client.js";
import type { DraftStatus } from "$lib/planDraft.js";

interface PlanRow {
  id: string;
  event: string;
  event_date: string;
  start_date: string | null;
  total_weeks: number | null;
  updated_at: string;
}

export const load: PageServerLoad = async ({ locals }) => {
  // locals.user is guaranteed non-null here: hooks.server.ts redirects to
  // /login for every route outside PUBLIC_ROUTES before this ever runs.
  const plans = all<PlanRow>(
    `SELECT id, event, event_date, updated_at,
       CASE WHEN json_valid(data) THEN json_extract(data, '$.meta.planStartDate') END AS start_date,
       CASE WHEN json_valid(data) THEN json_extract(data, '$.meta.totalWeeks') END AS total_weeks
     FROM plans WHERE user_id = ? ORDER BY event_date`,
    [locals.user!.id]
  );

  // Plans the coach is still writing (or waiting on): they only reach `plans`
  // once adopted, so without these an athlete who leaves loses the way back.
  const drafts = all<{ id: number; status: DraftStatus; race: string | null }>(
    `SELECT id, status, json_extract(form, '$.raceName') AS race FROM plan_drafts
     WHERE user_id = ? AND status != 'adopted' ORDER BY id DESC LIMIT 5`,
    [locals.user!.id]
  );

  return { user: locals.user, plans, drafts };
};
