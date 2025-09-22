import React, { useState } from 'react';

interface ApiResponse {
    error?: string;
    message?: string;
}
  
// 新组件：用来设置 GitHub 仓库名
export const SetGitHubRepo = () => {
    const [repo, setRepo] = useState('');
    const [status, setStatus] = useState<string | null>(null);
  
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setRepo(e.target.value);
    };
  
    const handleSetRepo = async () => {
      if (!repo.trim()) return;
      try {
        const response = await fetch('/api/github/set-repo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ githubRepoName: repo.trim() }),
        });
        const data: ApiResponse = await response.json();
  
        // 兼容后端返回的 message 或 error 字段
        const errorMsg = data.error ?? data.message ?? '设置失败';
        if (response.ok) {
          setStatus('仓库名设置成功！');
        } else {
          setStatus(`错误：${errorMsg}`);
        }
      } catch (err: any) {
        console.error('Error:', err);
        setStatus(`网络请求失败：${err.message || err}`);
      }
    };
  
    return (
      <div className="mb-2 w-full flex items-center space-x-2 bg-white dark:bg-zinc-800 px-2 py-1 rounded-lg border border-gray-200 dark:border-zinc-700">
        <input
          type="text"
          placeholder="输入 GitHub 仓库名"
          value={repo}
          onChange={handleChange}
          className="flex-grow bg-transparent focus:outline-none"
        />
        <button
          onClick={handleSetRepo}
          className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600"
        >
          设置
        </button>
        {status && <span className="text-sm text-gray-500">{status}</span>}
      </div>
    );
};

export default SetGitHubRepo;