export interface Task {
    id: string;
    commitMessage: string;
    completed: boolean;
    createdAt?: string;
    content: string;
    filePath: string;
}