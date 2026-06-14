export type QdrantQueryValue = 
  | number[] 
  | { name: string; vector: number[] } 
  | { nearest: { vector: number[]; top?: number } } 
  | any;

export interface QueryPointsParam {
  query?: QdrantQueryValue;
  limit?: number;        
  with_payload?: boolean; 
  with_vector?: boolean;  
  filter?: Record<string, any>; 
  [key: string]: any;     
}

/**
 * 定义单个检索出的 ScoredPoint 结构
 */
export interface QdrantScoredPoint {
  id: number | string;
  version: number;
  score: number; // 相似度匹配得分
  payload?: Record<string, any>;
  vector?: number[] | Record<string, number[]> | null;
}

/**
 * 🔄 修正后的 Qdrant 查询点响应接口
 * 对应真实结构：{ result: { points: [ ... ] }, status: 'ok', time: 0.00047816 }
 */
export interface QueryPointsResponse {
  result: {
    points: QdrantScoredPoint[]; // 实际的数据点嵌套在 points 字段中
  };
  status: 'ok' | string;
  time?: number;
  [key: string]: any; 
}

/**
 * 检索 Qdrant 集合中的数据点 (Query Points)
 */
export async function queryCollectionPoints(
  url: string,
  collectionName: string,
  apiKey: string,
  queryParam: QueryPointsParam
): Promise<QueryPointsResponse> {
  try {
    const response = await fetch(`${url}/collections/${collectionName}/points/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(queryParam)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: QueryPointsResponse = await response.json();
    // 🔄 这里的日志打印也同步修正为读取 data.result.points
    console.log(`集合 [${collectionName}] 查询成功，找到了 ${data.result?.points?.length || 0} 个匹配点。`);
    return data;
  } catch (error) {
    console.error(`向集合 [${collectionName}] 发起查询请求失败:`, error);
    throw error;
  }
}