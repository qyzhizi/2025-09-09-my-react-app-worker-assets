import { generateJWT } from '@/common'
import {normalizeGitHubPath} from "@/common";
import {batchGetFileContents} from "@/durable/github/githubGetContent";
import { KV_META_DEFAULTS, KV_META_KEYS } from "@/durable/repository/SqliteRepository";

import {type VaultMetaInfo} from "@/types/provider";

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

type GitHubContentItem = {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink" | "submodule";
};

type GitTreeItem = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
};

interface GitTreeResponse {
  sha: string;
  url: string;
  tree: GitTreeItem[];
  truncated: boolean;
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

  // Reserve 60 seconds of buffer to avoid expiration
  const now = Date.now();
  if (cached && cached.expiresAt - now > 60_000) {
    return cached.token;
  }

  // Otherwise refresh
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

export async function getRepoFileList(
  owner: string,
  repo: string,
  path: string | undefined,
  token: string,
  options?: {
    filesOnly?: boolean; // Whether to return only files
  }
): Promise<string[]> {
  // GitHub API path should not have leading or trailing slashes
  const normalizedPath = path?.replace(/^\/+|\/+$/g, "") ?? "";

  const url = normalizedPath
    ? `https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}`
    : `https://api.github.com/repos/${owner}/${repo}/contents`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Cloudflare-Worker"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API Error:
Status: ${response.status} ${response.statusText}
URL: ${url}
Message: ${errorText}`
    );
  }

  const data = await response.json();

  // if the path is a file, GitHub returns an object instead of an array
  if (!Array.isArray(data)) {
    throw new Error(
      `Path "${normalizedPath || "/"}" is not a directory`
    );
  }

  const items = data as GitHubContentItem[];

  const filtered = options?.filesOnly
    ? items.filter(item => item.type === "file")
    : items;

  return filtered.map(item => item.path);
}

export function getFolderPath(
    vaultPathInRepo: string,
    vaultName: string,
    folderIndex: number 
): string {

    if (!Number.isInteger(folderIndex) || folderIndex < 0) {
        throw new Error(`Invalid folder index: ${folderIndex}`);
    }

    const rawPath = [
        vaultPathInRepo,
        vaultName,
        `${folderIndex}_Folder`
    ].filter(Boolean).join('/');

    return normalizeGitHubPath(rawPath);
}

export function getTitleIndexRootPath(
    vaultPathInRepo: string,
    vaultName: string,
): string {

    const rawPath = [
        vaultPathInRepo,
        vaultName,
        `TitleIndex`
    ].filter(Boolean).join('/');

    return normalizeGitHubPath(rawPath);
}

export async function getFileContent(
    owner: string,
    repo: string,
    filePath: string,
    token: string
): Promise<string> {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${normalizeGitHubPath(filePath)}`;

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Cloudflare-Worker"
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `GitHub API Error: Status: ${response.status} ${response.statusText} URL: ${url} Message: ${errorText}`
        );
    }

    const data: { content?: string } = await response.json();

    if (!data.content) {
        throw new Error(`File "${filePath}" not found`);
    }

    // Decode base64 content
    const content = atob(data.content);
    return content;
}

/**
 * Get multiple file contents in batches (concurrent requests)
 */
export async function getMultipleFilesContent(
    owner: string,
    repo: string,
    filePaths: string[],
    token: string
): Promise<Map<string, string>> {
    const results = await Promise.all(
        filePaths.map(async (filePath) => {
            try {
                const content = await getFileContent(owner, repo, filePath, token);
                return { filePath, content, error: null };
            } catch (error) {
                return { filePath, content: null, error };
            }
        })
    );

    const contentMap = new Map<string, string>();
    for (const result of results) {
        if (result.content !== null) {
            contentMap.set(result.filePath, result.content);
        }
    }

    return contentMap;
}

/**
 *Get the tree SHA of the specified directory (search downwards step by step, without using recursive)
 *
 *For example dirPath = "vault/MyVault/0_Folder"
 *Will request in sequence: root tree → Find the tree SHA of "vault" → Find "MyVault" → Find "0_Folder"
 */
