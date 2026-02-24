import type { Context } from "hono";
import { nanoid } from 'nanoid'
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getInstallationRepositories } from '@/githubApp'

import { fetchAccessToken, fetchGitHubUserInfo } from '@/githubauth/tokenService'
import {durableHello,
  durableCreateTaskAndSaveArticleToDB,
  durablePushToGitHub,
  getDODatabaseStatus,
  resetDoKeyStorageAndSqlite,
  getArticleContentList,
} from "@/durable/callDurable"
import { findManyUsers, getUserAvatarUrl, createOrUpdateUser } from "@/infrastructure/user";
import { getUserById } from "@/infrastructure/user";
import { getUserSettingsFromDb, updateUserSettingsToDb } from "@/infrastructure/userSettings";
import { addOrUpdategithubRepoAccessData } from "@/infrastructure/githubRepoAccess";
import {getVaultInfo} from '@/infrastructure/githubRepoAccess'
import { safeUpdategithubRepoAccessByUserId,
  getgithubRepoAccessInfo, 
} from "@/infrastructure/githubRepoAccess"
import type { PushGitRepoTaskParams } from "@/types/durable";
import { Provider } from "@/types/provider";
import { validateGitRepoFullName, getTitleFromContent } from "@/common"
import { ValidationError, NotGetAccessTokenError } from "@/types/error"
import {getOrUpdategithubRepoAccessInfo} from "@/providers"
import {testGitHubRepoAcess} from "@/providers"
import {type GithubRepoAccess} from "@/infrastructure/types";

const VALIDATION_TARGET = {
  QUERY: "query",
  JSON: "json",
  FORM: "form",
  PARAM: "param",
} as const

// schema definition for hello route query validation
const helloQuerySchema = z.object({
  name: z.string(),
})

export const helloZValidator= zValidator(VALIDATION_TARGET.QUERY, helloQuerySchema)

// Register the route handler for GITHUB_LOGIN_PATH to handle the logic after GitHub login success, setCookie to set JWT token
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

    // Redirect to init-refresh-token route to initialize refresh token
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
  // Remove access_token
  setCookie(c, 'access_token', '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 0, // Key: expire immediately
  })

  // Remove refresh_token
  setCookie(c, 'refresh_token', '', {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 0,
  })

  // Return success response
  return c.json({ ok: true })
}

// Processing function (let TS automatically infer the type here)
export const helloHandler = (c: Parameters<typeof helloZValidator>[0]) => {
  const { name } = c.req.valid(VALIDATION_TARGET.QUERY) // automatically inferred as string
  return c.json({ message: `Hello ${name}!` })
};

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
 * GitHub authorization callback routing processing function
 * This function extracts the code from the request, then calls fetchAccessToken to obtain the token, and redirects to the front-end settings page
 */
export async function githubAppAuthCallbackHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // Extract code from query parameters
  const code = c.req.query('code')
  if (!code) {
    return c.text('缺少 code 参数', 400)
  }

  // Read Client ID and Client Secret from environment variables (must be bound in Workers)
  const CLIENT_ID = c.env.GITHUB_APP_CLIENT_ID
  const CLIENT_SECRET = c.env.GITHUB_APP_CLIENT_SECRETS

  try {
    const tokenData = await fetchAccessToken(CLIENT_ID, CLIENT_SECRET, code)
    const userInfo = await fetchGitHubUserInfo(tokenData.access_token)
    const now = Date.now(); // utc time
    const filteredTokenData: Record<string, any> = {
      githubUserName: userInfo.login,
      accessToken: tokenData.access_token,
      accessTokenExpiresAt: new Date(now + tokenData.expires_in * 1000), // Expires in 8 hours
      refreshToken: tokenData.refresh_token,
      refreshTokenExpiresAt: new Date(now + tokenData.refresh_token_expires_in * 1000) // Expires in 184 days
    };
    // Try to update GitHub App related data in the database
    try {
      await addOrUpdategithubRepoAccessData(c, filteredTokenData)
    } catch (dbError) {
      console.error('Error updating GitHub App access data:', dbError)
      // Redirect to settings page with error parameter
      return c.redirect('/settings-page?github_auth=error&tab=github')
    }
    // Redirect to settings page with success parameter and tab parameter
    return c.redirect('/settings-page?github_auth=success&tab=github')
  } catch (error) {
    console.error('Error occurred while fetching access token:', error)
    // Redirect to settings page with error parameter
    return c.redirect('/settings-page?github_auth=error&tab=github')
  }
}

