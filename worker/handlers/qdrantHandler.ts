import type { Context } from "hono";
import {
  durableInitQdrantCollectionForUser,
  durableFetchCollectioinStats,
} from "@/durable/callDurable"
import { getUserSettingsFromDb,
  updateUserSettingsToDb } from "@/infrastructure/userSettings";
import { isQdrantSettings, type QdrantSettings } from "@/utils/qdrant";
import { DURABLE_NAME_PREFIX } from "@/ConstVar";
import { getgithubRepoAccessInfo } from "@/infrastructure/githubRepoAccess"
import { updateCollectionOptimizers, type UpdateOptimizersParam} from "@/durable/qdrant/updateCollectionOptimizers";


export async function getQdrantSettingsHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;

    return c.json( {qdrantUrl: userSettings.qdrantUrl ?? "" } )
  } catch (error) {
    console.error('getQdrantSettingsHandler error:', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function saveAndInitQdrantCollectionForUserHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  // get qdrantUrl and qdrantApiKey from request body
  const { qdrantUrl, qdrantApiKey } = await c.req.json()
  // Collection name if fixed for now, as each user will have only one collection. In the future, if we want to support multiple collections per user, we can modify the collection naming strategy and pass the collection name as a parameter.
  const collectionName = `${c.get("userName")}Collection`
  try {
      // save Qdrant collection info to userSettings
      const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
      // 判断 userSettings 是否符合 QdrantSettings 接口
      if (isQdrantSettings(userSettings)) {
        // 如果符合
        console.log("Existing userSettings before update:", userSettings);
      }
      await updateUserSettingsToDb(c, c.get("userId"), { qdrantUrl, qdrantApiKey, collectionName })
    
      const result = await durableInitQdrantCollectionForUser(c, { qdrantUrl, qdrantApiKey, collectionName })
      return c.json(result)
  } catch (err) {
      console.error('Error in saveAndInitQdrantCollectionForUserHandler:', err)
      const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
      return c.json({ error: errorMessage }, 500)
  }
}

export async function fetchQdrantCollectioinStatsHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
    const qdrantSettings = {
      qdrantUrl: userSettings.qdrantUrl ?? null,
      qdrantApiKey: userSettings.qdrantApiKey ?? null,
      collectionName: userSettings.collectionName ?? null,
    }
    if (!isQdrantSettings(qdrantSettings)) {
      return c.json({ error: "Missing or invalid Qdrant configuration attributes" }, 400);
    }

    if (!qdrantSettings.qdrantUrl || !qdrantSettings.qdrantApiKey) {
      return c.json({ error: "Qdrant URL or API key is missing" }, 400);
    }
    const stats = await durableFetchCollectioinStats(c, qdrantSettings)
    return c.json(stats)
  } catch (err) {
    console.error('Error in fetchQdrantCollectioinStatsHandler:', err)
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
    return c.json({ error: errorMessage }, 500)
  }
}

export async function UpsertCollectionPointsHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
    const githubAccessInfo = await getgithubRepoAccessInfo(c);
    const githubRepoName = githubAccessInfo?.githubRepoName ?? '' 
    const vaultPathInRepo = githubAccessInfo?.vaultPathInRepo ?? ''

    const qdrantSettings = {
      qdrantUrl: userSettings.qdrantUrl!,
      qdrantApiKey: userSettings.qdrantApiKey!,
      collectionName: userSettings.collectionName!,
    } as QdrantSettings;
    if (!isQdrantSettings(qdrantSettings)) {
      return c.json({ error: "Missing or invalid Qdrant configuration attributes" }, 400);
    }

    const incomingContentType = c.req.raw.headers.get('content-type');
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
      `${DURABLE_NAME_PREFIX}${c.get("userId")}`
    );
    const stub = c.env.MY_DURABLE_OBJECT.get(doId);

    const url = new URL("https://durable/upsert-collection-points");
    url.searchParams.set('qdrantUrl', qdrantSettings.qdrantUrl);
    url.searchParams.set('collectionName', qdrantSettings.collectionName);

    const response = await stub.fetch(
      new Request(url.toString(), {
        method: 'POST',
        headers: {
          ...(incomingContentType ? { 'Content-Type': incomingContentType } : {}),
          'x-qdrant-api-key': qdrantSettings.qdrantApiKey,
          'x-repoName': githubRepoName,
          'x-vaultPathInRepo': vaultPathInRepo,
        },
        body: c.req.raw.body,
      })
    );

    const result: any = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || `DO request failed with status ${response.status}`);
    }

    return c.json(result);
  } catch (err) {
    console.error('Error in UpsertCollectionPointsHandler:', err)
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
    return c.json({ error: errorMessage }, 500)
  }
}

export const updateQdrantCollectionOptimizersHandler = async (c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> => {
    try {
        const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
        const qdrantSettings = {
          qdrantUrl: userSettings.qdrantUrl!,
          qdrantApiKey: userSettings.qdrantApiKey!,
          collectionName: userSettings.collectionName!,
        } as QdrantSettings;
        if (!isQdrantSettings(qdrantSettings)) {
          return c.json({ error: "Missing or invalid Qdrant configuration attributes" }, 400);
        }

        const optimizersConfig = await c.req.json() as UpdateOptimizersParam;

        const result = await updateCollectionOptimizers(
            qdrantSettings.qdrantUrl,
            qdrantSettings.collectionName,
            qdrantSettings.qdrantApiKey,
            optimizersConfig
         );
         return c.json(result);
     } catch (err) {
         console.error('Error in updateQdrantCollectionOptimizersHandler:', err)
         const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
         return c.json({ error: errorMessage }, 500)
     }
}

