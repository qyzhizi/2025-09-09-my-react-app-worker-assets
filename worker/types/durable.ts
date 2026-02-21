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
    createdAt?: string;
}

export interface PushGitRepoTaskRespon {
    taskId: string;
    completed: boolean;
}