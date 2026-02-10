import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Context } from "hono";

import { tables, githubRepoAccess} from "./db/schema";
import {type GithubRepoAccess} from "./types";

export const addOrUpdategithubRepoAccessData = async (
    c: Context,
    data: Record<string, any>
): Promise<boolean> => {
    const db = drizzle(c.env.DB, { schema: tables });
    const userId = c.get("userId");
    
    // Check if user already exists in the table
    const existingRecord = await db.query.githubRepoAccess.findFirst({
        where: (githubRepoAccess, { eq }) => eq(githubRepoAccess.userId, userId),
    });
    
    if (existingRecord) {
        // User exists, perform update
        await db
            .update(githubRepoAccess)
            .set(data)
            .where(eq(githubRepoAccess.userId, userId));
    } else {
        // User does not exist, perform insert
        await db.insert(githubRepoAccess).values({
            id: uuidv4(),
            userId,
            ...data,
        });
    }
    
    return true;
};

export const findgithubRepoAccessByUserId = async (
    c: Context,
  ) => {
    const db = drizzle(c.env.DB, { schema: tables });
    const userId = c.get("userId");
  
    return db.query.githubRepoAccess.findFirst({
      where: (githubRepoAccess, { eq }) => eq(githubRepoAccess.userId, userId),
    });
  };

export const updateGithubRepoNameByUserId = async (
  c: Context,
  userId: string,
  newRepoName: string
) => {
  const db = drizzle(c.env.DB, { schema: tables });
  
  return db
    .update(githubRepoAccess)
    .set({ githubRepoName: newRepoName })
    .where(eq(githubRepoAccess.userId, userId));
};
  
export const updategithubRepoAccessByUserId = async (
  c: Context,
  userId: string,
  updates: Partial<typeof githubRepoAccess._.columns>
) => {
  const db = drizzle(c.env.DB, { schema: tables });
  
  return db
    .update(githubRepoAccess)
    .set(updates)
    .where(eq(githubRepoAccess.userId, userId));
};
  
export const safeUpdategithubRepoAccessByUserId = async (
  c: Context,
  updates: Partial<typeof githubRepoAccess._.columns>
) => {
  const db = drizzle(c.env.DB, { schema: tables });
  const userId = c.get("userId");
  
  const existing = await db.query.githubRepoAccess.findFirst({
    where: (githubRepoAccess, { eq }) => eq(githubRepoAccess.userId, userId),
  });
  
  if (!existing) {
    throw new Error(`githubRepoAccess record not found for userId: ${userId}`);
  }
  
  return db
    .update(githubRepoAccess)
    .set(updates)
    .where(eq(githubRepoAccess.userId, userId));
};
  
export const getgithubRepoAccessInfo = async (c: Context): Promise<GithubRepoAccess | undefined> => {
  const db = drizzle(c.env.DB, { schema: tables });
  const userId = c.get("userId");

  return db.query.githubRepoAccess.findFirst({
    where: (githubRepoAccess, { eq }) => eq(githubRepoAccess.userId, userId),
  });
}

export const getVaultInfo = async (c: Context) => {
  const db = drizzle(c.env.DB, { schema: tables });
  const userId = c.get("userId");
  const existing = await db.query.githubRepoAccess.findFirst({
    where: (githubRepoAccess, { eq }) => eq(githubRepoAccess.userId, userId),
  });
  if (!existing) {
    throw new Error(`githubRepoAccess record not found for userId: ${userId}`);
  }
  // if vaultName is already set, do nothing
  return {vaultName: existing.vaultName, folderIndexInVault: existing.folderIndexInVault, fileIndexInFolder: existing.fileIndexInFolder};
};