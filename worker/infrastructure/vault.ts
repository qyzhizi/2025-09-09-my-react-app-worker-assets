import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { v4 as uuidv4 } from "uuid";

import { tables, vault } from "./db/schema";

export interface Vault {
  id: string;
  userId: string;
  vaultName: string;
  folderIndexInVault: number;
  fileIndexInFolder: number;
}

export interface CreateVaultInput {
  userId: string;
  vaultName?: string;
  folderIndexInVault?: number;
  fileIndexInFolder?: number;
}

export interface UpdateVaultInput {
  vaultName?: string;
  folderIndexInVault?: number;
  fileIndexInFolder?: number;
}

/**
 * Create a new vault
 */
export const createVault = async (
  c: Context,
  input: CreateVaultInput,
): Promise<Vault> => {
  const db = drizzle(c.env.DB, { schema: tables });

  // 1️⃣ 先查询该 user 是否已经有 vault
  const existing = await db
    .select()
    .from(vault)
    .where(eq(vault.userId, input.userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0]; // 直接返回已有 vault
  }

  // 2️⃣ 不存在才创建
  const vaultId = uuidv4();
  const newVault = {
    id: vaultId,
    userId: input.userId,
    vaultName: input.vaultName ?? "memoflowVault",
    folderIndexInVault: input.folderIndexInVault ?? 0,
    fileIndexInFolder: input.fileIndexInFolder ?? 0,
  };

  const inserted = await db
    .insert(vault)
    .values(newVault)
    .returning();

  if (inserted.length === 0) {
    throw new Error("VAULT_INSERT_FAILED");
  }

  return inserted[0];
};


/**
 * Get vault by id
 */
export const getVaultById = async (
  c: Context,
  vaultId: string,
): Promise<Vault | null> => {
  const db = drizzle(c.env.DB, { schema: tables });

  const result = await db.query.vault.findFirst({
    where: (vault, { eq }) => eq(vault.id, vaultId),
  });

  return result ?? null;
};

/**
 * Get all vaults by userId
 */
export const getVaultsByUserId = async (
  c: Context,
  userId: string,
): Promise<Vault[]> => {
  const db = drizzle(c.env.DB, { schema: tables });

  const results = await db.query.vault.findMany({
    where: (vault, { eq }) => eq(vault.userId, userId),
  });

  return results;
};

/**
 * Update vault by id
 */
export const updateVault = async (
  c: Context,
  vaultId: string,
  input: UpdateVaultInput,
): Promise<Vault | null> => {
  const db = drizzle(c.env.DB, { schema: tables });

  const updateData: Partial<UpdateVaultInput> = {};
  if (input.vaultName !== undefined) updateData.vaultName = input.vaultName;
  if (input.folderIndexInVault !== undefined)
    updateData.folderIndexInVault = input.folderIndexInVault;
  if (input.fileIndexInFolder !== undefined)
    updateData.fileIndexInFolder = input.fileIndexInFolder;

  if (Object.keys(updateData).length === 0) {
    // No updates, just return the existing vault
    return getVaultById(c, vaultId);
  }

  const updated = await db
    .update(vault)
    .set(updateData)
    .where(eq(vault.id, vaultId))
    .returning();

  if (updated.length === 0) {
    return null;
  }

  return updated[0];
};


/**
 * Delete vault by id
 */
export const deleteVault = async (
  c: Context,
  vaultId: string,
): Promise<boolean> => {
  const db = drizzle(c.env.DB, { schema: tables });

  try {
    await db.delete(vault).where(eq(vault.id, vaultId));
    return true;
  } catch (error) {
    console.error("Failed to delete vault", error);
    return false;
  }
};
