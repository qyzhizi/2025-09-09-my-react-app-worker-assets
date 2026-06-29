
// 在全局预分配一个足够大的缓冲区（例如 1KB，根据你的字符串长度定）
const SHARED_ENCODER = new TextEncoder();
const SCRATCH_BUFFER = new Uint8Array(1024);

const UUID_PADDING = "0000000000000000";

export function edgeHash64(str: string, seed: bigint = BigInt(0)): string {

  // 1. 直接编码到预分配的缓冲区中
  // read 是消耗的字符数，written 是写入缓冲区的字节数
  const normalized = str.normalize("NFC");
  const { read, written } = SHARED_ENCODER.encodeInto(normalized, SCRATCH_BUFFER);

  if (read < normalized.length) {
    throw new RangeError("Input string too long for SCRATCH_BUFFER");
  }

  // 如果字符串超长，这里需要处理逻辑，但对于一般哈希足够了
  const bytes = SCRATCH_BUFFER;

  const MASK64 = BigInt("0xffffffffffffffff");
  const PRIME = BigInt("0x100000001b3");
  // 2. 初始化 (混入 seed)
  let h: bigint = (BigInt("0xcbf29ce484222325") ^ (seed & MASK64)) & MASK64;


  // 3. FNV-1a 核心循环
  for (let i = 0; i < written; i++) {
    h ^= BigInt(bytes[i]);
    h = (h * PRIME) & MASK64;
  }

  // 4. 雪崩混合 (Finalizer)
  const FINALIZER_SHIFT = BigInt(33);
  h ^= h >> FINALIZER_SHIFT;
  h = (h * BigInt("0xff51afd7ed558ccd")) & MASK64;
  h ^= h >> FINALIZER_SHIFT;
  h = (h * BigInt("0xc4ceb9fe1a85ec53")) & MASK64;
  h ^= h >> FINALIZER_SHIFT;
  
  // 5. 转换为 16 进制固定长度字符串
  return h.toString(16).padStart(16, "0");
}


/**
 * 将 uuid 均匀映射到 [0, a) 区间
 * @param uuid - 用户的 uuid 字符串
 * @param a - 区间上限（不包含）
 * @returns [0, a) 的整数
 */
export function mapUuidToInt(uuid: string, a: number): number {
  if (!uuid || typeof uuid !== "string") throw new TypeError("uuid must be a string");
  if (!Number.isInteger(a) || a <= 0) throw new RangeError("a must be a positive integer");

  // 用 edgeHash64 生成 64 位哈希
  const hashHex = edgeHash64(uuid);
  // 转为 bigint
  const hashInt = BigInt("0x" + hashHex);
  // 映射到 [0, a)
  return Number(hashInt % BigInt(a));
}

// 直接用 uuid v4 的十六进制内容
export function mapUuidToIntDirect(uuid: string, a: number): number {
  if (!uuid || typeof uuid !== "string") throw new TypeError("uuid must be a string");
  if (!Number.isInteger(a) || a <= 0) throw new RangeError("a must be a positive integer");

  // 去掉所有连字符
  const hex = uuid.replace(/-/g, "");
  // 取前16或全部字符转 bigint
  const uuidInt = BigInt("0x" + hex);
  return Number(uuidInt % BigInt(a));
}

export function mapUuidQuick(uuid: string, a: number) {
  // UUID v4 的前 8 位是随机的： 6f41d4f8
  // 取前 8 位直接转 16 进制整数，不需要 BigInt
  const part = parseInt(uuid.substring(0, 8), 16);
  return part % a;
}

/**
 * 16位 hex -> 紧凑 UUID (32位，不带连字符)
 */
export function hex16ToUuid(hex16: string): string {
  if (!/^[0-9a-fA-F]{16}$/.test(hex16)) {
    throw new Error("必须是16位十六进制字符串");
  }

  const compact = hex16.toLowerCase() + UUID_PADDING;
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

/**
 * 紧凑 UUID -> 原始16位 hex
 */
export function uuidToHex16(uuid: string): string {
  // 去掉可能存在的连字符，兼容两种 UUID 格式
  const compact = uuid.replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(compact)) {
    // throw new Error("非法 UUID");
    console.warn("警告: 非法 UUID 格式，返回原字符串:", uuid);
    return uuid; // 如果不是合法 UUID，直接返回原字符串（兼容老数据）
  }

  return compact.slice(0, 16);
}