// Define handler function
export const githubAuthHandler = (c: Context<{ Bindings: Env }>) => {
  // Get GitHub Client ID from environment variables
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

    // Perform safe update
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
  // if not avatarUrl, return 401
  if (!avatarUrl) {
    return c.json({ error: "Unauthorized" }, 401);
  }
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
    const title = await getTitleFromContent(content) 

    const logEntry = {
      message: "update by Memoflow",
      content,
      created_at: now,
      taskId: taskId,
      title: title,
    }

    const githubAccessInfo: GithubRepoAccess | null = await getOrUpdategithubRepoAccessInfo(c)
    if (!githubAccessInfo || !githubAccessInfo.accessToken){
      throw new NotGetAccessTokenError("Fail to get or update accessToken, Please auth GitHub APP first!")
    }

    // First check if githubAccessInfo exists
    if (!githubAccessInfo) {
      return c.json({ error: "GitHub app access record not found" }, 404);
    }
    if (!githubAccessInfo.githubRepoName){
      return c.json({ error: "githubRepoName is not exist" }, 400);
    }
    if (!githubAccessInfo.accessToken || !githubAccessInfo.githubUserName || !githubAccessInfo.githubRepoName) {
      // console.log("githubAccessInfo:", githubAccessInfo)
      return c.json({ error: "Incomplete GitHub access record" }, 400);
    }
    // get vaultName
    const vaultPathInRepo = githubAccessInfo.vaultPathInRepo;
    const vaultName = githubAccessInfo.vaultName;
    if (!vaultPathInRepo || vaultPathInRepo.trim() === '') {
      return c.json({ error: 'Empty vaultPathInRepo in githubAccessInfo' }, 400);
    }

    const taskParams: Partial<PushGitRepoTaskParams> = {
      id: logEntry.taskId,
      commitMessage: logEntry.message,
      accessToken: githubAccessInfo.accessToken,
      githubUserName: githubAccessInfo.githubUserName,
      repoName: githubAccessInfo.githubRepoName,
      vaultPathInRepo: vaultPathInRepo,
      vaultName: vaultName,
      title: logEntry.title,
      content: logEntry.content,
      completed: false,
      createdAt: logEntry.created_at,
    }
    await durableCreateTaskAndSaveArticleToDB(c, taskParams)
    // console.log("createdTask:", createdTask)
    
    try {
      const result = await durablePushToGitHub(c, taskId);
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

export async function getArticleContentListHandler(c: Context<{ Bindings: Env; Variables: { userId: string; userName: string } }>): Promise<Response> {
  const page = c.req.query("page");
  const pageSize = c.req.query("pageSize");

  console.log("getArticleContentListHandler called with:", { page, pageSize });
  if (!page || !pageSize) {
    return c.json({ error: 'Missing page or pageSize' }, 400);
  }

  const articleList = await getArticleContentList(c, parseInt(page), parseInt(pageSize));
  return c.json(articleList);
}

export async function getDODatabaseStatusHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const dbStatus = await getDODatabaseStatus(c);
    // console.log("dbStatus: ", JSON.stringify(dbStatus, null, 2));
    return c.json(dbStatus);
  } catch (error) {
    console.error("Error in getDODatabaseStatusHandler:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
}

export async function resetDoKeyStorageAndSqliteHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const result = await resetDoKeyStorageAndSqlite(c);
    return c.json(result);
  } catch (error) {
    console.error("Error in resetDoKeyStorageAndSqliteHandler:", error);
    return c.json({ error: "Internal Server Error" }, 500);
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
      throw error; 
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
    const dbGithubRepoName = githubAccessInfo.githubRepoName
    const dbVaultPathInRepo = githubAccessInfo.vaultPathInRepo
    if (!dbGithubUserName ) {
      throw new NotGetAccessTokenError("Fail to get GitHub username, Please login GitHub first, then try again!")
    }
    if (githubUserName !== dbGithubUserName ) {
      console.log({githubUserName, dbGithubUserName})
      throw new NotGetAccessTokenError(" Input is inconsistent with DB  , Please login GitHub first, then try again!")
    }
    let durableIsReset = false
    if (vaultPathInRepo !== dbVaultPathInRepo || githubRepoName !== dbGithubRepoName) {
      console.warn("vaultPathInRepo or githubRepoName is different from DB!")
      // reset durable object storage and sqlite to avoid potential issue caused by inconsistent repoName or vaultPathInRepo
      await resetDoKeyStorageAndSqlite(c)
      durableIsReset = true
    }

    try{
      await safeUpdategithubRepoAccessByUserId(c, { githubRepoName, vaultPathInRepo });
      await testGitHubRepoAcess(accessToken, githubUserName, githubRepoName);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return c.json({"success": "false", "error": errorMessage}, 400)
    }
    if (durableIsReset) {
      console.log("Durable Object storage and sqlite reset done.")
      return c.json({"success": `${githubUserName}/${githubRepoName} saved, durable object reset done, connecting success!`})
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
  // Convert string to newline
  const privateKeyPem = rawPrivateKeyPem.replace(/\\n/g, '\n')
  const installationData = await getInstallationRepositories(
    installationId, githubAppId, privateKeyPem)
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
