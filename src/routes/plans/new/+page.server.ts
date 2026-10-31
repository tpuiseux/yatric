import type { PageServerLoad } from "./$types";
import { coachConfigured } from "$lib/server/coach/agent.js";
import { isGarminBridgeConfigured } from "$lib/server/garminBridge.js";
import { isGarminConnected } from "$lib/server/garminCredentials.js";
import { addDays, nextMonday } from "$lib/server/planBuilder/form.js";
import { garminSnapshot } from "$lib/server/planBuilder/garmin.js";
import { todayLocal } from "$lib/server/weekReview.js";

export const load: PageServerLoad = async ({ locals }) => {
  const today = todayLocal();
  const userId = locals.user!.id;
  return {
    configured: coachConfigured(),
    today,
    startDate: nextMonday(addDays(today, 1)),
    garmin: {
      available: isGarminBridgeConfigured(),
      connected: isGarminConnected(userId),
      snapshot: garminSnapshot(userId, today),
    },
  };
};
