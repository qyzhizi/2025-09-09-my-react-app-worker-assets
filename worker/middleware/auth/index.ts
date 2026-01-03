import type { Hono } from "hono";

import { GITHUB_LOGIN_PATH } from "@/ConstVar";
import { authMiddleware } from "./middleware";
import { GitHubLoginMiddleware } from "./github";


// 配置中间件
export const configAuthMiddleware = (app: Hono) => {
	// 1. OAuth 登录相关
	app.use(GITHUB_LOGIN_PATH, GitHubLoginMiddleware);

	// 2. 全局认证
	app.use(authMiddleware);
};
