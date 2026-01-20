// 1) 定义两个简单的自定义 Error，用于区分 NotFound 和 验证失败
export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class TokenExpiredError extends Error {}
export class DBError extends Error {}
export class NotGetAccessTokenError extends Error{}