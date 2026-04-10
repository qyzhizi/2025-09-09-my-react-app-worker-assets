import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { apiFetch } from "@/common";
import { useSearchParams } from "@/RouterLite";


type SearchCommitItem = {
  sha: string;
  date: string | null;
  author: string;
  message: string;
  source: "search" | "recent";
};

const SearchLogs = () => {
  const [commits, setCommits] = useState<SearchCommitItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { q = "" } = useSearchParams(); // ?q=
  const keyword = q.trim();

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!keyword) {
        setCommits([]);
        setError(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch(
          `/api/github-app/search-commits?commitFilter=${encodeURIComponent(keyword)}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch search results");
        }
        const data = (await response.json()) as { commits?: SearchCommitItem[] };
        setCommits(Array.isArray(data.commits) ? data.commits : []);
      } catch (err) {
        console.error("Failed to fetch search results:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    void fetchSearchResults();
  }, [keyword]);

  const sortedCommits = useMemo(() => {
    return [...commits].sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });
  }, [commits]);

  return (
    <div className="h-fit max-w-4xl mb-2 relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
      <div className="w-full px-3 pt-2 pb-1 text-sm text-gray-500 dark:text-gray-400">
        Search keyword: <span className="font-medium text-gray-700 dark:text-gray-200">{keyword || "-"}</span>
      </div>

      {loading && (
        <div className="w-full flex justify-center items-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500 dark:text-gray-400 text-sm">加载中...</span>
        </div>
      )}

      {!loading && error && (
        <div className="w-full text-center py-8 text-red-500 dark:text-red-400 text-sm">
          Loading failed: {error}
        </div>
      )}

      {!loading && !error && keyword && sortedCommits.length === 0 && (
        <div className="w-full text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          No search results
        </div>
      )}

      {!loading && !error && !keyword && (
        <div className="w-full text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          Enter a keyword in top search bar
        </div>
      )}

      {!loading && !error && sortedCommits.length > 0 && (
        <div className="w-full flex flex-col gap-2 mt-2">
          {sortedCommits.map((item) => (
            <div
              key={item.sha}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {item.date ? new Date(item.date).toLocaleString() : "Unknown date"}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {item.source}
                </span>
              </div>
              <div className="text-sm text-gray-800 dark:text-gray-200 break-words">
                {item.message}
              </div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {item.author} · {item.sha.slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchLogs;
