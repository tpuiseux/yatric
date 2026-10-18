import { existsSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";

/** Where the SQLite database lives: YATRIC_DB_PATH, or data/yatric.db under the working directory. */
export function getDbPath(): string {
  return resolve(process.env.YATRIC_DB_PATH || "data/yatric.db");
}

export function ensureDbDir(): void {
  const dir = dirname(getDbPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
