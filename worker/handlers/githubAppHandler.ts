import type { Context } from "hono";
import { getInstallationRepositories, getRepoFileList, getFileContent} from '@/durable/github/githubApp'

import {
  resetDoKeyStorageAndSqlite,
  durableSearchCommits,
} from "@/durable/callDurable"
import { getUserSettingsFromDb, updateUserSettingsToDb } from "@/infrastructure/userSettings";
import { safeUpdategithubRepoAccessByUserId,
  getgithubRepoAccessInfo, 
} from "@/infrastructure/githubRepoAccess"
import { validateGitRepoFullName } from "@/common"
import { ValidationError, NotGetAccessTokenError } from "@/types/error"
import {getOrUpdategithubRepoAccessInfo} from "@/providers"
import {testGitHubRepoAcess} from "@/providers"
import { getRepoVaultMetaInfo } from "@/providers";
import {type GithubRepoAccess} from "@/infrastructure/types";
import { NEW_TAG, PER_PAGE, MAX_SEARCH_PAGES } from "@/ConstVar";

const DEFAULT_SEARCH_COMMITS_THRESHOLD = 100;

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

    let githubAccessInfo;
    try {
        githubAccessInfo = await getOrUpdategithubRepoAccessInfo(c);
    } catch (TokenExpiredError) {
        return c.json({ TokenExpiredError: 'GitHub access token and refresh token have expired, Please re-authenticate GitHub APP' }, 401)
    }
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

export async function getRepoFileListHandler(c:Context<{Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
    let githubAccessInfo;
    try {
        githubAccessInfo = await getOrUpdategithubRepoAccessInfo(c);
    } catch (TokenExpiredError) {
        return c.json({ TokenExpiredError: 'GitHub access token and refresh token have expired, Please re-authenticate GitHub APP' }, 401)
    }
    const githubRepoName = githubAccessInfo?.githubRepoName ?? null
    const githubUserName = githubAccessInfo?.githubUserName ?? null
    const vaultPathInRepo = githubAccessInfo?.vaultPathInRepo ?? null
    const vaultName = githubAccessInfo?.vaultName ?? null
    const accessToken = githubAccessInfo?.accessToken ?? null
    if (!githubRepoName || !githubUserName || !vaultPathInRepo || !accessToken) {
        return c.json({ error: 'GitHub repository information is incomplete, Please set GitHub repo info first!' }, 400)
    }
    // vaultPathInRepo/vaultName
    const path = `${vaultPathInRepo}/${vaultName}`
    const folderList = await getRepoFileList(githubUserName, githubRepoName, path, accessToken)
    if (folderList.length === 0) {
      return c.json({folderList: [], fileList: []})
    }
    //Filter out the TitleIndex folder (there may be multiple, take the last one), and other folder lists, and sort other folder lists
    const { titleIndexList, filteredFolderList } = folderList.reduce((acc, item) => {
        if (item.endsWith('/TitleIndex') || item === 'TitleIndex') acc.titleIndexList.push(item)
        else acc.filteredFolderList.push(item)
        return acc
        }, { titleIndexList: [] as string[], filteredFolderList: [] as string[] })
    //Sorted list of folders (markdown files inside)
    filteredFolderList.sort((a, b) => a.localeCompare(b))
    //Assert that the length of titleIndexList is 1, take the last element
    if (titleIndexList.length !== 1) {
        throw new Error('TitleIndex list is not valid')
    }
    const titleIndexFolder = titleIndexList[0]

    //Get the file list and TitleIndex file list of the last folder in parallel
    const [fileList, titleIndexFileList] = await Promise.all([
      getRepoFileList(githubUserName, githubRepoName, filteredFolderList.slice(-1)[0], accessToken, { filesOnly: true }),
      getRepoFileList(githubUserName, githubRepoName, titleIndexFolder, accessToken, { filesOnly: true }),
    ])

    //Sort titleIndexFileList in ascending order and get the last item
    titleIndexFileList.sort((a, b) => a.localeCompare(b))
    const lastTitleIndexFile = titleIndexFileList.slice(-1)[0]

    //get content of lastTitleIndexFile, and parse it in json format (NDJSON: one JSON object per line)
    const lastTitleIndexFileContent = await getFileContent(githubUserName, githubRepoName, `${lastTitleIndexFile}`, accessToken)
    console.log("lastTitleIndexFileContent: ", lastTitleIndexFileContent)
    const lastTitleIndexFileJson = lastTitleIndexFileContent
      .split('\n')
      .filter((line: string) => line.trim() !== '')
      .map((line: string) => JSON.parse(line))


    return c.json({folderList: folderList, filteredFolderList: filteredFolderList, fileList: fileList, titleIndexFileList: titleIndexFileList, lastTitleIndexFile: lastTitleIndexFile, lastTitleIndexFileContent: lastTitleIndexFileJson, 
    lengthOfLastTitleIndex: lastTitleIndexFileJson.length
    })
}

export async function getRepoVaultMetaInfoHandler(c:Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>) {
    const vaultMetaInfo = await getRepoVaultMetaInfo(c);
    return c.json({ vaultMetaInfo });
}

export async function searchCommitsHandler(c:Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<Response> {
  const thresholdParam = c.req.query("threshold");
  const tag = c.req.query("tag");
  let threshold: number;
  if (thresholdParam === undefined || thresholdParam === "") {
    threshold = DEFAULT_SEARCH_COMMITS_THRESHOLD;
  } else {
    const n = Number(thresholdParam);
    if (!Number.isFinite(n) || n < 0) {
      return c.json({ error: "threshold must be a non-negative number" }, 400);
    }
    threshold = Math.floor(n);
  }
  let githubAccessInfo: GithubRepoAccess | null;
  try {
    githubAccessInfo = await getOrUpdategithubRepoAccessInfo(c);
  } catch (TokenExpiredError) {
    return c.json({ TokenExpiredError: 'GitHub access token and refresh token have expired, Please re-authenticate GitHub APP' }, 401);
  }
  if (!githubAccessInfo || !githubAccessInfo.accessToken){
    throw new NotGetAccessTokenError("Fail to get or update accessToken, Please auth GitHub APP first!");
  }

  // First check if githubAccessInfo exists
  if (!githubAccessInfo) {
    return c.json({ error: "GitHub app access record not found" }, 404);
  }
  if (!githubAccessInfo.githubRepoName){
    return c.json({ error: "githubRepoName is not exist" }, 400);
  }
  if (!githubAccessInfo.accessToken || !githubAccessInfo.githubUserName || !githubAccessInfo.githubRepoName) {
    return c.json({ error: "Incomplete GitHub access record" }, 400);
  }
  // get vaultName
  const vaultPathInRepo = githubAccessInfo.vaultPathInRepo;
  const vaultName = githubAccessInfo.vaultName;
  if (!vaultPathInRepo || vaultPathInRepo.trim() === '') {
    return c.json({ error: 'Empty vaultPathInRepo in githubAccessInfo' }, 400);
  }
  console.log("accessToken: ", githubAccessInfo.accessToken)
  const commits = await durableSearchCommits(c, {
    githubUserName: githubAccessInfo.githubUserName,
    repoName: githubAccessInfo.githubRepoName,
    accessToken: githubAccessInfo.accessToken,
    threshold: threshold,
    searchPath: `${vaultPathInRepo}/${vaultName}/`,
    tag: tag,
    perPage: PER_PAGE,
  })
  return c.json({ commits });
}
