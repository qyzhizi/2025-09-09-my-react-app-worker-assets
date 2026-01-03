import { githubAuth } from "@hono/oauth-providers/github";
import type { Context } from "hono";

export const GitHubLoginMiddleware = (c: Context, next: () => Promise<void>) =>
	githubAuth({
		client_id: c.env.GITHUB_ID,
		client_secret: c.env.GITHUB_SECRET,
		scope: ["read:user", "user", "user:email"],
		oauthApp: true,
	})(c, next);
