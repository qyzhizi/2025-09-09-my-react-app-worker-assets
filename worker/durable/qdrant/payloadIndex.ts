/**
 * 定义 Payload 索引字段的 Schema 配置
 */
interface FieldSchema {
  type: 'keyword' | 'integer' | 'float' | 'geo' | 'text' | 'bool' | 'datetime';
  on_disk?: boolean;
  is_tenant?: boolean;
  is_principal?: boolean;
}

/**
 * 创建 Payload 索引的请求体参数接口
 */
export interface CreatePayloadIndexParam {
  field_name: string;
  field_schema: FieldSchema;
}

/**
 * Qdrant 创建 Payload 索引的响应类型接口
 */
interface CreatePayloadIndexResponse {
  result: {
    operation_id: number;
    status: 'acknowledged' | 'completed' | string;
  };
  status: 'ok' | string;
  [key: string]: any; // 兼容 Qdrant 原生返回的其他字段
}

/**
 * 在 Qdrant 集合中创建 Payload 索引
 * @param url - Qdrant 服务的基本 URL
 * @param collectionName - 集合名称
 * @param apiKey - API 密钥
 * @param indexParam - 索引的具体配置参数（包含字段名和配置项）
 */
export async function createPayloadIndex(
  url: string,
  collectionName: string,
  apiKey: string,
  indexParam: CreatePayloadIndexParam // 动态传入索引参数
): Promise<CreatePayloadIndexResponse> {
  try {
    const response = await fetch(`${url}/collections/${collectionName}/index`, {
      method: 'PUT', // Qdrant 创建索引接口使用 PUT
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(indexParam) // 将配置参数序列化为 JSON 字符串
    });

    // 1. 处理常见的 HTTP 错误（如 400 参数错误、401 未授权、404 集合不存在等）
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 2. 解析成功的响应
    const data: CreatePayloadIndexResponse = await response.json();
    console.log(`集合 [${collectionName}] 的字段 [${indexParam.field_name}] 索引创建成功:`, data);
    return data;

  } catch (error) {
    // 3. 捕获网络错误或捕获上面抛出的 HTTP 错误
    console.error(`集合 [${collectionName}] 创建字段 [${indexParam.field_name}] 索引失败:`, error);
    throw error;
  }
}