import { and, eq } from "drizzle-orm";
import { tables, userAuths } from "./db/schema";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import type { ProviderType } from "../types/provider";

export interface UserAuth {
	id: number;
	userId: string;
	providerType: ProviderType;
	providerUserId: string;
	createdAt: string;
	updatedAt: string;
}

export const findFirstUserAuth = async (
	c: Context,
    userId: string,
	providerType: ProviderType,
	providerUserId: string,
): Promise<UserAuth | undefined> => {
	const db = drizzle(c.env.DB, { schema: tables });
	const result = await db.query.userAuths.findFirst({
		where: and(
        	eq(userAuths.userId, userId),
			eq(userAuths.providerType, providerType),
			eq(userAuths.providerUserId, providerUserId),
		),
	});
	return result;
};