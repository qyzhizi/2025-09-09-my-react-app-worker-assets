import type { Context } from "hono";
import { getgithubRepoAccessInfo } from "./infrastructure/githubRepoAccess";
import {TokenExpiredError, DBError } from "@/types/error";
import { addOrUpdategithubRepoAccessData } from "@/infrastructure/githubRepoAccess";

interface githubRepoAccessInfo {
  accessToken: string | null;
  githubUserName: string | null;
  githubRepoName: string | null;
  // accessTokenExpiresAt: Date | null;
}

interface OriginGitHubAppTokenInfo {
  access_token: string ;
  expires_in: number ;
  refresh_token: string ;
  refresh_token_expires_in: number;
}

interface GitHubAppTokenInfo {
  accessToken: string ;
  accessTokenExpiresAt: Date ;
  refreshToken: string ;
  refreshTokenExpiresAt: Date;
}

interface testGitHubRepoAcessInfo{
  name: string;
  login: string;
}

/**
 * 类型守卫：判断值是否为 Date 类型
 */
// function isDate(value: unknown): value is Date {
//   return value instanceof Date;
// }

export async function getOrUpdategithubRepoAccessInfo(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>): Promise<githubRepoAccessInfo | null> {
  const gitHubAccessInfo = await getgithubRepoAccessInfo(c);
  const refreshToken = gitHubAccessInfo?.refreshToken ?? null;
  const accessToken = gitHubAccessInfo?.accessToken ?? null;
  const accessTokenExpiresAt = gitHubAccessInfo?.accessTokenExpiresAt ?? null;
  const refreshTokenExpiresAt = gitHubAccessInfo?.refreshTokenExpiresAt ?? null;
  const githubUserName = gitHubAccessInfo?.githubUserName ?? null;
  const githubRepoName = gitHubAccessInfo?.githubRepoName ?? null;
  
  // // 断言检查 accessTokenExpiresAt 是否为 Date 类型
  // if (accessTokenExpiresAt !== null && !isDate(accessTokenExpiresAt)) {
  //   console.warn("accessTokenExpiresAt is not a Date instance:", accessTokenExpiresAt, typeof accessTokenExpiresAt);
  // }
  
  // // 断言检查 refreshTokenExpiresAt 是否为 Date 类型
  // if (accessTokenExpiresAt !== null && !isDate(refreshTokenExpiresAt)) {
  //   console.warn("refreshTokenExpiresAt is not a Date instance:",refreshTokenExpiresAt, typeof refreshTokenExpiresAt);
  // }
  
  // console.log("gitHubAccessInfo: ", gitHubAccessInfo)
  // 获取当前时间
  const currentTime = Date.now(); // utc time
  // console.log("currentTime: ", currentTime)
  // console.log("accessTokenExpiresAt.getTime(): ", accessTokenExpiresAt?.getTime())

  // if access_token has expired
  if (accessTokenExpiresAt && currentTime > accessTokenExpiresAt.getTime()) {
    // Token expired, handle refresh logic here if needed
    console.warn("accessToken has expired")
    if (refreshTokenExpiresAt && currentTime > refreshTokenExpiresAt?.getTime()){
      console.error("refreshToken has expired")
      throw new TokenExpiredError("refreshToken has expired");
    }

    if (refreshToken) {
      const refreshedOriginTokenInfo:OriginGitHubAppTokenInfo = await getGitHubAccessTokenByRefreshToken(c, refreshToken);
      // console.log("test refreshedOriginTokenInfo: ", refreshedOriginTokenInfo);
      const githubAppTokenInfo:GitHubAppTokenInfo = await transformGitHubAppTokenInfo(refreshedOriginTokenInfo)
      // update db
      try {
        await addOrUpdategithubRepoAccessData(c, githubAppTokenInfo)
        console.log("addOrUpdategithubRepoAccessData: ", "success")
      } catch (dbError) {
        console.error('更新 GitHub App 访问数据时出错:', dbError)
        throw new DBError("fail to add or update github app access data ")
      }
  
      return {
        "accessToken": githubAppTokenInfo.accessToken,
        githubUserName,
        githubRepoName
      };
    }
  }
  return {accessToken,githubUserName, githubRepoName }

}

async function getGitHubAccessTokenByRefreshToken(c: Context<{ Bindings: Env, Variables: { userId: string, userName: string} }>, refreshToken: string): Promise<OriginGitHubAppTokenInfo> {
  const token_url = 'https://github.com/login/oauth/access_token'
  const GITHUB_APP_CLIENT_ID = c.env.GITHUB_APP_CLIENT_ID;
  const CLIENT_SECRET = c.env.GITHUB_APP_CLIENT_SECRETS
  
  // 构建 URL-encoded payload
  const params = new URLSearchParams()
  params.append('client_id', GITHUB_APP_CLIENT_ID)
  params.append('client_secret', CLIENT_SECRET)
  params.append('grant_type', 'refresh_token')
  params.append('refresh_token', refreshToken)

  try {
    const response = await fetch(token_url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: params.toString()
    })

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        const errorText = await response.text();
        errorData = { message: errorText };
      }
      console.error(`Network Error, Can't get accesstoken by refresh token: ${JSON.stringify(errorData)}`)
      throw new Error("Network Error, Can't get accesstoken by refresh token, try again later!")
    }

    const data: OriginGitHubAppTokenInfo = await response.json()
    
    if (!data.access_token) {
      console.error(`access_token not in response, response: ${JSON.stringify(data)}`)
      throw new Error("Network Error, Can't get accesstoken by refresh token")
    }

    return data
  } catch (error) {
    console.error("Exception in getGitHubAccessTokenByRefreshToken:", error)
    throw error
  }
}

export async function transformGitHubAppTokenInfo(
  originGithubAppTokenInfo:OriginGitHubAppTokenInfo
): Promise<GitHubAppTokenInfo>{
  const now = Date.now(); // utc time
  const githubAppTokenInfo: GitHubAppTokenInfo= {
    accessToken: originGithubAppTokenInfo.access_token,
    accessTokenExpiresAt: new Date(now + originGithubAppTokenInfo.expires_in * 1000), // 8小时后过期,
    refreshToken: originGithubAppTokenInfo.refresh_token,
    refreshTokenExpiresAt: new Date(now + originGithubAppTokenInfo.refresh_token_expires_in * 1000) // 184天后过期
  };  
  return githubAppTokenInfo
}

export async function testGitHubRepoAcess(accessToken:string, githubUserName:string, githubRepoName:string): Promise<testGitHubRepoAcessInfo>{
  const repoUrl = `https://api.github.com/repos/${githubUserName}/${githubRepoName}`;
  
  try {
    const response = await fetch(repoUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Hono-Worker',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`GitHub API Error: ${response.status} - ${errorText}`);
      throw new Error(`Failed to access GitHub repo: ${response.status}`);
    }

    const repoData = await response.json() as { name: string; owner: { login: string } };
    // console.log("repoData: ", repoData)
    console.log("testGitHubRepoAcess ok: ", repoData.owner.login, repoData.name )
    
    return {
      name: repoData.name,
      login: repoData.owner.login,
    };
  } catch (error) {
    console.error("Exception in testGitHubRepoAcess:", error);
    throw error;
  }
}