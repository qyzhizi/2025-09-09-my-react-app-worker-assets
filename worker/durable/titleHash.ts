
// 在全局预分配一个足够大的缓冲区（例如 1KB，根据你的字符串长度定）
const SHARED_ENCODER = new TextEncoder();
const SCRATCH_BUFFER = new Uint8Array(1024);

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
