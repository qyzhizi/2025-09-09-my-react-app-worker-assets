/**
 * Turbo 量化配置
 */
export interface TurboConfig {
  always_ram?: boolean;
}

/**
 * 量化配置
 */
export interface QuantizationConfig {
  turbo?: TurboConfig;
}

/**
 * HNSW 配置
 */
export interface HnswConfig {
  m?: number;
  payload_m?: number;
  ef_construct?: number;
}

/**
 * 向量配置
 */
export interface VectorConfig {
  size: number; // 初始化创建时建议必填
  distance: 'Cosine' | 'Euclidean' | 'Dot';

  on_disk?: boolean;

  hnsw_config?: HnswConfig;

  datatype?: 'float32' | 'float16' | 'uint8' | 'int8';
}

/**
 * 支持默认向量 "" 和命名向量
 */
export interface VectorsConfig {
  [vectorName: string]: VectorConfig;
}

/**
 * create collection 响应
 */
export interface CreateCollectionResponse {
  result?: boolean;
  status?: 'already_exists' | string;
  [key: string]: any;
}

/**
 * 创建 Collection
 */
export async function createCollection(
  url: string,
  collectionName: string,
  apiKey: string,

  // 新增：完整 vector 配置
  vectors: VectorsConfig,

  // 可选量化配置
  quantizationConfig?: QuantizationConfig
): Promise<CreateCollectionResponse> {

  try {

    const requestBody: Record<string, any> = {
      vectors
    };

    if (quantizationConfig) {
      requestBody.quantization_config =
        quantizationConfig;
    }

    const response = await fetch(
      `${url}/collections/${collectionName}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (response.status === 409) {

      console.log(
        `集合 [${collectionName}] 已存在`
      );

      return {
        result: true,
        status: 'already_exists'
      };
    }

    if (!response.ok) {

      throw new Error(
        `HTTP error: ${response.status}`
      );

    }

    const data:
      CreateCollectionResponse =
      await response.json();

    console.log(
      `创建成功`,
      data
    );

    return data;

  } catch (err) {

    console.error(
      `创建失败`,
      err
    );

    throw err;
  }
}