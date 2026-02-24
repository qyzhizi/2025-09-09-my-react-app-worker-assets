import { DurableObject } from "cloudflare:workers";
import { NotFoundError, ValidationError } from "@/types/error"
import type { Task, PushGitRepoTaskParams, PushGitRepoTaskRespon } from "@/types/durable";
import { SqliteRepository } from "@/durable/repository";

const MAX_FILES_PER_FOLDER = 1000;
const MAX_ARTICLES_TO_STORE = 1000;
const MAX_SINGLE_FILE_TITLE_INDEX = 1000;
/** After the titleIndexCache accumulates to this quantity, it will be flushed in bulk to the GitHub index file. */
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

        // Use blockConcurrencyWhile to ensure that initialization completes before processing any RPC requests,
        // Prevent the index from being reset or read to an uninitialized state when rebuilding after DO eviction.
        ctx.blockConcurrencyWhile(async () => {
            await this.initialize(false);
        });
    }

    async initialize(forceInit: boolean = false) {
        // Read initialization token from SQLite kvMeta table (persistent, not lost by DO eviction)
        const stored = this.sqliteRepository.getKvMeta("initialized");
        if (stored !== 'true' || forceInit) {
          // First initialization: Set the file index starting value
          console.log("Durable Object initializing storage (writing to SQLite kvMeta)...");
          this.sqliteRepository.setKvMeta("initialized", "true");
          this.sqliteRepository.setKvMeta("folderIndexInVault", 0);
          this.sqliteRepository.setKvMeta("fileIndexInFolder", -1);

          // currentTitleIndexCount
          this.sqliteRepository.setKvMeta("currentTitleIndexCount", 0);
          this.sqliteRepository.setKvMeta("indexOfTitleIndexFiles", -1);
        } else {
          // DO rebuild after eviction: read from SQLite (SQLite is persistent and will not be lost)
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
        // Determine whether the file exists
        const fileExists = await this.checkFileExistsInRepo(accessToken, githubUserName, repoName, placeholderFilePath);
        if (fileExists) {
            console.log("File already exists, skipping creation.");
            return;
        }

        console.log("Creating folder in repo at path:", placeholderFilePath);

        const MAX_RETRIES = 3;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            // If it is a retry, recheck whether the file has been created by other concurrent requests.
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

            // 201 = created, 200 = updated（Idempotent）
            if (res.ok || res.status === 200) {
                return;
            }

            // 409 Conflict: There may be concurrent requests operating on the same file
            if (res.status === 409 && attempt < MAX_RETRIES - 1) {
                console.warn(`SHA conflict (409) creating folder on attempt ${attempt + 1}, retrying...`);
                await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
                continue;
            }

            // 422 means the file already exists (race creation)
            if (res.status === 422) {
                console.log("File already exists (422), skipping.");
                return;
            }

            const errorText = await res.text();
            console.log("Failed to create folder:", errorText);
            // throw new Error(errorText);
        }
        // If the retries still fail, you can choose to throw an error or log and continue (based on business needs)
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

            // 201 = created, 200 = updated（Idempotent）
            if (res.ok) {
                return;
            }

            // 409 confict can occur even if the file doesn't exist yet, because GitHub checks the branch's HEAD commit SHA for every update, and concurrent updates can cause SHA mismatches. Therefore, we should retry on 409 regardless of whether we think the file exists or not.
            if (res.status === 409 && attempt < MAX_RETRIES - 1) {
                console.warn(`SHA conflict (409) creating file on attempt ${attempt + 1}, retrying...`);
                await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
                continue;
            }

            // 422 means the file already exists (race creation)
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
        currentTitleIndexCount: number; // The current number of title indexes, used to determine whether it is necessary to switch to a new file to store title indexes
        indexOfTitleIndexFiles: number; // The file number currently used to store the title index
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

        // First initialization (fileIndex = -1 means the file has not been written yet)
        if (folderIndex === 0 && fileIndex === -1) {
            needCreateFolder = true;
            nextFileIndex = 0;
        }

        // The number of files exceeds the limit, enter a new folder
        if (nextFileIndex >= maxFilesPerFolder) {
            nextFileIndex = 0;
            nextFolderIndex++;
            needCreateFolder = true;
        }

        // The number of title indexes exceeds the limit, enter a new file
        if (currentTitleIndexCount % maxSingleFileTitleIndex === 0) {
            needCreateIndexFile = true;
            nextIndexOfTitleIndexFiles = (indexOfTitleIndexFiles ?? -1) + 1;
            nextCurrentTitleIndexCount = 0; // Reset the current title index count and start counting the number of title indexes for new files
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
     * Atomically allocate the next file position index and immediately write it back to the SQLite kvMeta.
     * SQLite operations are synchronous, ensuring that no other concurrent requests can insert, thus avoiding index races.
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

        /**
         * Immediately write the new index back to SQLite kvMeta (synchronous operation, will not yield execution),
         * This way, even if subsequent await fetch yields execution, other concurrent requests will read the updated index.
         * Cost: If subsequent GitHub push fails, this file number will be "skipped", but this is harmless.
         */
        this.sqliteRepository.setKvMeta("folderIndexInVault", result.folderIndex);
        this.sqliteRepository.setKvMeta("fileIndexInFolder", result.fileIndex);

        // console.log("Updating indexOfTitleIndexFiles in SQLite kvMeta, indexOfTitleIndexFiles:", result.indexOfTitleIndexFiles)
        this.sqliteRepository.setKvMeta("indexOfTitleIndexFiles", result.indexOfTitleIndexFiles);
        // console.log("Updated indexOfTitleIndexFiles in SQLite kvMeta, indexOfTitleIndexFiles:", this.sqliteRepository.getKvMetaNumber("indexOfTitleIndexFiles"))
        this.sqliteRepository.setKvMeta("currentTitleIndexCount", result.currentTitleIndexCount);

        return result;
    }

    async processGithubPushTask(taskId: string): Promise<PushGitRepoTaskRespon> {
        /** Use Promise chain to serialize all GitHub pushes, avoiding concurrent submissions on the same branch leading to 409.
         * Principle: GitHub Contents API creates a new commit for each PUT,
         * If two PUTs are concurrently based on the same HEAD commit, the later one will result in 409.
         * Even if different files are written, conflicts can still occur because conflicts happen at the Git branch level, not the file level.
         */
        const promise = this.githubPushQueue.then(() =>
            this._doProcessGithubPushTask(taskId)
        );
        //Regardless of success or failure, update the end of the queue (use catch to prevent chain breaks)
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

        // ====== Step 1: Assign file index ======
        const result: FileLocationResult = await this.allocateNextFileLocation({
            vaultPathInRepo,
            vaultName,
        });
        console.log("Determined file location:", result);

        // ====== Step 2: Perform GitHub network operations (serialized through githubPushQueue, no concurrency conflicts) ======
        /** Folder creation and index file creation write different files and can be executed concurrently;
         * If both are triggered at the same time, a 409 may be generated, but each has internal retry logic to cover the issue.
         */
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

        /**
         * First sent to titleIndexCache, titleIndex. If titleIndexCache meets a certain number, the titleIndexCache content will be appended to the front of the GitHub titleIndexFilePath file page to ensure that the index file content is up to date.
         * title cannot be an empty string, otherwise it will cause hash calculation errors, and the index and remote path will not be correctly generated.
         * If title is empty or '', the index update will be skipped, but the content file will still be pushed to GitHub to ensure that the article content will not be lost due to indexing issues.
         */
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

        // Delete a processed task
        await this.deleteTask(taskId);
        return { "taskId": taskId, "completed": true };
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

    /**
     * Write the current title into titleIndex (local LRU) and titleIndexCache (buffer to be pushed),
     * When the number of titleIndexCache reaches TITLE_INDEX_CACHE_FLUSH_THRESHOLD,
     * Batch prepend the buffered content to the titleIndexFilePath file on GitHub,
     * Then clear the titleIndexCache.
     *
     * In this way, multiple title indexes can be merged into one GitHub commit, reducing the frequency of API calls.
     * Also ensure that the latest entry in the index file appears at the front of the file.
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

        // ---- 1. Calculate the hash of the title & generate the remote article path ----
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(title));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashOfTitle = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // remoteArticlePath uses the directory where the current titleIndexFilePath is located;
        // This stores the actual file push path, determined by allocateNextFileLocation
        const remoteArticlePath = titleIndexFilePath;

        // ---- 2. Write to titleIndex (local LRU) and titleIndexCache (buffer to be pushed) ----
        const insertParams = { title, hashOfTitle, remoteArticlePath };
        await this.sqliteRepository.insertTitleIndex(insertParams);
        // insertParams.title cannot be '' empty string, an error will be thrown directly
        if (!insertParams.title) {
            throw new Error('Title is required');
        }
        await this.sqliteRepository.insertTitleIndexCache(insertParams);

        // ---- 3. Check if cache has reached flush threshold ----
        const cacheCount = await this.sqliteRepository.getTitleIndexCacheCount();
        console.log(`titleIndexCache count: ${cacheCount}, threshold: ${TITLE_INDEX_CACHE_FLUSH_THRESHOLD}`);

        if (cacheCount < TITLE_INDEX_CACHE_FLUSH_THRESHOLD) {
            // Not enough, wait for the next push
            return;
        }

        // ---- 4. Read all cache entries and assemble them into JSON lines ----
        const cacheEntries = this.sqliteRepository.getAllTitleIndexCache();
        if (cacheEntries.length === 0) {
            return;
        }

        // Each record is converted to a line of JSON, with the latest at the front (cacheEntries is sorted by createdAt ASC, reversed to have the latest first)
        const newLines = [...cacheEntries].reverse().map(entry =>
            JSON.stringify({
                title: entry.title,
                hashOfTitle: entry.hashOfTitle,
                remoteArticlePath: entry.remoteArticlePath,
                createdAt: entry.createdAt,
            })
        ).join('\n');

        // ---- 5. Get existing index file content from GitHub ----
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
            // The content returned by GitHub is base64 encoded and may contain newlines
            existingContent = Buffer.from(fileData.content.replace(/\n/g, ''), 'base64').toString('utf-8');
        }

        // ---- 6. Prepend new entries to the front of the file ----
        const mergedContent = existingContent
            ? `${newLines}\n${existingContent}`
            : newLines;

        const base64Content = Buffer.from(mergedContent, 'utf-8').toString('base64');

        // ---- 7. Push to GitHub (with retries) ----
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            // Retry fetching SHA
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
                        // SHA has changed, indicating the file was modified by another commit
                        // We need to re-merge based on the latest content, otherwise we might overwrite others' changes.
                        fileSha = retryData.sha;
                        const latestContent = Buffer.from(retryData.content.replace(/\n/g, ''), 'base64').toString('utf-8');
                        const reMerged = latestContent
                            ? `${newLines}\n${latestContent}`
                            : newLines;
                        var updatedBase64 = Buffer.from(reMerged, 'utf-8').toString('base64');
                    } else {
                        // SHA has not changed, the file content has not been modified, we can use the previously merged content
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

        // ---- 8. Push successful, clear titleIndexCache ----
        this.sqliteRepository.clearTitleIndexCache();
        console.log(`Flushed ${cacheEntries.length} title index entries to GitHub: ${titleIndexFilePath}`);
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
     * Insert a new title record into the titleIndex table
     */
    async insertTitleIndex(params: {
        title: string;
        hashOfTitle: string;
        remoteArticlePath: string;
    }): Promise<{ id: string }> {
        return this.sqliteRepository.insertTitleIndex(params);
    }

    /**
     * Query title records based on hashOfTitle
     */
    async queryTitleIndexByHash(hashOfTitle: string): Promise<any | null> {
        return this.sqliteRepository.queryTitleIndexByHash(hashOfTitle);
    }

    /**
     * Query title records based on ID
     */
    async queryTitleIndexById(id: string): Promise<any | null> {
        return this.sqliteRepository.queryTitleIndexById(id);
    }

    /**
     * Get all title records
     */
    async getAllTitleIndex(): Promise<any[]> {
        return this.sqliteRepository.getAllTitleIndex();
    }

    /**
     * Get title record count
     */
    async getTitleIndexCount(): Promise<number> {
        return this.sqliteRepository.getTitleIndexCount();
    }

    /**
     * Insert a new article content record into the articleContent table
     */
    async insertArticleContent(params: {
        title: string;
        content: string;
    }): Promise<{ id: string }> {
        console.log("Inserting article content:", params);
        return this.sqliteRepository.insertArticleContent(params);
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
     * Delete title record
     */
    async deleteTitleIndex(idOfTitleIndex: string): Promise<void> {
        return this.sqliteRepository.deleteTitleIndex(idOfTitleIndex);
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
}

function normalizeGitHubPath(path: string): string {
    return path
        .replace(/\\/g, '/')        // Replace backslashes with forward slashes
        .replace(/\/+/g, '/')       // Merge multiple slashes
        .replace(/^\/|\/$/g, '');   // Remove leading and trailing slashes
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
