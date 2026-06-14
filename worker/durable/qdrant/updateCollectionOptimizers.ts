/**
 * 定义更新集合优化器配置的参数接口
 */
export interface UpdateOptimizersParam {
  indexing_threshold?: number; // 触发 HNSW 索引构建的向量数量阈值
  [key: string]: any;          // 兼容其他优化器参数
}

export interface UpdateCollectionResponse {
  result: boolean;
  status: string;
}

/**
 * 更新 Qdrant 集合的优化器配置（如修改索引阈值）
 * @param url - Qdrant 服务的基本 URL (如: http://localhost:6333)
 * @param collectionName - 集合名称
 * @param apiKey - API 密钥
 * @param optimizersConfig - 优化器配置对象
 */
export async function updateCollectionOptimizers(
  url: string,
  collectionName: string,
  apiKey: string,
  optimizersConfig: UpdateOptimizersParam
): Promise<UpdateCollectionResponse> {
  try {
    const response = await fetch(`${url}/collections/${collectionName}`, {
      method: 'PATCH', // 更新局部配置必须使用 PATCH 方法
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        optimizers_config: optimizersConfig // 必须包裹在 optimizers_config 内
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP 错误! 状态码: ${response.status}`);
    }

    const data: UpdateCollectionResponse = await response.json();
    return data;
  } catch (error) {
    console.error(`更新集合 [${collectionName}] 优化器配置失败:`, error);
    throw error;
  }
}