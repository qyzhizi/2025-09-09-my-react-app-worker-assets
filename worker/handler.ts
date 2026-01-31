import type { Context } from "hono";
import { nanoid } from 'nanoid'
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getInstallationRepositories } from '@/githubApp'

import { fetchAccessToken, fetchGitHubUserInfo } from '@/githubauth/tokenService'
import {durableHello,
  durableCreateGithubPushParamsTask,
  durableProcessGithubPush} from "@/callDurable"
import { findManyUsers, getUserAvatarUrl, createOrUpdateUser } from "@/infrastructure/user";
import { getUserById } from "@/infrastructure/user";
import { getUserSettingsFromDb, updateUserSettingsToDb } from "@/infrastructure/userSettings";
import { addOrUpdategithubRepoAccessData } from "@/infrastructure/githubRepoAccess";
import {getVaultInfo} from '@/infrastructure/githubRepoAccess'
import { safeUpdategithubRepoAccessByUserId,
  findgithubRepoAccessByUserId,
  getgithubRepoAccessInfo, 
} from "@/infrastructure/githubRepoAccess"
import type { PushGitRepoTaskParams } from "@/types/durable";
import { Provider } from "@/types/provider";
import { validateGitRepoFullName } from "@/common"
import { ValidationError, NotGetAccessTokenError } from "@/types/error"
import {getOrUpdategithubRepoAccessInfo} from "@/providers"
import {testGitHubRepoAcess} from "@/providers"

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

// 注册 GITHUB_LOGIN_PATH 的路由后续处理函数，处理 GitHub 登录成功后的逻辑，setCookie 设置 JWT token
export const GithubLoginHandler = async (c: Context) => {
		const userData = c.get("user-github");
		
		if (!userData) {
			return c.text("GitHub authentication failed", 400);
		}

		if (!userData.id || !userData.login || !userData.email) {
			return c.text("Required information could not be retrieved", 400);
		}

		const user = await createOrUpdateUser(
			c,
			userData.login,
			userData.email,
			userData.avatar_url ?? "",
			Provider.GitHub,
			userData.id.toString(),
		);

		const accessTokenPayload = {
			sub: user.id.toString(),
			name: user.name,
			exp: Math.floor(Date.now() / 1000) + parseInt(c.env.ACCESS_TOKEN_EXPIRY, 10),
		};

		const accessToken = await sign(
			accessTokenPayload,
			c.env.ACCESS_TOKEN_SECRET,
		);

		setCookie(c, "access_token", accessToken, {
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
		});

    // 跳转到 init-refresh-token 路由，初始化 refresh token
		return c.redirect("/login-callback-init-refresh-token");
};

export const initRefreshTokenHandler = async (
  c: Context<{
    Bindings: Env;
    Variables: { userId: string; userName: string };
  }>
) => {

  const refreshTokenPayload = {
    sub: c.get("userId"),
    name: c.get("userName"),
    exp: Math.floor(Date.now() / 1000) + parseInt(c.env.REFRESH_TOKEN_EXPIRY, 10),
	};
  
  const refreshToken = await sign(
    refreshTokenPayload,
    c.env.REFRESH_TOKEN_SECRET,
	);

  setCookie(c, "refresh_token", refreshToken, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  });
  return c.json({ ok: true });
};

export const logoutHandler = async (c: Context) => {
  // 删除 access_token
  setCookie(c, 'access_token', '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 0, // 关键：立即过期
  })

  // 删除 refresh_token
  setCookie(c, 'refresh_token', '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 0,
  })

  // 返回成功响应
  return c.json({ ok: true })
}

// 处理函数（这里让 TS 自动推断类型）
export const helloHandler = (c: Parameters<typeof helloZValidator>[0]) => {
  const { name } = c.req.valid(VALIDATION_TARGET.QUERY) // 自动推断为 string
  return c.json({ message: `Hello ${name}!` })
}

// getAuthInfoHandler
export const getAuthInfoHandler = async (c: Context<{ 
    Bindings: Env,
    Variables: {userId: string, userName: string}
  }> ): Promise<Response> => {
  return c.json({
    user: {
      id: c.get("userId"),
      name: c.get("userName"),
    },
  })
}

