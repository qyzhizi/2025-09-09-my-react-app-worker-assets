/**
 * 指数退避重试配置接口
 */
export interface RetryConfig {
  maxRetries?: number; // 最大重试次数，默认 3
  initialDelayMs?: number; // 初始延迟时间（毫秒），默认 1000
  maxDelayMs?: number; // 最大延迟时间（毫秒），默认 30000
  backoffMultiplier?: number; // 退避倍数，默认 2
}

/**
 * 延迟函数 (Promise-based sleep)
 * @param ms - 延迟毫秒数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 执行指数退避重试
 * 专门处理 429 (Too Many Requests) 状态码的重试机制
 * @param fn - 异步操作函数
 * @param config - 重试配置
 */
export async function retryWithExponentialBackoff(
  fn: () => Promise<Response>,
  config: RetryConfig = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2
  } = config;

  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt + 1} of ${maxRetries + 1}`);
      const response = await fn();
      console.log(`Received response with status: ${response.status}`);

      // 如果是 429，进行重试（如果还有重试次数）
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : delayMs;
        console.log(`Attempt ${attempt + 1} of ${maxRetries + 1} - Received 429, waiting ${waitTime}ms`);
        console.warn(
          `收到 429 速率限制 (尝试 ${attempt + 1}/${maxRetries + 1})，` +
          `等待 ${waitTime}ms 后重试...`
        );

        await delay(waitTime);
        
        // 计算下一次延迟时间（指数退避）
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
        continue;
      }

      // 其他状态码直接返回
      return response;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // 网络错误也进行重试（如果还有重试次数）
      if (attempt < maxRetries) {
        console.warn(
          `网络错误 (尝试 ${attempt + 1}/${maxRetries + 1})，` +
          `${delayMs}ms 后重试...`,
          error
        );
        
        await delay(delayMs);
        delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
        continue;
      }
    }
  }

  // 如果所有重试都失败了，抛出最后的错误
  if (lastError) {
    throw lastError;
  }

  throw new Error('重试失败：未知错误');
}