/**
 * SQLite repository layer
 * Responsible for handling all SQLite database operations
 */

import { NotFoundError } from "@/types/error";
import type {
    TitleIndex,
    ArticleContent,
    InsertTitleIndexParams,
    InsertArticleContentParams,
    UpdateArticleContentParams,
    InsertResult,
} from "./types";

import { v4 as uuidv4 } from "uuid";

export class SqliteRepository {
    private sql: any;
    private maxArticlesToStore: number;
    private static readonly MAX_ENTRIES = 30000;

    constructor(sql: any, maxArticlesToStore: number = 1000) {
        this.sql = sql;
        this.maxArticlesToStore = maxArticlesToStore;
    }

    /**
     * Helper method: Convert a SQLite Cursor object to a serializable array
     * Cloudflare Durable Object's SQLite returns Cursor object, which needs to be converted to a standard array
     * 
     * Currently, it is not possible to configure Durable Object SQLite to directly return an array.
     * Conversion can only be done through this helper function
     */
    private convertCursorToArray(result: any): any[] {
        try {
            if (result && typeof result === 'object' && 'columnNames' in result) {
                // This is a Cursor object, converted to an array
                const converted = Array.from(result);
                return converted;
            } else if (Array.isArray(result)) {
                // Already an array, return directly
                console.log(`Already an array, length: ${result.length}`);
                return result;
            } else {
                console.log(`Unexpected result type: ${typeof result}, value:`, result);
                return [];
            }
        } catch (error) {
            console.error('Error in convertCursorToArray:', error);
            return [];
        }
    }

