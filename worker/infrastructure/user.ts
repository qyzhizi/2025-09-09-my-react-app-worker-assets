import { tables, userAuths, users } from "./db/schema";
import { findFirstUserAuth } from "./userAuth";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import type { ProviderType } from "../types/provider";
import { v4 as uuidv4 } from 'uuid';

export interface User {
    id: string;
    name: string | null;
    email: string;
    avatar_url: string | null;
}


export const createOrUpdateUser = async (
  c: Context,
  name: string,
  email: string,
  avatar_url: string,
  providerType: ProviderType,
  providerUserId: string,
): Promise<User> => {
  const db = drizzle(c.env.DB, { schema: tables });

  // 1. 查找用户（按 email）
  const existingUser = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.email, email),
  });

  if (existingUser) {
    await updateUserIfNeeded(db, existingUser, {
      name,
      email,
      avatar_url,
    });

    await ensureUserAuthExists(
      c,
      existingUser.id,
      providerType,
      providerUserId,
    );

    return existingUser;
  }

  // 2. 创建新用户
  return await createUserWithAuth(
    db,
    {
      name,
      email,
      avatar_url,
    },
    {
      providerType,
      providerUserId,
    },
  );
};

const updateUserIfNeeded = async (
  db: ReturnType<typeof drizzle>,
  user: User,
  updates: Pick<User, "name" | "email" | "avatar_url">,
) => {
  const needUpdate =
    user.name !== updates.name ||
    user.email !== updates.email ||
    user.avatar_url !== updates.avatar_url;

  if (!needUpdate) return;

  try {
    await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id));
  } catch (error) {
    console.error("用户信息更新失败", error);
    throw new Error("DATABASE_UPDATE_FAILED");
  }
};


const ensureUserAuthExists = async (
  c: Context,
  userId: string,
  providerType: ProviderType,
  providerUserId: string,
) => {
  const existingAuth = await findFirstUserAuth(
    c,
    userId,
    providerType,
    providerUserId,
  );

  if (existingAuth) return;

  const db = drizzle(c.env.DB, { schema: tables });

  await db.insert(userAuths).values({
    userId,
    providerType,
    providerUserId,
  });
};


const createUserWithAuth = async (
  db: ReturnType<typeof drizzle>,
  userData: Pick<User, "name" | "email" | "avatar_url">,
  authData: {
    providerType: ProviderType;
    providerUserId: string;
  },
): Promise<User> => {
  const userId = uuidv4();

  const insertedUsers = await db
    .insert(users)
    .values({ id: userId, ...userData })
    .returning();

  if (insertedUsers.length === 0) {
    throw new Error("USER_INSERT_FAILED");
  }

  const newUser = insertedUsers[0];

  try {
    await db.insert(userAuths).values({
      userId: newUser.id,
      providerType: authData.providerType,
      providerUserId: authData.providerUserId,
    });
  } catch (error) {
    console.error("userAuth 插入失败，回滚用户", error);
    await db.delete(users).where(eq(users.id, newUser.id));
    throw new Error("USER_AUTH_INSERT_FAILED");
  }

  return newUser;
};


export const findManyUsers = async (c: Context): Promise<User[]> => {
    const db = drizzle(c.env.DB, { schema: tables });
    // return await db.query.users.findMany();
    const res = await db.query.users.findMany({
        columns: {
          id: true,
          name: true,
          email: true,
          avatar_url:true,
          username: true,
          password: true,
          salt: true,
          diaryTableName: true,
          avatarImage: true,
          createdAt: true,
          updatedAt: true
        }
      });
    // console.log(res)
    return res
};

export const getUserAvatarUrl = async (
  c: Context<{ Bindings: Env, Variables: { userId: string , userName: string} }>,
  userId: string
  ): Promise<string> =>{
  const db = drizzle(c.env.DB, { schema: tables });
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    columns: {
      avatar_url: true
    }
  });
  return user?.avatar_url ?? "";
}

export const getUserById = async (
  c: Context<{ Bindings: Env, Variables: { userId: string , userName: string} }>,
  userId: string
): Promise<User | null> => {
  const db = drizzle(c.env.DB, { schema: tables });
  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
  });
  return user ?? null;
};