async function getDirectoryTreeSha(
    owner: string,
    repo: string,
    dirPath: string,
    token: string,
    branch: string
): Promise<string> {
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Cloudflare-Worker"
    };

    // Step 1: Get the latest commit SHA of the branch
    const refRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
        { headers }
    );
    if (!refRes.ok) {
        const errorText = await refRes.text();
        throw new Error(
            `Failed to get branch ref: ${refRes.status} ${refRes.statusText} - ${errorText}`
        );
    }
    const refData = await refRes.json() as {
        object: { sha: string; type: string; url: string };
    };
    const commitSha = refData.object.sha;

    // Step 2: Get the root tree (GitHub Trees API supports passing in commit SHA and will automatically dereference to the tree)
    const rootTreeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${commitSha}`,
        { headers }
    );
    if (!rootTreeRes.ok) {
        const errorText = await rootTreeRes.text();
        throw new Error(
            `Failed to get root tree: ${rootTreeRes.status} ${rootTreeRes.statusText} - ${errorText}`
        );
    }
    const rootTree = await rootTreeRes.json() as GitTreeResponse;

    // Step 3: Step down to find the tree SHA of the target directory
    const segments = normalizeGitHubPath(dirPath).split('/');
    let currentTree = rootTree;

    for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const entry = currentTree.tree.find(
            item => item.type === 'tree' && item.path === segment
        );
        if (!entry) {
            throw new Error(
                `Directory not found: "${segments.slice(0, i + 1).join('/')}" (segment "${segment}" not in tree)`
            );
        }

        // The last layer returns SHA directly, without requesting the tree content (the outer layer will request it)
        if (i === segments.length - 1) {
            return entry.sha;
        }

        // The middle layer needs to continue to obtain the next level tree
        const nextTreeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${entry.sha}`,
            { headers }
        );
        if (!nextTreeRes.ok) {
            const errorText = await nextTreeRes.text();
            throw new Error(
                `Failed to get tree for "${segments.slice(0, i + 1).join('/')}": ${nextTreeRes.status} - ${errorText}`
            );
        }
        currentTree = await nextTreeRes.json() as GitTreeResponse;
    }

    // Returns root tree SHA when dirPath is empty
    return rootTree.sha;
}

/**
*Get the contents of the first N Markdown files sorted by file name in the specified directory
 *
 *Only match `.md` files named purely numerically (such as 0.md, 1.md, 2.md), ignoring subdirectories and other files.
 *
 *Process:
 *1. Find the tree SHA of the target directory level by level through Git Trees API
 *2. Get the tree (direct children) of the directory, filter and sort the blobs that meet the conditions
 *3. Get the contents of selected files in batches through GraphQL API (automatically downgrade to REST to get one by one in case of failure)
 *
 *@param owner -warehouse owner
 *@param repo -warehouse name
 *@param dirPath -target directory path, such as "vault/MyVault/0_Folder"
 *@param token -GitHub Installation Access Token
 *@param options.limit -the maximum number of files returned, default 20
 *@param options.branch -branch name, default "main"
*@param options.order -sorting direction, default "asc"
 *@returns array of file path and content
 */