    /**
     * Initialize database table structure
     */
    initializeTables(): void {
        // Create count tables to maintain the number of records for each table (O(1) query complexity)
        this.sql.exec(`
            CREATE TABLE IF NOT EXISTS tableCounters (
                tableName TEXT PRIMARY KEY,
                count INTEGER DEFAULT 0,
                lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Initialize count table data
        this.sql.exec(`
            INSERT OR IGNORE INTO tableCounters (tableName, count)
            VALUES ('titleIndex', 0), ('articleContent', 0);
        `);

        // Create title index table and add last_access field for LRU cache
        this.sql.exec(`
            CREATE TABLE IF NOT EXISTS titleIndex (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                hashOfTitle TEXT NOT NULL UNIQUE,
                remoteArticlePath TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_access INTEGER DEFAULT (cast(strftime('%s','now') as int))
            );
        `);

        // Create an index for hashOfTitle to speed up queries
        this.sql.exec(`
            CREATE INDEX IF NOT EXISTS idx_hashOfTitle ON titleIndex(hashOfTitle);
        `);

        // Create an index for (last_access, id) to support LRU cache eviction, (last_access, id) is a covering index, so that the query does not return the table at all
        this.sql.exec(`
            CREATE INDEX IF NOT EXISTS idx_last_access_id ON titleIndex (last_access, id);
        `);

        // Create article content table
        this.sql.exec(`
            CREATE TABLE IF NOT EXISTS articleContent (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create an index for title for quick query
        this.sql.exec(`
            CREATE INDEX IF NOT EXISTS idx_title ON articleContent(title);
        `);
    }

    /**
     * Private method: Increment table count
     */
    private incrementTableCount(tableName: string, amount: number = 1): void {
        try {
            console.log(`incrementTableCount: tableName=${tableName}, amount=${amount}`);
            this.sql.exec(
                `UPDATE tableCounters SET count = count + ?, lastUpdated = CURRENT_TIMESTAMP WHERE tableName = ?`,
                amount,
                tableName
            );
            console.log(`incrementTableCount成功: tableName=${tableName}`);
        } catch (error) {
            console.error(`incrementTableCount失败: tableName=${tableName}, amount=${amount}, error=`, error);
            throw error;
        }
    }

    /**
     * Private method: Decrement table count
     */
    private decrementTableCount(tableName: string, amount: number = 1): void {
        this.sql.exec(
            `UPDATE tableCounters SET count = MAX(0, count - ?), lastUpdated = CURRENT_TIMESTAMP WHERE tableName = ?`,
            amount,
            tableName
        );
    }

    /**
     * Private method: Get table count (O(1) time complexity)
     */
    private getTableCount(tableName: string): number {
        const result = this.sql.exec(
            `
            SELECT count FROM tableCounters
            WHERE tableName = ?
            `,
            tableName
        );

        const resultArray = this.convertCursorToArray(result);
        return resultArray[0]?.count || 0;
    }

    // =============== titleIndex table operation methods ==================

    /**
     * Private method: Update the last_access time of a record
     */
    private updateLastAccess(id: string): void {
        this.sql.exec(
            `
            UPDATE titleIndex
            SET last_access = cast(strftime('%s','now') as int)
            WHERE id = ?
            `,
            id
        );
    }

    /**
     * Private method: LRU cache eviction
     * When the number of records in the titleIndex table exceeds MAX_ENTRIES, delete the least recently accessed records
     */
    private async evictIfNeeded(): Promise<void> {
        const totalCount = this.getTableCount('titleIndex');

        if (totalCount >= SqliteRepository.MAX_ENTRIES) {
            const toDelete = totalCount - SqliteRepository.MAX_ENTRIES + 1;

            // Delete the least recently accessed records
            this.sql.exec(
                `
                DELETE FROM titleIndex
                WHERE id IN (
                    SELECT id FROM titleIndex
                    ORDER BY last_access ASC
                    LIMIT ?
                )`,
                toDelete
            );

            // Update count table
            this.decrementTableCount('titleIndex', toDelete);

            console.log(
                `deleted ${toDelete} least recently accessed records to maintain the limit of ${SqliteRepository.MAX_ENTRIES} entries`
            );
        }
    }

    /**
     * Insert a new title record into the titleIndex table
     * Also check whether the MAX_ENTRIES limit is exceeded, and if so, delete the oldest record through LRU
     */
    async insertTitleIndex(params: InsertTitleIndexParams): Promise<InsertResult> {
        const { title, hashOfTitle, remoteArticlePath } = params;
        const id = uuidv4();

        this.sql.exec(
            `
            INSERT INTO titleIndex (id, title, hashOfTitle, remoteArticlePath)
            VALUES (?, ?, ?, ?)
            `,
            id, title, hashOfTitle, remoteArticlePath
        );

        // Update count table
        this.incrementTableCount('titleIndex', 1);

        // Check whether the LRU cache limit is exceeded
        await this.evictIfNeeded();

        return { id };
    }

    /**
     * Query title record by hashOfTitle
     * Accessing updates the last_access time (LRU cache mechanism)
     */
    async queryTitleIndexByHash(hashOfTitle: string): Promise<TitleIndex | null> {
        const result = this.sql.exec(
            `
            SELECT id, title, hashOfTitle, remoteArticlePath, createdAt, last_access
            FROM titleIndex
            WHERE hashOfTitle = ?
            LIMIT 1
            `,
            hashOfTitle
        );

        const resultArray = this.convertCursorToArray(result);

        if (resultArray.length > 0) {
            const record = resultArray[0] as TitleIndex;
            // Accessing updates the last_access time (LRU cache mechanism)
            this.updateLastAccess(record.id);
            return record;
        }

        return null;
    }

    /**
     * Query title record by ID
     * Accessing updates the last_access time (LRU cache mechanism)
     */
    async queryTitleIndexById(id: string): Promise<TitleIndex | null> {
        const result = this.sql.exec(
            `
            SELECT id, title, hashOfTitle, remoteArticlePath, createdAt, last_access
            FROM titleIndex
            WHERE id = ?
            LIMIT 1
            `,
            id
        );

        const resultArray = this.convertCursorToArray(result);

        if (resultArray.length > 0) {
            const record = resultArray[0] as TitleIndex;
            // Accessing updates the last_access time (LRU cache mechanism)
            this.updateLastAccess(id);
            return record;
        }

        return null;
    }

    /**
     * Query all title records (in reverse order of creation time)
     */
    async getAllTitleIndex(): Promise<TitleIndex[]> {
        const result = this.sql.exec(`
            SELECT id, title, hashOfTitle, remoteArticlePath, createdAt, last_access
            FROM titleIndex
            ORDER BY createdAt DESC
        `);

        return this.convertCursorToArray(result) as TitleIndex[];
    }

    /**
     * Get title record count (O(1) time complexity)
     */
    async getTitleIndexCount(): Promise<number> {
        return this.getTableCount('titleIndex');
    }

    // ===================== articleContent  =====================

    /**
     * Insert a new article content record into the articleContent table
     *Also check whether the MAX_ARTICLES_TO_STORE limit is exceeded, and if so, delete the oldest article
     */
    async insertArticleContent(
        params: InsertArticleContentParams
    ): Promise<InsertResult> {
        const { title, content } = params;
        const id = uuidv4();
        
        // param validation
        if (title === undefined || title === null) {
            throw new Error(`Invalid title: ${title}`);
        }
        if (content === undefined || content === null) {
            throw new Error(`Invalid content: ${content}`);
        }

        // Insert new article
        this.sql.exec(
            `INSERT INTO articleContent (id, title, content)
            VALUES (?, ?, ?)`,
            id,
            title,
            content
        );
        console.log(`Inserting article content with id=${id}, title="${title}", content length=${content.length}`);

        // Update count table
        try {
            this.incrementTableCount('articleContent', 1);
        } catch (error) {
            console.error(`Failed to update count table:`, error);
            throw error;
        }

        // Check whether the storage limit is exceeded
        await this.enforceArticleCountLimit();

        return { id };
    }

    /**
     * Private method: Ensure that only MAX_ARTICLES_TO_STORE articles are stored in the articleContent table.
     *When the limit is exceeded, the oldest article will be deleted
     */
    private async enforceArticleCountLimit(): Promise<void> {
        const totalCount = this.getTableCount('articleContent');

        if (totalCount > this.maxArticlesToStore) {
            const toDelete = totalCount - this.maxArticlesToStore;

            // Delete the oldest articles
            this.sql.exec(
                `
                DELETE FROM articleContent
                WHERE id IN (
                    SELECT id FROM articleContent
                    ORDER BY createdAt ASC
                    LIMIT ?
                )
            `,
                toDelete
            );

            // Update count table
            this.decrementTableCount('articleContent', toDelete);

            console.log(
                `Deleted ${toDelete} oldest articles to maintain the limit of ${this.maxArticlesToStore} articles`
            );
        }
    }

    /**
     * Query article content based on title
     */
    async queryArticleContentByTitle(
        title: string
    ): Promise<ArticleContent | null> {
        const result = this.sql.exec(
            `
            SELECT id, title, content, createdAt
            FROM articleContent
            WHERE title = ?
            LIMIT 1
            `,
            title
        );

        const resultArray = this.convertCursorToArray(result);
        return resultArray.length > 0 ? (resultArray[0] as ArticleContent) : null;
    }

    /**
     * Query article content based on ID
     */
    async queryArticleContentById(id: string): Promise<ArticleContent | null> {
        const result = this.sql.exec(
            `
            SELECT id, title, content, createdAt
            FROM articleContent
            WHERE id = ?
            LIMIT 1
            `,
            id
        );

        const resultArray = this.convertCursorToArray(result);
        return resultArray.length > 0 ? (resultArray[0] as ArticleContent) : null;
    }

    /**
     * Get all article content (in reverse order of creation time)
     */
    async getAllArticleContent(): Promise<ArticleContent[]> {
        const result = this.sql.exec(`
            SELECT id, title, content, createdAt
            FROM articleContent
            ORDER BY createdAt DESC
        `);

        return this.convertCursorToArray(result) as ArticleContent[];
    }

    /**
     * Get article content in pages (in reverse order of creation time)
     * page starts from 1, pageSize is the number of records per page
     * For example: page=1, pageSize=10 gets the latest 10 articles; page=2, pageSize=10 gets the 11th-20th articles, and so on.
     **/
    async getArticleContentList(
        page: number, pageSize: number
    ): Promise<ArticleContent[]>{
        const result = this.sql.exec(`
            SELECT id, title, content, createdAt
            FROM articleContent
            ORDER BY createdAt DESC
            LIMIT ? OFFSET ?
        `, pageSize, (page - 1) * pageSize);
        const resultArray = this.convertCursorToArray(result);
        console.log("getArticleContentList called with:", { page, pageSize });
        console.log("getArticleContentList result:", resultArray);
        return resultArray;

    }

    /**
     * Get all article content of a specific title (in reverse order of creation time)
     */
    async getAllArticleContentByTitle(
        title: string
    ): Promise<ArticleContent[]> {
        const result = this.sql.exec(
            `
            SELECT id, title, content, createdAt
            FROM articleContent
            WHERE title = ?
            ORDER BY createdAt DESC
            `,
            title
        );

        return this.convertCursorToArray(result) as ArticleContent[];
    }

    /**
     * Get article content count (O(1) time complexity)
     */
    async getArticleContentCount(): Promise<number> {
        return this.getTableCount('articleContent');
    }

    /**
     * Update article content
     */
    async updateArticleContent(params: UpdateArticleContentParams): Promise<void> {
        const { id, content } = params;

        const result = this.sql.exec(
            `
            UPDATE articleContent
            SET content = ?
            WHERE id = ?
            `,
            content,
            id
        );

        // check if any row was updated (using changes property)
        if (result.changes === 0) {
            throw new NotFoundError(`Article content with id=${id} not found`);
        }
    }

    // ===================== Cascading Delete Operations =====================

    /**
     * Delete title record
     * No longer automatically delete associated article content
     */
    async deleteTitleIndex(idOfTitleIndex: string): Promise<void> {
        const result = this.sql.exec(
            `
            DELETE FROM titleIndex
            WHERE id = ?
            `,
            idOfTitleIndex
        );

        // Check if any row was deleted (using changes property)
        if (result.changes === 0) {
            throw new NotFoundError(
                `Title index with id=${idOfTitleIndex} not found`
            );
        }

        // Update count table
        this.decrementTableCount('titleIndex', 1);
    }

    /**
     * Delete a single article content
     */
    async deleteArticleContent(id: string): Promise<void> {
        const result = this.sql.exec(
            `
            DELETE FROM articleContent
            WHERE id = ?
            `,
            id
        );

        if (result.changes === 0) {
            throw new NotFoundError(`Article content with id=${id} not found`);
        }

        // Update count table
        this.decrementTableCount('articleContent', 1);
    }

    /**
     * Delete all articles by title
     */
    async deleteAllArticlesByTitle(title: string): Promise<void> {
        const result = this.sql.exec(
            `
            DELETE FROM articleContent
            WHERE title = ?
            `,
            title
        );

        // Update count table (using changes property to get actual number of deleted rows)
        if (result.changes > 0) {
            this.decrementTableCount('articleContent', result.changes);
        }

        console.log(
            `已删除标题 "${title}" 的 ${result.changes} 篇文章内容`
        );
    }

    // ======== Debugging and database status query methods ============

    /**
     * Get information about all tables in the database
     */
    debugGetAllTables(): any {
        try {
            const result: any = {
                section: "Database Table Information",
                success: true,
                data: {}
            };

            // Get all user table names (filtering out Cloudflare system tables)
            const tables = this.sql.exec(`
                SELECT name, type 
                FROM sqlite_master 
                WHERE type='table' 
                  AND name NOT LIKE 'sqlite_%' 
                  AND name NOT LIKE '_cf_%'
                ORDER BY name
            `);
            
            const tablesArray = this.convertCursorToArray(tables);
            // console.log("tablesArray: ", JSON.stringify(tablesArray, null, 2));
            // console.log("item type: ", typeof tablesArray[0]);
            result.data.tables = tablesArray;

            // Get record count for each table (excluding table structure due to PRAGMA command restrictions in Cloudflare Durable Object)
            const tableDetails: any[] = [];
            tablesArray.forEach((table: any) => {
                // console.log(`Processing table: ${table.name}`);
                try {
                    const count = this.sql.exec(`SELECT COUNT(*) as count FROM ${table.name}`);
                    // get column names
                    const columns = this.sql.exec(`PRAGMA table_info(${table.name})`);
                    const columnsArray = this.convertCursorToArray(columns);
                    const columnNames = columnsArray.map((col: any) => col.name);

                    const countArray = this.convertCursorToArray(count);

                    tableDetails.push({
                        name: table.name,
                        type: table.type,
                        recordCount: countArray[0]?.count || 0,
                        columns: columnNames,
                    });
                } catch (error) {
                    console.error(`Error getting count for table ${table.name}:`, error);
                    tableDetails.push({
                        name: table.name,
                        type: table.type,
                        recordCount: 0,
                        error: error instanceof Error ? error.message : String(error),
                        note: "Could not retrieve record count or columns due to error"
                    });
                }
            });
            
            result.data.tableDetails = tableDetails;
            // console.log("tableDetails: ", JSON.stringify(tableDetails, null, 2));

            // Get all indexes
            const indexes = this.sql.exec(`
                SELECT name, tbl_name, sql 
                FROM sqlite_master 
                WHERE type='index' AND name NOT LIKE 'sqlite_%'
                ORDER BY tbl_name, name
            `);
            
            const indexesArray = this.convertCursorToArray(indexes);
            // console.log("indexesArray: ", JSON.stringify(indexesArray, null, 2));
            result.data.indexes = indexesArray;

            // console.log("result: ", JSON.stringify(result, null, 2));

            return result;
            
        } catch (error) {
            console.error("Error in debugGetAllTables: ", error);
            return {
                section: "Database Table Information",
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get table counter information
     */
    debugGetTableCounters(): any {
        try {
            const result: any = {
                section: "Table Counter Information",
                success: true,
                data: {}
            };
            
            const counters = this.sql.exec(`
                SELECT tableName, count, lastUpdated 
                FROM tableCounters 
                ORDER BY tableName
            `);
            
            const countersArray = this.convertCursorToArray(counters);
            result.data.counters = countersArray;

            // Validate counter accuracy
            const validationResults: any[] = [];
            countersArray.forEach((counter: any) => {
                if (counter.tableName === 'titleIndex') {
                    const actualCount = this.sql.exec(`SELECT COUNT(*) as count FROM titleIndex`);
                    const actualCountArray = this.convertCursorToArray(actualCount);
                    
                    validationResults.push({
                        tableName: 'titleIndex',
                        counterValue: counter.count,
                        actualCount: actualCountArray[0]?.count,
                        isValid: counter.count === actualCountArray[0]?.count
                    });
                } else if (counter.tableName === 'articleContent') {
                    const actualCount = this.sql.exec(`SELECT COUNT(*) as count FROM articleContent`);
                    const actualCountArray = this.convertCursorToArray(actualCount);
                    
                    validationResults.push({
                        tableName: 'articleContent',
                        counterValue: counter.count,
                        actualCount: actualCountArray[0]?.count,
                        isValid: counter.count === actualCountArray[0]?.count
                    });
                }
            });
            
            result.data.validation = validationResults;
            
            return result;
            
        } catch (error) {
            return {
                section: "表计数器信息",
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get recent access records (LRU cache debugging)
     */
    debugGetRecentAccess(): any {
        try {
            const result: any = {
                section: "LRU Cache Status",
                success: true,
                data: {}
            };
            
            const recentAccess = this.sql.exec(`
                SELECT id, title, last_access, 
                       datetime(last_access, 'unixepoch') as last_access_time,
                       createdAt
                FROM titleIndex 
                ORDER BY last_access DESC 
                LIMIT 10
            `);
            
            const recentAccessArray = this.convertCursorToArray(recentAccess);
            result.data.recentAccess = recentAccessArray;
            
            const oldestAccess = this.sql.exec(`
                SELECT id, title, last_access,
                       datetime(last_access, 'unixepoch') as last_access_time,
                       createdAt
                FROM titleIndex 
                ORDER BY last_access ASC 
                LIMIT 5
            `);
            
            const oldestAccessArray = this.convertCursorToArray(oldestAccess);
            result.data.oldestAccess = oldestAccessArray;
            
            return result;
            
        } catch (error) {
            return {
                section: "LRU Cache Status",
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get complete database status debugging information
     */
    getDODBStatus(): any {
        const debugResult = {
            timestamp: new Date().toISOString(),
            sections: {} as any
        };

        // Collect all debugging information
        debugResult.sections.tables = this.debugGetAllTables();
        debugResult.sections.counters = this.debugGetTableCounters();
        debugResult.sections.lruCache = this.debugGetRecentAccess();

        return debugResult;
    }    

    // Reset all tables
    resetTables(): any {
        try {
            const result: any = {
                section: "Reset All Tables",
                success: true,
                data: {}
            };

            // Delete all data from the tables, preserving structure and indexes
            this.sql.exec(`DELETE FROM titleIndex`);
            this.sql.exec(`DELETE FROM articleContent`);

            // Reinitialize counters
            this.sql.exec(`DELETE FROM tableCounters`);
            this.sql.exec(`
                INSERT INTO tableCounters (tableName, count)
                VALUES ('titleIndex', 0), ('articleContent', 0)
            `);

            result.data.deletedTables = ['titleIndex', 'articleContent'];
            result.data.preservedStructures = [
                'Table structure fully preserved',
                'Index structure fully preserved: idx_hashOfTitle, idx_last_access_id, idx_title',
                'Counter has been reset to 0'
            ];

            return result;

        } catch (error) {
            return {
                section: "Reset All Tables",
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}
