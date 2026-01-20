import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";

import { tables, userSettings } from "./db/schema";

export type UserSettingsInput = Record<string, unknown>;
export type UserSettingsOutput = Record<string, string | null>;

/**
 * Upsert user settings into `user_settings`.
 * Equivalent to SQLite: INSERT OR REPLACE INTO user_settings (user_id, setting_key, setting_value) ...
 */
export const updateUserSettingsToDb = async (
  c: Context,
  userId: string,
  userSettingsDict: UserSettingsInput,
): Promise<void> => {
  const entries = Object.entries(userSettingsDict);
  if (entries.length === 0) return;

  const db = drizzle(c.env.DB, { schema: tables });

  const rows = entries.map(([key, value]) => ({
    userId,
    settingKey: key,
    settingValue: String(value),
  }));

  // Batch upsert by composite primary key: (user_id, setting_key)
  await db
    .insert(userSettings)
    .values(rows)
    .onConflictDoUpdate({
      target: [userSettings.userId, userSettings.settingKey],
      set: {
        settingValue: sql`excluded.setting_value`,
      },
    });
};

/**
 * Query user settings from `user_settings` by userId.
 * Returns an object map: { [settingKey]: settingValue }
 */
export const getUserSettingsFromDb = async (
  c: Context,
  userId: string,
): Promise<UserSettingsOutput> => {
  const db = drizzle(c.env.DB, { schema: tables });

  const rows = await db.query.userSettings.findMany({
    where: (userSettings, { eq }) => eq(userSettings.userId, userId),
  });

  const result: UserSettingsOutput = {};
  for (const row of rows) {
    result[row.settingKey] = row.settingValue ?? null;
  }

  return result;
};
