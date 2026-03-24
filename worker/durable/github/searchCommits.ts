/**
 * searchCommits — 融合 Search API + Commits API 的完整实现
 *
 * 策略：
 *   1. Search API  → 历史 commits（全局 message 搜索，但有索引延迟）
 *   2. Commits API → 最近 commits（实时，本地过滤补偿索引延迟）
 *   3. 本地去重    → 按 sha 合并两路结果
 */

import { NEW_TAG, PER_PAGE, MAX_SEARCH_PAGES } from "@/ConstVar";

// ─────────────────────────────────────────────
// 工具：统一构建请求头
// ─────────────────────────────────────────────
type GitHubToken = string;

type GitHubHeaders = Record<string, string>;

function buildHeaders(token: GitHubToken | null | undefined): GitHubHeaders {
  const headers: GitHubHeaders = {
    Accept: "application/vnd.github.cloak-preview+json",
    // GitHub REST API rejects requests without User-Agent (403)
    "User-Agent": "Cloudflare-Worker",
  };
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}

type GitHubCommitUser = {
  name?: string | null;
  date?: string | null;
};

type GitHubCommitInfo = {
  message?: string | null;
  author?: GitHubCommitUser;
  committer?: GitHubCommitUser;
};

type GitHubCommitItem = {
  sha: string;
  commit?: GitHubCommitInfo;
};

export type SearchCommitResult = {
  sha: string;
  // hash: string;
  // path: string;
  date: string | null;
  author: string;
  message: string;
  source: "search" | "recent";
};

// ─────────────────────────────────────────────
// 工具：将一条 commit item 解析为统一结构
// 返回 null 表示该 commit 不匹配（无法解析 hash）
// ─────────────────────────────────────────────
function parseCommitItem(
  item: GitHubCommitItem,
  tag: string | null,
): Omit<SearchCommitResult, "source"> | null {
  const message = item.commit?.message ?? "";

  // 如果外部传入了 tag，做二次确认（Commits API 路径用得到）
  if (tag && !message.includes(tag)) return null;

  // 自动解析 hash（格式：${tag}: <hash> 或 ${tag} <hash>）
  // const match = message.match(new RegExp(`${tag}[:\s]+([a-f0-9]{6,})`, "i"));
  // const hash = match ? match[1] : null;

  // if (!hash) return null;

  // const prefix2 = hash.substring(0, 2);
  // const prefix4 = hash.substring(2, 4);
  // const rest    = hash.substring(4);

  return {
    sha:    item.sha,
    // hash,
    // path:   `/${searchPath}${prefix2}/${prefix4}/${rest}.md`,
    date:   item.commit?.committer?.date ?? item.commit?.author?.date ?? null,
    author: item.commit?.author?.name ?? item.commit?.committer?.name ?? "unknown",
    message,
  };
}

