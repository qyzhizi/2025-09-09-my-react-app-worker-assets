// 定义 Delete Points 接口的请求体参数
export interface DeletePointsParam {
  /** * 要删除的数据点 ID 数组（支持数字或 UUID 字符串）
   * 与 filter 二选一，或组合使用
   */
  points?: (number | string)[];
  /** * 过滤删除条件（例如：按 payload 里的字段过滤删除）
   * 与 points 二选一，或组合使用
   */
  filter?: Record<string, any>;
}

// 定义 Qdrant 删除数据点的响应类型接口
export interface DeletePointsResponse {
  result: {
    operation_id: number;
    status: 'acknowledged' | 'completed' | string;
  };
  status: 'ok' | string;
  time?: number;
  [key: string]: any; // 兼容 Qdrant 原生返回的其他未知字段
}

/**
 * 从 Qdrant 集合中删除指定的数据点 (Delete Points)
 * @param url - Qdrant 服务的基本 URL (例如: http://localhost:6333)
 * @param collectionName - 集合名称
 * @param apiKey - API 密钥
 * @param deleteParam - 包含 points 数组或 filter 过滤器的配置对象
 * @returns 包含删除操作执行状态的 Promise 对象
 */
async function retrieveCollectionPointsByIds(
  url: string,
  collectionName: string,
  apiKey: string,
  ids: (number | string)[]
): Promise<Array<number | string>> {
    const response = await fetch(`${url}/collections/${collectionName}/points`, {
        method: 'POST',
        headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
        },
        body: JSON.stringify({ ids, with_payload: false, with_vector: false })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Qdrant retrieve 请求失败: status=${response.status}, statusText=${response.statusText}, body=${errorText}`);
        throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}, body: ${errorText}`);
    }

    const data: any = await response.json();
    return (data?.result || []).map((point: any) => point.id);
}

export async function deleteCollectionPoints(
  url: string,
  collectionName: string,
  apiKey: string,
  deleteParam: DeletePointsParam
): Promise<DeletePointsResponse> {
  if (!deleteParam?.points && !deleteParam?.filter) {
    throw new Error('deleteParam must include either points or filter.');
  }

  try {
    if (Array.isArray(deleteParam.points) && deleteParam.points.length > 0) {
      try {
        const existingIds = await retrieveCollectionPointsByIds(url, collectionName, apiKey, deleteParam.points);
        const missingIds = deleteParam.points.filter(
          (id) => !existingIds.some((existingId) => existingId === id)
        );

        if (missingIds.length > 0) {
          console.warn(
            `集合 [${collectionName}] 中未找到以下要删除的 id，将忽略：`,
            missingIds
          );
        }
      } catch (retrieveError) {
        console.warn(
          `在删除之前检查 Qdrant ID 是否存在时发生错误，继续执行删除操作:`,
          retrieveError
        );
      }
    }

    const response = await fetch(`${url}/collections/${collectionName}/points/delete`, {
      method: 'POST', // Qdrant 删除接口规定使用 POST
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(deleteParam)
    });

    // 1. 处理常见的 HTTP 错误（如 400 参数错误、401 未授权、404 集合不存在等）
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 2. 解析成功的响应
    const data: DeletePointsResponse = await response.json();
    return data;
  } catch (error) {
    // 3. 捕获网络异常或上面抛出的错误
    console.error(`向集合 [${collectionName}] 删除数据点失败:`, error);
    throw error;
  }
}