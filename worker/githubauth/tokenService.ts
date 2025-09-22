// tokenService.ts
/**
 * 该函数用于与 GitHub 交互，使用 code 获取 access token
 * @param clientId GitHub App 的 Client ID
 * @param clientSecret GitHub App 的 Client Secret
 * @param code 授权回调中传回的 code
 * @returns 返回解析后的 token 数据
 */
export async function fetchAccessToken(clientId: string, clientSecret: string, code: string): Promise<any> {
    const tokenUrl = 'https://github.com/login/oauth/access_token'
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)
    params.append('code', code)
    // 如果需要，加入 redirect_uri 参数
    // params.append('redirect_uri', 'your_redirect_uri')
  
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        "User-Agent": "Mozilla/5.0"  // 可能需要这个头
      },
      body: params.toString()
    })
  
    if (!res.ok) {
      const errorMsg = await res.text()
      throw new Error(`获取 access token 失败：${errorMsg}`)
    }
  
    return res.json()
  }

  export async function fetchGitHubUserInfo(accessToken: string): Promise<any> {
    const userUrl = "https://api.github.com/user";
  
    try {
      const response = await fetch(userUrl, {
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${accessToken}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Mozilla/5.0"  // 可能需要这个头
        }
      });
  
      if (!response.ok) {
        throw new Error(`fetchGitHubUserInfo failed: ${response.status} ${response.statusText}`);
      }
  
      return await response.json();
    } catch (error) {
      console.error("fetchGitHubUserInfo failed: ", error);
      throw error;
    }
  }
  