import {
  sqliteTable,
  integer,
  text,
  primaryKey
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm"; // 正确导入 sql


export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email", { length: 255 }).notNull().unique(),
  username: text("username", { length: 255 }),
  password: text("password", { length: 255 }),
  salt: text("salt", { length: 255 }),
  diaryTableName: text("diary_table_name", { length: 255 }),
  avatarImage: text("avatar_image"),
  avatar_url: text("avatar_url"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});


export const userAuths = sqliteTable("user_auths", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerType: integer("provider_type").notNull(),
  providerUserId: text("provider_user_id").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});


export const userSettings = sqliteTable("user_settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    settingKey: text("setting_key", { length: 255 }).notNull(),
    settingValue: text("setting_value"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.settingKey] }),
  ]
);

export const vault = sqliteTable("vault", {
  id: text("id").primaryKey(),

  userId: text("user_id")   // TS: userId, DB: user_id
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  vaultName: text("vault_name", { length: 255 })
    .notNull()
    .default("memoflow"),

  status: text("status", {
    enum: ["current", "active", "disable", "archived"],
  }).notNull().default("current"),

  folderIndexInVault: integer("folder_index_in_vault")
    .notNull()
    .default(0),

  fileIndexInFolder: integer("file_index_in_folder")
    .notNull()
    .default(0),
})

export const githubAppAccess = sqliteTable("github_access", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  githubRepoName: text("github_repo_name", { length: 255 }),
  accessToken: text("access_token", { length: 255 }),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshToken: text("refresh_token", { length: 255 }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  githubUserName: text("github_user_name", { length: 255 }),
});


export const tables = {
  users,
  userAuths,
  userSettings,
  vault,
  githubAppAccess,
};
