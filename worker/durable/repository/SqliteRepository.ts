/**
 * SQLite repository layer
 * Responsible for handling all SQLite database operations
 */

import { NotFoundError } from "@/types/error";
import type {
    ArticleContent,
    InsertArticleContentParams,
    UpdateArticleContentParams,
    InsertResult,
} from "./types";

import { v4 as uuidv4 } from "uuid";


export class SqliteRepository {
    private sql: any;
    private maxArticlesToStore: number;
    // private static readonly MAX_ENTRIES = 30000;

    /** All table names that need counter tracking */
    private static readonly COUNTED_TABLES = ['articleContent'] as const;

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
     * Private method: Initialize or reinitialize counter table data
     * @param mode 'ignore' - only insert if not exists (for initializeTables); 'reset' - delete and re-insert (for resetTables)
     */
    private initializeCounters(mode: 'ignore' | 'reset' = 'ignore'): void {
        if (mode === 'reset') {
            this.sql.exec(`DELETE FROM tableCounters`);
        }

        const values = SqliteRepository.COUNTED_TABLES
            .map(name => `('${name}', 0)`)
            .join(', ');

        const insertKeyword = mode === 'ignore' ? 'INSERT OR IGNORE' : 'INSERT';
        this.sql.exec(`${insertKeyword} INTO tableCounters (tableName, count) VALUES ${values};`);
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
        this.initializeCounters('ignore');

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

        // Create kvMeta table for persistent key-value storage
        // Used to store critical state like file indices that must survive DO eviction
        this.sql.exec(`
            CREATE TABLE IF NOT EXISTS kvMeta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            );
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
     * Batch insert multiple article content records into the articleContent table.
     * More efficient than calling insertArticleContent individually because:
     * - Counter is updated once with the total count
     * - enforceArticleCountLimit is called only once at the end
     * 
     * @param paramsList - Array of InsertArticleContentParams
     * @returns Array of InsertResult with generated ids
     */
    async batchInsertArticleContent(
        paramsList: InsertArticleContentParams[]
    ): Promise<InsertResult[]> {
        if (paramsList.length === 0) {
            console.log(`batchInsertArticleContent, No valid params to insert`);
            return [];
        }

        // Pre-validate all params and generate ids
        // Assign sequential createdAt timestamps so each record has a distinct creation time
        const baseTime = Date.now();
        const prepared: Array<{ id: string; title: string; content: string; createdAt: string }> = [];
        for (let idx = 0; idx < paramsList.length; idx++) {
            const { title, content } = paramsList[idx];
            if (title === undefined || title === null) {
                throw new Error(`Invalid title: ${title}`);
            }
            if (content === undefined || content === null) {
                throw new Error(`Invalid content: ${content}`);
            }
            // Each record gets baseTime + idx milliseconds, formatted as ISO 8601 string
            const createdAt = new Date(baseTime - idx).toISOString().replace('T', ' ').replace('Z', '');
            prepared.push({ id: uuidv4(), title, content, createdAt });
        }

        // SQLite has a default SQLITE_MAX_VARIABLE_NUMBER limit (typically 999).
        // Each row uses 4 placeholders, so process in chunks of 200 rows.
        const CHUNK_SIZE = 200;

        for (let i = 0; i < prepared.length; i += CHUNK_SIZE) {
            const chunk = prepared.slice(i, i + CHUNK_SIZE);
            const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
            const bindValues = chunk.flatMap(({ id, title, content, createdAt }) => [id, title, content, createdAt]);

            this.sql.exec(
                `INSERT INTO articleContent (id, title, content, createdAt) VALUES ${placeholders}`,
                ...bindValues
            );
        }

        console.log(`Batch inserted ${prepared.length} article(s): ${prepared.map(p => `id=${p.id}, title="${p.title}", len=${p.content.length}, createdAt=${p.createdAt}`).join('; ')}`);

        // Update count table once for all inserts
        try {
            this.incrementTableCount('articleContent', prepared.length);
        } catch (error) {
            console.error(`Failed to update count table:`, error);
            throw error;
        }

        // Check whether the storage limit is exceeded (once after all inserts)
        await this.enforceArticleCountLimit();

        return prepared.map(({ id }) => ({ id }));
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
            result.data.tables = tablesArray;

            // Get record count for each table (excluding table structure due to PRAGMA command restrictions in Cloudflare Durable Object)
            const tableDetails: any[] = [];
            tablesArray.forEach((table: any) => {
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

            // Get all indexes
            const indexes = this.sql.exec(`
                SELECT name, tbl_name, sql 
                FROM sqlite_master 
                WHERE type='index' AND name NOT LIKE 'sqlite_%'
                ORDER BY tbl_name, name
            `);
            
            const indexesArray = this.convertCursorToArray(indexes);
            result.data.indexes = indexesArray;


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
                if (counter.tableName === 'articleContent') {
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
        debugResult.sections.kvMeta = this.getAllKvMeta();

        return debugResult;
    }    

    // ===================== kvMeta key-value storage =====================

    /**
     * Get the value in kvMeta
     * @returns Value string, returns null if it does not exist
     */
    getKvMeta(key: string): string | null {
        const result = this.sql.exec(
            `SELECT value FROM kvMeta WHERE key = ? LIMIT 1`,
            key
        );
        const arr = this.convertCursorToArray(result);
        return arr.length > 0 ? arr[0].value : null;
    }

    /**
     * Get the numeric value in kvMeta
     * @returns Number, returns null if it does not exist
     */
    getKvMetaNumber(key: string): number | null {
        const raw = this.getKvMeta(key);
        if (raw === null) return null;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
    }

    /**
     * Set the value in kvMeta (upsert)
     */
    setKvMeta(key: string, value: string | number | boolean): void {
        this.sql.exec(
            `INSERT INTO kvMeta (key, value, updatedAt)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`,
            key,
            String(value)
        );
    }

    /**
     * Delete a key in kvMeta
     */
    deleteKvMeta(key: string): void {
        this.sql.exec(`DELETE FROM kvMeta WHERE key = ?`, key);
    }

    /**
     * Get all key-value pairs in kvMeta (for debugging)
     */
    getAllKvMeta(): Array<{ key: string; value: string; updatedAt: string }> {
        const result = this.sql.exec(`SELECT key, value, updatedAt FROM kvMeta ORDER BY key`);
        return this.convertCursorToArray(result);
    }

    /**
     * Reset kvMeta to default initial values
     * Clears all existing kvMeta entries and inserts the default key-value pairs
     */
    deleteAllKv(): void {
        this.sql.exec(`DELETE FROM kvMeta`);
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
            // this.sql.exec(`DELETE FROM titleIndex`);
            this.sql.exec(`DELETE FROM articleContent`);

            // Reinitialize counters
            this.initializeCounters('reset');

            // reset titleIndexCache 
            // this.sql.exec(`DELETE FROM titleIndexCache`);

            this.deleteAllKv();

            result.data.deletedTables = [ 'articleContent'];
            result.data.preservedStructures = [
                'Table structure fully preserved',
                'Index structure fully preserved: idx_title',
                'Counter has been reset to 0',
                'kvMeta file indices reset to initial values'
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
