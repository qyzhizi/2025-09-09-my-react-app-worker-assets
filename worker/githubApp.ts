import { generateJWT } from '@/common'

interface InstallationDataResponse {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
  repository_selection: "all" | "selected";
}

interface CachedInstallationToken {
  token: string;
  expiresAt: number; // Unix ms
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
}

interface InstallationRepositoriesResponse {
  total_count: number;
  repositories: GitHubRepository[];
}

const installationTokenCache = new Map<
  string,
  CachedInstallationToken
>();

export async function getInstallationData(
  installationId: number | string,
  appId: string,
  privateKey: string
): Promise<InstallationDataResponse> {
  const jwtToken = await generateJWT(appId, privateKey);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Cloudflare-Worker"
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get installation token: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as InstallationDataResponse;


  return data;
}

export async function getInstallationRepositories(
  installationId: string,
  appId: string,
  privateKey: string
): Promise<InstallationRepositoriesResponse> {
  const installationToken = await getCachedInstallationToken(
    installationId,
    appId,
    privateKey
  );

  const response = await fetch(
    "https://api.github.com/installation/repositories",
    {
      headers: {
        Authorization: `token ${installationToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Cloudflare-Worker"
      }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get repositories: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as InstallationRepositoriesResponse;

  if (!Array.isArray(data.repositories)) {
    throw new Error("Invalid GitHub repositories response");
  }

  return {
    total_count: data.total_count,
    repositories: data.repositories.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      html_url: repo.html_url,
      description: repo.description ?? null
    }))
  };
}

export async function getCachedInstallationToken(
  installationId: number | string,
  appId: string,
  privateKey: string
): Promise<string> {
  const key = String(installationId);
  const cached = installationTokenCache.get(key);

  // 预留 60 秒 buffer，避免刚好过期
  const now = Date.now();
  if (cached && cached.expiresAt - now > 60_000) {
    return cached.token;
  }

  // 否则刷新
  const data = await getInstallationData(installationId, appId, privateKey);

  if (!data.token) {
    throw new Error("GitHub did not return installation token");
  }

  const expiresAt = new Date(data.expires_at).getTime();

  installationTokenCache.set(key, {
    token: data.token,
    expiresAt
  });

  return data.token;
}
