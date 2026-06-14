// 定义 Qdrant 获取集合详情的响应类型接口
export interface GetCollectionInfoResponse {
  result: {
    status: 'green' | 'yellow' | 'red' | string;
    optimizer_status: 'ok' | string;
    indexed_vectors_count?: number;
    points_count?: number;
    segments_count?: number;
    config: Record<string, any>;        // 集合的具体配置项（params, hnsw_config 等）
    payload_schema: Record<string, any>; // 集合中已创建的 payload 索引 Schema
    update_queue?: number; // 可选：当前待处理的更新操作数量
    [key: string]: any; // 兼容 Qdrant 原生返回的其他字段
  };
  status: 'ok' | string;
  time: number;
  [key: string]: any; // 兼容 Qdrant 原生返回的其他字段
}

/**
 * 获取 Qdrant 集合的详细信息 (Get Collection Info)
 * @param url - Qdrant 服务的基本 URL (例如: http://localhost:6333)
 * @param collectionName - 集合名称
 * @param apiKey - API 密钥
 * @returns 包含集合详情的 Promise 对象
 */
export async function getCollectionInfo(
  url: string,
  collectionName: string,
  apiKey: string
): Promise<GetCollectionInfoResponse> {
  try {
    const response = await fetch(`${url}/collections/${collectionName}`, {
      method: 'GET', // 使用 GET 方法
      headers: {
        'api-key': apiKey
      }
    });

    // 1. 处理常见的 HTTP 错误（如 401 未授权、404 集合不存在等）
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 2. 解析成功的响应
    const data: GetCollectionInfoResponse = await response.json();
    return data;
  } catch (error) {
    // 3. 捕获网络异常或上面抛出的错误
    console.error(`获取集合 [${collectionName}] 详情失败:`, error);
    throw error;
  }
}