import { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/common';
import { Loader2 } from 'lucide-react';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

interface LogItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface LogListProps {
  refreshFlag?: number;
}

const LogList = ({ refreshFlag }: LogListProps) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch('/api/article/content/list?page=1&pageSize=20');
        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }
        const data = await response.json();
        setLogs(data as LogItem[]);
      } catch (err) {
        console.error('Failed to fetch logs:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, [refreshFlag]);

  const renderedLogs = useMemo(() => {
    return logs.map((log) => ({
      ...log,
      html: micromark(log.content, {
        extensions: [gfm()],
        htmlExtensions: [gfmHtml()],
      }),
    }));
  }, [logs]);

  if (loading) {
    return (
      <div className="w-full flex justify-center items-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500 dark:text-gray-400 text-sm">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full text-center py-8 text-red-500 dark:text-red-400 text-sm">
        Loading failed: {error}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="w-full text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
        No logs available
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-2 mt-2">
      {renderedLogs.map((log) => (
        <div
          key={log.id}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(log.createdAt).toLocaleString()}
            </span>
          </div>
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words"
            dangerouslySetInnerHTML={{ __html: log.html }}
          />
        </div>
      ))}
    </div>
  );
};

export default LogList;