export async function getDirectoryTopFiles(
    owner: string,
    repo: string,
    dirPath: string,
    token: string,
    options?: {
        limit?: number;         //Maximum number of files returned, default 20
        branch?: string;        //Branch name, default main
        order?: 'asc' | 'desc'; //Sorting direction, default asc
    }
): Promise<{ path: string; content: string }[]> {
    const limit = options?.limit ?? 20;
    const branch = options?.branch ?? 'main';
    const order = options?.order ?? 'asc';
    const normalizedDir = normalizeGitHubPath(dirPath);

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Cloudflare-Worker"
    };

    //Step 1: Find the tree SHA of the target directory level by level
    const dirTreeSha = await getDirectoryTreeSha(owner, repo, dirPath, token, branch);

    //Step 2: Get the tree of the target directory (do not use recursive, only include direct children)
    const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${dirTreeSha}`,
        { headers }
    );
    if (!treeRes.ok) {
        const errorText = await treeRes.text();
        throw new Error(
            `Failed to get directory tree: ${treeRes.status} ${treeRes.statusText} - ${errorText}`
        );
    }
    const treeData = await treeRes.json() as GitTreeResponse;

    //Step 3: Only keep blobs (files), exclude subdirectories, and only match md files named purely numerically such as 0.md, 1.md, 2.md
    const blobs = treeData.tree.filter(item => item.type === 'blob' && /^\d+\.md$/.test(item.path));

    //Sort (path in tree is a relative path, that is, file name)
    blobs.sort((a, b) => {
      const cmp = parseInt(a.path) - parseInt(b.path);
      return order === 'asc' ? cmp : -cmp;
    });

    //Get the first limit
    const selected = blobs.slice(0, limit);

    if (selected.length === 0) {
        return [];
    }

    //Step 4: Obtain file contents in batches through GraphQL API with a single request
    const filePaths = selected.map(item =>
        normalizedDir ? `${normalizedDir}/${item.path}` : item.path
    );
    const results = await batchGetFileContents(owner, repo, filePaths, branch, token);

    return results;
}

export async function fetchVaultMetaInfo(
  githubUserName: string,
  githubRepoName: string,
  vaultPathInRepo: string,
  vaultName: string,
  accessToken: string
): Promise<VaultMetaInfo> {
  //Step 1: Get the vault root directory list (single layer, 1 request)
  const vaultPath = `${vaultPathInRepo}/${vaultName}`;
  const folderListBefore = await getRepoFileList(githubUserName, githubRepoName, vaultPath, accessToken);
  //folderList filters out .gitkeep files
  const folderList = folderListBefore.filter(folder => !folder.endsWith('.gitkeep'));

  if (folderList.length === 0) {
    const defaults = Object.fromEntries(
      KV_META_DEFAULTS.map(({ key, value }) => [key, value])
    );
    return {
      folderIndexInVault: defaults[KV_META_KEYS.FOLDER_INDEX_IN_VAULT],
      fileIndexInFolder: defaults[KV_META_KEYS.FILE_INDEX_IN_FOLDER],
      currentTitleIndexCount: defaults[KV_META_KEYS.CURRENT_TITLE_INDEX_COUNT],
      indexOfTitleIndexFiles: defaults[KV_META_KEYS.INDEX_OF_TITLE_INDEX_FILES],
      markdownFileList: [],
      lastTitleIndexFileContentLines: []
    };
  }

  //Filter out the TitleIndex folder and N_Folder folder
  const folderPattern = /(?:^|\/)(\d+)_Folder$/;
  const titleIndexList: string[] = [];
  const filteredFolderList: string[] = [];
  for (const item of folderList) {
    if (item.endsWith('/TitleIndex') || item === 'TitleIndex') {
      titleIndexList.push(item);
    } else if (folderPattern.test(item)) {
      filteredFolderList.push(item);
    }
  }

  //Sort folder list
  filteredFolderList.sort((a, b) => parseInt(a) - parseInt(b));

  //folderIndexInVault: index of the last folder
  const folderIndexInVault = filteredFolderList.length > 0 ? String(filteredFolderList.length - 1) : "0";

  //Step 2: Parallel request -obtain the file list of the last Folder and the file list of TitleIndex at the same time
  const lastFolder = filteredFolderList.length > 0
    ? filteredFolderList[filteredFolderList.length - 1]
    : null;
  const titleIndexFolder = titleIndexList.length === 1 ? titleIndexList[0] : null;

  const [lastFolderFiles, titleIndexFiles] = await Promise.all([
    lastFolder
      ? getRepoFileList(githubUserName, githubRepoName, lastFolder, accessToken, { filesOnly: true })
      : Promise.resolve([]),
    titleIndexFolder
      ? getRepoFileList(githubUserName, githubRepoName, titleIndexFolder, accessToken, { filesOnly: true })
      : Promise.resolve([]),
  ]);

  //Filter out markdown files for lastFolderFiles
  const markdownFileList = lastFolderFiles.filter(file => file.endsWith('.md'));
  const fileIndexInFolder = markdownFileList.length > 0 ? String(markdownFileList.length - 1) : "-1";

  //TitleIndex related
  let currentTitleIndexCount = "0";
  const indexOfTitleIndexFiles = titleIndexFiles.length > 0 ? String(titleIndexFiles.length - 1) : "0";

  let lastTitleIndexFileContentLines : string[] = [];
  if (titleIndexFiles.length > 0) {
    //Sort in ascending order and get the last item
    titleIndexFiles.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    const lastTitleIndexFile = titleIndexFiles[titleIndexFiles.length - 1];

    //Step 3: Get the content of the last TitleIndex file and parse NDJSON (1 request)
    const lastTitleIndexFileContent = await getFileContent(githubUserName, githubRepoName, lastTitleIndexFile, accessToken);
    lastTitleIndexFileContentLines = lastTitleIndexFileContent
      .split('\n')
      .filter((line: string) => line.trim() !== '');
    currentTitleIndexCount = lastTitleIndexFileContentLines.length > 0 ? String(lastTitleIndexFileContentLines.length - 1) : "-1";
  }

  return {
    folderIndexInVault,
    fileIndexInFolder,
    currentTitleIndexCount,
    indexOfTitleIndexFiles,
    markdownFileList,
    lastTitleIndexFileContentLines
  };
}


export async function getDefaultBranchFromGitHubAPI(owner: string, repo: string, token: string): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repo}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Cloudflare-Worker"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `GitHub API Error: Status: ${response.status} ${response.statusText} URL: ${url} Message: ${errorText}`
    );
  }

  const data = await response.json() as { default_branch?: string };
  console.log("GitHub API response for repo info: ", data);

  if (!data.default_branch) {
    throw new Error("GitHub API did not return default_branch");
  }

  return data.default_branch;
  
}


/**
 * Lightweight check for the existence of a path (file or directory) in a GitHub repository.
 * Uses a HEAD request to avoid downloading content, only checks the status code.
 * 
 * @returns true if the path exists, false if not (404)
 * @throws for other HTTP errors (such as 401, 403, 500, etc.)
 */
export async function checkPathExists(
  owner: string,
  repo: string,
  path: string,
  token: string
): Promise<boolean> {
  const normalizedPath = path?.replace(/^\/+|\/+$/g, "") ?? "";

  const url = normalizedPath
    ? `https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}`
    : `https://api.github.com/repos/${owner}/${repo}/contents`;

  const response = await fetch(url, {
    method: "HEAD",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Cloudflare-Worker"
    }
  });

  if (response.ok) {
    return true;
  }

  if (response.status === 404) {
    return false;
  }

  throw new Error(
    `GitHub API Error: Status: ${response.status} ${response.statusText} URL: ${url}`
  );
}

