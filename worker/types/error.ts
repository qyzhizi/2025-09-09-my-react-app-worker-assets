// 1) 定义两个简单的自定义 Error，用于区分 NotFound 和 验证失败
export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class TokenExpiredError extends Error {}
export class DBError extends Error {}
export class NotGetAccessTokenError extends Error{}

export class AppError extends Error {
  code: string
  status: number
  cause?: any
  constructor(code: string, message?: string, cause?: any, status = 500) {
    super(message ?? code)
    this.code = code
    this.status = status
    this.cause = cause
  }
}

import type { Context } from "hono";
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const respondError = (c: Context, err: any, defaultStatus = 500) => {
  // console.error('Handler error:', err);
  if (err instanceof AppError) {
    const status = err.status ?? defaultStatus;
    return c.json({ error: err.code, message: err.message }, status as ContentfulStatusCode);
  }
  return c.json({ error: 'Internal Server Error' }, defaultStatus as ContentfulStatusCode );
}