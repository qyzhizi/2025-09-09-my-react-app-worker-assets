import { DurableObject } from "cloudflare:workers";
import { NotFoundError, ValidationError } from "@/types/error"
import type { Task, PushGitRepoTaskParams, PushGitRepoTaskRespon } from "@/types/durable";

const MAX_FILES_PER_FOLDER = 1000;

interface FileLocationResult {
    folderIndex: number;
    fileIndex: number;
    folderPath: string;
    filePath: string;
    needCreateFolder: boolean;
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


/** A Durable Object's behavior is defined in an exported Javascript class */
export class MyDurableObject extends DurableObject<Env> {
    private state: DurableObjectState;
    env: Env;
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
        this.initialize(false);
    }

    async initialize(forceInit: boolean = false) {
        let stored = await this.state.storage.get("initialized");
        if (!stored || forceInit) {
          // 初始化操作
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

    async createGithubPushParamsTask(data: PushGitRepoTaskParams): Promise<PushGitRepoTaskParams> {
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
    console.log("Creating folder in repo at path:", placeholderFilePath);

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
    if (!res.ok && res.status !== 200) {
        throw new Error(await res.text());
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

    async processGithubPushTask(id: string): Promise<PushGitRepoTaskRespon> {
        const taskParams = await this.state.storage.get<PushGitRepoTaskParams>(id);
        if (!taskParams) {
        throw new NotFoundError(`Task with id=${id} not found`);
        }

        console.log("Processing taskParams:", taskParams);
        const {commitMessage, accessToken, githubUserName, repoName, vaultPathInRepo, vaultName, content, completed  } = taskParams;
        // get folderIndexInVault and fileIndexInFolder
        let folder_index_in_vault = await this.state.storage.get<number>("folderIndexInVault");
        let file_index_in_folder = await this.state.storage.get<number>("fileIndexInFolder");
        if (folder_index_in_vault === undefined) {
            throw new Error("folderIndexInVault is undefined in DO storage");
        }
        if (file_index_in_folder === undefined) {
            throw new Error("fileIndexInFolder is undefined in DO storage");
        }

        const result: FileLocationResult = await this.getNextFileLocation({
            vaultPathInRepo,
            vaultName,
            folderIndex: folder_index_in_vault,
            fileIndex: file_index_in_folder,
            maxFilesPerFolder: MAX_FILES_PER_FOLDER
        });

        folder_index_in_vault = result.folderIndex;
        file_index_in_folder = result.fileIndex;

        if (result.needCreateFolder) {
            await this.createEmptyFolderPathInRepo(
                accessToken,
                githubUserName,
                repoName,
                result.folderPath
            );
        }

        // 使用 result.filePath 写文件
        const filePath = result.filePath;

        if (completed) {
            return { "id": id, "completed": true };
        }

        let fileSha: string | null = null;
        const fileUrl = `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${filePath}`;
        try {
            // 检查文件是否存在
            const fileRes = await fetch(fileUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'Hono-Worker',
                },
            });

            if (fileRes.ok) {
                // 明确类型 { sha: string }
                const fileData = (await fileRes.json()) as { sha: string };
                fileSha = fileData.sha; // 获取已有文件的 SHA 以进行更新
            }
            const base64Content = Buffer.from(content, 'utf-8').toString('base64');
            // 提交到 GitHub（创建或更新）
            const githubRes = await fetch(fileUrl, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'Hono-Worker',
                },
                body: JSON.stringify({
                    message: commitMessage,
                    content: base64Content,
                    sha: fileSha || undefined, // 只有在更新时才传 sha
                }),
            });

            if (!githubRes.ok) {
                throw new Error(await githubRes.text());
            }
            // 解析 GitHub 响应
            //   const result = (await githubRes.json()) as { content: { sha: string } };
            // save updated folderIndexInVault and fileIndexInFolder
            await this.state.storage.put("folderIndexInVault", folder_index_in_vault);
            await this.state.storage.put("fileIndexInFolder", file_index_in_folder);
        } catch (error) {
            console.error('任务处理失败:', error, "id: ", id);
            throw new Error(`Failed to process GitHub push: ${error}`);
            // return {"id": id, "completed": false}
        }
        // 例如标记为已完成
        // taskParams.completed = true;
        // await this.state.storage.put(id, taskParams);

        // 删除已处理的任务
        await this.deleteTask(id)
        return { "id": id, "completed": true };
    }

    // 2) 返回 Promise<Task>，不再直接构造 Response
    async updateTask(id: string, data: Partial<Task>): Promise<Task> {
        const existing = await this.state.storage.get<Task>(id)
        if (!existing) {
        // 这里抛出 NotFoundError
        throw new NotFoundError(`Task with id=${id} not found`)
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

        await this.state.storage.put(id, updated)
        return updated
    }

    async deleteTask(id: string): Promise<void> {
        const existed = await this.state.storage.get<Task>(id);
        if (!existed) {
            throw new NotFoundError(`Task with id=${id} not found`);
        }
        await this.state.storage.delete(id);
    }
}