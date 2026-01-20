import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Context } from "hono";

import { tables, githubAppAccess } from "./db/schema";

export const addOrUpdateGithubAppAccessData = async (
    c: Context,
    data: Record<string, any>
): Promise<boolean> => {
    const db = drizzle(c.env.DB, { schema: tables });
    const userId = c.get("userId");
    
    // Check if user already exists in the table
    const existingRecord = await db.query.githubAppAccess.findFirst({
        where: (githubAppAccess, { eq }) => eq(githubAppAccess.userId, userId),
    });
    
    if (existingRecord) {
        // User exists, perform update
        await db
            .update(githubAppAccess)
            .set(data)
            .where(eq(githubAppAccess.userId, userId));
    } else {
        // User does not exist, perform insert
        await db.insert(githubAppAccess).values({
            id: uuidv4(),
            userId,
            ...data,
        });
    }
    
    return true;
};

export const findGithubAppAccessByUserId = async (
    c: Context,
  ) => {
    const db = drizzle(c.env.DB, { schema: tables });
    const userId = c.get("userId");
  
    return db.query.githubAppAccess.findFirst({
      where: (githubAppAccess, { eq }) => eq(githubAppAccess.userId, userId),
    });
  };

  export const updateGithubRepoNameByUserId = async (
    c: Context,
    userId: string,
    newRepoName: string
  ) => {
    const db = drizzle(c.env.DB, { schema: tables });
  
    return db
      .update(githubAppAccess)
      .set({ githubRepoName: newRepoName })
      .where(eq(githubAppAccess.userId, userId));
  };
  
  export const updateGithubAppAccessByUserId = async (
    c: Context,
    userId: string,
    updates: Partial<typeof githubAppAccess._.columns>
  ) => {
    const db = drizzle(c.env.DB, { schema: tables });
  
    return db
      .update(githubAppAccess)
      .set(updates)
      .where(eq(githubAppAccess.userId, userId));
  };
  
  export const safeUpdateGithubAppAccessByUserId = async (
    c: Context,
    updates: Partial<typeof githubAppAccess._.columns>
  ) => {
    const db = drizzle(c.env.DB, { schema: tables });
    const userId = c.get("userId");
  
    const existing = await db.query.githubAppAccess.findFirst({
      where: (githubAppAccess, { eq }) => eq(githubAppAccess.userId, userId),
    });
  
    if (!existing) {
      throw new Error(`githubAppAccess record not found for userId: ${userId}`);
    }
  
    return db
      .update(githubAppAccess)
      .set(updates)
      .where(eq(githubAppAccess.userId, userId));
  };
  
export const getGithubAppAccessInfo = async (c: Context) => {
  const db = drizzle(c.env.DB, { schema: tables });
  const userId = c.get("userId");

  return db.query.githubAppAccess.findFirst({
    where: (githubAppAccess, { eq }) => eq(githubAppAccess.userId, userId),
  });
}