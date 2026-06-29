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
    title: string;
    content: string;
    hash: string;
    commitMessage: string;
    accessToken: string;
    githubUserName: string;
    githubRepoName: string;
    vaultPathInRepo: string;
    vaultName: string;
    branch?: string;
    completed: boolean;
    createdAt: string;
}

export interface EditGitRepoTaskParams {
    id: string;
    title: string;
    content: string;
    hash: string;
    originalId: string;
    commitMessage: string;
    accessToken: string;
    githubUserName: string;
    githubRepoName: string;
    vaultPathInRepo: string;
    vaultName: string;
    branch?: string;
    completed: boolean;
    createdAt: string;
}

export interface DeleteArticleTaskParams {
    userId: string;
    articleId: string;
    commitMessage: string;
    accessToken: string;
    githubUserName: string;
    githubRepoName: string;
    vaultPathInRepo: string;
    vaultName: string;
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