// ─────────────────────────────────────────────
// 工具：带速率限制重试的 fetch 封装
// ─────────────────────────────────────────────
async function fetchWithRetry(
  url: string,
  headers: GitHubHeaders,
  label = "API",
): Promise<Response> {
  while (true) {
    console.log("fetchWithRetry url: ", url)
    const res = await fetch(url, { headers });
    // console.log("fetchWithRetry res: ", res)

    if (res.status === 403 || res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const resetAt    = res.headers.get("X-RateLimit-Reset");
      const waitSec    = retryAfter
        ? parseInt(retryAfter, 10)
        : resetAt
          ? Math.max(1, parseInt(resetAt, 10) - Math.floor(Date.now() / 1000))
          : 60;
      const body = await res.text();
      console.log(`[${label}] Rate limit detail`, {
        status: res.status,
        url,
        retryAfter,
        resetAt,
        xRateLimitLimit: res.headers.get("X-RateLimit-Limit"),
        xRateLimitRemaining: res.headers.get("X-RateLimit-Remaining"),
        xRateLimitUsed: res.headers.get("X-RateLimit-Used"),
        xRateLimitResource: res.headers.get("X-RateLimit-Resource"),
        body,
      });
      console.warn(`[${label}] Rate limited. Waiting ${waitSec}s …`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue; // 重试
    }

    if (!res.ok) {
      throw new Error(`[${label}] HTTP ${res.status}: ${await res.text()}`);
    }

    return res;
  }
}

type SearchCommitsResponse = {
  items?: GitHubCommitItem[];
};

// ─────────────────────────────────────────────
// 工具：抓取 Search API 单个时间窗口的全部分页
// （最多 10 页 × 100 条 = 1000 条，即 GitHub 硬上限）
//
// 返回：
//   items      — 该窗口内所有原始 commit item
//   saturated  — 窗口是否被撑满（收到了完整的 1000 条）
//                true  → 还有更早的历史，需要继续分段
//                false → 本窗口已返回全部匹配，搜索结束
//   oldestDate — 本窗口最旧一条的 committer-date（用于推进下一窗口的 before）
//
// 判断依据（不依赖 total_count，因其有时为空或不准确）：
//   · 某页返回 < perPage 条        → 数据已取尽，saturated = false
//   · 跑满全部 10 页且每页都是满的 → 窗口撑满，saturated = true，需继续分段
// ─────────────────────────────────────────────
async function fetchSearchWindow({
  baseQuery,
  headers,
  perPage = 100,
  maxItems,
}: {
  baseQuery: string;
  headers: GitHubHeaders;
  perPage?: number;
  maxItems?: number | null;
}): Promise<{ items: GitHubCommitItem[]; saturated: boolean; oldestDate: string | null }> {
  const items: GitHubCommitItem[] = [];
  let   oldestDate = null;
  let   saturated  = false;
  let   page       = 1;

  console.log(`[searchAPI] 窗口请求：${baseQuery}`);

  // GitHub 硬限：search/commits 最多翻到第 ${MAX_SEARCH_PAGES} 页
  while (page <= MAX_SEARCH_PAGES) {
    const q   = encodeURIComponent(baseQuery);
    const url =
      `https://api.github.com/search/commits?q=${q}` +
      `&sort=committer-date&order=desc&per_page=${perPage}&page=${page}`;

    console.log("url: ", url)
    const res  = await fetchWithRetry(url, headers, "searchAPI");
    const data = (await res.json()) as SearchCommitsResponse;
    // console.log("data: ", data)

    if (!data.items || data.items.length === 0) break;
    console.log("data.items.length: ", data.items.length)
    console.log("data items (top 2):", data.items.slice(0, 2));

    items.push(...data.items);

    // 持续更新最旧时间（结果 order=desc，每页末尾是该页最旧）
    const lastItem = data.items[data.items.length - 1];
    const lastDate = lastItem.commit?.committer?.date ?? lastItem.commit?.author?.date;
    if (lastDate) oldestDate = lastDate;

    // 如果达到外部阈值要求的 maxItems，立即停止继续翻页（避免多余请求）。
    if (maxItems != null && items.length >= maxItems) {
      const capped = items.slice(0, maxItems);
      const lastKept = capped[capped.length - 1];
      const keptDate = lastKept.commit?.committer?.date ?? lastKept.commit?.author?.date ?? null;
      // maxItems 截断意味着我们已经“满足停止条件”，不再认为是 saturated。
      return { items: capped, saturated: false, oldestDate: keptDate };
    }

    // 本页返回条数 < perPage → 已是最后一页，数据取尽
    if (data.items.length < perPage) break;

    // 已跑到最后一页（第 10 页）且本页是满的 → 窗口被撑满，还有更多历史
    if (page === MAX_SEARCH_PAGES) {
      saturated = true;
      break;
    }

    page++;
  }

  console.log(
    `[searchAPI] 本窗口获取 ${items.length} 条，` +
    `oldest=${oldestDate}，saturated=${saturated}`
  );

  return { items, saturated, oldestDate };
}

// ─────────────────────────────────────────────
// Part 1：Search API — 历史全局搜索（支持突破 1000 限制）
//
// 原理：
//   GitHub Search API 每次最多返回 1000 条结果。
//   不依赖 total_count（可能为空），而是通过窗口是否被撑满（saturated）
//   来判断是否还有更早的历史数据：
//
//   · saturated = true  → 窗口跑满了 1000 条，用最后一条的 committer-date
//                         作为下一窗口的 before，继续向历史推进
//   · saturated = false → 当前窗口已返回全部匹配，搜索结束
//
//   时间窗口示意：
//     窗口 1：repo:X "${tag}"                          → 满 1000 条，saturated=true
//     窗口 2：repo:X "${tag}" committer-date:<oldest1  → 满 1000 条，saturated=true
//     窗口 3：repo:X "${tag}" committer-date:<oldest2  → 返回 340 条，saturated=false → 结束
// ─────────────────────────────────────────────
async function searchAPI({
  owner,
  repo,
  token      = null,
  searchPath = "",
  tag        = NEW_TAG,
  perPage    = PER_PAGE,
  threshold,
}: {
  owner: string;
  repo: string;
  token?: GitHubToken | null;
  searchPath?: string;
  tag?: string;
  perPage?: number;
  threshold?: number;
}): Promise<{ results: SearchCommitResult[]; latestDate: string | null }> {
  const headers    = buildHeaders(token);
  const allItems: GitHubCommitItem[] = [];
  let   latestDate = null; // 整体最新 commit 的时间（第一窗口第一条）
  void searchPath; // kept for backward-compatible signature

  // 可选阈值：当原始拿到的 commit 数量 >= threshold 时，立即停止继续请求。
  const stopAt = typeof threshold === "number" ? Math.max(0, Math.floor(threshold)) : null;
  if (stopAt != null && stopAt === 0) {
    return { results: [], latestDate };
  }

  const coreQuery = `${tag} repo:${owner}/${repo}`;
  console.log("coreQuery: ", coreQuery);
  let   before    = null;  // 上一窗口最旧 commit 的时间，null 表示首次查询
  let   windowIdx = 0;

  while (true) {
    if (stopAt != null && allItems.length >= stopAt) break;
    windowIdx++;

    // 构造当前窗口的完整 query
    const windowQuery = before
      ? `${coreQuery} committer-date:<${before}`
      : coreQuery;

    console.log(`[searchAPI] ── 窗口 ${windowIdx} ──`);

    const remaining = stopAt != null ? Math.max(0, stopAt - allItems.length) : null;
    const { items, saturated, oldestDate } = await fetchSearchWindow({
      baseQuery: windowQuery,
      headers,
      perPage,
      maxItems: remaining != null && remaining > 0 ? remaining : null,
    });

    if (items.length === 0) {
      console.log(`[searchAPI] 窗口 ${windowIdx} 无结果，搜索完毕。`);
      break;
    }

    // 首窗口第一条即整体最新
    if (windowIdx === 1) {
      latestDate =
        items[0].commit?.committer?.date ??
        items[0].commit?.author?.date ??
        null;
    }

    allItems.push(...items);

    console.log(
      `[searchAPI] 窗口 ${windowIdx} 收集 ${items.length} 条，` +
      `累计 ${allItems.length} 条`
    );

    if (stopAt != null && allItems.length >= stopAt) {
      console.log(`[searchAPI] 达到阈值 stopAt=${stopAt}，停止继续请求。`);
      // 只保留前 stopAt 条原始 items，后续不再继续发请求。
      allItems.splice(stopAt);
      break;
    }

    // 窗口未撑满 → 所有历史已取完，结束
    if (!saturated) {
      console.log(`[searchAPI] 窗口 ${windowIdx} 未撑满，搜索完毕。`);
      break;
    }

    // 窗口撑满 → 还有更早的历史，用 oldestDate 推进 before
    if (!oldestDate) {
      console.warn("[searchAPI] 无法获取 oldestDate，停止分段以避免死循环。");
      break;
    }

    // 防止死循环：before 不能与上一轮相同
    if (before === oldestDate) {
      console.warn(`[searchAPI] oldestDate 未推进（${oldestDate}），停止分段。`);
      break;
    }

    console.log(`[searchAPI] 窗口撑满，继续分段，before=${oldestDate}`);
    before = oldestDate;
  }

  // 将原始 items 解析为统一结构
  const results = allItems
    .map((item): SearchCommitResult | null => {
      // Search API 已经在 q 里限定了 message tag，这里仍需要把 tag 传进去，
      // 否则 parseCommitItem 内部用于提取 hash 的正则会变成匹配 "null ...".
      const parsed = parseCommitItem(item, tag);
      if (!parsed) return null;
      return { ...parsed, source: "search" };
    })
    .filter((x): x is SearchCommitResult => x != null);

  // 全局去重（不同窗口边界可能有重叠的同秒 commit）
  const seen    = new Set<string>();
  const deduped = results.filter(r => {
    if (seen.has(r.sha)) return false;
    seen.add(r.sha);
    return true;
  });

  console.log(
    `[searchAPI] 完成。原始 ${allItems.length} 条 → ` +
    `解析 ${results.length} 条 → 去重后 ${deduped.length} 条`
  );

  return {
    results: stopAt != null ? deduped.slice(0, stopAt) : deduped,
    latestDate,
  };
}

// ─────────────────────────────────────────────
// Commits List API 
// ─────────────────────────────────────────────
async function commitListAPI({
  owner,
  repo,
  token      = null,
  searchPath = "",
  tag        = NEW_TAG,
  since,          // ISO 8601，从此时间起扫描
  perPage    = PER_PAGE,
  maxPages,
  threshold,
}: {
  owner: string;
  repo: string;
  token?: GitHubToken | null;
  searchPath?: string;
  tag?: string;
  since?: string | null;
  perPage?: number;
  maxPages?: number | null;
  threshold?: number | null;
}): Promise<SearchCommitResult[]> {
  // Commit List API 单次扫描最多允许拉取 1000 条（100 × 10）以避免超大分页。
  const COMMIT_LIST_MAX_ITEMS = 1000;
  const headers = buildHeaders(token);
  const results: SearchCommitResult[] = [];
  let   page    = 1;
  const trimmedPath = searchPath.trim().replace(/^\/+|\/+$/g, "");
  let stopAt =
    typeof threshold === "number" ? Math.max(0, Math.floor(threshold)) : null;
  if (stopAt === 0) return [];

  let effectiveMaxPages =
    typeof maxPages === "number" ? Math.max(1, Math.floor(maxPages)) : maxPages;
  if (typeof effectiveMaxPages === "number") {
    const requestedItems = perPage * effectiveMaxPages;
    if (requestedItems > COMMIT_LIST_MAX_ITEMS) {
      effectiveMaxPages = Math.max(1, Math.floor(COMMIT_LIST_MAX_ITEMS / perPage));
      console.warn(
        `[commitListAPI] perPage * maxPages (${requestedItems}) exceeds ${COMMIT_LIST_MAX_ITEMS}, ` +
        `adjusting maxPages to ${effectiveMaxPages}`
      );
    }
  }

  // 当不限制页数时，确保 threshold 在合理范围内，避免一次扫描过多。
  if (effectiveMaxPages == null) {
    if (stopAt == null) {
      effectiveMaxPages = 1;
      console.warn(
        `[commitListAPI] maxPages is not set and threshold is not set; ` +
        `defaulting maxPages to 1 to avoid unbounded scanning`
      );
    } else if (stopAt > COMMIT_LIST_MAX_ITEMS) {
      console.warn(
        `[commitListAPI] threshold (${stopAt}) exceeds ${COMMIT_LIST_MAX_ITEMS}; ` +
        `capping threshold to ${COMMIT_LIST_MAX_ITEMS}`
      );
      stopAt = COMMIT_LIST_MAX_ITEMS;
    }
  }

  while (effectiveMaxPages == null || page <= effectiveMaxPages) {
    const query = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });
    if (since) query.set("since", since);
    if (trimmedPath) query.set("path", trimmedPath);
    const url =
      `https://api.github.com/repos/${owner}/${repo}/commits` +
      `?${query.toString()}`;
    console.log("commit list url: ", url)

    const res   = await fetchWithRetry(url, headers, "commitListAPI");
    const items = (await res.json()) as unknown;

    if (!Array.isArray(items) || items.length === 0) break;

    for (const item of items as GitHubCommitItem[]) {
      const parsed = parseCommitItem(item, tag); // 本地过滤 tag
      if (!parsed) continue;
      results.push({ ...parsed, source: "recent" });
      if (stopAt != null && results.length >= stopAt) {
        return results.slice(0, stopAt);
      }
    }

    if (items.length < perPage) break;
    page++;
  }

  return results;
}

