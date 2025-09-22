import type { Context } from "hono";
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

import { fetchAccessToken, fetchGitHubUserInfo } from './githubauth/tokenService'
import { addOrUpdategithubAppAccessData } from "./infrastructure/githubAppAccess";
import { safeUpdateGithubAppAccessByUserId,
} from "./infrastructure/githubAppAccess"
import { findManyUsers } from "./infrastructure/user";

const VALIDATION_TARGET = {
  QUERY: "query",
  JSON: "json",
  FORM: "form",
  PARAM: "param",
} as const

// schema 单独提取
const helloQuerySchema = z.object({
  name: z.string(),
})

export const helloZValidator= zValidator(VALIDATION_TARGET.QUERY, helloQuerySchema)

// 处理函数（这里让 TS 自动推断类型）
export const helloHandler = (c: Parameters<typeof helloZValidator>[0]) => {
  const { name } = c.req.valid(VALIDATION_TARGET.QUERY) // 自动推断为 string
  return c.json({ message: `Hello ${name}!` })
}

/**
 * GitHub 授权回调路由处理函数
 * 该函数从请求中提取 code，然后调用 fetchAccessToken 获取 token，并返回 JSON 响应
 */
export async function githubAppAuthCallbackHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // 从查询参数中获取 code
  const code = c.req.query('code')
  if (!code) {
    return c.text('缺少 code 参数', 400)
  }

  // 从环境变量中读取 Client ID 与 Client Secret（需要在 Workers 中绑定）
  const CLIENT_ID = c.env.GITHUB_APP_CLIENT_ID
  const CLIENT_SECRET = c.env.GITHUB_APP_CLIENT_SECRETS

  try {
    const tokenData = await fetchAccessToken(CLIENT_ID, CLIENT_SECRET, code)
    const userInfo = await fetchGitHubUserInfo(tokenData.access_token)
    const filteredTokenData: Record<string, any> = {
      githubUserName: userInfo.login,
      accessToken: tokenData.access_token,
      accessTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000), // 8小时后过期,
      refreshToken: tokenData.refresh_token,
      refreshTokenExpiresAt: new Date(Date.now() + tokenData.refresh_token_expires_in * 1000) // 184天后过期
    };    
    // 尝试更新数据库中 GitHub App 相关数据
    try {
      await addOrUpdategithubAppAccessData(c, c.env.USER_ID, filteredTokenData)
    } catch (dbError) {
      console.error('更新 GitHub App 访问数据时出错:', dbError)
      return c.json({ error: '更新 GitHub App 访问数据失败' }, 500)
    }
    return c.json(tokenData)
  } catch (error) {
    console.error('获取 access token 过程中出错:', error)
    return c.json({ error: '获取 access token 失败' }, 500)
  }
}

// 定义处理函数
export const githubAuthHandler = (c: Context<{ Bindings: Env }>) => {
  // 从环境变量中获取 GitHub Client ID
  const clientId = c.env.GITHUB_APP_CLIENT_ID
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}`
  return c.redirect(githubAuthUrl)
}

export async function setGithubRepoHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const { githubRepoName } = body;

    if (!githubRepoName || githubRepoName.trim() === '') {
      return c.json({ error: 'Empty githubRepoName' }, 400);
    }

    // 执行安全更新
    await safeUpdateGithubAppAccessByUserId(c, c.env.USER_ID, { githubRepoName });

    return c.json({ message: 'GitHub repo name updated successfully' }, 200);
  } catch (err: any) {
    console.error('Error in setGithubRepoHandler:', err);

    return c.json(
      { error: err?.message || 'Internal Server Error' },
      err?.message?.includes('not found') ? 404 : 500
    );
  }
}

export const durableHello = async (c: Context) => {
		// Create a `DurableObjectId` for an instance of the `MemoflowDurableObject`
		// class named "foo". Requests from all Workers to the instance named
		// "foo" will go to a single globally unique Durable Object instance.
		const id: DurableObjectId = c.env.MY_DURABLE_OBJECT.idFromName("foo");

		// Create a stub to open a communication channel with the Durable
		// Object instance.
		const stub = c.env.MY_DURABLE_OBJECT.get(id);

		// Call the `sayHello()` RPC method on the stub to invoke the method on
		// the remote Durable Object instance
		const greeting = await stub.sayHello("world, lzp");
    return c.json({ commitMessage: greeting });
};

export const getUsers = async (c: Context) => {
	const users = await findManyUsers(c);
	return c.json({ users: users });
}
