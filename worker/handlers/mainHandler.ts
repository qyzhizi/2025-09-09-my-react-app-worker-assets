import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { getInstallationRepositories } from '@/durable/github/githubApp'
import { DURABLE_NAME_PREFIX, COMMIT_MESSAGE, DELETE_COMMIT_MESSAGE } from "@/ConstVar";
import { respondError } from "@/types/error"

import { fetchAccessToken, fetchGitHubUserInfo } from '@/githubauth/tokenService'
import {durableHello,
  durableCreateTaskAndSaveArticleToDB,
  durableProcessTask,
  getDODatabaseStatus,
  resetDoKeyStorageAndSqlite,
  getArticleContentList,
  durableSearchSimilarTitlesInVectorIndex,
} from "@/durable/callDurable"
import { findManyUsers, getUserAvatarUrl, createOrUpdateUser } from "@/infrastructure/user";
import { getUserById } from "@/infrastructure/user";
import { getUserSettingsFromDb,
  updateUserSettingsToDb } from "@/infrastructure/userSettings";
import { addOrUpdategithubRepoAccessData } from "@/infrastructure/githubRepoAccess";
import {getVaultInfo} from '@/infrastructure/githubRepoAccess'
import { safeUpdategithubRepoAccessByUserId,
  getgithubRepoAccessInfo, 
} from "@/infrastructure/githubRepoAccess"
import type { PushGitRepoTaskParams, DeleteArticleTaskParams, EditGitRepoTaskParams} from "@/types/durable";
import { Provider } from "@/types/provider";
import { getMetaDataFromContent } from "@/utils/tools"
import { TokenExpiredError, NotFoundError } from "@/types/error"
import {getOrUpdategithubRepoAccessInfo} from "@/providers"
import {type GithubRepoAccess, type ValidatedGithubAccess} from "@/infrastructure/types";
import { edgeHash64 } from "@/utils/titleHash"
import { isVectorIndexProvider } from "@/types/durable";

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

    let user;
    try {
      user = await createOrUpdateUser(
        c,
        edgeHash64(userData.id.toString()), // userId
        userData.login,
        userData.email,
        userData.avatar_url ?? "",
        Provider.GitHub,
        userData.id.toString(),
      );
    } catch (err: any) {
      return respondError(c, err);
    }

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

