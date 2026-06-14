export interface QdrantSettings {
  qdrantUrl: string;
  qdrantApiKey: string;
  collectionName: string;
}

// 定义一个类型守卫函数
export function isQdrantSettings(obj: any): obj is QdrantSettings {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    typeof obj.qdrantUrl === 'string' &&
    obj.qdrantUrl.trim() !== '' && // 可选：确保不是空字符串
    typeof obj.qdrantApiKey === 'string' &&
    obj.qdrantApiKey.trim() !== '' // 可选：确保不是空字符串
    && typeof obj.collectionName === 'string' &&
    obj.collectionName.trim() !== ''
  );
}