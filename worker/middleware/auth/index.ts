import type { Hono } from "hono";

import { GITHUB_LOGIN_PATH } from "@/ConstVar";
import { authMiddleware } from "./middleware";
import { GitHubLoginMiddleware } from "./github";


// Configure middleware
export const configAuthMiddleware = (app: Hono) => {
	// 1. OAuth login related
	app.use(GITHUB_LOGIN_PATH, GitHubLoginMiddleware);

	// 2. Global authentication
	app.use(authMiddleware);
};
