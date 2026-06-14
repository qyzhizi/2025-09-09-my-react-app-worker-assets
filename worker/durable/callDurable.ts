import type { Context } from "hono";
import type { PushGitRepoTaskParams } from "@/types/durable";
import { NotFoundError, ValidationError } from "@/types/error"
import { COMMITFILTER, PER_PAGE, DURABLE_NAME_PREFIX } from "@/ConstVar";

import type { VectorsConfig, QuantizationConfig } from '@/durable/qdrant/createCollection';
import type { CreatePayloadIndexParam } from '@/durable/qdrant/payloadIndex';
import { isQdrantSettings } from "@/utils/qdrant";
import type { QdrantSettings } from "@/utils/qdrant";


export const durableHello = async (c: Context) => {
    // Create a `DurableObjectId` for an instance of the `MemoflowDurableObject`
    // class named "foo". Requests from all Workers to the instance named
    // "foo" will go to a single globally unique Durable Object instance.
    const id: DurableObjectId = c.env.MY_DURABLE_OBJECT.idFromName("foo");
    
    // Create a stub to open a communication channel with the Durable
    // Object instance.
    const stub = c.env.MY_DURABLE_OBJECT.get(id);
    
    // Call the `sayHello()` RPC method on the stub to invoke the method on
    // the remote Durable Object instance
    const greeting = await stub.sayHello("world, lzp");
    return { commitMessage: greeting }
}

export const durableCreateTaskAndSaveArticleToDB = async (c: Context,
    taskParams: Partial<PushGitRepoTaskParams>) => {
    const durableObjectName = `${DURABLE_NAME_PREFIX}${c.get("userId")}`;
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(durableObjectName)
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const createdTask = await stub.createTaskAndSaveArticleToDB(taskParams)
        return createdTask;
    } catch (err) {
        if (err instanceof ValidationError) {
            throw new ValidationError(err.message)
        }
        if (err instanceof NotFoundError) {
            // Theoretically, creating tasks will not encounter this, but fault tolerance can be preserved.
            throw new NotFoundError(err.message)
        }

        console.error('Unexpected error in createTaskAndSaveArticleToDB:', err)
        throw new Error('Internal Server Error')
    }
}

export const durablePushToGitHub = async (c: Context,
    taskId: string) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)
    
    // Offload time-consuming tasks to DO without blocking HTTP responses
    c.executionCtx.waitUntil(
        stub.processGithubPushTask(taskId, c.get("userId"))
        .catch((err: any) => {
            // Note: The errors here will no longer be passed to the user request and can only be recorded by yourself.
            console.error("Background DO task failed:", err);
        })
    );

    // Users get an immediate response, without waiting for the task to complete
    return { status: "accepted", taskId };
}

export const durableSearchCommits = async (c: Context,
    {
        githubUserName,
        githubRepoName,
        accessToken,
        threshold,
        searchPath = "",
        commitFilter = COMMITFILTER,
        perPage = PER_PAGE,
    }: {
        githubUserName: string;
        githubRepoName: string;
        accessToken: string;
        threshold: number;
        searchPath?: string;
        commitFilter?: string;
        perPage?: number;
    }): Promise<any> => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const commits = await stub.searchCommits({
            githubUserName,
            githubRepoName,
            accessToken,
            threshold,
            searchPath,
            commitFilter,
            perPage,
        })
        return commits
    } catch (err) {
        console.error('Unexpected error in searchCommits:', err)
        throw new Error('Internal Server Error')
    }
}

