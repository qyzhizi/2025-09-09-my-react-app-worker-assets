import { useState } from 'react';
import SubmitButton from './SubmitButton';
import MarkdownEditor from './MarkdownEditor'
import { apiFetch } from '@/common';

interface LogInputProps {
  onLogSubmitted?: () => void;
}

function getTitleFromContent(content: string): string {
  let title = '';

  const queMatch = content.match(/^\x20{0,2}#que(?:\x20)(.*)$/m);
  if (queMatch && queMatch[1]) {
    title = queMatch[1].trim();
  } else {
    const headerMatch = content.match(/^\x20{0,2}#(?:\x20)(.*)$/m);
    if (headerMatch && headerMatch[1]) {
      title = headerMatch[1].trim();
    }
  }

  return title;
}

const LogInput = ({ onLogSubmitted }: LogInputProps) => {
  const [log, setLog] = useState('');

  const handleSubmit = async () => {
    if (log.trim() === '') return;
  
    const now = new Date();
    const markdownDate = now.toISOString();
    const extractedTitle = getTitleFromContent(log);
    const title = extractedTitle || '';
    const frontMatter = `<!--\ntitle: ${title}\ndate: ${markdownDate}\n-->\n\n`;
    const fullLog = frontMatter + log;
  
    try {
      const response = await apiFetch('/api/diary-log/addlog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: fullLog }),
      });
  
      const result = await response.json();
  
      if (response.ok) {
        setLog('');
        onLogSubmitted?.();
      } else {
        console.error('Error:', result);
      }
    } catch (error) {
      console.error('Request failed:', error);
    }
  };  

  return (
    <div className="h-fit max-w-4xl mb-2 relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800 px-1 pt-2 rounded-lg border border-gray-200 dark:border-zinc-700">
      {/* Use MarkdownEditor instead of TextAreaBox */}
      <MarkdownEditor value={log} onChange={setLog} />
      <hr className="hr_2 w-full" />
      <SubmitButton onClick={handleSubmit} />
    </div>
  );
};

export default LogInput;
