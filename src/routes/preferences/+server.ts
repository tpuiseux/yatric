import { json, type RequestHandler } from "@sveltejs/kit";
import { base } from "$app/paths";
import { isLocale } from "$lib/i18n/index.js";
import { isTheme } from "$lib/preferences.js";

const YEAR = 60 * 60 * 24 * 365;

/** Saves the interface language and theme for this browser: {lang?, theme?}. */
export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const options = { path: base || "/", maxAge: YEAR, sameSite: "lax" as const, httpOnly: true };
  if (isLocale(body?.lang)) cookies.set("lang", body.lang, options);
  if (isTheme(body?.theme)) cookies.set("theme", body.theme, options);
  return json({ ok: true });
};
