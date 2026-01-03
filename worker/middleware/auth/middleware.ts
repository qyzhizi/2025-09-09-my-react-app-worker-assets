import { createMiddleware } from "hono/factory";
import { verifyOrRefreshAccessToken } from "./jwt";

import { BASE_PATH, GITHUB_LOGIN_PATH } from "../../ConstVar";

const PUBLIC_PATHS = [
	GITHUB_LOGIN_PATH, // GitHub OAuth 回调
];

const isPublicPath = (path: string) =>
	PUBLIC_PATHS.some(p =>
		path.replace(BASE_PATH, "").startsWith(p)
	);

export const authMiddleware = createMiddleware(async (c, next) => {
	if (isPublicPath(c.req.path)) {
		return next();
	}

	const payload = await verifyOrRefreshAccessToken(c);
	if (!payload) {
		return c.text("Unauthorized", 401);
	}

	// 注入上下文
	c.set("userId", payload.sub);
	c.set("userName", payload.name);

	await next();
});
