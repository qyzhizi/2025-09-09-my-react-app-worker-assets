// tokenService.ts
/**
 * This function is used to interact with GitHub and use code to obtain access token
 * @param clientId GitHub App Client ID
 * @param clientSecret GitHub App Client Secret
 * @param code The code returned in the authorization callback
 * @returns The parsed token data
 */
export async function fetchAccessToken(clientId: string, clientSecret: string, code: string): Promise<any> {
    const tokenUrl = 'https://github.com/login/oauth/access_token'
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)
    params.append('code', code)
    // If needed, add redirect_uri parameter
    // params.append('redirect_uri', 'your_redirect_uri')
  
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        "User-Agent": "Mozilla/5.0"  // This header may be needed
      },
      body: params.toString()
    })
  
    if (!res.ok) {
      const errorMsg = await res.text()
      throw new Error(`Failed to obtain access token: ${errorMsg}`)
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
          "User-Agent": "Mozilla/5.0"  // This header may be needed
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
  