// ─────────────────────────────────────────────
// 主函数：searchCommits
// ─────────────────────────────────────────────
/**
 * @param {object} options
 * @param {string}  options.owner        - 仓库 owner
 * @param {string}  options.repo         - 仓库名
 * @param {string}  [options.token]      - GitHub Personal Access Token（推荐，避免速率限制）
 * @param {string}  [options.searchPath] - 路径前缀，用于生成 path 字段，默认 ""
 * @param {string}  [options.tag]        - commit message 关键词，默认 NEW_TAG
 * @param {number}  [options.perPage]    - 每页条数，默认 100（Search API 最大值）
 * @param {number}  [options.threshold]  - 最多返回多少条匹配的 commit；不传则不限制
 *
 * @returns {Promise<Array<{
 *   sha:     string,
 *   hash:    string,
 *   path:    string,
 *   date:    string,
 *   author:  string,
 *   message: string,
 *   source:  "search" | "recent"
 * }>>}
 */
async function searchCommits({
  owner,
  repo,
  token,
  threshold,
  since,
  searchPath = "",
  tag        = NEW_TAG,
  perPage    = PER_PAGE,
  maxPages   = MAX_SEARCH_PAGES,
}: {
  owner: string;
  repo: string;
  token: GitHubToken;
  since?: string | null;
  searchPath?: string;
  tag?: string;
  perPage?: number;
  threshold?: number;
  maxPages?: number | null;
}): Promise<SearchCommitResult[]> {
  const stopAt: number | undefined =
    typeof threshold === "number" ? Math.max(0, Math.floor(threshold)) : undefined;
  if (stopAt === 0) return [];

  const normalizedPath = searchPath.trim().replace(/^\/+|\/+$/g, "");
  // 仅使用 Commit List API：通过 since + path 过滤服务端范围，再在本地按 message 过滤 tag
  // since 由调用方按需传入；不传则不加 since 过滤。

  console.log(
    `[searchCommits] Commit List API: repo=${owner}/${repo} tag="${tag}" path="${normalizedPath}" since=${since}`
  );
  const results = await commitListAPI({
    owner,
    repo,
    token,
    searchPath: normalizedPath,
    tag,
    since,
    perPage,
    maxPages,
    threshold: stopAt,
  });
  console.log(`[searchCommits] Commit List API → ${results.length} commits (tag filtered)`);
  console.log("search commits results: ", results.slice(0, 2))

  return stopAt !== undefined ? results.slice(0, stopAt) : results;
}

// ─────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────
// ESM
export { searchCommits, searchAPI, commitListAPI };

// CommonJS（如需要，取消注释）
// module.exports = { searchCommits, searchAPI, commitListAPI };


// ─────────────────────────────────────────────
// 使用示例
// ─────────────────────────────────────────────
/*
const commits = await searchCommits({
  owner:      "your-org",
  repo:       "your-repo",
  token:      process.env.GITHUB_TOKEN,
  searchPath: "data/",
  tag:        NEW_TAG,
  perPage:    PER_PAGE,
});

console.log(commits);
// [
//   {
//     sha:     "abc123...",
//     hash:    "a1b2c3d4e5f6...",
//     path:    "/data/a1/b2/c3d4e5f6....md",
//     date:    "2025-06-01T12:00:00Z",
//     author:  "Alice",
//     message: "${NEW_TAG}: a1b2c3d4e5f6...",
//     source:  "search"  // 或 "recent"
//   },
//   ...
// ]
*/