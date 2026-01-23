import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { v4 as uuidv4 } from "uuid";

import { tables, vault } from "./db/schema";

export type VaultStatus = "current" | "active" | "disable" |"archived";

export interface Vault {
  id: string;
  userId: string;
  vaultName: string;
  status: VaultStatus;
  folderIndexInVault: number;
  fileIndexInFolder: number;
}

export interface CreateVaultInput {
  userId: string;
  vaultName?: string;
  status?: VaultStatus;
  folderIndexInVault?: number;
  fileIndexInFolder?: number;
}

export interface UpdateVaultInput {
  vaultName?: string;
  status?: VaultStatus;
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

  const vaultId = uuidv4();
  const newVault = {
    id: vaultId,
    userId: input.userId,
    vaultName: input.vaultName ?? "memoflow",
    status: input.status ?? "active",
    folderIndexInVault: input.folderIndexInVault ?? 0,
    fileIndexInFolder: input.fileIndexInFolder ?? 0,
  };

  const inserted = await db.insert(vault).values(newVault).returning();

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
 * Get current vault by userId (status = "current")
 */
export const getCurrentVaultByUserId = async (
  c: Context,
  userId: string,
): Promise<Vault | null> => {
  const db = drizzle(c.env.DB, { schema: tables });

  const result = await db.query.vault.findFirst({
    where: (vault, { eq, and }) =>
      and(eq(vault.userId, userId), eq(vault.status, "current")),
  });

  return result ?? null;
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
  if (input.status !== undefined) updateData.status = input.status;
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
 * Update current vault by userId (status = "current")
 */
export const updateCurrentVaultByUserId = async (
  c: Context,
  userId: string,
  input: UpdateVaultInput,
): Promise<Vault | null> => {
  const db = drizzle(c.env.DB, { schema: tables });

  const updateData: Partial<UpdateVaultInput> = {};
  if (input.vaultName !== undefined) updateData.vaultName = input.vaultName;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.folderIndexInVault !== undefined)
    updateData.folderIndexInVault = input.folderIndexInVault;
  if (input.fileIndexInFolder !== undefined)
    updateData.fileIndexInFolder = input.fileIndexInFolder;

  if (Object.keys(updateData).length === 0) {
    // No updates, just return the existing current vault
    return getCurrentVaultByUserId(c, userId);
  }

  const updated = await db
    .update(vault)
    .set(updateData)
    .where(and(eq(vault.userId, userId), eq(vault.status, "current")))
    .returning();

  if (updated.length === 0) {
    return null;
  }

  return updated[0];
};

/**
 * Update or create vault by userId and vaultName
 * If vault exists, update it; otherwise create a new one
 */
export const updateOrCreateVaultByName = async (
  c: Context,
  userId: string,
  vaultName: string,
  input: UpdateVaultInput & Partial<CreateVaultInput>,
): Promise<Vault> => {
  const db = drizzle(c.env.DB, { schema: tables });

  // Check if vault exists by userId and vaultName
  const existingVault = await db.query.vault.findFirst({
    where: (vault, { eq, and }) =>
      and(eq(vault.userId, userId), eq(vault.vaultName, vaultName)),
  });

  if (existingVault) {
    // Vault exists, perform update
    const updateData: Partial<UpdateVaultInput> = {};
    if (input.vaultName !== undefined) updateData.vaultName = input.vaultName;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.folderIndexInVault !== undefined)
      updateData.folderIndexInVault = input.folderIndexInVault;
    if (input.fileIndexInFolder !== undefined)
      updateData.fileIndexInFolder = input.fileIndexInFolder;

    if (Object.keys(updateData).length === 0) {
      // No updates, just return the existing vault
      return existingVault;
    }

    const updated = await db
      .update(vault)
      .set(updateData)
      .where(
        and(eq(vault.userId, userId), eq(vault.vaultName, vaultName)),
      )
      .returning();

    if (updated.length === 0) {
      throw new Error("VAULT_UPDATE_FAILED");
    }

    return updated[0];
  } else {
    // Vault does not exist, create a new one
    const vaultId = uuidv4();
    const newVault = {
      id: vaultId,
      userId,
      vaultName,
      status: input.status ?? "active",
      folderIndexInVault: input.folderIndexInVault ?? 0,
      fileIndexInFolder: input.fileIndexInFolder ?? 0,
    };

    const inserted = await db.insert(vault).values(newVault).returning();

    if (inserted.length === 0) {
      throw new Error("VAULT_INSERT_FAILED");
    }

    return inserted[0];
  }
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