/**
 * GitHub 授权回调路由处理函数
 * 该函数从请求中提取 code，然后调用 fetchAccessToken 获取 token，并重定向到前端设置页面
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
    const now = Date.now(); // utc time
    const filteredTokenData: Record<string, any> = {
      githubUserName: userInfo.login,
      accessToken: tokenData.access_token,
      accessTokenExpiresAt: new Date(now + tokenData.expires_in * 1000), // 8小时后过期,
      refreshToken: tokenData.refresh_token,
      refreshTokenExpiresAt: new Date(now + tokenData.refresh_token_expires_in * 1000) // 184天后过期
    };
    // 尝试更新数据库中 GitHub App 相关数据
    try {
      await addOrUpdategithubRepoAccessData(c, filteredTokenData)
    } catch (dbError) {
      console.error('更新 GitHub App 访问数据时出错:', dbError)
      // 重定向到设置页面，但带上错误参数
      return c.redirect('/settings-page?github_auth=error&tab=github')
    }
    // 成功时重定向到设置页面，并带上成功参数和 tab 参数
    return c.redirect('/settings-page?github_auth=success&tab=github')
  } catch (error) {
    console.error('获取 access token 过程中出错:', error)
    // 错误时也重定向到设置页面，但带上错误参数
    return c.redirect('/settings-page?github_auth=error&tab=github')
  }
}

// 定义处理函数
export const githubAuthHandler = (c: Context<{ Bindings: Env }>) => {
  // 从环境变量中获取 GitHub Client ID
  const clientId = c.env.GITHUB_APP_CLIENT_ID
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}`
  return c.redirect(githubAuthUrl)
}

export async function githubAppConfigureHandler(c: Context<{ Bindings: Env & { GITHUB_APP_URL: string } }>): Promise<Response> {
  const githubAppUrl = c.env.GITHUB_APP_URL
  return c.redirect(githubAppUrl ?? "")
}

export async function setGithubRepoHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const body = await c.req.json();
    const { githubRepoName } = body;

    if (!githubRepoName || githubRepoName.trim() === '') {
      return c.json({ error: 'Empty githubRepoName' }, 400);
    }

    // 执行安全更新
    await safeUpdategithubRepoAccessByUserId(c, { githubRepoName });

    return c.json({ message: 'GitHub repo name updated successfully' }, 200);
  } catch (err: any) {
    console.error('Error in setGithubRepoHandler:', err);

    return c.json(
      { error: err?.message || 'Internal Server Error' },
      err?.message?.includes('not found') ? 404 : 500
    );
  }
}

export const durableHelloHandler = async (c: Context) => {
  return durableHello(c);
};

export const getUsersHandler = async (c: Context) => {
    const users = await findManyUsers(c);
    return c.json({ users: users });
};

export const getUserAvatarUrlHandler = async (
  c: Context<{
    Bindings: Env;
    Variables: { userId: string , userName: string};
  }>): Promise<Response> => {
  const avatarUrl = await getUserAvatarUrl(c, c.get("userId"));
  return c.json({ avatar_url: avatarUrl });
};

export const getUserInfoHandler = async (c: Context<{ Bindings: Env; Variables: { userId: string; userName: string }; }>): Promise<Response> => {
  const user = await getUserById(c, c.get("userId"));
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }
  return c.json({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatar_url });
}

export async function addLogHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const body = await c.req.json()
    const content = body.content

    if (!content || typeof content !== 'string' || content.trim() === '') {
      return c.json({ error: 'Empty content' }, 400)
    }

    const taskId = nanoid()
    const now = new Date().toISOString()

    const logEntry = {
      message: "update by Memoflow",
      content,
      created_at: now,
      taskId: taskId,
    }
    var existingRecord = await findgithubRepoAccessByUserId(c);

    // console.log("existingRecord:", existingRecord)
    // 先检查 existingRecord 是否存在
    if (!existingRecord) {
      return c.json({ error: "GitHub app access record not found" }, 404);
    }
    if (!existingRecord.githubRepoName){
      return c.json({ error: "githubRepoName is not exist" }, 400);
    }
    if (!existingRecord.accessToken || !existingRecord.githubUserName || !existingRecord.githubRepoName) {
      // console.log("existingRecord:", existingRecord)
      return c.json({ error: "Incomplete GitHub access record" }, 400);
    }
    // get vaultName
    const vaultPathInRepo = existingRecord.vaultPathInRepo;
    const vaultName = existingRecord.vaultName;
    if (!vaultPathInRepo || vaultPathInRepo.trim() === '') {
      return c.json({ error: 'Empty vaultPathInRepo in existingRecord' }, 400);
    }

    const taskParams: Partial<PushGitRepoTaskParams> = {
      id: logEntry.taskId,
      commitMessage: logEntry.message,
      accessToken: existingRecord.accessToken,
      githubUserName: existingRecord.githubUserName,
      repoName: existingRecord.githubRepoName,
      vaultPathInRepo: vaultPathInRepo,
      vaultName: vaultName,
      content: logEntry.content,
      completed: false,
      createdAt: logEntry.created_at,
    }
    await durableCreateGithubPushParamsTask(c, taskParams)
    // console.log("createdTask:", createdTask)
    
    try {
      const result = await durableProcessGithubPush(c, taskId);
      return c.json(result);
    } catch (error) {
      console.error("Error in fetchMemoflowTaskHandler:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  } catch (err) {
    console.error('Error in addLogHandler:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function getVaultInfoHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  const {vaultName, folderIndexInVault, fileIndexInFolder} = await getVaultInfo(c)
  return c.json({vaultName, folderIndexInVault, fileIndexInFolder})
}

export async function saveRepoAndTestConnectionHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const body = await c.req.json()
    const { githubRepoFullName, vaultPathInRepo } = body

    // verify vaultPathInRep
    if (!vaultPathInRepo || vaultPathInRepo.trim() === '') {
      return c.json({ error: 'Empty vaultPathInRepo' }, 400);
    }
    // verify vaultPathInRepo format
    if (!/^([\w\-./]+)$/.test(vaultPathInRepo)) {
      return c.json({ error: 'Invalid vaultPathInRepo format. Only alphanumeric characters, hyphens, underscores, dots, and slashes are allowed.' }, 400);
    }
    
    // verify repoName
    try {
      validateGitRepoFullName(githubRepoFullName);
    } catch (error) {
      if (error instanceof ValidationError) {
        return c.json({ error: error.message }, 400);
      }
      throw error; // 重新抛出非 ValidationError 的错误
    }
    const [githubUserName, githubRepoName] = githubRepoFullName.split("/");

    // get settings @todo validate user settings
    const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
    console.log("userSettings: ", userSettings)

    const githubAccessInfo = await getOrUpdategithubRepoAccessInfo(c)
    if (!githubAccessInfo || !githubAccessInfo.accessToken){
      throw new NotGetAccessTokenError("Fail to get or update accessToken, Please auth GitHub APP first!")
    }
    const accessToken = githubAccessInfo.accessToken
    const dbGithubUserName = githubAccessInfo.githubUserName
    if (!dbGithubUserName ) {
      throw new NotGetAccessTokenError("Fail to get GitHub username, Please login GitHub first, then try again!")
    }
    if (githubUserName !== dbGithubUserName ) {
      console.log({githubUserName, dbGithubUserName})
      throw new NotGetAccessTokenError(" Input is inconsistent with DB  , Please login GitHub first, then try again!")
    }

    try{
      await safeUpdategithubRepoAccessByUserId(c, { githubRepoName, vaultPathInRepo });
      await testGitHubRepoAcess(accessToken, githubUserName, githubRepoName);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({"success": "false", "error": errorMessage}, 400)
    }
    
    return c.json({"success": `${githubUserName}/${githubRepoName} saved, connecting success!`})

  } catch (error) {
    console.log("error: ", error)
    return c.json({error: 'Internal Server Error'}, 500);
  }
}

export async function getGitHubRepoInfoHandler(c:Context<{Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  const githubAccessInfo = await getgithubRepoAccessInfo(c);
  const githubRepoName = githubAccessInfo?.githubRepoName ?? null
  const githubUserName = githubAccessInfo?.githubUserName ?? null
  const vaultPathInRepo = githubAccessInfo?.vaultPathInRepo ?? null
  const vaultName = githubAccessInfo?.vaultName ?? null
  const vaultInfo = { vaultName, folderIndexInVault: null, fileIndexInFolder: null }
  return c.json({githubUserName, githubRepoName, vaultPathInRepo, vaultInfo})
}

export async function githubAppSetupHandler(c:Context<{Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const installationId = c.req.query('installation_id')
    const setupAction = c.req.query('setup_action')
    if (!installationId) {
      return c.json({ error: 'lack installation_id param' }, 400)
    }
    // save to userSettings
    await updateUserSettingsToDb(c, c.get("userId"), 
      { installationId, setupAction })
    return c.redirect('/github-app-setup-success')
  } catch (err) {
    console.error('githubAppSetupHandler error:', err)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function getGitHubAppInstallationReposHandler(c:Context<{Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {

  const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
  const installationId = userSettings['installationId']
  if (!installationId) {
    return c.json({ error: 'Installation ID not found, Please re-configure the GitHub App' }, 404)
  }
  const githubAppId = c.env.GITHUB_APP_ID
  const rawPrivateKeyPem= c.env.GITHUB_APP_PRIVATE_PEM
  // 将字符串转换为换行符
  const privateKeyPem = rawPrivateKeyPem.replace(/\\n/g, '\n')
  console.log("githubAppPrivateKey: ", privateKeyPem)
  const installationData = await getInstallationRepositories(
    installationId, githubAppId, privateKeyPem)
  console.log(installationData)
  return c.json({installationData})
}

export async function setStoragePreferenceHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const body = await c.req.json()
    const { storageType } = body

    // Validate storageType
    if (!storageType) {
      return c.json({ error: 'Storage type is required' }, 400)
    }

    // save to userSettings
    await updateUserSettingsToDb(c, c.get("userId"),
      { storageType })

    return c.json({ success: true })
  } catch (error) {
    console.error('setStoragePreferenceHandler error:', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function getStoragePreferenceHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const userSettings = await getUserSettingsFromDb(c, c.get("userId")) as Record<string, string | null>;
    const storageType = userSettings['storageType']
    return c.json({ storageType })
  } catch (error) {
    console.error('getStoragePreferenceHandler error:', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}