export async function createEmptyFolderPathInRepoIfNotExists(
  githubUserName: string,
  repoName: string,
  folderPath: string,
  accessToken: string,
) {
  const normalizedFolderPath = folderPath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
  const placeholderFilePath = `${normalizedFolderPath}/.gitkeep`;
  // Determine whether the file exists
  const fileExists = await checkPathExists(githubUserName, repoName, placeholderFilePath, accessToken);
    if (fileExists) {
        console.log("File already exists, skipping creation.");
        return;
    }

  console.log("Creating folder in repo at path:", placeholderFilePath);

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // If it is a retry, recheck whether the file has been created by other concurrent requests.
      if (attempt > 0) {
          const alreadyCreated = await checkPathExists(githubUserName, repoName, placeholderFilePath, accessToken);
          if (alreadyCreated) {
              console.log("File was created by a concurrent request, skipping.");
              return;
          }
      }
      const res = await fetch(
          `https://api.github.com/repos/${githubUserName}/${repoName}/contents/${placeholderFilePath}`,
          {
              method: 'PUT',
              headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'User-Agent': 'Hono-Worker',
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  message: `Init folder ${normalizedFolderPath}`,
                  content: Buffer.from('').toString('base64'),
              }),
          }
      );

      // 201 = created, 200 = updated（Idempotent）
      if (res.ok || res.status === 200) {
          return;
      }

      // 409 Conflict: There may be concurrent requests operating on the same file
      if (res.status === 409 && attempt < MAX_RETRIES - 1) {
          console.warn(`SHA conflict (409) creating folder on attempt ${attempt + 1}, retrying...`);
          await new Promise(r => setTimeout(r, 50 * Math.pow(2, attempt)));
          continue;
      }

      // 422 means the file already exists (race creation)
      if (res.status === 422) {
          console.log("File already exists (422), skipping.");
          return;
      }

      const errorText = await res.text();
      console.log("Failed to create folder:", errorText);
      // throw new Error(errorText);
  }
  // If the retries still fail, you can choose to throw an error or log and continue (based on business needs)
  console.error("Failed to create folder after multiple attempts.");
  // throw new Error("Failed to create folder after multiple attempts.");
  throw new Error("Failed to create folder after multiple attempts.");
}
