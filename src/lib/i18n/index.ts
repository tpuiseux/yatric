/**
 * The interface in French or English: the athlete's messages (en.ts, fr.ts)
 * and the formatting of dates, durations and numbers that goes with them.
 * The locale comes from the `lang` cookie, else the browser's language
 * (hooks.server.ts), and reaches components through context (getI18n).
 */

import { getContext, setContext } from "svelte";
import { en, type Messages } from "./en.js";
import { fr } from "./fr.js";

export type Locale = "fr" | "en";
export const LOCALES: readonly Locale[] = ["fr", "en"];
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

const MESSAGES: Record<Locale, Messages> = { fr, en };
/** The Intl locale behind each interface language. */
const INTL: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en";
}

/** The cookie's choice if any, else the first of the browser's languages we speak. */
export function resolveLocale(cookie: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const lang = part.trim().slice(0, 2).toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return "en";
}

export function messages(locale: Locale): Messages {
  return MESSAGES[locale];
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Dates, durations and numbers, written the way each language writes them. */
export function formatter(locale: Locale) {
  const intl = INTL[locale];
  const dateFormats = {
    /** "vendredi 23 octobre" / "Friday 23 October" */
    long: { weekday: "long", day: "numeric", month: "long" },
    /** "dimanche 1 novembre 2026" */
    full: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
    /** "23 oct." / "23 Oct" */
    short: { day: "numeric", month: "short" },
    /** "23 octobre" */
    dayMonth: { day: "numeric", month: "long" },
    /** "ven." / "Fri" */
    weekday: { weekday: "short" },
    /** "vendredi" / "Friday" */
    weekdayLong: { weekday: "long" },
  } satisfies Record<string, Intl.DateTimeFormatOptions>;

  return {
    locale,
    /** A YYYY-MM-DD date. */
    date(iso: string, style: keyof typeof dateFormats = "long"): string {
      if (!iso) return "";
      return parseIso(iso).toLocaleDateString(intl, { ...dateFormats[style], timeZone: "UTC" });
    },
    /** "1 h 37", "46 min" / "1h 37m", "46 min". */
    duration(minutes: number | null | undefined): string {
      if (!minutes || minutes < 0) return "";
      const total = Math.round(minutes);
      const h = Math.floor(total / 60);
      const m = total % 60;
      if (h === 0) return `${m} min`;
      if (locale === "fr") return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
      return m ? `${h}h ${m}m` : `${h}h`;
    },
    /** A number with the language's decimal mark: "9,9" / "9.9". */
    number(value: number, digits = 0): string {
      return value.toLocaleString(intl, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    },
    /** "à l'instant", "il y a 12 min" / "just now", "12 min ago". */
    relative(iso: string, now = Date.now()): string {
      const minutes = Math.round((now - Date.parse(iso)) / 60000);
      const rtf = new Intl.RelativeTimeFormat(intl, { numeric: "auto", style: "short" });
      if (minutes < 1) return rtf.format(0, "second");
      if (minutes < 60) return rtf.format(-minutes, "minute");
      const hours = Math.round(minutes / 60);
      if (hours < 24) return rtf.format(-hours, "hour");
      return rtf.format(-Math.round(hours / 24), "day");
    },
  };
}

export type Formatter = ReturnType<typeof formatter>;

export interface I18n {
  readonly locale: Locale;
  readonly m: Messages;
  readonly fmt: Formatter;
}

const KEY = Symbol("i18n");

/** Called once by the root layout, with a getter so a language change follows. */
export function setI18n(getLocale: () => Locale): I18n {
  const cache = new Map<Locale, Formatter>();
  const i18n: I18n = {
    get locale() {
      return getLocale();
    },
    get m() {
      return MESSAGES[getLocale()];
    },
    get fmt() {
      const l = getLocale();
      if (!cache.has(l)) cache.set(l, formatter(l));
      return cache.get(l)!;
    },
  };
  return setContext(KEY, i18n);
}

export function getI18n(): I18n {
  const i18n = getContext<I18n>(KEY);
  if (!i18n) throw new Error("getI18n() outside the root layout");
  return i18n;
}

export type { Messages };
