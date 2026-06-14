import { tables, userAuths, users } from "./db/schema";
import { findFirstUserAuth } from "./userAuth";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import type { ProviderType } from "../types/provider";
// import { v4 as uuidv4 } from 'uuid';
import { AppError } from "@/types/error"

export interface User {
    id: string;
    name: string | null;
    email: string;
    avatar_url: string | null;
}


export const createOrUpdateUser = async (
  c: Context,
  userId: string,
  name: string,
  email: string,
  avatar_url: string,
  providerType: ProviderType,
  providerUserId: string,
): Promise<User> => {
  const db = drizzle(c.env.DB, { schema: tables });
  try {
    // 1. Find users (by id)
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
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

    // 2. Create new user
    return await createUserWithAuth(
      db,
      {
        id: userId,
        name,
        email,
        avatar_url,
      },
      {
        providerType,
        providerUserId,
      },
    );
  } catch (error) {
    console.error("createOrUpdateUser failed", error);
    throw new AppError("CREATE_OR_UPDATE_USER_FAILED", "Failed to create or update user", error, 500);
  }
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
  try {
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
  } catch (error) {
    console.error("ensureUserAuthExists failed", error);
    throw new Error("ENSURE_USER_AUTH_FAILED");
  }
};


const createUserWithAuth = async (
  db: ReturnType<typeof drizzle>,
  userData: Pick<User, "id" | "name" | "email" | "avatar_url">,
  authData: {
    providerType: ProviderType;
    providerUserId: string;
  },
): Promise<User> => {
  // const userId = uuidv4();
  let newUser;
  try {
    const insertedUsers = await db.insert(users).values({ ...userData }).returning();

    if (insertedUsers.length === 0) {
      throw new Error("USER_INSERT_FAILED");
    }

    newUser = insertedUsers[0];
  } catch (error) {
    console.error("user insert failed", error);
    throw new Error("USER_INSERT_FAILED");
  }

  try {
    await db.insert(userAuths).values({
      userId: newUser.id,
      providerType: authData.providerType,
      providerUserId: authData.providerUserId,
    });
  } catch (error) {
    console.error("userAuth 插入失败，回滚用户", error);
    try {
      await db.delete(users).where(eq(users.id, newUser.id));
    } catch (deleteError) {
      console.error("回滚用户失败", deleteError);
    }
    throw new Error("USER_AUTH_INSERT_FAILED");
  }

  return newUser;
};


export const findManyUsers = async (c: Context): Promise<User[]> => {
    const db = drizzle(c.env.DB, { schema: tables });
    try {
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
      return res;
    } catch (error) {
      console.error("findManyUsers failed", error);
      throw new Error("FIND_USERS_FAILED");
    }
};

export const getUserAvatarUrl = async (
  c: Context<{ Bindings: Env, Variables: { userId: string , userName: string} }>,
  userId: string
  ): Promise<string | null> =>{
  const db = drizzle(c.env.DB, { schema: tables });
  try {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
      columns: {
        avatar_url: true
      }
    });
    return user?.avatar_url ?? null;
  } catch (error) {
    console.error("getUserAvatarUrl failed", error);
    throw new Error("GET_USER_AVATAR_FAILED");
  }
}

export const getUserById = async (
  c: Context<{ Bindings: Env, Variables: { userId: string , userName: string} }>,
  userId: string
): Promise<User | null> => {
  const db = drizzle(c.env.DB, { schema: tables });
  try {
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });
    return user ?? null;
  } catch (error) {
    console.error("getUserById failed", error);
    throw new Error("GET_USER_BY_ID_FAILED");
  }
};
