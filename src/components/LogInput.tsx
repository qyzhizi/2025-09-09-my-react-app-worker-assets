import React, { useState } from 'react';
import TextAreaBox from './TextAreaBox';
import SubmitButton from './SubmitButton';
import { SetGitHubRepo } from './SetRepoName'
const LogInput = () => {
  const [log, setLog] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLog(e.target.value);
  };

  const handleSubmit = async () => {
    // console.log('Log submitted:', log);
    if (log.trim() === '') {
      // console.log('log is none');
      return;
    }
  
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    const fullLog = `## ${dateStr} ${timeStr}:\n` + log;
    // console.log('fullLog submitted:', fullLog);
  
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
        // 如果你有类似 autoResize('log') 的功能，可以在这里调用
      } else {
        console.error('Error:', result);
      }
    } catch (error) {
      console.error('Request failed:', error);
    }
  };  

  return (
    <div
      className="mb-2 relative w-full flex flex-col justify-start items-start bg-white dark:bg-zinc-800 px-1 pt-2 rounded-lg border border-gray-200 dark:border-zinc-700"
      tabIndex={0}
    >
      <SetGitHubRepo />
      <TextAreaBox value={log} onChange={handleChange} />
      <hr className="hr_2 w-full" />
      <SubmitButton onClick={handleSubmit} />
    </div>
  );
};

export default LogInput;
