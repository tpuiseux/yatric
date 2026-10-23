/** Per-browser display preferences, kept in cookies (see routes/preferences). */

export type Theme = "light" | "dark" | "system";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

/** Dark unless the athlete chose otherwise. */
export function resolveTheme(cookie: string | undefined): Theme {
  return isTheme(cookie) ? cookie : "dark";
}
