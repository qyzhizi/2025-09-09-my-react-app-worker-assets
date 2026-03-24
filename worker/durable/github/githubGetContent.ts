import {normalizeGitHubPath} from "../../common";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";
const GITHUB_RAW_REST = "https://raw.githubusercontent.com";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const GRAPHQL_CHUNK_SIZE = 20;  // DO subrequest limit=1000, 30s CPU; GitHub GraphQL complexity safe zone
const MAX_CONCURRENCY = 3;     // REST fallback concurrency; DO has 30s CPU, but stay conservative for GitHub rate limit

/**
 *High-performance batch retrieval of GitHub file contents
 */
export async function batchGetFileContents(
  owner: string,
  repo: string,
  filePaths: string[],
  branch: string,
  token: string,
): Promise<{ path: string; content: string }[]> {
  if (!filePaths.length) return [];

  const results: { path: string; content: string }[] = [];
  const missingForFallback: string[] = [];

  //1️⃣ Sharding GraphQL
  const chunks = chunkArray(filePaths, GRAPHQL_CHUNK_SIZE);

  for (const chunk of chunks) {
    const { okResults, fallbackList } = await fetchByGraphQLChunk(
      owner,
      repo,
      chunk,
      branch,
      token,
    );

    results.push(...okResults);
    missingForFallback.push(...fallbackList);
  }

  //2️⃣ REST fallback (with concurrency control)
  const fallbackResults = await runWithConcurrency(
    missingForFallback,
    MAX_CONCURRENCY,
    async (path) => {
      const content = await fetchByRestRaw(
        owner,
        repo,
        path,
        token,
        branch
      );
      if (content != null) {
        return { path, content };
      }
      return null;
    }
  );

  results.push(
    ...fallbackResults.filter(Boolean) as { path: string; content: string }[]
  );

  return results;
}

async function fetchByGraphQLChunk(
  owner: string,
  repo: string,
  filePaths: string[],
  branch: string,
  token: string,
) {
  const fileQueries = filePaths.map((filePath, index) => {
    const ref = branch ?? "HEAD";
    console.log("ref: ", ref);
    const expression = `${ref}:${normalizeGitHubPath(filePath)}`;
    console.log(`GraphQL expression[${index}]: "${expression}" (original path: "${filePath}")`);
    return `
      file${index}: object(expression: ${JSON.stringify(expression)}) {
        ... on Blob {
          text
          byteSize
        }
      }
    `;
  });

  const query = `
    query {
      repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) {
        ${fileQueries.join("\n")}
      }
    }
  `;

  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "memoflow-worker"
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    // GraphQL API returned an error (e.g. 403 Forbidden for some tokens),
    // fall back to REST for all files in this chunk
    console.warn(`GraphQL failed with status ${res.status}, falling back to REST for ${filePaths.length} files`);
    //Print error message
    const errorText = await res.text();
    console.error(`GraphQL error: ${errorText}`);
    return { okResults: [], fallbackList: [...filePaths] };
  }

  const json = await res.json() as {
    data?: {
      repository?: {
        [key: string]: {
          text?: string;
          byteSize?: number;
        }
      }
    }
  };

  const okResults: { path: string; content: string }[] = [];
  const fallbackList: string[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const file = json?.data?.repository?.[`file${i}`];

    if (!file) {
      fallbackList.push(filePaths[i]);
      continue;
    }

    if (file.text != null) {
      okResults.push({ path: filePaths[i], content: file.text });
    } else {
      fallbackList.push(filePaths[i]);
    }
  }

  return { okResults, fallbackList };
}

/**
 *REST raw fallback
 *>10MB automatically skipped
 */
async function fetchByRestRaw(
  owner: string,
  repo: string,
  path: string,
  token: string,
  branch: string
): Promise<string | null> {
  const url = `${GITHUB_RAW_REST}/${owner}/${repo}/${branch}/${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "memoflow-worker"
    }
  });

  if (!res.ok) return null;

  const contentLength = Number(res.headers.get("content-length") || 0);

  if (contentLength > MAX_FILE_SIZE) {
    return null;
  }

  //Streaming reading prevents memory explosion
  const reader = res.body?.getReader();
  if (!reader) return null;

  let received = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    received += value.length;

    if (received > MAX_FILE_SIZE) {
      return null;
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(received);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(merged);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R | null>
): Promise<(R | null)[]> {
  const results: (R | null)[] = [];
  const queue = [...items];

  const runners = Array.from({ length: concurrency }).map(async () => {
    while (queue.length) {
      const item = queue.shift();
      if (!item) return;
      results.push(await worker(item));
    }
  });

  await Promise.all(runners);
  return results;
}
