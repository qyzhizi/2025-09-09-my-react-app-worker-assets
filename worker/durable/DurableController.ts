import { DurableObject } from "cloudflare:workers";
import { NotFoundError, ValidationError } from "@/types/error"
import type { Task, PushGitRepoTaskParams, PushGitRepoTaskRespon } from "@/types/durable";
import { SqliteRepository } from "@/durable/repository";

import {batchGetFileContents} from "@/durable/github/githubGetContent";
import { getMetaDataFromContent } from "@/common"
import { createEmptyFolderPathInRepoIfNotExists } from "@/durable/github/githubApp";
import { searchCommits } from "@/durable/github/searchCommits";
import type { SearchCommitResult } from "@/durable/github/searchCommits";
import { COMMITFILTER, PER_PAGE } from "@/ConstVar";
import { edgeHash64, mapUuidQuick } from "@/durable/titleHash"
import type { UpsertArticleContentParams } from "@/durable/repository/types";

const MAX_ARTICLES_TO_STORE = 1000;
const SEARCH_COMMITS_THRESHOLD = 100;

const EMBEDDING_MODEL = '@cf/qwen/qwen3-embedding-0.6b'
const INDEX_NAME_PREFIX = 'MEMOFLOW_INDEX_'

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject<Env> {
    private state: DurableObjectState;
    env: Env;
    private sql: any;
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
        this.sql = ctx.storage.sql;
        this.sqliteRepository = new SqliteRepository(this.sql, MAX_ARTICLES_TO_STORE);
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

    async listTasks(): Promise<Task[]> {
        const entries = await this.state.storage.list<Task>();
        return Array.from(entries.values());
    }

    private isTaskPayload(data: any): data is Partial<Task> {
        // Your verification logic, such as checking the commitMessage/content type
        return (
          typeof data === 'object' &&
          (data.id === undefined || typeof data.id === 'string') &&
          (data.commitMessage === undefined || typeof data.commitMessage === 'string') &&
          (data.content === undefined || typeof data.content === 'string') &&
          (data.completed === undefined || typeof data.completed === 'boolean')
        )
      }

    async createTask(data: Task): Promise<Task> {
        if (!this.isTaskPayload(data)) {
            throw new ValidationError('Type Check Error: Invalid payload');
        }

        const task: Task = {
            id: data.id ,
            commitMessage: data.commitMessage ?? '',
            completed: false,
            createdAt: data.createdAt ?? new Date().toISOString(),
            content: data.content ?? '',
            filePath: data.filePath ?? ''
        };

        await this.state.storage.put(data.id, task);
        return task;
    }

    async createTaskAndSaveArticleToDB(data: PushGitRepoTaskParams): Promise<PushGitRepoTaskParams> {
        if (!this.isTaskPayload(data)) {
            throw new ValidationError('Type Check Error: Invalid payload');
        }
        if (!data.createdAt) {
            throw new ValidationError('Type Check Error: createdAt is required');
        }

        const params: PushGitRepoTaskParams = {
            id: data.id ,
            commitMessage: data.commitMessage ?? '',
            accessToken: data.accessToken ?? '',
            githubUserName: data.githubUserName ?? '',
            repoName: data.repoName ?? '',
            vaultPathInRepo: data.vaultPathInRepo ?? '',
            vaultName: data.vaultName ?? '',
            title: data.title ?? '',
            content: data.content ?? '',
            completed: false,
            createdAt: data.createdAt,
        };

        await this.state.storage.put(data.id, params);
        // save content to DO SQL for later query and analysis
        console.log("Saving content to Durable Object SQL:", data.content);
        await this.saveContentToDOSql(
            params.id,
            params.title,
            params.createdAt,
            params.content
        );
        return params;
    }

    async getTask(id: string): Promise<Task> {
        const task = await this.state.storage.get<Task>(id);
        // const task: Task = await this.state.storage.get(id);
        if (!task) {
            throw new NotFoundError(`Durable Task with id=${id} not found`);
        }
        return task;
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

    async processGithubPushTask(taskId: string, userId: string): Promise<PushGitRepoTaskRespon> {
        /** Use Promise chain to serialize all GitHub pushes, avoiding concurrent submissions on the same branch leading to 409.
         * Principle: GitHub Contents API creates a new commit for each PUT,
         * If two PUTs are concurrently based on the same HEAD commit, the later one will result in 409.
         * Even if different files are written, conflicts can still occur because conflicts happen at the Git branch level, not the file level.
         */
        const promise = this.githubPushQueue.then(() =>
            this._doProcessGithubPushTask(taskId, userId)
        );
        //Regardless of success or failure, update the end of the queue (use catch to prevent chain breaks)
        this.githubPushQueue = promise.catch(() => {});
        return promise;
    }

    private async _doProcessGithubPushTask(taskId: string, userId: string): Promise<PushGitRepoTaskRespon> {
        const taskParams = await this.state.storage.get<PushGitRepoTaskParams>(taskId);
        if (!taskParams) {
            throw new NotFoundError(`Task with taskId=${taskId} not found`);
        }

        const { commitMessage, accessToken, githubUserName, repoName, vaultPathInRepo, vaultName, title, content, completed } = taskParams;

        if (completed) {
            return { "taskId": taskId, "completed": true };
        }

        console.log("title: ", title, "title.length: ", title.length)
        const titleHash = edgeHash64(title)
        console.log("titleHash: ", titleHash)
        const filePath = `${vaultPathInRepo}/${vaultName}/${titleHash.slice(0,2)}/${titleHash.slice(2,4)}/${titleHash.slice(4)}.md`
        console.log("filePath: ", filePath)

        await this.pushFileToGitHub({
            accessToken,
            githubUserName,
            repoName,
            filePath: filePath,
            content,
            commitMessage: `${commitMessage}:${titleHash}`,
            taskId,
        });

        // Delete a processed task
        await this.deleteTask(taskId);
        
        // Get title embedding and save to vector index
        if (title && title.trim()) {
            try {
                // Generate embedding for title using AI binding
                const embeddings = await this.env.AI.run(EMBEDDING_MODEL as any, {
                    text: [title],
                });
                console.log("Generated embeddings for title:", title);
                
                // Check if embeddings has data (not an async response)
                if ('data' in embeddings && Array.isArray(embeddings.data) && embeddings.data.length > 0) {
                    // Get vector index number using mapUuidQuick (maps to 0-9) to distribute load
                    const indexNumber = mapUuidQuick(userId, 10);
                    const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
                    const vectorIndex = this.env[vectorIndexKey] as VectorizeIndex;
                    
                    // Insert embedding into the vector index with userId as namespace
                    if (vectorIndex) {
                        await vectorIndex.upsert([
                            {
                                id: titleHash,
                                values: embeddings.data[0],
                                metadata: { title, repoName },
                                namespace: userId,
                            },
                        ],);
                        console.log(`Embedding saved to vector index ${indexNumber} (namespace: userId with id: ${titleHash}`);

                        // Wait for the index to process the new embedding before querying
                        await new Promise(resolve => setTimeout(resolve, 300));
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

    async searchSimilarTitlesInVectorIndex(query: string, topK: number, userId: string, repoName: string): Promise<any> {
        try {
            const embeddings = await this.env.AI.run(EMBEDDING_MODEL as any, {
                text: [query],
            });
            
            if ('data' in embeddings && Array.isArray(embeddings.data) && embeddings.data.length > 0) {
                const indexNumber = mapUuidQuick(userId, 10);
                const vectorIndexKey = `${INDEX_NAME_PREFIX}${indexNumber}` as keyof Env;
                const vectorIndex = this.env[vectorIndexKey] as VectorizeIndex;

                if (vectorIndex) {
                    const queryResult = await vectorIndex.query(
                        embeddings.data[0],
                        { topK: topK, 
                          namespace: userId, 
                          filter: { repoName: repoName }, // Filter results by repoName in metadata
                          returnValues: true,
                          returnMetadata: "all",
                        }
                    );
                    // Transform results to return only id, score, metadata in order
                    const transformedResults = queryResult.matches?.map((match: any) => ({
                        id: match.id,
                        score: match.score,
                        metadata: match.metadata,
                    })) || [];
                    console.log(`Search query: "${query}" returned ${transformedResults.length} results from vector index ${indexNumber}`);
                    return transformedResults;
                } else {
                    console.warn(`Vector index ${indexNumber} not found for userId: ${userId}`);
                    return null;
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

    /**
     * Push file contents to GitHub repository (create or update) with built-in retry mechanism to handle 409 conflicts.
     */
    private async pushFileToGitHub(params: {
        accessToken: string;
        githubUserName: string;
        repoName: string;
        filePath: string;
        content: string;
        commitMessage: string;
        taskId: string;
    }): Promise<void> {
        const { accessToken, githubUserName, repoName, filePath, content, commitMessage, taskId } = params;
        const fileUrl = `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${filePath}`;
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

    // 2) Return Promise<Task>, no longer directly construct Response
    async updateTask(taskId: string, data: Partial<Task>): Promise<Task> {
        const existing = await this.state.storage.get<Task>(taskId)
        if (!existing) {
        // Here throw NotFoundError
        throw new NotFoundError(`Task with taskId=${taskId} not found`)
        }

        if (!this.isTaskPayload(data)) {
        // Here throw ValidationError
        throw new ValidationError('Invalid task payload')
        }

        const updated: Task = {
        ...existing,
        commitMessage: data.commitMessage ?? existing.commitMessage,
        content: data.content ?? existing.content,
        completed: data.completed ?? existing.completed,
        createdAt: existing.createdAt,
        filePath: data.filePath ?? existing.filePath,
        }

        await this.state.storage.put(taskId, updated)
        return updated
    }

    async deleteTask(taskId: string): Promise<void> {
        const existed = await this.state.storage.get<Task>(taskId);
        if (!existed) {
            throw new NotFoundError(`Task with taskId=${taskId} not found`);
        }
        await this.state.storage.delete(taskId);
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

    // The following methods are implemented by proxying to SqliteRepository

    /**
     * Insert a new article content record into the articleContent table
     */
    async insertArticleContent(params: {
        id: string;
        title: string;
        date: string;
        content: string;
    }): Promise<{ id: string }> {
        console.log("Inserting article content:", params);
        return this.sqliteRepository.insertArticleContent(params);
    }

    // upsert article content by id, if id exists, update; if not, insert new record
    async upsertArticleContent(params: UpsertArticleContentParams): Promise<{ id: string }> {
        console.log("Upserting article content:", params);
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
            commitFilter:"[NEW] by memoflow",
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
        console.log("selectedMarkdownFileList", selectedMarkdownFileList.slice(0,10))
        
        const FileContents = await batchGetFileContents(githubUserName, githubRepoName, selectedMarkdownFileList, branch,  accessToken);
        console.log("FileContents: ", FileContents.slice(0, 10));
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
