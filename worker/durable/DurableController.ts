import { DurableObject } from "cloudflare:workers";
import { NotFoundError, ValidationError } from "@/types/error"
import type { Task, PushGitRepoTaskParams, PushGitRepoTaskRespon, EditGitRepoTaskParams } from "@/types/durable";
import { SqliteRepository } from "@/durable/repository";

import {batchGetFileContents, checkFilesExistInRepo} from "@/durable/github/githubGetContent";
import { getMetaDataFromContent } from "@/utils/tools"
import { createEmptyFolderPathInRepoIfNotExists } from "@/durable/github/githubApp";
import { searchCommits } from "@/durable/github/searchCommits";
import type { SearchCommitResult } from "@/durable/github/searchCommits";
import { COMMITFILTER, PER_PAGE, COMMIT_MESSAGE, DELETE_COMMIT_MESSAGE } from "@/ConstVar";
import { edgeHash64, mapUuidQuick, hex16ToUuid, uuidToHex16 } from "@/utils/titleHash"
import type { UpsertArticleContentParams } from "@/durable/repository/types";
import {initQdrantCollection} from "@/durable/qdrant/initQdrant";
import type { VectorsConfig, QuantizationConfig } from '@/durable/qdrant/createCollection';
import type { CreatePayloadIndexParam } from '@/durable/qdrant/payloadIndex';
import type { QdrantSettings } from "@/utils/qdrant";

import { upsertCollectionPoints, type UpsertPointsParam } from "@/durable/qdrant/upsertPoints";
import { deleteCollectionPoints } from "@/durable/qdrant/deletePoints"
import { queryCollectionPoints, type QueryPointsParam } from "@/durable/qdrant/queryPoints";
import {VECTORINDEXTYPE} from "@/types/durable";
import type { DeleteArticleTaskParams} from "@/types/durable";

const MAX_ARTICLES_TO_STORE = 1000;
const SEARCH_COMMITS_THRESHOLD = 100;

// const EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b'
const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m'
const INDEX_NAME_PREFIX = 'MEMOFLOW_INDEX_'

// 定义一个与接口严格绑定的 Keys 常量
const QDRANT_KEYS: { [K in keyof QdrantSettings]: K } = {
  qdrantUrl: 'qdrantUrl',
  qdrantApiKey: 'qdrantApiKey',
  collectionName: 'collectionName'
};

