import type { Context } from "hono";
import { DURABLE_NAME_PREFIX } from "@/ConstVar";
import { getgithubRepoAccessInfo } from "@/infrastructure/githubRepoAccess"

export async function getCloudflareVectorIndexStatusHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
    try {
        // avoid deep/recursive type instantiation by narrowing types explicitly
        const userId = c.get("userId") as string
        const doId = c.env.MY_DURABLE_OBJECT.idFromName(`${DURABLE_NAME_PREFIX}${userId}`)
        const stub = c.env.MY_DURABLE_OBJECT.get(doId)
        // cast stub to any to prevent complex type inference on the Durable Object method
        const status = await (stub as any).getCloudflareVectorIndexStatus(userId)
        return c.json(status)
    } catch (err) {
        console.error('Error in getCloudflareVectorIndexStatusHandler:', err)
        const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
        return c.json({ error: errorMessage }, 500)
    }
}

export async function resetCloudflareNamespaceVectorCountsHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
    try {
        const userId = c.get("userId") as string
        const doId = c.env.MY_DURABLE_OBJECT.idFromName(`${DURABLE_NAME_PREFIX}${userId}`)
        const stub = c.env.MY_DURABLE_OBJECT.get(doId)
        await (stub as any).resetCloudflareNamespaceVectorCountsInKvMeta(userId)
        return c.json({ success: true })
    } catch (err) {
        console.error('Error in resetCloudflareNamespaceVectorCountsHandler:', err)
        const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
        return c.json({ error: errorMessage }, 500)
    }
}

export async function upsertVectorsToCloudflareIndexHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
    try {
        const incomingContentType = c.req.raw.headers.get('content-type');
        const githubAccessInfo = await getgithubRepoAccessInfo(c);
        const githubRepoName = githubAccessInfo?.githubRepoName ?? '' 
        const vaultPathInRepo = githubAccessInfo?.vaultPathInRepo ?? ''

        const userId = c.get("userId") as string
        const doId = c.env.MY_DURABLE_OBJECT.idFromName(`${DURABLE_NAME_PREFIX}${userId}`)
        const stub = c.env.MY_DURABLE_OBJECT.get(doId)

        const url = new URL("https://durable/upsert-vectors-to-cloudflare-index");
        const response = await stub.fetch(
            new Request(url.toString(), {
                method: 'POST',
                headers: {
                ...(incomingContentType ? { 'Content-Type': incomingContentType } : {}),
                'x-repoName': githubRepoName,
                'x-vaultPathInRepo': vaultPathInRepo,
                'x-userId': userId,
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
        console.error('Error in upsertVectorToCloudflareIndexHandler:', err)
        const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
        return c.json({ error: errorMessage }, 500)
    }
}
