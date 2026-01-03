import { useState } from 'react';
import SubmitButton from './SubmitButton';
import { SetGitHubRepo } from './SetRepoName'
import MarkdownEditor from './MarkdownEditor'

const LogInput = () => {
  const [log, setLog] = useState('');

  const handleSubmit = async () => {
    if (log.trim() === '') return;
  
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    const fullLog = `## ${dateStr} ${timeStr}:\n` + log;
  
    try {
      const response = await fetch('/api/diary-log/addlog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: fullLog }),
      });
  
      const result = await response.json();
  
      if (response.ok) {
        setLog('');
      } else {
        console.error('Error:', result);
      }
    } catch (error) {
      console.error('Request failed:', error);
    }
  };  

  return (
    <div
      className="mb-2 relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800 px-1 pt-2 rounded-lg border border-gray-200 dark:border-zinc-700 "
      tabIndex={0}
    >
      <SetGitHubRepo />
      {/* 用 MarkdownEditor 替代 TextAreaBox */}
      {/*  */}
      <MarkdownEditor value={log} onChange={setLog} />
      <hr className="hr_2 w-full" />
      <SubmitButton onClick={handleSubmit} />
    </div>
  );
};

export default LogInput;