// 定义 Qdrant 获取集合详情的响应类型接口
export interface GetCollectionInfoResponse {
  result: {
    status: 'green' | 'yellow' | 'red' | string;
    optimizer_status: 'ok' | string;
    indexed_vectors_count?: number;
    points_count?: number;
    segments_count?: number;
    config: Record<string, any>;        // 集合的具体配置项（params, hnsw_config 等）
    payload_schema: Record<string, any>; // 集合中已创建的 payload 索引 Schema
    update_queue?: number; // 可选：当前待处理的更新操作数量
    [key: string]: any; // 兼容 Qdrant 原生返回的其他字段
  };
  status: 'ok' | string;
  time: number;
  [key: string]: any; // 兼容 Qdrant 原生返回的其他字段
}

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject<Env> {
    private state: DurableObjectState;
    env: Env;
    private sqliteRepository: SqliteRepository;
    /**
     * GitHub push serialization lock.
     * Contents API concurrent commits on the same branch will result in 409 (Git HEAD race condition),
     * The Promise chain ensures that only one push is executed at the same time.
     */
    private githubPushQueue: Promise<any> = Promise.resolve();
    /**
     * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
     * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
     *
     * @param ctx - The interface for interacting with Durable Object state
     * @param env - The interface to reference bindings declared in wrangler.jsonc
     */
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.state = ctx;
        this.env = env;
        this.sqliteRepository = new SqliteRepository(ctx.storage,MAX_ARTICLES_TO_STORE);
        this.sqliteRepository.initializeTables();
    }

    /**
     * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
     *  Object instance receives a request from a Worker via the same method invocation on the stub
     *
     * @param name - The name provided to a Durable Object instance from a Worker
     * @returns The greeting to be sent back to the Worker
     */
    async sayHello(name: string): Promise<string> {
        return `Hello, ${name}!  this message from DurableObject`;
    }

    async createTaskAndSaveArticleToDB(data: any): Promise<any> {
        if (!data.createdAt) {
            throw new ValidationError('Type Check Error: createdAt is required');
        }

        const params = {
            originalId: data.originalId ?? null,
            id: data.id ,
            title: data.title ?? '',
            content: data.content ?? '',
            hash: data.hash,
            commitMessage: data.commitMessage ?? '',
            accessToken: data.accessToken ?? '',
            githubUserName: data.githubUserName ?? '',
            githubRepoName: data.githubRepoName ?? '',
            vaultPathInRepo: data.vaultPathInRepo ?? '',
            vaultName: data.vaultName ?? '',
            completed: false,
            createdAt: data.createdAt,
        };

        await this.state.storage.put(data.id, params);
        // process edit article ,when article title hash(id) was changed
        if (params.originalId && params.originalId !== params.id){
            await this.deleteArticleContent(params.originalId)
        }
        // save content to DO SQL for later query and analysis
        await this.saveContentToDOSql(
            params.id,
            params.title,
            params.createdAt,
            params.content
        );
        return params;
    }

    async saveContentToDOSql(id: string, title: string, date: string, content: string): Promise<any> {
        // 参数验证
        if (title === undefined || title === null || title === '') {
            console.warn("Warning: title is empty, using default");
            title = '';
        }
        if (content === undefined || content === null || content === '') {
            throw new Error("Content cannot be empty");
        }
        if (date === undefined || date === null || date === '') {
            throw new Error("date cannot be empty");
        }

        await this.upsertArticleContent({
            id,
            title,
            date,
            content
        });

        return { id, title };


    }

    async processTask(taskId: string, userId: string): Promise<PushGitRepoTaskRespon> {
        /** Use Promise chain to serialize all GitHub pushes, avoiding concurrent submissions on the same branch leading to 409.
         * Principle: GitHub Contents API creates a new commit for each PUT,
         * If two PUTs are concurrently based on the same HEAD commit, the later one will result in 409.
         * Even if different files are written, conflicts can still occur because conflicts happen at the Git branch level, not the file level.
         */
        const promise = this.githubPushQueue.then(() =>
            this._processGithubTask(taskId, userId)
        );
        //Regardless of success or failure, update the end of the queue (use catch to prevent chain breaks)
        this.githubPushQueue = promise.catch(() => {});
        return promise;
    }

    async processDeleteArticle(deleteArticleTaskParams:DeleteArticleTaskParams): Promise<any> {
        const vaultPathInRepo = deleteArticleTaskParams.vaultPathInRepo
        const vaultName = deleteArticleTaskParams.vaultName
        const articleId = deleteArticleTaskParams.articleId
        const commitMessage = deleteArticleTaskParams.commitMessage
        const userId = deleteArticleTaskParams.userId
        
        const filePath = `${vaultPathInRepo}/${vaultName}/${articleId.slice(0,2)}/${articleId.slice(2,4)}/${articleId.slice(4)}.md`

        const vectorIndexProvider = this.sqliteRepository.getKvMeta("vectorIndexProvider") as string | undefined;        

        const promise = this.githubPushQueue.then(() =>
            this._deleteFileFromGitHub({
                accessToken: deleteArticleTaskParams.accessToken,
                githubUserName: deleteArticleTaskParams.githubUserName,
                githubRepoName: deleteArticleTaskParams.githubRepoName,
                filePath: filePath,
                commitMessage
            })
        );        
        this.githubPushQueue = promise.catch(() => {});
        

        // delete vector in vector index
        // Get Qdrant settings from KvMeta
        if (vectorIndexProvider === VECTORINDEXTYPE.QDRANT) {
            const qdrantSettings = await this.getQdrantSettingsFromKvMeta();
            if (!qdrantSettings) {
                console.warn("Qdrant settings not found in KvMeta, skipping embedding upsert to Qdrant");
                throw new Error("Qdrant settings not found in KvMeta");
            }        
            await deleteCollectionPoints(
                    qdrantSettings.qdrantUrl,
                    qdrantSettings.collectionName,
                    qdrantSettings.qdrantApiKey,            
                    {
                        points: [hex16ToUuid(articleId)]
                    }
            )
        } else if (vectorIndexProvider === VECTORINDEXTYPE.CLOUDFLARE) {
            await this.deleteEmbeddingFromCloudflareVectorIndex(articleId, userId)
        }

    }

    private async upsertEmbeddingToCloudflareVectorIndex(title: string, titleHash: string, embedding: any, userId: string, githubRepoName: string, vaultPathInRepo: string) {
        // Get vector index number using mapUuidQuick (maps to 0-9) to distribute load
        const indexNumber = mapUuidQuick(userId, 10);
        const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
        const vectorIndex = this.env[vectorIndexKey] as VectorizeIndex;
                    
        // Insert embedding into the vector index with userId as namespace
        if (vectorIndex) {
            const vectors = [
                {
                    id: titleHash,
                    values: embedding,
                    metadata: { repoAndVaultPath: `${githubRepoName}-${vaultPathInRepo}`, title },
                    namespace: userId,
                },
            ];
            await this.safeUpsertToCloudflareIndex(vectors, userId, vectorIndex);

            // Wait for the index to process the new embedding before querying
            // await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    /**
     * Safely upsert vectors into a Cloudflare Vector index.
     * Only increments the per-user vector count for vectors that did not exist before.
     */
    private async safeUpsertToCloudflareIndex(vectors: any[], userId: string, vectorIndex: VectorizeIndex) {
        try {
            const ids = vectors.map(v => v.id);
            // get existing vectors by id in chunks to respect Cloudflare limit (max 20 ids per request)
            const existingIdSet = new Set<string>();
            const CHUNK_SIZE = 20;
            for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
                const chunk = ids.slice(i, i + CHUNK_SIZE);
                try {
                    const res = await vectorIndex.getByIds(chunk);
                    if (Array.isArray(res)) {
                        res.forEach((v: any) => existingIdSet.add(v.id));
                    }
                } catch (err) {
                    console.warn(`getByIds chunk failed (ids ${i}-${i + chunk.length - 1}), assuming those ids may be new`, err);
                    // If a chunk fails, we continue so missing ids are treated as new
                }
            }
            const newCount = ids.filter(id => !existingIdSet.has(id)).length;

            // perform the upsert for all vectors (so existing ones still get updated)
            await vectorIndex.upsert(vectors);

            // only increment the KV meta count for truly new vectors
            if (newCount > 0) {
                this.incrementCloudflareVectorCountsOfUserInKvMeta(newCount, userId);
            }
        } catch (error) {
            console.error('safeUpsertToCloudflareIndex failed:', error);
            // still try a best-effort upsert if something went wrong
            try { await vectorIndex.upsert(vectors); } catch (e) { console.error('fallback upsert failed', e); }
        }
    }

    private async deleteEmbeddingFromCloudflareVectorIndex(titleHash: string, userId: string): Promise<void> {
        // Get vector index number using mapUuidQuick (maps to 0-9) to distribute load
        const indexNumber = mapUuidQuick(userId, 10);
        const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
        const vectorIndex = this.env[vectorIndexKey] as VectorizeIndex;

        if (!vectorIndex) {
            console.warn(`Cloudflare vector index ${indexNumber} not found for userId: ${userId}`);
            return;
        }

        try {
            const existingVectors = await vectorIndex.getByIds([titleHash]);
            const exists = Array.isArray(existingVectors) && existingVectors.some((v: any) => v?.id === titleHash);

            await vectorIndex.deleteByIds([titleHash]);

            if (exists) {
                this.decrementCloudflareVectorCountsOfUserInKvMeta(1, userId);
            }
        } catch (error) {
            console.error('Failed to delete embedding from Cloudflare vector index:', error);
        }
    }

    private async upsertEmbeddingToQdrantVectorIndex(title: string, titleHash: string, embedding: any, githubRepoName: string, vaultPathInRepo: string) {
        // Get Qdrant settings from KvMeta
        const qdrantSettings = await this.getQdrantSettingsFromKvMeta();
        if (!qdrantSettings) {
            console.warn("Qdrant settings not found in KvMeta, skipping embedding upsert to Qdrant");
            throw new Error("Qdrant settings not found in KvMeta");
        }
        const upsertParam: UpsertPointsParam = {
            points: [{
                id: hex16ToUuid(titleHash), // Use title hash as ID, converted to UUID format
                vector: embedding,
                payload: {repoAndVaultPath: `${githubRepoName}-${vaultPathInRepo}`, title}
            }]
        }   
        try {        
            const result = await this.upsertCollectionPoints(
                qdrantSettings.qdrantUrl,
                qdrantSettings.collectionName,
                qdrantSettings.qdrantApiKey,
                upsertParam
            );
            return result;
        } catch (error) {
            console.error('Failed to upsert embedding to Qdrant vector index:', error);
            throw new Error('Failed to upsert embedding to Qdrant vector index');
        }      
    }

    private async _addArticleGtihubPushTask(taskId: string, userId: string, taskParams: PushGitRepoTaskParams, vectorIndexProvider: string|undefined): Promise<any>{
        const { hash, title, content, commitMessage, accessToken, githubUserName, githubRepoName, vaultPathInRepo, vaultName, completed } = taskParams;

        if (completed) {
            return { "taskId": taskId, "completed": true };
        }

        const filePath = `${vaultPathInRepo}/${vaultName}/${hash.slice(0,2)}/${hash.slice(2,4)}/${hash.slice(4)}.md`

        await this.pushFileToGitHub({
            accessToken,
            githubUserName,
            githubRepoName,
            filePath: filePath,
            content,
            commitMessage: `${commitMessage}:${hash}`,
            taskId,
        });

        // Delete a processed task
        await this.state.storage.delete(taskId);
        
        // Get title embedding and save to vector index
        if (title) {
            try {
                // Generate embedding for title using AI binding
                const embeddings = await this.env.AI.run(EMBEDDING_MODEL as any, {
                    text: [title],
                });
                
                // Check if embeddings has data (not an async response)
                if ('data' in embeddings && Array.isArray(embeddings.data) && embeddings.data.length > 0) {
                    if (vectorIndexProvider === VECTORINDEXTYPE.CLOUDFLARE) {
                        this.upsertEmbeddingToCloudflareVectorIndex(title, hash, embeddings.data[0], userId, githubRepoName, vaultPathInRepo);
                    } else if (vectorIndexProvider === VECTORINDEXTYPE.QDRANT) {
                        await this.upsertEmbeddingToQdrantVectorIndex(title, hash, embeddings.data[0], githubRepoName, vaultPathInRepo);
                    }
                } else {
                    console.warn('AI returned async response or no data, skipping embedding storage');
                }
            } catch (error) {
                console.error('Failed to save embedding to vector index:', error);
                // Continue even if embedding fails - don't block the main flow
            }
        }

        return { "taskId": taskId, "completed": true };
    }

    private async _editArticleGithubPushTask(taskId: string, userId: string, taskParams: EditGitRepoTaskParams){
        const vectorIndexProvider = this.sqliteRepository.getKvMeta("vectorIndexProvider") as string | undefined;
        const { id, originalId, accessToken, githubUserName, githubRepoName, vaultPathInRepo, vaultName, completed } = taskParams;                

        if (completed) {
            return { "taskId": taskId, "completed": true };
        }        
        if (id !== originalId){
            // delete original article
            await this.processDeleteArticle({
                userId: userId,
                articleId: originalId,
                commitMessage: DELETE_COMMIT_MESSAGE,
                accessToken,
                githubUserName,
                githubRepoName,
                vaultPathInRepo,
                vaultName
            })
        }
        return await this._addArticleGtihubPushTask(taskId, userId, taskParams, vectorIndexProvider)
    }

    private async _processGithubTask(taskId: string, userId: string): Promise<any> {
        const taskParams = await this.state.storage.get<any>(taskId);
        if (!taskParams) {
            throw new NotFoundError(`Task with taskId=${taskId} not found`);
        }
        // get vectorIndexType from KvMeta, default to VECTORINDEXTYPE.CLOUDFLARE if not set
        const vectorIndexProvider = this.sqliteRepository.getKvMeta("vectorIndexProvider") as string | undefined;        

        const { originalId } = taskParams;
        if(!originalId){
            await this._addArticleGtihubPushTask(taskId, userId, taskParams, vectorIndexProvider)
        }
        if(originalId){
            await this._editArticleGithubPushTask(taskId, userId, taskParams)
        }

    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === "/upsert-collection-points") {
            if (request.method !== "POST") {
                return new Response("Method Not Allowed", {
                    status: 405,
                    headers: {
                        "Allow": "POST",
                        "Content-Type": "application/json"
                    }
                });
            }
            const qdrantUrl = url.searchParams.get('qdrantUrl') ?? url.searchParams.get('url') ?? request.headers.get('x-qdrant-url');
            const collectionName = url.searchParams.get('collectionName') ?? request.headers.get('x-qdrant-collection-name');
            const apiKey = url.searchParams.get('apiKey') ?? request.headers.get('x-qdrant-api-key');
            const githubRepoName = request.headers.get('x-githubRepoName') ?? '';
            const vaultPathInRepo = request.headers.get('x-vaultPathInRepo') ?? '';

            // get body
            const {titles} = await request.json() as { titles: string[] };
            // get embeddings for the titles
            const embeddings = await this.env.AI.run(EMBEDDING_MODEL as any, { text:[...titles] });
            const upsertParam: UpsertPointsParam = {
                points: (embeddings.data as number[][]).map((vector, idx) => ({
                    id: hex16ToUuid(edgeHash64(titles[idx])), // Use title hash as ID, converted to UUID format
                    vector,
                    payload: {repoAndVaultPath: `${githubRepoName}-${vaultPathInRepo}`, title: titles[idx] }
                }))
            }


            if (!qdrantUrl || !collectionName || !apiKey) {
                return new Response(JSON.stringify({
                    error: "Missing required fields: qdrantUrl/url, collectionName, apiKey"
                }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" }
                });
            }

            try {
                const result = await this.upsertCollectionPoints(
                    qdrantUrl,
                    collectionName,
                    apiKey,
                    upsertParam
                );
                return new Response(JSON.stringify(result), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return new Response(JSON.stringify({ error: message }), {
                    status: 500,
                    headers: { "Content-Type": "application/json" }
                });
            }
        } else if (url.pathname === "/upsert-vectors-to-cloudflare-index") {
            if (request.method !== "POST") {
                return new Response("Method Not Allowed", {
                    status: 405,
                    headers: {
                        "Allow": "POST",
                        "Content-Type": "application/json"
                    }
                });
            }
            const githubRepoName = request.headers.get('x-githubRepoName') ?? '';
            const vaultPathInRepo = request.headers.get('x-vaultPathInRepo') ?? 
            '';
            const userId = request.headers.get('x-userId') ?? '';
            // get body
            const {titles} = await request.json() as { titles: string[] };
            // get embeddings for the titles
            const embeddings = await this.env.AI.run(EMBEDDING_MODEL as any, { text:[...titles] });

            const indexNumber = mapUuidQuick(userId, 10);
            const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
            const vectorIndex = this.env[vectorIndexKey] as VectorizeIndex;
            if (vectorIndex) {
                const vectors = (embeddings.data as number[][]).map((embedding, idx) => ({
                    id: edgeHash64(titles[idx]),
                    values: embedding,
                    metadata: { repoAndVaultPath: `${githubRepoName}-${vaultPathInRepo}`, title: titles[idx] },
                    namespace: userId,
                }));
                await this.safeUpsertToCloudflareIndex(vectors, userId, vectorIndex);
                return new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }
        return new Response("Not Found", { status: 404 });
    }

    async initQdrantCollectionForUser(
        url: string,
        collectionName: string,
        apiKey: string,
        vectors: VectorsConfig,
        indexParam: CreatePayloadIndexParam,
        quantizationConfig?: QuantizationConfig
    ): Promise<any> {
        // save qdrant settings to KvMeta for later use
        await this.setQdrantSettingsToKvMeta({
            qdrantUrl: url,
            qdrantApiKey: apiKey,
            collectionName: collectionName
        });

        const result = await initQdrantCollection(
            url,
            collectionName,
            apiKey,
            vectors,
            indexParam,
            quantizationConfig
        );
        return result;
    }

    /**
     * 获取 Qdrant 集合的详细信息 (Get Collection Info)
     * @param url - Qdrant 服务的基本 URL (例如: http://localhost:6333)
     * @param collectionName - 集合名称
     * @param apiKey - API 密钥
     * @returns 包含集合详情的 Promise 对象
     */
    async fetchCollectioinStats(
        url: string,
        collectionName: string,
        apiKey: string
    ): Promise<GetCollectionInfoResponse> {
        try {
            const response = await fetch(`${url}/collections/${collectionName}`,
                {
                    method: 'GET', // 使用 GET 方法
                    headers: {
                        'api-key': apiKey
                    }
                }
            );

            // 1. 处理常见的 HTTP 错误（如 401 未授权、404 集合不存在等）
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // 2. 解析成功的响应
            const data: GetCollectionInfoResponse = await response.json();
            return data;
        } catch (error) {
            // 3. 捕获网络异常或上面抛出的错误
            console.error(`获取集合 [${collectionName}] 详情失败:`, error);
            throw error;
        }
    }

    async getCloudflareVectorIndexStatus(userId: string): Promise<any> {
        // Get vector index number using mapUuidQuick (maps to 0-9) to distribute load
        const indexNumber = mapUuidQuick(userId, 10);
        const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
        const vectorIndex = this.env[vectorIndexKey] as unknown as Vectorize;
        // 2. 获取该索引的详细信息（包含维度、向量数量等）
        const indexDetails : VectorizeIndexInfo = await vectorIndex.describe();
        const dimensions = indexDetails.dimensions ; // 获取维度
        // const vectorCount = indexDetails.vectorCount; // 获取当前向量总数
        const vectorCount = this.getCloudflareVectorCountsOfUserFromKvMeta(userId); // 从 KvMeta 获取向量总数
        return {
            dimensions,
            vectorCount
        };
    }

    async resetCloudflareNamespaceVectorCountsInKvMeta(userId: string): Promise<void> {
        this.sqliteRepository.setKvMeta(`vectorCounts_${userId}`, 0);
    }

    upsertCollectionPoints = upsertCollectionPoints;
    queryCollectionPoints = queryCollectionPoints;

    async searchInCloudflareVectorIndex(embedding: number[], topK: number, userId: string, repoAndVaultPath: string): Promise<any> {
        // Get vector index number using mapUuidQuick (maps to 0-9) to distribute load
        const indexNumber = mapUuidQuick(userId, 10);
        const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
        const vectorIndex = this.env[vectorIndexKey] as unknown as Vectorize;
        if (!vectorIndex) {
            console.warn(`Vector index ${indexNumber} not found for userId: ${userId}`);
            return null;
        }
        let queryParam : VectorizeQueryOptions= {
            topK: topK,
            namespace: userId,
            returnValues: true,
            returnMetadata: "all",
        };
        if (repoAndVaultPath) {
            queryParam.filter = { repoAndVaultPath: { $eq: repoAndVaultPath } };
        }

        const queryResult = await vectorIndex.query(
            embedding,
            queryParam
        );
        // Transform results to return only id, score, metadata in order
        const transformedResults = queryResult.matches?.map((match: any) => ({
            id: match.id,
            score: match.score,
            metadata: match.metadata,
        })) || [];

        return transformedResults;
    }

    async searchInQdrantVectorIndex(embedding: number[], topK: number, repoAndVaultPath: string, qdrantSettings: QdrantSettings): Promise<any> {
        let queryParam: QueryPointsParam = {
            query: embedding,
            limit: topK,
            with_payload: true, // 返回 payload 数据
            with_vector: false, // 不返回向量数据以节省带宽
        };
        if (repoAndVaultPath) {
            queryParam.filter = {
                must: [
                    {
                        key: "repoAndVaultPath",
                        match: {
                            value: repoAndVaultPath
                        }
                    }
                ]
            }
        }
        try {
            const queryResult = await queryCollectionPoints(
                qdrantSettings.qdrantUrl,
                qdrantSettings.collectionName,
                qdrantSettings.qdrantApiKey,
                queryParam
            );
            
            let transformedResults: {
                id: string; // 转换 ID 为 hex16 格式
                score: number; 
                metadata: Record<string, any> | undefined;
            }[] = [];
            queryResult.result.points.forEach((point) => {
                transformedResults.push({
                    id: uuidToHex16(point.id.toString()), // 转换 ID 为 hex16 格式
                    score: point.score,
                    metadata: point.payload
                });
            });
            return transformedResults;
            } catch (error) {
            console.error("Main 执行时发生错误:", error);
            }
    }

    async searchSimilarTitlesInVectorIndex(query: string, topK: number, userId: string, repoAndVaultPath: string): Promise<any> {
        try {
            const embeddings = await this.env.AI.run(EMBEDDING_MODEL as any, {
                text: [query],
            });
            
            if ('data' in embeddings && Array.isArray(embeddings.data) && embeddings.data.length > 0) {
                const vectorIndexProvider = this.sqliteRepository.getKvMeta("vectorIndexProvider") as string | undefined;
                if (vectorIndexProvider === VECTORINDEXTYPE.CLOUDFLARE) {
                    return await this.searchInCloudflareVectorIndex(embeddings.data[0], topK, userId, repoAndVaultPath);
                } else if (vectorIndexProvider === VECTORINDEXTYPE.QDRANT) {
                    // Search in Qdrant vector index
                    return await this.searchInQdrantVectorIndex(embeddings.data[0], topK, repoAndVaultPath, await this.getQdrantSettingsFromKvMeta() as QdrantSettings);
                }
            } else {
                console.warn('AI returned async response or no data for search query');
                return null;
            }
        } catch (error) {
            console.error('Failed to search vector index:', error);
            return null;
        }

    }

    async checkIfFilesExistOnGitHub(params: {
        accessToken: string;
        githubUserName: string;
        githubRepoName: string;
        dbBranch: string;
        filePaths: string[];
    }): Promise< any> {
        const { accessToken, githubUserName, githubRepoName, dbBranch, filePaths } = params;
        const result = await checkFilesExistInRepo({
            owner: githubUserName,
            repo: githubRepoName,
            filePaths,
            branch: dbBranch,
            token: accessToken
        });

        return result;
    }


    /**
     * Push file contents to GitHub repository (create or update) with built-in retry mechanism to handle 409 conflicts.
     */
    private async pushFileToGitHub(params: {
        accessToken: string;
        githubUserName: string;
        githubRepoName: string;
        filePath: string;
        content: string;
        commitMessage: string;
        taskId: string;
    }): Promise<void> {
        const { accessToken, githubUserName, githubRepoName, filePath, content, commitMessage, taskId } = params;
        const fileUrl = `https://api.github.com/repos/${githubUserName}/${githubRepoName}/contents/${filePath}`;
        const base64Content = Buffer.from(content, 'utf-8').toString('base64');

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // Re-obtain the latest SHA with each retry to avoid SHA expiration caused by concurrency
                let fileSha: string | null = null;
                const fileRes = await fetch(fileUrl, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                    },
                });

                if (fileRes.ok) {
                    const fileData = (await fileRes.json()) as { sha: string };
                    fileSha = fileData.sha;
                }

                // Submit to GitHub (create or update)
                const githubRes = await fetch(fileUrl, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: commitMessage,
                        content: base64Content,
                        sha: fileSha || undefined,
                    }),
                });

                if (githubRes.ok) {
                    break; // Success, exit retry loop
                }

                // 409 Conflict: SHA expired, can retry
                if (githubRes.status === 409 && attempt < MAX_RETRIES - 1) {
                    console.warn(`SHA conflict (409) on attempt ${attempt + 1}, retrying...`, "taskId:", taskId);
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }

                // Other errors or retry attempts exhausted
                throw new Error(await githubRes.text());
            } catch (error) {
                if (attempt < MAX_RETRIES - 1 && error instanceof Error && error.message.includes('409')) {
                    console.warn(`Retry ${attempt + 1}/${MAX_RETRIES} due to conflict, taskId:`, taskId);
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }
                console.error('Task processing failed:', error, "taskId: ", taskId);
                throw new Error(`Failed to process GitHub push: ${error}`);
            }
        }
    }

    private async _deleteFileFromGitHub(params: {
        accessToken: string;
        githubUserName: string;
        githubRepoName: string;
        filePath: string;
        commitMessage: string;
    }): Promise<void> {
        const { accessToken, githubUserName, githubRepoName, filePath, commitMessage } = params;
        const fileUrl = `https://api.github.com/repos/${githubUserName}/${githubRepoName}/contents/${filePath}`;

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                let fileSha: string | null = null;
                const fileRes = await fetch(fileUrl, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                    },
                });

                if (fileRes.ok) {
                    const fileData = (await fileRes.json()) as { sha: string };
                    fileSha = fileData.sha;
                } else if (fileRes.status === 404) {
                    console.warn(`File not found during delete, treating as success.`, "filePath:", filePath);
                    return;
                } else {
                    throw new Error(`Failed to fetch file metadata: ${fileRes.status} ${await fileRes.text()}`);
                }

                const githubRes = await fetch(fileUrl, {
                    method: 'DELETE',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: commitMessage,
                        sha: fileSha,
                    }),
                });

                if (githubRes.ok) {
                    return;
                }

                if (githubRes.status === 409 && attempt < MAX_RETRIES - 1) {
                    console.warn(`SHA conflict (409) on delete attempt ${attempt + 1}, retrying...`);
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }

                throw new Error(await githubRes.text());
            } catch (error) {
                if (attempt < MAX_RETRIES - 1 && error instanceof Error && error.message.includes('409')) {
                    console.warn(`Retry ${attempt + 1}/${MAX_RETRIES} due to conflict on delete`);
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }
                throw new Error(`Failed to delete GitHub file: ${error}`);
            }
        }
    }

    async searchCommits({
        githubUserName,
        githubRepoName,
        accessToken,
        threshold,
        searchPath = "",
        commitFilter = COMMITFILTER,
        perPage = PER_PAGE,
        maxPages,
    }: {
        githubUserName: string;
        githubRepoName: string;
        accessToken: string;
        threshold: number;
        searchPath?: string;
        commitFilter?: string;
        perPage?: number;
        maxPages?: number;
    }): Promise<SearchCommitResult[]> {
        if (!githubUserName?.trim()) throw new ValidationError("githubUserName is required");
        if (!githubRepoName?.trim()) throw new ValidationError("githubRepoName is required");
        if (!accessToken?.trim()) throw new ValidationError("accessToken is required");

        return searchCommits({
            owner: githubUserName,
            repo: githubRepoName,
            token: accessToken,
            threshold,
            searchPath,
            commitFilter,
            perPage,
            maxPages,
        });
    }

    // Reset DO storage and SQLite database
    async resetDoKeyStorageAndSqlite(): Promise<any> {
        try {
            const result: any = {
                section: "Reset DO Key Storage and SQLite Database",
                success: true,
                data: {}
            };

            // clear Do storage entries (tasks)
            const entries = await this.state.storage.list<Task>();
            const deletedTaskKeys: string[] = [];
            for (const key of entries.keys()) {
                deletedTaskKeys.push(key);
                await this.state.storage.delete(key);
            }

            // Reset SQLite database (including file index in kvMeta)
            const sqliteResetResult = await this.sqliteRepository.resetTables();

            result.data.doStorage = {
                deletedTaskCount: deletedTaskKeys.length,
                deletedTaskKeys: deletedTaskKeys,
            };

            result.data.sqlite = sqliteResetResult;

            return result;

        } catch (error) {
            return {
                section: "Reset DO Key Storage and SQLite Database",
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    // get vector index type from KvMeta
    async getVectorIndexProviderFromKvMeta(): Promise<any> {
        const vectorIndexProvider = this.sqliteRepository.getKvMeta("vectorIndexProvider");
        if (!vectorIndexProvider) {
            return null;
        }
        return { vectorIndexProvider: vectorIndexProvider };
    }
    
    // set vector index type to KvMeta
    async setVectorIndexProviderToKvMeta(vectorIndexProvider: string): Promise<void> {
        // store the primitive string value (vectorIndexType)
        // SqliteRepository.setKvMeta expects string | number | boolean
        this.sqliteRepository.setKvMeta("vectorIndexProvider", vectorIndexProvider);
    }

    // The following methods are implemented by proxying to SqliteRepository

    // set qdrantUrl and apiKey to KvMeta
    async setQdrantSettingsToKvMeta(params: QdrantSettings): Promise<any | null> {
        // 使用常量代替硬编码字符串
        this.sqliteRepository.setKvMeta(QDRANT_KEYS.qdrantUrl, params.qdrantUrl)
        this.sqliteRepository.setKvMeta(QDRANT_KEYS.qdrantApiKey, params.qdrantApiKey)
        this.sqliteRepository.setKvMeta(QDRANT_KEYS.collectionName, params.collectionName)

        return {
            qdrantUrl: params.qdrantUrl,
            qdrantApiKey: params.qdrantApiKey,
            collectionName: params.collectionName,
        }
    }

    incrementCloudflareVectorCountsOfUserInKvMeta(incrementBy: number, userId: string): void {
        const key = `vectorCounts_${userId}`;
        const currentCount = Number(this.sqliteRepository.getKvMeta(key)) || 0;
        const newCount = currentCount + incrementBy;
        this.sqliteRepository.setKvMeta(key, newCount);
    }

    decrementCloudflareVectorCountsOfUserInKvMeta(decrementBy: number, userId: string): void {
        const key = `vectorCounts_${userId}`;
        const currentCount = Number(this.sqliteRepository.getKvMeta(key)) || 0;
        const newCount = Math.max(currentCount - decrementBy, 0); // 确保不为负数
        this.sqliteRepository.setKvMeta(key, newCount);
    }

    getCloudflareVectorCountsOfUserFromKvMeta(userId: string): number {
        const key = `vectorCounts_${userId}`;
        const count = Number(this.sqliteRepository.getKvMeta(key)) || 0;
        return count;
    }

    async getQdrantSettingsFromKvMeta(): Promise<QdrantSettings | null> {
        const qdrantUrl = this.sqliteRepository.getKvMeta(QDRANT_KEYS.qdrantUrl);
        const qdrantApiKey = this.sqliteRepository.getKvMeta(QDRANT_KEYS.qdrantApiKey);
        const collectionName = this.sqliteRepository.getKvMeta(QDRANT_KEYS.collectionName);

        if (!qdrantUrl) {
            return null;
        }

        return {
            qdrantUrl,
            qdrantApiKey: qdrantApiKey || '',
            collectionName: collectionName || '',
        }
    }

    /**
     * Insert a new article content record into the articleContent table
     */
    async insertArticleContent(params: {
        id: string;
        title: string;
        date: string;
        content: string;
    }): Promise<{ id: string }> {
        return this.sqliteRepository.insertArticleContent(params);
    }

    // upsert article content by id, if id exists, update; if not, insert new record
    async upsertArticleContent(params: UpsertArticleContentParams): Promise<{ id: string }> {
        return this.sqliteRepository.upsertArticleContent(params);
    }

    /**
     * Query article content by title
     */
    async queryArticleContentByTitle(title: string): Promise<any | null> {
        return this.sqliteRepository.queryArticleContentByTitle(title);
    }

    /**
     * Query article content by ID
     */
    async queryArticleContentById(id: string): Promise<any | null> {
        return this.sqliteRepository.queryArticleContentById(id);
    }

    /**
     * Get all article content
     */
    async getAllArticleContent(): Promise<any[]> {
        return this.sqliteRepository.getAllArticleContent();
    }

    // Get article content list with pagination
    async getArticleContentList(page: number, pageSize: number): Promise<any[]> {
        return this.sqliteRepository.getArticleContentList(page, pageSize);
    }

    /**
     * Get all article content by title
     */
    async getAllArticleContentByTitle(title: string): Promise<any[]> {
        return this.sqliteRepository.getAllArticleContentByTitle(title);
    }

    /**
     * Get article content count
     */
    async getArticleContentCount(): Promise<number> {
        return this.sqliteRepository.getArticleContentCount();
    }

    /**
     * Update article content
     */
    async updateArticleContent(params: {
        id: string;
        content: string;
    }): Promise<void> {
        return this.sqliteRepository.updateArticleContent(params);
    }

    /**
     * Delete a single article content
     */
    async deleteArticleContent(id: string): Promise<void> {
        return this.sqliteRepository.deleteArticleContent(id);
    }

    /**
     * Delete all article content by title
     */
    async deleteAllArticlesByTitle(title: string): Promise<void> {
        return this.sqliteRepository.deleteAllArticlesByTitle(title);
    }

    // debug getDODBStatus 
    async getDODBStatus(): Promise<any> {
        return this.sqliteRepository.getDODBStatus();
    }

    async switchAndInitVault(
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
    ): Promise<void> {

        // before Init Vault
        this.resetDoKeyStorageAndSqlite();
        // check vaultPathInRepo exists, if not, create it
        await createEmptyFolderPathInRepoIfNotExists(githubUserName, githubRepoName, `${vaultPathInRepo}/${vaultName}`, accessToken);

        const commits = await this.searchCommits({
            githubUserName,
            githubRepoName,
            accessToken,
            threshold: SEARCH_COMMITS_THRESHOLD,
            searchPath:`${vaultPathInRepo}/${vaultName}/`,
            commitFilter:COMMIT_MESSAGE,
            perPage:20,
        })
        const selectedMarkdownFileList = Array.from(new Set(commits
            .map((commit) => {
                const parts = commit.message.split(":");
                const titleHash = parts[parts.length - 1]?.trim();
                if (!titleHash) return null;
                const filePath = `${vaultPathInRepo}/${vaultName}/${titleHash.slice(0,2)}/${titleHash.slice(2,4)}/${titleHash.slice(4)}.md`;
                return filePath;
            })
            .filter((filePath): filePath is string => Boolean(filePath))));
        
        const FileContents = await batchGetFileContents(githubUserName, githubRepoName, selectedMarkdownFileList, branch,  accessToken);
        const articleParamsList = FileContents.map((fileContent) => {
            const { title, date } = getMetaDataFromContent(fileContent.content);
            const articleId = edgeHash64(title || fileContent.path);
            return {
                id: articleId,
                title: title || date,
                date: date,
                content: fileContent.content,
            };
        });
        await this.sqliteRepository.batchInsertArticleContent(articleParamsList);
    }
}
