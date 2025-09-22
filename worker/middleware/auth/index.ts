import type { Hono, Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";
import { githubAuth } from "@hono/oauth-providers/github";
import { Provider } from "../../types/provider";
import { findOrCreateUser } from "../../infrastructure/user";
import { BASE_PATH, GITHUB_LOGIN_PATH } from "../../ConstVar";


// 注册 GITHUB_LOGIN_PATH 的中间件, 使用 @hono/oauth-providers/github 处理 GitHub OAuth 流程
const registerGitHubLoginMiddleware = (app: Hono) => {
	app.use(GITHUB_LOGIN_PATH, (c: Context, next) => {
		return githubAuth({
			client_id: c.env.GITHUB_ID,
			client_secret: c.env.GITHUB_SECRET,
			scope: ["read:user", "user", "user:email"],
			oauthApp: true,
		})(c, next);
	});
};

// 认证中间件, 允许GitHub 登录回调路径, 验证 JWT token, 并在必要时刷新 token, 将 userid 存入环境变量
const authMiddleware = createMiddleware(async (c, next) => {
	// 允许未认证访问的路径, 比如 GitHub 登录回调路径
	// http://localhost:5173/api/github/login?code=01ce2a9cd47efcca459a&state=dzl4t5ymzke-iagsdihffh-5ctxtn2r908
	if (c.req.path.replace(BASE_PATH, "").startsWith(GITHUB_LOGIN_PATH)) {
		return next();
	}

	let accessToken = getCookie(c, "access_token");
	if (!accessToken) {
		return c.text("Unauthorized: no access token", 401);
	}

	let accessTokenPayload: JWTPayload;
	try {
		accessTokenPayload = await verify(accessToken, c.env.ACCESS_TOKEN_SECRET);
	} catch (err) {
		const refreshToken = getCookie(c, "refresh_token");
		if (!refreshToken) {
			return c.text("Unauthorized: no refresh token", 401);
		}
		let refreshTokenPayload: JWTPayload;
		try {
			refreshTokenPayload = await verify(refreshToken, c.env.REFRESH_TOKEN_SECRET);
		} catch (err2) {
			return c.text("Unauthorized: invalid refresh token", 401);
		}

		accessTokenPayload = {
			...refreshTokenPayload,
			exp:
				Math.floor(Date.now() / 1000) + parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10),
		};
		accessToken = await sign(accessTokenPayload, c.env.ACCESS_TOKEN_SECRET);
		setCookie(c, "access_token", accessToken, {
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "None",
			maxAge: parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10),
		});
	}
	// 将 userid 存入 Cloudflare 环境变量
	c.env.USER_ID = accessTokenPayload.sub;
	return next();
});

// 配置认证中间件
export const configAuthMiddleware = (app: Hono) => {
	app.use(authMiddleware); // Applies to all endpoints
	registerGitHubLoginMiddleware(app);
};

// 注册 GITHUB_LOGIN_PATH 的路由后续处理函数，处理 GitHub 登录成功后的逻辑，setCookie 设置 JWT token
export const registerGithubLoginHandler = (app: Hono) => {
	app.get(GITHUB_LOGIN_PATH, async (c: Context) => {
		const userData = c.get("user-github");
		
		if (!userData) {
			return c.text("GitHub authentication failed", 400);
		}

		if (!userData.id || !userData.login || !userData.email) {
			return c.text("Required information could not be retrieved", 400);
		}

		const user = await findOrCreateUser(
			c,
			userData.login,
			userData.email,
			Provider.GitHub,
			userData.id.toString(),
		);

		const accessTokenPayload = {
			sub: user.id.toString(),
			name: user.name,
			exp:
				Math.floor(Date.now() / 1000) + parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10),
		};
		const refreshTokenPayload = {
			sub: user.id.toString(),
			name: user.name,
			exp:
				Math.floor(Date.now() / 1000) +
				parseInt(c.env.REFRESH_TOKEN_EXPIRY, 10),
		};

		const accessToken = await sign(
			accessTokenPayload,
			c.env.ACCESS_TOKEN_SECRET,
		);
		const refreshToken = await sign(
			refreshTokenPayload,
			c.env.REFRESH_TOKEN_SECRET,
		);

		setCookie(c, "access_token", accessToken, {
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "None",
		});
		setCookie(c, "refresh_token", refreshToken, {
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "None",
		});

		return c.redirect("/");
	});
};
