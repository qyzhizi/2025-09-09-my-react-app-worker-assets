import { DurableObject } from "cloudflare:workers";
import { NotFoundError, ValidationError } from "@/types/error"
import type { Task, PushGitRepoTaskParams, PushGitRepoTaskRespon } from "@/types/durable";
import { SqliteRepository } from "@/durable/repository";

const MAX_FILES_PER_FOLDER = 1000;
const MAX_ARTICLES_TO_STORE = 1000;

interface FileLocationResult {
    folderIndex: number;
    fileIndex: number;
    folderPath: string;
    filePath: string;
    needCreateFolder: boolean;
}

/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject<Env> {
    private state: DurableObjectState;
    env: Env;
    private sql: any;
    private sqliteRepository: SqliteRepository;
    /**
     * GitHub 推送串行化锁。
     * Contents API 在同一 branch 上并发提交会导致 409（Git HEAD 竞态），
     * 通过 Promise 链保证同一时刻只有一个推送在执行。
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
        this.initialize(false);
    }

    async initialize(forceInit: boolean = false) {
        let stored = await this.state.storage.get("initialized");
        if (!stored || forceInit) {
          // 初始化操作
          console.log("Durable Object initializing storage...");
          await this.state.storage.put("initialized", true);

          await this.state.storage.put("folderIndexInVault", 0);
          await this.state.storage.put("fileIndexInFolder", -1);

        }
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
        // 你的校验逻辑，比如检查 commitMessage/content 类型
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

        // const id = crypto.randomUUID();
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

        // const id = crypto.randomUUID();
        const params: PushGitRepoTaskParams = {
            id: data.id ,
            commitMessage: data.commitMessage ?? '',
            accessToken: data.accessToken ?? '',
            githubUserName: data.githubUserName ?? '',
            repoName: data.repoName ?? '',
            vaultPathInRepo: data.vaultPathInRepo ?? '',
            vaultName: data.vaultName ?? '',
            content: data.content ?? '',
            completed: false,
            createdAt: data.createdAt ?? new Date().toISOString()
        };

        await this.state.storage.put(data.id, params);
        // save content to DO SQL for later query and analysis
        console.log("Saving content to Durable Object SQL:", data.content);
        await this.saveContentToDOSql(data.content);
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

    async checkFileExistsInRepo(
        accessToken: string,
        githubUserName: string,
        repoName: string,
        filePath: string
    ): Promise<boolean> {
        const res = await fetch(
            `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${filePath}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'Hono-Worker',
                },
            }
        );
        return res.ok;
    }

    async createEmptyFolderPathInRepo(
        accessToken: string,
        githubUserName: string,
        repoName: string,
        folderPath: string
    ) {
        const normalizedFolderPath = folderPath
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .replace(/^\/|\/$/g, '');
        const placeholderFilePath = `${normalizedFolderPath}/.gitkeep`;
        // 判断文件是否存在
        const fileExists = await this.checkFileExistsInRepo(accessToken, githubUserName, repoName, placeholderFilePath);
        if (fileExists) {
            console.log("File already exists, skipping creation.");
            return;
        }

        console.log("Creating folder in repo at path:", placeholderFilePath);

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            // 如果是重试，重新检查文件是否已被其他并发请求创建
            if (attempt > 0) {
                const recheckExists = await this.checkFileExistsInRepo(accessToken, githubUserName, repoName, placeholderFilePath);
                if (recheckExists) {
                    console.log("File was created by another request during retry, skipping.");
                    return;
                }
            }

            const res = await fetch(
                `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${placeholderFilePath}`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: `Init folder ${normalizedFolderPath}`,
                        content: Buffer.from('').toString('base64'),
                    }),
                }
            );

            // 201 = created, 200 = updated（幂等）
            if (res.ok || res.status === 200) {
                return;
            }

            // 409 冲突：可能有并发请求正在操作同一文件
            if (res.status === 409 && attempt < MAX_RETRIES - 1) {
                console.warn(`SHA conflict (409) creating folder on attempt ${attempt + 1}, retrying...`);
                await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                continue;
            }

            // 422 表示文件已存在（竞态创建）
            if (res.status === 422) {
                console.log("File already exists (422), skipping.");
                return;
            }

            const errorText = await res.text();
            console.log("Failed to create folder:", errorText);
            throw new Error(errorText);
        }
    }

    async getNextFileLocation(params: {
        vaultPathInRepo: string;
        vaultName: string;
        folderIndex: number;
        fileIndex: number;
        maxFilesPerFolder: number;
    }): Promise<FileLocationResult> {

        const {
            vaultPathInRepo,
            vaultName,
            folderIndex,
            fileIndex,
            maxFilesPerFolder
        } = params;

        let nextFolderIndex = folderIndex;
        let nextFileIndex = fileIndex + 1;
        let needCreateFolder = false;

        // 首次初始化（fileIndex = -1 代表还没写过文件）
        if (folderIndex === 0 && fileIndex === -1) {
            needCreateFolder = true;
            nextFileIndex = 0;
        }

        // 文件数超限，进入新 folder
        if (nextFileIndex >= maxFilesPerFolder) {
            nextFileIndex = 0;
            nextFolderIndex++;
            needCreateFolder = true;
        }

        const folderPath = getFolderPath(vaultPathInRepo, vaultName, nextFolderIndex);
        const filePath = `${folderPath}/File_${nextFileIndex}.md`;

        return {
            folderIndex: nextFolderIndex,
            fileIndex: nextFileIndex,
            folderPath,
            filePath,
            needCreateFolder
        };
    }

    async saveContentToDOSql(content: string): Promise<any> {
        // const taskParams = await this.state.storage.get<PushGitRepoTaskParams>(taskId);
        // if (!taskParams) {
        // throw new NotFoundError(`Task with taskId=${taskId} not found`);
        // }

        // console.log("Saving content to DO SQL, taskParams:", taskParams);
        // const { content } = taskParams;

        // 使用正则表达式提取标题
        let title = '';
        
        // 首先查找 #que 后面跟一个空格的行
        const queMatch = content.match(/^\x20{0,2}#que(?:\x20)(.*)$/m);
        if (queMatch && queMatch[1]) {
            title = queMatch[1].trim();
        } else {
            // 如果没有找到 #que，查找第一个 “# “后面跟一个空格的行
            const headerMatch = content.match(/^\x20{0,2}#(?:\x20)(.*)$/m);
            if (headerMatch && headerMatch[1]) {
                title = headerMatch[1].trim();
            }
        }
        console.log("Extracted title: ", title)
        console.log("Extracted content length: ", content?.length || 0)

        // 参数验证
        if (title === undefined || title === null || title === '') {
            console.warn("Warning: title is empty, using default");
            title = '未命名文档';
        }
        if (content === undefined || content === null || content === '') {
            throw new Error("Content cannot be empty");
        }

        const id = await this.insertArticleContent({
            title,
            content
        });

        return { id, title };


    }

    /**
     * 原子地分配下一个文件位置索引，并立即写回存储。
     * 这个方法内部没有 await fetch，所以在单次 I/O turn 中完成，
     * 保证不会被其他并发请求插入，从而避免索引竞态。
     */
    private async allocateNextFileLocation(params: {
        vaultPathInRepo: string;
        vaultName: string;
    }): Promise<FileLocationResult> {
        const folder_index_in_vault = await this.state.storage.get<number>("folderIndexInVault");
        console.log("folder_index_in_vault", folder_index_in_vault);
     
        const file_index_in_folder = await this.state.storage.get<number>("fileIndexInFolder");
        console.log("file_index_in_folder", file_index_in_folder);

        if (folder_index_in_vault === undefined) {
            throw new Error("folderIndexInVault is undefined in DO storage");
        }
        if (file_index_in_folder === undefined) {
            throw new Error("fileIndexInFolder is undefined in DO storage");
        }

        const result: FileLocationResult = await this.getNextFileLocation({
            vaultPathInRepo: params.vaultPathInRepo,
            vaultName: params.vaultName,
            folderIndex: folder_index_in_vault,
            fileIndex: file_index_in_folder,
            maxFilesPerFolder: MAX_FILES_PER_FOLDER
        });

        // 立即将新索引写回存储（在发起任何 fetch 之前），
        // 这样即使后续 await fetch 让出执行权，其他并发请求读到的也是已更新的索引。
        // 代价：如果后续 GitHub push 失败，这个文件编号会被"跳过"，但这是无害的。
        await this.state.storage.put("folderIndexInVault", result.folderIndex);
        await this.state.storage.put("fileIndexInFolder", result.fileIndex);

        return result;
    }

    async processGithubPushTask(taskId: string): Promise<PushGitRepoTaskRespon> {
        // 通过 Promise 链串行化所有 GitHub 推送，避免同一 branch 上的并发提交导致 409。
        // 原理：GitHub Contents API 每次 PUT 都会创建一个新 commit，
        // 如果两个 PUT 并发基于同一个 HEAD commit，后提交的那个就会 409。
        // 即使写的是不同文件也会冲突，因为冲突发生在 Git branch 级别，不是文件级别。
        const promise = this.githubPushQueue.then(() =>
            this._doProcessGithubPushTask(taskId)
        );
        // 无论成功失败，都更新队列尾部（用 catch 防止链断裂）
        this.githubPushQueue = promise.catch(() => {});
        return promise;
    }

    private async _doProcessGithubPushTask(taskId: string): Promise<PushGitRepoTaskRespon> {
        const taskParams = await this.state.storage.get<PushGitRepoTaskParams>(taskId);
        if (!taskParams) {
            throw new NotFoundError(`Task with taskId=${taskId} not found`);
        }

        const { commitMessage, accessToken, githubUserName, repoName, vaultPathInRepo, vaultName, content, completed } = taskParams;

        if (completed) {
            return { "taskId": taskId, "completed": true };
        }

        // ====== 第一步：分配文件索引 ======
        const result = await this.allocateNextFileLocation({
            vaultPathInRepo,
            vaultName,
        });
        console.log("Determined file location:", result);

        // ====== 第二步：执行 GitHub 网络操作（已通过 githubPushQueue 串行化，不会并发冲突） ======
        if (result.needCreateFolder) {
            await this.createEmptyFolderPathInRepo(
                accessToken,
                githubUserName,
                repoName,
                result.folderPath
            );
        }

        const filePath = result.filePath;
        const fileUrl = `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${filePath}`;
        const base64Content = Buffer.from(content, 'utf-8').toString('base64');

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                // 每次重试都重新获取最新 SHA，避免并发导致的 SHA 过期
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

                // 提交到 GitHub（创建或更新）
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
                    break; // 成功，跳出重试循环
                }

                // 409 冲突：SHA 过期，可以重试
                if (githubRes.status === 409 && attempt < MAX_RETRIES - 1) {
                    console.warn(`SHA conflict (409) on attempt ${attempt + 1}, retrying...`, "taskId:", taskId);
                    // 短暂等待，给并发请求完成的时间（指数退避）
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }

                // 其他错误或重试次数已耗尽
                throw new Error(await githubRes.text());
            } catch (error) {
                if (attempt < MAX_RETRIES - 1 && error instanceof Error && error.message.includes('409')) {
                    console.warn(`Retry ${attempt + 1}/${MAX_RETRIES} due to conflict, taskId:`, taskId);
                    await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                    continue;
                }
                console.error('任务处理失败:', error, "taskId: ", taskId);
                throw new Error(`Failed to process GitHub push: ${error}`);
            }
        }

        // 删除已处理的任务
        await this.deleteTask(taskId);
        return { "taskId": taskId, "completed": true };
    }

    // 2) 返回 Promise<Task>，不再直接构造 Response
    async updateTask(taskId: string, data: Partial<Task>): Promise<Task> {
        const existing = await this.state.storage.get<Task>(taskId)
        if (!existing) {
        // 这里抛出 NotFoundError
        throw new NotFoundError(`Task with taskId=${taskId} not found`)
        }

        if (!this.isTaskPayload(data)) {
        // 这里抛出 ValidationError
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

    // 重置 DO 存储和 SQLite 数据库
    async resetDoKeyStorageAndSqlite(): Promise<any> {
        try {
            const result: any = {
                section: "重置 DO Key 存储和 SQLite 数据库",
                success: true,
                data: {}
            };

            // clear Do storage entries 
            const entries = await this.state.storage.list<Task>();
            const deletedTaskKeys: string[] = [];
            for (const key of entries.keys()) {
                deletedTaskKeys.push(key);
                await this.state.storage.delete(key);
            }

            // reset DO storage
            // await this.state.storage.put("initialized", false);
            await this.state.storage.put("folderIndexInVault", 0);
            await this.state.storage.put("fileIndexInFolder", -1);

            // 重置 SQLite 数据库
            const sqliteResetResult = await this.sqliteRepository.resetTables();

            result.data.doStorage = {
                deletedTaskCount: deletedTaskKeys.length,
                deletedTaskKeys: deletedTaskKeys,
                resetInitialized: false,
                resetFolderIndexInVault: 0,
                resetFileIndexInFolder: 0
            };

            result.data.sqlite = sqliteResetResult;

            return result;

        } catch (error) {
            return {
                section: "重置 DO Key 存储和 SQLite 数据库",
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    // ===================== 仓储层代理方法 =====================
    // 以下方法通过代理到 SqliteRepository 实现

    /**
     * 向 titleIndex 表中插入一条新的标题记录
     */
    async insertTitleIndex(params: {
        title: string;
        hashOfTitle: string;
        remoteArticlePath: string;
    }): Promise<{ id: string }> {
        return this.sqliteRepository.insertTitleIndex(params);
    }

    /**
     * 根据 hashOfTitle 查询标题记录
     */
    async queryTitleIndexByHash(hashOfTitle: string): Promise<any | null> {
        return this.sqliteRepository.queryTitleIndexByHash(hashOfTitle);
    }

    /**
     * 根据 ID 查询标题记录
     */
    async queryTitleIndexById(id: string): Promise<any | null> {
        return this.sqliteRepository.queryTitleIndexById(id);
    }

    /**
     * 获取所有标题记录
     */
    async getAllTitleIndex(): Promise<any[]> {
        return this.sqliteRepository.getAllTitleIndex();
    }

    /**
     * 获取标题记录数量
     */
    async getTitleIndexCount(): Promise<number> {
        return this.sqliteRepository.getTitleIndexCount();
    }

    /**
     * 向 articleContent 表中插入一条新的文章内容记录
     */
    async insertArticleContent(params: {
        title: string;
        content: string;
    }): Promise<{ id: string }> {
        console.log("Inserting article content:", params);
        return this.sqliteRepository.insertArticleContent(params);
    }

    /**
     * 根据 title 查询文章内容
     */
    async queryArticleContentByTitle(title: string): Promise<any | null> {
        return this.sqliteRepository.queryArticleContentByTitle(title);
    }

    /**
     * 根据 ID 查询文章内容
     */
    async queryArticleContentById(id: string): Promise<any | null> {
        return this.sqliteRepository.queryArticleContentById(id);
    }

    /**
     * 获取所有文章内容
     */
    async getAllArticleContent(): Promise<any[]> {
        return this.sqliteRepository.getAllArticleContent();
    }

    // 获取文章内容列表，支持分页
    async getArticleContentList(page: number, pageSize: number): Promise<any[]> {
        return this.sqliteRepository.getArticleContentList(page, pageSize);
    }

    /**
     * 获取特定标题的所有文章内容
     */
    async getAllArticleContentByTitle(title: string): Promise<any[]> {
        return this.sqliteRepository.getAllArticleContentByTitle(title);
    }

    /**
     * 获取文章内容数量
     */
    async getArticleContentCount(): Promise<number> {
        return this.sqliteRepository.getArticleContentCount();
    }

    /**
     * 更新文章内容
     */
    async updateArticleContent(params: {
        id: string;
        content: string;
    }): Promise<void> {
        return this.sqliteRepository.updateArticleContent(params);
    }

    /**
     * 删除标题记录
     */
    async deleteTitleIndex(idOfTitleIndex: string): Promise<void> {
        return this.sqliteRepository.deleteTitleIndex(idOfTitleIndex);
    }

    /**
     * 删除单个文章内容
     */
    async deleteArticleContent(id: string): Promise<void> {
        return this.sqliteRepository.deleteArticleContent(id);
    }

    /**
     * 删除特定标题的所有文章内容
     */
    async deleteAllArticlesByTitle(title: string): Promise<void> {
        return this.sqliteRepository.deleteAllArticlesByTitle(title);
    }

    // debug 调用 getDODBStatus
    async getDODBStatus(): Promise<any> {
        return this.sqliteRepository.getDODBStatus();
    }
}

function normalizeGitHubPath(path: string): string {
    return path
        .replace(/\\/g, '/')        // 禁止反斜杠
        .replace(/\/+/g, '/')       // 合并多余 /
        .replace(/^\/|\/$/g, '');   // 去掉首尾 /
}

function getFolderPath(
    vaultPathInRepo: string,
    vaultName: string,
    folderIndex: number 
): string {

    if (!Number.isInteger(folderIndex) || folderIndex < 0) {
        throw new Error(`Invalid folder index: ${folderIndex}`);
    }

    const rawPath = [
        vaultPathInRepo,
        vaultName,
        `Folder_${folderIndex}`
    ].filter(Boolean).join('/');

    return normalizeGitHubPath(rawPath);
}
