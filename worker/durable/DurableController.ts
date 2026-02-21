import { DurableObject } from "cloudflare:workers";
import { NotFoundError, ValidationError } from "@/types/error"
import type { Task, PushGitRepoTaskParams, PushGitRepoTaskRespon } from "@/types/durable";
import { SqliteRepository } from "@/durable/repository";

const MAX_FILES_PER_FOLDER = 1000;
const MAX_ARTICLES_TO_STORE = 1000;
const MAX_SINGLE_FILE_TITLE_INDEX = 1000;
/** titleIndexCache 积攒到此数量后，批量 flush 到 GitHub 索引文件 */
const TITLE_INDEX_CACHE_FLUSH_THRESHOLD = 10;

interface FileLocationResult {
    folderIndex: number;
    fileIndex: number;
    folderPath: string;
    filePath: string;
    needCreateFolder: boolean;
    currentTitleIndexCount: number;
    indexOfTitleIndexFiles: number;
    titleIndexFilePath: string;
    needCreateIndexFile: boolean;
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

        // 使用 blockConcurrencyWhile 确保初始化在处理任何 RPC 请求之前完成，
        // 避免 DO 被驱逐后重建时，索引被重置或读取到未初始化的状态。
        ctx.blockConcurrencyWhile(async () => {
            await this.initialize(false);
        });
    }

    async initialize(forceInit: boolean = false) {
        // 从 SQLite kvMeta 表中读取初始化标记（持久化，不会因 DO 驱逐而丢失）
        const stored = this.sqliteRepository.getKvMeta("initialized");
        if (stored !== 'true' || forceInit) {
          // 首次初始化：设置文件索引起始值
          console.log("Durable Object initializing storage (writing to SQLite kvMeta)...");
          this.sqliteRepository.setKvMeta("initialized", "true");
          this.sqliteRepository.setKvMeta("folderIndexInVault", 0);
          this.sqliteRepository.setKvMeta("fileIndexInFolder", -1);

          // currentTitleIndexCount
          this.sqliteRepository.setKvMeta("currentTitleIndexCount", 0);
          this.sqliteRepository.setKvMeta("indexOfTitleIndexFiles", -1);
        } else {
          // DO 被驱逐后重建：从 SQLite 读取（SQLite 是持久化的，不会丢失）
          const folderIndex = this.sqliteRepository.getKvMetaNumber("folderIndexInVault");
          const fileIndex = this.sqliteRepository.getKvMetaNumber("fileIndexInFolder");
          const indexOfTitleIndexFiles = this.sqliteRepository.getKvMetaNumber("indexOfTitleIndexFiles");
          const currentTitleIndexCount = this.sqliteRepository.getKvMetaNumber("currentTitleIndexCount");

          console.log("Durable Object restored from SQLite kvMeta, folderIndex:", folderIndex, "fileIndex:", fileIndex, "indexOfTitleIndexFiles:", indexOfTitleIndexFiles, "currentTitleIndexCount:", currentTitleIndexCount);
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
            title: data.title ?? '',
            content: data.content ?? '',
            completed: false,
            createdAt: data.createdAt ?? new Date().toISOString()
        };

        await this.state.storage.put(data.id, params);
        // save content to DO SQL for later query and analysis
        console.log("Saving content to Durable Object SQL:", data.content);
        await this.saveContentToDOSql(data.title, data.content);
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
                await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
                continue;
            }

            // 422 表示文件已存在（竞态创建）
            if (res.status === 422) {
                console.log("File already exists (422), skipping.");
                return;
            }

            const errorText = await res.text();
            console.log("Failed to create folder:", errorText);
            // throw new Error(errorText);
        }
        // 如果重试耗尽仍失败，可以选择抛出错误或记录日志后继续（根据业务需求）
        console.error("Failed to create folder after multiple attempts.");
        // throw new Error("Failed to create folder after multiple attempts.");
        throw new Error("Failed to create folder after multiple attempts.");
    }

    async createEmptyFileInRepo(
        accessToken: string,
        githubUserName: string,
        repoName: string,
        filePath: string
    ) {
        // normalize file path to prevent issues with leading/trailing slashes or backslashes
        const normalizedFilePath = filePath
            .replace(/\\/g, '/')
            .replace(/\/+/g, '/')
            .replace(/^\/|\/$/g, '');

        console.log("Creating empty file in repo at path:", normalizedFilePath);

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const res = await fetch(
                `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${normalizedFilePath}`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: `Init file ${normalizedFilePath}`,
                        content: Buffer.from('').toString('base64'),
                    }),
                }
            );

            // 201 = created, 200 = updated（幂等）
            if (res.ok) {
                return;
            }

            // 409 冲突：可能有并发请求正在操作同一分支
            if (res.status === 409 && attempt < MAX_RETRIES - 1) {
                console.warn(`SHA conflict (409) creating file on attempt ${attempt + 1}, retrying...`);
                await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
                continue;
            }

            // 422 表示文件已存在（竞态创建）
            if (res.status === 422) {
                console.log("File already exists (422), skipping.");
                return;
            }

            const errorText = await res.text();
            console.log("Failed to create file:", errorText);
        }
        console.error("Failed to create file after multiple attempts.");
        throw new Error("Failed to create file after multiple attempts.");
    }

    async getNextFileLocation(params: {
        vaultPathInRepo: string;
        vaultName: string;
        folderIndex: number;
        fileIndex: number;
        currentTitleIndexCount: number; // 当前标题索引数量，用于判断是否需要切换到新文件存储标题索引
        indexOfTitleIndexFiles: number; // 当前用于存储标题索引的文件编号
        maxFilesPerFolder: number;
        maxSingleFileTitleIndex: number;
    }): Promise<FileLocationResult> {

        const {
            vaultPathInRepo,
            vaultName,
            folderIndex,
            fileIndex,
            currentTitleIndexCount,
            indexOfTitleIndexFiles,
            maxFilesPerFolder,
            maxSingleFileTitleIndex,
        } = params;

        let nextFolderIndex = folderIndex;
        let nextFileIndex = fileIndex + 1;
        let needCreateFolder = false;
        let nextIndexOfTitleIndexFiles = indexOfTitleIndexFiles;
        let needCreateIndexFile = false;
        let nextCurrentTitleIndexCount = currentTitleIndexCount + 1;

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

        // 标题索引数超限，进入新文件
        if (currentTitleIndexCount % maxSingleFileTitleIndex === 0) {
            needCreateIndexFile = true;
            nextIndexOfTitleIndexFiles = (indexOfTitleIndexFiles ?? -1) + 1;
            nextCurrentTitleIndexCount = 0; // 重置当前标题索引计数，开始计数新文件的标题索引数量
        }

        const folderPath = getFolderPath(vaultPathInRepo, vaultName, nextFolderIndex);
        const filePath = `${folderPath}/File_${nextFileIndex}.md`;
        const titleIndexFilePath = `${folderPath}/TitleIndex_${nextIndexOfTitleIndexFiles}.json`;

        return {
            folderIndex: nextFolderIndex,
            fileIndex: nextFileIndex,
            folderPath,
            filePath,
            needCreateFolder,
            currentTitleIndexCount: nextCurrentTitleIndexCount,
            indexOfTitleIndexFiles: nextIndexOfTitleIndexFiles,
            titleIndexFilePath,
            needCreateIndexFile,
        };
    }

    async saveContentToDOSql(title: string, content: string): Promise<any> {
        // const taskParams = await this.state.storage.get<PushGitRepoTaskParams>(taskId);
        // if (!taskParams) {
        // throw new NotFoundError(`Task with taskId=${taskId} not found`);
        // }

        // console.log("Saving content to DO SQL, taskParams:", taskParams);
        // const { content } = taskParams;



        // 参数验证
        if (title === undefined || title === null || title === '') {
            console.warn("Warning: title is empty, using default");
            title = '';
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
     * 原子地分配下一个文件位置索引，并立即写回 SQLite kvMeta。
     * SQLite 操作是同步的，保证不会被其他并发请求插入，从而避免索引竞态。
     */
    private async allocateNextFileLocation(params: {
        vaultPathInRepo: string;
        vaultName: string;
    }): Promise<FileLocationResult> {
        const folder_index_in_vault = this.sqliteRepository.getKvMetaNumber("folderIndexInVault");
        console.log("folder_index_in_vault", folder_index_in_vault);
     
        const file_index_in_folder = this.sqliteRepository.getKvMetaNumber("fileIndexInFolder");
        console.log("file_index_in_folder", file_index_in_folder);

        if (folder_index_in_vault === null) {
            throw new Error("folderIndexInVault is missing in SQLite kvMeta");
        }
        if (file_index_in_folder === null) {
            throw new Error("fileIndexInFolder is missing in SQLite kvMeta");
        }

        const currentTitleIndexCount = this.sqliteRepository.getKvMetaNumber("currentTitleIndexCount") || 0;
        const indexOfTitleIndexFiles = this.sqliteRepository.getKvMetaNumber("indexOfTitleIndexFiles") ?? -1;
        console.log("currentTitleIndexCount", currentTitleIndexCount, "indexOfTitleIndexFiles", indexOfTitleIndexFiles);

        const result: FileLocationResult = await this.getNextFileLocation({
            vaultPathInRepo: params.vaultPathInRepo,
            vaultName: params.vaultName,
            folderIndex: folder_index_in_vault,
            fileIndex: file_index_in_folder,
            currentTitleIndexCount,
            indexOfTitleIndexFiles,
            maxFilesPerFolder: MAX_FILES_PER_FOLDER,
            maxSingleFileTitleIndex: MAX_SINGLE_FILE_TITLE_INDEX,
        });

        // 立即将新索引写回 SQLite kvMeta（同步操作，不会让出执行权），
        // 这样即使后续 await fetch 让出执行权，其他并发请求读到的也是已更新的索引。
        // 代价：如果后续 GitHub push 失败，这个文件编号会被"跳过"，但这是无害的。
        this.sqliteRepository.setKvMeta("folderIndexInVault", result.folderIndex);
        this.sqliteRepository.setKvMeta("fileIndexInFolder", result.fileIndex);

        // console.log("Updating indexOfTitleIndexFiles in SQLite kvMeta, indexOfTitleIndexFiles:", result.indexOfTitleIndexFiles)
        this.sqliteRepository.setKvMeta("indexOfTitleIndexFiles", result.indexOfTitleIndexFiles);
        // console.log("Updated indexOfTitleIndexFiles in SQLite kvMeta, indexOfTitleIndexFiles:", this.sqliteRepository.getKvMetaNumber("indexOfTitleIndexFiles"))
        this.sqliteRepository.setKvMeta("currentTitleIndexCount", result.currentTitleIndexCount);

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

        const { commitMessage, accessToken, githubUserName, repoName, vaultPathInRepo, vaultName, title, content, completed } = taskParams;

        if (completed) {
            return { "taskId": taskId, "completed": true };
        }

        // ====== 第一步：分配文件索引 ======
        const result: FileLocationResult = await this.allocateNextFileLocation({
            vaultPathInRepo,
            vaultName,
        });
        console.log("Determined file location:", result);

        // ====== 第二步：执行 GitHub 网络操作（已通过 githubPushQueue 串行化，不会并发冲突） ======
        // 文件夹创建和索引文件创建写的是不同文件，可并发执行；
        // 若两者同时触发可能产生 409，但各自内部已有重试逻辑可兜底。
        const initTasks: Promise<void>[] = [];
        if (result.needCreateFolder) {
            initTasks.push(
                this.createEmptyFolderPathInRepo(
                    accessToken,
                    githubUserName,
                    repoName,
                    result.folderPath
                )
            );
        }
        if (result.needCreateIndexFile) {
            initTasks.push(
                this.createEmptyFileInRepo(
                    accessToken,
                    githubUserName,
                    repoName,
                    result.titleIndexFilePath
                )
            );
        }
        if (initTasks.length > 0) {
            await Promise.all(initTasks);
        }

        await this.pushFileToGitHub({
            accessToken,
            githubUserName,
            repoName,
            filePath: result.filePath,
            content,
            commitMessage,
            taskId,
        });

        // 先发送到 titleIndexCache, titleIndex, 如果 titleIndexCache 满足一定数量就将 titleIndexCache 内容追加到 GitHub titleIndexFilePath 文件页面最前面，保证索引文件内容是最新的
        // title 不能为空字符串，否则会导致哈希计算出错，进而无法正确生成索引和远程路径
        // title 如果为空 or  ''，跳过索引更新，但仍然推送内容文件到 GitHub，保证文章内容不会因为索引问题而丢失
        if (title) {
            await this.pushTitleIndexCacheToGitHub({
                accessToken,
                githubUserName,
                repoName,
                titleIndexFilePath: result.titleIndexFilePath,
                commitMessage,
                title,
            });
        }

        // 删除已处理的任务
        await this.deleteTask(taskId);
        return { "taskId": taskId, "completed": true };
    }

    /**
     * 将文件内容推送到 GitHub 仓库（创建或更新），内置重试机制处理 409 冲突。
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
    }

    /**
     * 将当前 title 写入 titleIndex（本地 LRU）和 titleIndexCache（待推送缓冲），
     * 当 titleIndexCache 条数达到 TITLE_INDEX_CACHE_FLUSH_THRESHOLD 时，
     * 将缓冲内容批量 prepend 到 GitHub 上的 titleIndexFilePath 文件，
     * 然后清空 titleIndexCache。
     *
     * 这样可以把多条标题索引合并成一次 GitHub commit，减少 API 调用频率，
     * 同时保证索引文件中最新的条目出现在文件最前面。
     */
    private async pushTitleIndexCacheToGitHub(params: {
        accessToken: string;
        githubUserName: string;
        repoName: string;
        titleIndexFilePath: string;
        commitMessage: string;
        title: string;
    }): Promise<void> {
        const { accessToken, githubUserName, repoName, titleIndexFilePath, commitMessage, title } = params;

        // ---- 1. 计算 title 的哈希 & 生成远程文章路径 ----
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(title));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashOfTitle = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // remoteArticlePath 使用当前 titleIndexFilePath 所在目录；
        // 这里存储的是文件实际推送路径，由 allocateNextFileLocation 决定
        const remoteArticlePath = titleIndexFilePath;

        // ---- 2. 同时写入 titleIndex（本地 LRU）和 titleIndexCache（待推送缓冲） ----
        const insertParams = { title, hashOfTitle, remoteArticlePath };
        await this.sqliteRepository.insertTitleIndex(insertParams);
        // insertParams.title 不可以 为 ‘‘ 空字符串，直接抛出错误
        if (!insertParams.title) {
            throw new Error('Title is required');
        }
        await this.sqliteRepository.insertTitleIndexCache(insertParams);

        // ---- 3. 检查 cache 是否达到 flush 阈值 ----
        const cacheCount = await this.sqliteRepository.getTitleIndexCacheCount();
        console.log(`titleIndexCache count: ${cacheCount}, threshold: ${TITLE_INDEX_CACHE_FLUSH_THRESHOLD}`);

        if (cacheCount < TITLE_INDEX_CACHE_FLUSH_THRESHOLD) {
            // 还没攒够，等下次再推
            return;
        }

        // ---- 4. 读取所有 cache 条目，组装为 JSON 行 ----
        const cacheEntries = this.sqliteRepository.getAllTitleIndexCache();
        if (cacheEntries.length === 0) {
            return;
        }

        // 每条记录转为一行 JSON，最新的在最前面（cacheEntries 按 createdAt ASC，反转后最新在前）
        const newLines = [...cacheEntries].reverse().map(entry =>
            JSON.stringify({
                title: entry.title,
                hashOfTitle: entry.hashOfTitle,
                remoteArticlePath: entry.remoteArticlePath,
                createdAt: entry.createdAt,
            })
        ).join('\n');

        // ---- 5. 从 GitHub 获取现有索引文件内容 ----
        const fileUrl = `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${titleIndexFilePath}`;
        let existingContent = '';
        let fileSha: string | null = null;

        const MAX_RETRIES = 3;

        const getRes = await fetch(fileUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'Hono-Worker',
            },
        });

        if (getRes.ok) {
            const fileData = (await getRes.json()) as { sha: string; content: string };
            fileSha = fileData.sha;
            // GitHub 返回的 content 是 base64 编码且可能含换行符
            existingContent = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        }

        // ---- 6. 将新条目 prepend 到文件最前面 ----
        const mergedContent = existingContent
            ? `${newLines}\n${existingContent}`
            : newLines;

        const base64Content = Buffer.from(mergedContent, 'utf-8').toString('base64');

        // ---- 7. 推送到 GitHub（带重试） ----
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            // 重试时重新获取 SHA
            if (attempt > 0) {
                const retryGetRes = await fetch(fileUrl, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'User-Agent': 'Hono-Worker',
                    },
                });
                if (retryGetRes.ok) {
                    const retryData = (await retryGetRes.json()) as { sha: string; content: string };
                    if (retryData.sha !== fileSha) {
                        // SHA 变了，说明文件在两次请求之间被其他 commit 修改过，
                        // 需要基于最新内容重新合并，否则会覆盖掉别人的修改。
                        fileSha = retryData.sha;
                        const latestContent = Buffer.from(retryData.content.replace(/\n/g, ''), 'base64').toString('utf-8');
                        const reMerged = latestContent
                            ? `${newLines}\n${latestContent}`
                            : newLines;
                        var updatedBase64 = Buffer.from(reMerged, 'utf-8').toString('base64');
                    } else {
                        // SHA 没变，文件内容未被修改，沿用之前已合并好的内容即可
                        fileSha = retryData.sha;
                        var updatedBase64 = base64Content;
                    }
                } else {
                    updatedBase64 = base64Content;
                }
            } else {
                var updatedBase64 = base64Content;
            }

            const putRes = await fetch(fileUrl, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'Hono-Worker',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: `${commitMessage} - update title index`,
                    content: updatedBase64,
                    sha: fileSha || undefined,
                }),
            });

            if (putRes.ok) {
                break;
            }

            if (putRes.status === 409 && attempt < MAX_RETRIES - 1) {
                console.warn(`SHA conflict (409) pushing title index on attempt ${attempt + 1}, retrying...`);
                await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
                continue;
            }

            const errorText = await putRes.text();
            throw new Error(`Failed to push title index to GitHub: ${errorText}`);
        }

        // ---- 8. 推送成功，清空 titleIndexCache ----
        this.sqliteRepository.clearTitleIndexCache();
        console.log(`Flushed ${cacheEntries.length} title index entries to GitHub: ${titleIndexFilePath}`);
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

            // clear Do storage entries (tasks)
            const entries = await this.state.storage.list<Task>();
            const deletedTaskKeys: string[] = [];
            for (const key of entries.keys()) {
                deletedTaskKeys.push(key);
                await this.state.storage.delete(key);
            }

            // 重置 SQLite 数据库（包括 kvMeta 中的文件索引）
            const sqliteResetResult = await this.sqliteRepository.resetTables();

            result.data.doStorage = {
                deletedTaskCount: deletedTaskKeys.length,
                deletedTaskKeys: deletedTaskKeys,
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
