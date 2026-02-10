export interface GithubRepoAccess {
  id: string;
  userId: string;
  githubRepoName: string | null;
  vaultPathInRepo: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
  githubUserName: string | null;
  vaultName: string;
  folderIndexInVault: number;
  fileIndexInFolder: number;
}

export interface CreateGithubRepoAccess {
  id: string;
  userId: string;
  githubRepoName?: string | null;
  vaultPathInRepo?: string | null;
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshToken?: string | null;
  refreshTokenExpiresAt?: Date | null;
  githubUserName?: string | null;
  vaultName?: string;
  folderIndexInVault?: number;
  fileIndexInFolder?: number;
}

export interface UpdateGithubRepoAccess {
  githubRepoName?: string | null;
  vaultPathInRepo?: string | null;
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshToken?: string | null;
  refreshTokenExpiresAt?: Date | null;
  githubUserName?: string | null;
  vaultName?: string;
  folderIndexInVault?: number;
  fileIndexInFolder?: number;
}