// Helper: ensure and validate GitHub access info for handlers
export async function getValidatedGithubAccessInfo(c: Context): Promise<GithubRepoAccess | Response> {
  let githubAccessInfo: GithubRepoAccess | null;
  try {
    githubAccessInfo = await getOrUpdategithubRepoAccessInfo(c);
  } catch (err: any) {
    if (err instanceof TokenExpiredError) {
      return c.json({ TokenExpiredError: 'GitHub access token and refresh token have expired, Please re-authenticate GitHub APP' }, 401);
    }
    console.error('Error getting GitHub access info:', err);
    return c.json({ Error: 'Fail to get or update accessToken, Please auth GitHub APP first!' }, 401);
  }

  if (!githubAccessInfo || !githubAccessInfo.accessToken) {
    console.error('Fail to get or update accessToken, Please auth GitHub APP first!');
    return c.json({ Error: 'Fail to get or update accessToken, Please auth GitHub APP first!' }, 401);
  }

  if (!githubAccessInfo.githubRepoName) {
    return c.json({ error: 'Incomplete GitHub access record, githubRepoName is not exist' }, 401);
  }

  if (!githubAccessInfo.githubUserName) {
    return c.json({ error: 'Incomplete GitHub access record, githubUserName is not exist' }, 401);
  }

  const vaultPathInRepo = githubAccessInfo.vaultPathInRepo;
  if (!vaultPathInRepo || vaultPathInRepo.trim() === '') {
    return c.json({ error: 'Empty vaultPathInRepo in githubAccessInfo' }, 400);
  }

  return githubAccessInfo;
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
  return c.json(await durableHello(c));
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

    // const now = new Date().toISOString()
    const { title: extractedTitle, date: extractedDate } = getMetaDataFromContent(content)
    if (!extractedDate){
      console.error("Date is required in content")
      return c.json({ error: "Date is required in content" }, 404);
    }
    const hash =  extractedTitle ? edgeHash64(extractedTitle) : edgeHash64(extractedDate)

    const logEntry = {
      message: COMMIT_MESSAGE,
      content,
      hash,
      created_at: extractedDate,
      taskId: hash,
      title: extractedTitle,
    }

    const _gh = await getValidatedGithubAccessInfo(c);
    if (!('accessToken' in _gh)) {
      return _gh as Response;
    }
    const githubAccessInfo = _gh as ValidatedGithubAccess;
    // get vaultName
    const vaultPathInRepo = githubAccessInfo.vaultPathInRepo;
    const vaultName = githubAccessInfo.vaultName;

    const taskParams: Partial<PushGitRepoTaskParams> = {
      id: logEntry.taskId,
      title: logEntry.title,
      content: logEntry.content,
      hash: logEntry.hash,
      commitMessage: logEntry.message,
      accessToken: githubAccessInfo.accessToken,
      githubUserName: githubAccessInfo.githubUserName,
      githubRepoName: githubAccessInfo.githubRepoName,
      vaultPathInRepo: vaultPathInRepo,
      vaultName: vaultName,
      completed: false,
      createdAt: logEntry.created_at,
    }
    await durableCreateTaskAndSaveArticleToDB(c, taskParams)
    
    try {
      const result = await durableProcessTask(c, logEntry.taskId);
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

export async function deleteLogHandler(c: Context<{Bindings: Env, Variables: {userId: string, userName: string}}>): Promise<Response> {
  try {
    // Prefer path param `id`, fall back to body.id if not present
    const idFromParam = c.req.param('id')
    let id = idFromParam
    if (!id) {
      try {
        const body = await c.req.json()
        id = body?.id
      } catch (e) {
        // ignore
      }
    }

    if (!id || typeof id !== 'string') {
      return c.json({ error: 'Missing id' }, 400)
    }
    const _gh = await getValidatedGithubAccessInfo(c);
    if (!('accessToken' in _gh)) {
      return _gh as Response;
    }
    const githubAccessInfo = _gh as ValidatedGithubAccess;
    const deleteArticleTaskParams: DeleteArticleTaskParams = {
      userId: c.get("userId"),
      articleId: id,
      commitMessage: DELETE_COMMIT_MESSAGE,
      accessToken: githubAccessInfo.accessToken,
      githubUserName: githubAccessInfo.githubUserName,
      githubRepoName: githubAccessInfo.githubRepoName,
      vaultPathInRepo: githubAccessInfo.vaultPathInRepo,
      vaultName: githubAccessInfo.vaultName
    }
    
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
        `${DURABLE_NAME_PREFIX}${c.get("userId")}`)
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)
    await (stub as any).deleteArticleContent(deleteArticleTaskParams.articleId)
    c.executionCtx.waitUntil(
      (stub as any).processDeleteArticle(deleteArticleTaskParams)
      .catch((err: any) => {
            // Note: The errors here will no longer be passed to the user request and can only be recorded by yourself.
            console.error("Background DO task failed:", err);
      })
    )

    return c.json({ ok: true })
  } catch (err: any) {
    console.error('Error in deleteLogHandler:', err)
    if (err instanceof NotFoundError) {
      return c.json({ error: err.message }, 404)
    }
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function editLogHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const body = await c.req.json().catch(() => ({} as Record<string, any>))
    const idFromParam = c.req.param('id')
    const originalId = typeof idFromParam === 'string' && idFromParam ? idFromParam : body?.id

    if (!originalId || typeof originalId !== 'string') {
      return c.json({ error: 'Missing id' }, 400)
    }

    const content = body?.content
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return c.json({ error: 'Content is required' }, 400)
    }

    // const now = new Date().toISOString()
    const { title: extractedTitle, date: extractedDate } = getMetaDataFromContent(content)
    if (!extractedDate){
      console.error("Date is required in content")
      return c.json({ error: "Date is required in content" }, 404);
    }
    const hash =  extractedTitle ? edgeHash64(extractedTitle) : edgeHash64(extractedDate)

    const logEntry = {
      message: COMMIT_MESSAGE,
      content,
      created_at: extractedDate,
      taskId: hash,
      hash,
      title: extractedTitle,
    } 

    const _gh = await getValidatedGithubAccessInfo(c);
    if (!('accessToken' in _gh)) {
      return _gh as Response;
    }
    const githubAccessInfo = _gh as ValidatedGithubAccess;

    // const doId = c.env.MY_DURABLE_OBJECT.idFromName(
    //   `${DURABLE_NAME_PREFIX}${c.get("userId")}`
    // )
    // const stub = c.env.MY_DURABLE_OBJECT.get(doId) as any;

    const taskParams: Partial<EditGitRepoTaskParams> = {
      originalId,
      id: logEntry.taskId,
      title: logEntry.title,
      content: logEntry.content,
      hash: logEntry.hash,
      commitMessage: logEntry.message, // edit also use [NEW]
      accessToken: githubAccessInfo.accessToken,
      githubUserName: githubAccessInfo.githubUserName,
      githubRepoName: githubAccessInfo.githubRepoName,
      vaultPathInRepo: githubAccessInfo.vaultPathInRepo,
      vaultName: githubAccessInfo.vaultName,
      completed: false,
      createdAt: logEntry.created_at,
    }

    await durableCreateTaskAndSaveArticleToDB(c, taskParams)
    try {
      const result = await durableProcessTask(c, logEntry.taskId);
      return c.json(result);
    } catch (error) {
      console.error("Error in fetchMemoflowTaskHandler:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  } catch (err: any) {
    console.error('Error in editLogHandler:', err)
    // if (err instanceof NotFoundError) {
    //   return c.json({ error: err.message }, 404)
    // }
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function getArticleContentListHandler(c: Context<{ Bindings: Env; Variables: { userId: string; userName: string } }>): Promise<Response> {
  const page = c.req.query("page");
  const pageSize = c.req.query("pageSize");

  if (!page || !pageSize) {
    return c.json({ error: 'Missing page or pageSize' }, 400);
  }

  const articleList = await getArticleContentList(c, parseInt(page), parseInt(pageSize));
  return c.json(articleList);
}

export async function getDODatabaseStatusHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const dbStatus = await getDODatabaseStatus(c);
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
  const {vaultName} = await getVaultInfo(c)
  return c.json({vaultName})
}

export async function getGitHubRepoInfoHandler(c:Context<{Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  const githubAccessInfo = await getgithubRepoAccessInfo(c);
  const githubRepoName = githubAccessInfo?.githubRepoName ?? null
  const githubUserName = githubAccessInfo?.githubUserName ?? null
  const vaultPathInRepo = githubAccessInfo?.vaultPathInRepo ?? null
  const vaultName = githubAccessInfo?.vaultName ?? null
  const vaultInfo = { vaultName }
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

export async function durableSearchSimilarTitlesInVectorIndexHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
    try {
        // Validate and extract request body
        const body = await c.req.json()
        const { query, topK, currentRepoSearch = false } = body

        // Validate query parameter
        if (!query || typeof query !== 'string' || query.trim() === '') {
            return c.json({ error: 'Query must be a non-empty string' }, 400)
        }

        // Validate topK parameter with reasonable limits
        const MAX_TOP_K = 50
        if (!topK || typeof topK !== 'number' || topK <= 0 || topK > MAX_TOP_K) {
            return c.json({ error: `topK must be a positive integer between 1 and ${MAX_TOP_K}` }, 400)
        }

        // Get GitHub access information
        let githubAccessInfo: GithubRepoAccess | undefined
        try {
            githubAccessInfo = await getgithubRepoAccessInfo(c)
        } catch (githubError) {
            console.error('Error fetching GitHub access info:', githubError)
            // Return search results even if GitHub info fails
            githubAccessInfo = undefined
        }

        // Search for similar titles in vector index
        const githubRepoName = githubAccessInfo?.githubRepoName ?? ''
        const vaultPathInRepo = githubAccessInfo?.vaultPathInRepo ?? ''
        const similarTitles = await durableSearchSimilarTitlesInVectorIndex(
          c, { query, topK, repoAndVaultPath: currentRepoSearch ? `${githubRepoName}-${vaultPathInRepo}` : undefined })
        // console.log('similarTitles from durableSearchSimilarTitlesInVectorIndex:', similarTitles)
        
        // Validate similarTitles response
        if (!similarTitles) {
            console.warn('durableSearchSimilarTitlesInVectorIndex returned empty result')
            return c.json({ error: 'No search results found' }, 404)
        }


        // Construct result with search results and GitHub info
        const result = {
            similarTitles,
            githubUserName: githubAccessInfo?.githubUserName ?? null,
            githubRepoName: githubAccessInfo?.githubRepoName ?? null,
            vaultPathInRepo: githubAccessInfo?.vaultPathInRepo ?? null,
            vaultName: githubAccessInfo?.vaultName ?? null,
        }

        return c.json(result, 200)
    } catch (err) {
        console.error('Error in durableSearchSimilarTitlesInVectorIndexHandler:', err)
        const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
        return c.json({ error: errorMessage }, 500)
    }
}

export async function setVectorIndexProviderHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    const body = await c.req.json()
    const { vectorIndexProvider } = body
    // Validate vectorIndexProvider is vectorIndexProvider
    console.log('Received vectorIndexProvider:', vectorIndexProvider)
    if ( !isVectorIndexProvider(vectorIndexProvider) ) {
      return c.json({ error: 'Invalid vectorIndexProvider' }, 400)
    }
    // save to userSettings
    await updateUserSettingsToDb(c, c.get("userId"), { vectorIndexProvider })
    
    // save to durable object for quick access in durable functions
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
      `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    const stub = c.env.MY_DURABLE_OBJECT.get(doId)
    await stub.setVectorIndexProviderToKvMeta(vectorIndexProvider)

    return c.json({ success: true })
  } catch (error) {
    console.error('setVectorIndexProviderHandler error:', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}

export async function getVectorIndexProviderHandler(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  try {
    // get from durable object for quick access in durable functions
    const doId = c.env.MY_DURABLE_OBJECT.idFromName(
      `${DURABLE_NAME_PREFIX}${c.get("userId")}`);
    // avoid deep/recursive TS type instantiation from remote DO stub by narrowing stub type
    const stub = c.env.MY_DURABLE_OBJECT.get(doId) as unknown as {
      getVectorIndexProviderFromKvMeta: () => Promise< any>
    }
    const vectorIndexProvider = await stub.getVectorIndexProviderFromKvMeta()

    if (!vectorIndexProvider) {
      return c.json({ vectorIndexProvider: null }, 200)
    }

    return c.json( vectorIndexProvider, 200)
  } catch (error) {
    console.error('getVectorIndexProviderHandler error:', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}