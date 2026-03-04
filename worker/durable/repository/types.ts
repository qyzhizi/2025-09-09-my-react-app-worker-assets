/**
 * SQLite data model type definition
 */

export interface TitleIndex {
    id: string;
    title: string;
    hashOfTitle: string;
    remoteArticlePath: string;
    createdAt: string;
    last_access: number;
}

export interface ArticleContent {
    id: string;
    title: string;
    content: string;
    createdAt: string;
}

export interface InsertTitleIndexParams {
    title: string;
    hashOfTitle: string;
    remoteArticlePath: string;
    /** Optional: if provided, used as createdAt; otherwise SQLite DEFAULT CURRENT_TIMESTAMP is used */
    createdAt?: string;
}

export interface InsertArticleContentParams {
    title: string;
    content: string;
}

export interface UpdateArticleContentParams {
    id: string;
    content: string;
}

export interface InsertResult {
    id: string;
}
