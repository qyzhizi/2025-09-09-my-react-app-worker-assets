import { createCollection } from './createCollection';
import  { createPayloadIndex} from './payloadIndex';

import type { CreateCollectionResponse, VectorsConfig, QuantizationConfig } from './createCollection';
import type { CreatePayloadIndexParam } from './payloadIndex';


/**
 * 初始化 Qdrant 集合和索引
 * @param url - Qdrant 服务的基本 URL
 * @param collectionName - 集合名称
 * @param apiKey - API 密钥
 * @param vectors - 向量配置参数
 * @param indexParam - 索引配置参数
 * @param quantizationConfig - 量化配置参数
 */
export async function initQdrantCollection(
  url: string,
  collectionName: string,
  apiKey: string,
  vectors: VectorsConfig,
  indexParam: CreatePayloadIndexParam,
  quantizationConfig?: QuantizationConfig,
): Promise<CreateCollectionResponse> {
  try {
    // 1. 创建 Collection, 等幂操作，重复创建同一 Collection 不会导致错误
    const collectionResult = await createCollection(url, collectionName, apiKey, vectors, quantizationConfig);
    if (collectionResult.status === 'already_exists') {
      console.log(`集合 [${collectionName}] 已存在，跳过创建步骤`);
      return collectionResult
    }

    // 2. 创建 Payload 索引, 等幂操作，重复创建同一索引不会导致错误
    await createPayloadIndex(url, collectionName, apiKey, indexParam);
    console.log(`集合 [${collectionName}] 的字段 [${indexParam.field_name}] 索引创建成功`);
    return {...collectionResult, indexStatus: 'index_created' };


  } catch (error) {
    console.error(`初始化 Qdrant 集合 [${collectionName}] 和索引失败:`, error);
    throw error;
  }
}