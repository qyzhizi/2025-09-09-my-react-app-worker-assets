export interface Task {
    id: string;
    commitMessage: string;
    completed: boolean;
    createdAt?: string;
    content: string;
    filePath: string;
}


export interface PushGitRepoTaskParams {
    id: string;
    commitMessage: string;
    accessToken: string;
    githubUserName: string;
    repoName: string;
    vaultPathInRepo: string;
    vaultName: string;
    branch?: string;
    title: string;
    content: string;
    completed: boolean;
    createdAt: string;
}

export interface PushGitRepoTaskRespon {
    taskId: string;
    completed: boolean;
}

export const VECTORINDEXTYPE = {
    QDRANT: 'qdrant',
    CLOUDFLARE: 'cloudflare',
}

export const isVectorIndexProvider = (value: any): value is string => {
    return Object.values(VECTORINDEXTYPE).includes(value);
}