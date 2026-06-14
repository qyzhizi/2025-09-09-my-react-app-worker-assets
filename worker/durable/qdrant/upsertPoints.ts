import {retryWithExponentialBackoff} from '@/utils/retry';
import type {RetryConfig} from '@/utils/retry';
/**
 * 定义单个 Point (数据点) 的结构接口
 * 支持数字或字符串类型的 ID，支持单向量或命名向量
 */
export interface QdrantPoint {
  id: number | string;
  vector: number[] | { [vectorName: string]: number[] };
  payload?: Record<string, any>;
}

/**
 * 定义 Upsert Points 接口的请求体参数
 */
export interface UpsertPointsParam {
  points: QdrantPoint[];
}

/**
 * 定义 Qdrant 插入/更新点的响应类型接口
 */
export interface UpsertPointsResponse {
  result: {
    operation_id: number;
    status: 'acknowledged' | 'completed' | string;
  };
  status: 'ok' | string;
  time?: number;
  [key: string]: any; // 兼容 Qdrant 原生返回的其他未知字段
}

export interface UpsertPointsBatchResponse {
  totalPoints: number;
  batchCount: number;
  results: UpsertPointsResponse[];
}


/**
 * 向 Qdrant 集合中插入或更新数据点 (Upsert Points)
 * 支持指数退避重试处理 429 速率限制
 * @param url - Qdrant 服务的基本 URL (例如: http://localhost:6333)
 * @param collectionName - 集合名称
 * @param apiKey - API 密钥
 * @param pointsParam - 包含 points 数组的配置对象
 * @param retryConfig - 重试配置（可选）
 */
export type UpsertPointsBody = UpsertPointsParam | BodyInit;

export async function upsertCollectionPoints(
  url: string,
  collectionName: string,
  apiKey: string,
  pointsParam: UpsertPointsParam,
  retryConfig?: RetryConfig
): Promise<UpsertPointsResponse> {
  if (retryConfig == null) {
    retryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    };
  }

  try {
    const response = await retryWithExponentialBackoff(
      () =>
        fetch(`${url}/collections/${collectionName}/points`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify(pointsParam),
        }),
      retryConfig
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: UpsertPointsResponse = await response.json();
    console.log(`集合 [${collectionName}] upsert 成功:`, {
      status: data.status,
    });
    return data;
  } catch (error) {
    console.error(`向集合 [${collectionName}] 插入数据点失败:`, error);
    throw error;
  }
}