export const durableInitQdrantCollectionForUser = async (c: Context, 
    qdrantSettings: QdrantSettings,
) => {
    // 判断 userSettings 是否符合 QdrantSettings 接口
    if (!isQdrantSettings(qdrantSettings)) {
        throw new ValidationError('Invalid Qdrant settings')
    }
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    const vectors: VectorsConfig = {
        "": { // 默认向量配置
            size: 768, 
            distance: 'Cosine',
            on_disk: true,
            hnsw_config: {  
                // 1. 恢复 HNSW 索引构建：修改 m 值为非 0（推荐 16），允许构建 HNSW 索引
                m: 16, 
                // 2. 取消 Payload 强隔离的混合图连接：将其恢复为 0 或删除该行（使用默认的纯空间向量构图）
                payload_m: 0, 
                ef_construct: 200
            },
            datatype: 'float16' 
        },
    }

    const indexParam: CreatePayloadIndexParam = {
        field_name: "repoAndVaultPath", // 这个字段会存储 repoName 和 vaultPath 的组合作为标识
        field_schema: {
            type: "keyword",
            on_disk: false,
            // 3. 移除租户和主体标识：将这二者设为 false（或直接删除这两行）
            // 此时它退化为一个普通的、仅用于加速过滤查询（Filtering）的关键字索引
            is_tenant: false,     
            is_principal: false   
        }
    }
    const quantizationConfig: QuantizationConfig = {
      turbo: {
        always_ram: true
      }
    }

    try {
        // 等幂操作，重复调用不会导致错误
        const result = await stub.initQdrantCollectionForUser(
            qdrantSettings.qdrantUrl,
            qdrantSettings.collectionName,
            qdrantSettings.qdrantApiKey,
            vectors,
            indexParam,
            quantizationConfig
        );
        return result;
    } catch (err) {
        console.error('Unexpected error in initQdrantCollectionForUser:', err)
        throw new Error('Failed to initialize Qdrant collection')
    }
}

export const durableFetchCollectioinStats = async (c: Context, qdrantSettings: QdrantSettings) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const stats = await stub.fetchCollectioinStats(
            qdrantSettings.qdrantUrl,
            qdrantSettings.collectionName,
            qdrantSettings.qdrantApiKey
        );
        return stats;
    } catch (err) {
        console.error('Unexpected error in fetchCollectioinStats:', err)
        throw new Error('Failed to fetch collection stats')
    }
}

export const durableSearchSimilarTitlesInVectorIndex = async (c: Context,
    {
        query,
        topK,
        repoAndVaultPath,
    }: {
        query: string;
        topK: number;
        repoAndVaultPath: string | undefined; // 这个参数是可选的，只有在需要进行 repo/vault 过滤时才传入
    }): Promise<any> => {
    const userId = c.get("userId");
    if (!userId) {
        throw new ValidationError('User ID is required')
    }
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${userId}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const similarTitles = await stub.searchSimilarTitlesInVectorIndex(
            query, topK, userId, repoAndVaultPath);
        
        return similarTitles
    } catch (err) {
        console.error('Unexpected error in searchSimilarTitlesInVectorIndex:', err)
        throw new Error('Internal Server Error')
    }
}

export const getDODatabaseStatus = async (c: Context) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const dbStatus = await stub.getDODBStatus()
        return dbStatus
    } catch (err) {
        console.error('Unexpected error in getDODBStatus:', err)
        throw new Error('Internal Server Error')
    }
}

export const resetDoKeyStorageAndSqlite = async (c: Context) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const resetResult = await stub.resetDoKeyStorageAndSqlite()
        return resetResult
    } catch (err) {
        console.error('Unexpected error in resetDoKeyStorageAndSqlite:', err)
        throw new Error('Internal Server Error')
    }
}

export const duableSwitchAndInitVault = async (c: Context,
    {
        githubUserName,
        githubRepoName,
        vaultPathInRepo,
        vaultName,
        accessToken,
        branch,
    }: {
        githubUserName: string;
        githubRepoName: string;
        vaultPathInRepo: string;
        vaultName: string;
        accessToken: string;
        branch: string;
    }
) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        await stub.switchAndInitVault({
            githubUserName,
            githubRepoName,
            vaultPathInRepo,
            vaultName,
            accessToken,
            branch,
        })
    } catch (err) {
        console.error('Unexpected error in switchAndInitVault:', err)
        throw new Error('Internal Server Error')
    }
}

export const getArticleContentList = async (c: Context, page: number, pageSize: number) => {
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)

    try {
        const articleList = await stub.getArticleContentList(page, pageSize)
        return articleList
    } catch (err) {
        console.error('Unexpected error in getArticleContentList:', err)
        throw new Error('Internal Server Error')
    }
}
