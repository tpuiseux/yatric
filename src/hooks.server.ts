import type { Handle } from "@sveltejs/kit";
import { base } from "$app/paths";
import { initDatabase } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { validateSession } from "./auth/session.js";
import { findUserById } from "./auth/users.js";
import { resolveLocale } from "$lib/i18n/index.js";
import { resolveTheme } from "$lib/preferences.js";

export const SESSION_COOKIE = "session";

// initDatabase()/migrate() are cheap once run, but async - cache the
// promise so every request after the first just awaits the same one
// instead of re-running the (idempotent, but pointless) migration.
let dbReady: Promise<void> | null = null;
function ensureDb(): Promise<void> {
  if (!dbReady) {
    dbReady = initDatabase().then(() => migrate());
  }
  return dbReady;
}

// Public routes: everything else requires a session, enforced here rather
// than per-route so a new route can't accidentally ship unauthenticated.
// event.url.pathname includes `base` (nginx passes the full path through
// unchanged, matching how paths.base is configured - see svelte.config.js),
// so comparisons/redirects here need `base` prepended too.
// /signup answers 404 itself when SIGNUP_INVITE_CODE is unset (see
// routes/signup/+page.server.ts), so listing it here opens nothing by default.
const PUBLIC_ROUTES = new Set([`${base}/login`, `${base}/signup`]);
// Open with or without a session: the language and theme switch, also
// offered on the login page.
const OPEN_ROUTES = new Set([`${base}/preferences`]);

export const handle: Handle = async ({ event, resolve }) => {
  await ensureDb();

  const sessionId = event.cookies.get(SESSION_COOKIE);
  const userId = sessionId ? validateSession(sessionId) : null;

  if (userId) {
    const user = findUserById(userId);
    event.locals.user = user ? { id: user.id, email: user.email, name: user.name } : null;
  } else {
    event.locals.user = null;
  }

  event.locals.locale = resolveLocale(
    event.cookies.get("lang"),
    event.request.headers.get("accept-language")
  );
  event.locals.theme = resolveTheme(event.cookies.get("theme"));

  const isPublicRoute = PUBLIC_ROUTES.has(event.url.pathname);

  const isOpenRoute = OPEN_ROUTES.has(event.url.pathname);

  if (!event.locals.user && !isPublicRoute && !isOpenRoute) {
    return new Response(null, { status: 302, headers: { location: `${base}/login` } });
  }
  if (event.locals.user && isPublicRoute) {
    return new Response(null, { status: 302, headers: { location: `${base}/` } });
  }

  const { locale, theme } = event.locals;
  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace('<html lang="en">', `<html lang="${locale}" data-theme="${theme}">`),
  });
};
