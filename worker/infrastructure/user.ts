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
}

export const findOrCreateUser = async (
    c: Context,
    name: string,
    email: string,
    providerType: ProviderType,
    providerUserId: string,
): Promise<User> => {
    const db = drizzle(c.env.DB, { schema: tables });

    let user = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
    });

    if (user) {
        const userAuth = await findFirstUserAuth(
            c,
            user.id,
            providerType,
            providerUserId,
        );
        if (!userAuth) {
            await db.insert(userAuths).values({
                userId: user.id,
                providerType,
                providerUserId,
            });
        }
        return user;
    }
    const id = uuidv4();
    const newUser = await db.insert(users).values({ id, name, email }).returning();

    try {
        if (newUser.length > 0) {
          await db.insert(userAuths).values({
            userId: newUser[0].id,
            providerType,
            providerUserId,
          });
          return newUser[0];
        }
      } catch (error) {
        console.error("Failed to insert into userAuths, rolling back user insertion", error);
        await db.delete(users).where(eq(users.id, newUser[0].id));
      }
    
    throw new Error("User creation failed");
};

export const findManyUsers = async (c: Context): Promise<User[]> => {
    const db = drizzle(c.env.DB, { schema: tables });
    // return await db.query.users.findMany();
    const res = await db.query.users.findMany({
        columns: {
          id: true,
          name: true,
          email: true,
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
