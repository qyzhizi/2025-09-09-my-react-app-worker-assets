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
    branch?: string;
    content: string;
    completed: boolean;
    filePath: string;
    createdAt?: string;
}

export interface PushGitRepoTaskRespon {
    id: string;
    completed: boolean;
}