// LogEditModal.tsx
import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import SubmitButton from './SubmitButton';
import MarkdownEditor from './MarkdownEditor';
import { apiFetch } from '@/common';

interface LogItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

interface LogEditModalProps {
  log: LogItem;
  onClose: () => void;
  onSaved?: () => void;
}

function stripLeadingMetaComment(markdown: string): string {
  return markdown.replace(/^\s*<!--[\s\S]*?-->\s*/u, '');
}

function getTitleFromContent(content: string): string {
  const queMatch = content.match(/^\x20{0,2}#que(?:\x20)(.*)$/m);
  if (queMatch?.[1]) return queMatch[1].trim();
  const headerMatch = content.match(/^\x20{0,2}#(?:\x20)(.*)$/m);
  if (headerMatch?.[1]) return headerMatch[1].trim();
  return '';
}

const LogEditModal = ({ log, onClose, onSaved }: LogEditModalProps) => {
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  // 去掉 frontmatter，只编辑正文
  useEffect(() => {
    setContent(stripLeadingMetaComment(log.content));
  }, [log]);

  const handleSave = async () => {
    if (content.trim() === '') return;
    setSaving(true);

    const markdownDate = new Date().toISOString();
    const extractedTitle = getTitleFromContent(content);
    const frontMatter = `<!--\ntitle: ${extractedTitle}\ndate: ${markdownDate}\n-->\n\n`;
    const fullContent = frontMatter + content;

    try {
      const res = await apiFetch(`/api/diary-log/${log.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: fullContent }),
      });
      if (!res.ok) throw new Error('保存失败');
      onSaved?.();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 flex flex-col bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 shadow-2xl max-h-[90vh]">
        {/* Modal 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-zinc-700 shrink-0">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            编辑日志
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-400 dark:text-gray-500 transition-colors"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 编辑区 */}
        <div className="flex-1 overflow-y-auto px-1 pt-2 min-h-0">
          <MarkdownEditor value={content} onChange={setContent} />
        </div>

        <hr className="hr_2 w-full shrink-0" />

        {/* 底部操作 */}
        <div className="shrink-0 px-1 pb-1">
          <SubmitButton onClick={handleSave} disabled={saving} />
        </div>
      </div>
    </div>
  );
};

export default LogEditModal;