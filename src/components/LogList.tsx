import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { apiFetch } from '@/common';
import { Loader2, MoreVertical } from 'lucide-react';
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
  onEdit?: (log: LogItem) => void;
  onDelete?: (id: string) => void;
}

function stripLeadingMetaComment(markdown: string): string {
  return markdown.replace(/^\s*<!--[\s\S]*?-->\s*/u, '');
}

const FOLD_HEIGHT = 200; // px threshold

function LogEntryCard({
  log,
  onEdit,
  onDelete,
}: {
  log: LogItem & { html: string };
  onEdit?: (log: LogItem) => void;
  onDelete?: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [folded, setFolded] = useState(true);
  const [needsFold, setNeedsFold] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Measure content height to decide if fold/unfold is needed
  useEffect(() => {
    if (contentRef.current) {
      const fullHeight = contentRef.current.scrollHeight;
      setNeedsFold(fullHeight > FOLD_HEIGHT);
    }
  }, [log.html]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(log.content);
    setMenuOpen(false);
  }, [log.content]);

  const handleEdit = useCallback(() => {
    onEdit?.(log);
    setMenuOpen(false);
  }, [log, onEdit]);

  const handleDelete = useCallback(() => {
    onDelete?.(log.id);
    setMenuOpen(false);
  }, [log.id, onDelete]);

  return (
    <div className="relative w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {new Date(log.createdAt).toLocaleString()}
        </span>

        {/* Dropdown menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-400 dark:text-gray-500 transition-colors"
            aria-label="更多操作"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 min-w-[96px] rounded-md shadow-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-1 text-sm">
              <button
                onClick={handleCopy}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
              >
                复制
              </button>
              <button
                onClick={handleEdit}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
              >
                编辑
              </button>
              <button
                onClick={handleDelete}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700 text-red-500 dark:text-red-400"
              >
                删除
              </button>
              {needsFold && (
                <>
                  <div className="my-1 border-t border-gray-100 dark:border-zinc-700" />
                  {folded ? (
                    <button
                      onClick={() => { setFolded(false); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
                    >
                      展开
                    </button>
                  ) : (
                    <button
                      onClick={() => { setFolded(true); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300"
                    >
                      收起
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content with fold */}
      <div
        className="relative overflow-hidden transition-all duration-300"
        style={{ maxHeight: needsFold && folded ? `${FOLD_HEIGHT}px` : undefined }}
      >
        <div
          ref={contentRef}
          className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-200 break-words"
          dangerouslySetInnerHTML={{ __html: log.html }}
        />

        {/* Fade mask when folded */}
        {needsFold && folded && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-gray-50 dark:from-zinc-900 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Inline unfold button below content */}
      {needsFold && (
        <button
          onClick={() => setFolded((v) => !v)}
          className="mt-1 text-xs text-blue-500 dark:text-blue-400 hover:underline"
        >
          {folded ? '展开全文 ▾' : '收起 ▴'}
        </button>
      )}
    </div>
  );
}

const LogList = ({ refreshFlag, onEdit, onDelete }: LogListProps) => {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiFetch('/api/article/content/list?page=1&pageSize=20');
        if (!response.ok) throw new Error('Failed to fetch logs');
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
      html: micromark(stripLeadingMetaComment(log.content), {
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
        <LogEntryCard
          key={log.id}
          log={log}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default LogList;