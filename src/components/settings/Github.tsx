import { useState } from 'react';

export default function GithubSettings() {
  const [gitRepoPath, setGitRepoPath] = useState('');

  const handleSave = () => {
    if (!gitRepoPath.trim()) {
      alert('Please enter a Git repository path');
      return;
    }
    console.log('Saving repo path:', gitRepoPath);
    alert('Changes saved! Testing connection...');
  };

  return (
    <div className="min-h-screen bg-transparent transition-colors duration-300">
      <div className="max-w-2xl mx-auto bg-transparent rounded-lg p-2 transition-colors duration-300">
        {/* GitHub Icon */}
        <div className="flex justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" height="50" width="50" viewBox="0 0 448 512">
            <path className="fill-gray-900 dark:fill-white" d="M448 96c0-35.3-28.7-64-64-64H64C28.7 32 0 60.7 0 96V416c0 35.3 28.7 64 64 64H384c35.3 0 64-28.7 64-64V96zM265.8 407.7c0-1.8 0-6 .1-11.6c.1-11.4 .1-28.8 .1-43.7c0-15.6-5.2-25.5-11.3-30.7c37-4.1 76-9.2 76-73.1c0-18.2-6.5-27.3-17.1-39c1.7-4.3 7.4-22-1.7-45c-13.9-4.3-45.7 17.9-45.7 17.9c-13.2-3.7-27.5-5.6-41.6-5.6s-28.4 1.9-41.6 5.6c0 0-31.8-22.2-45.7-17.9c-9.1 22.9-3.5 40.6-1.7 45c-10.6 11.7-15.6 20.8-15.6 39c0 63.6 37.3 69 74.3 73.1c-4.8 4.3-9.1 11.7-10.6 22.3c-9.5 4.3-33.8 11.7-48.3-13.9c-9.1-15.8-25.5-17.1-25.5-17.1c-16.2-.2-1.1 10.2-1.1 10.2c10.8 5 18.4 24.2 18.4 24.2c9.7 29.7 56.1 19.7 56.1 19.7c0 9 .1 21.7 .1 30.6c0 4.8 .1 8.6 .1 10c0 4.3-3 9.5-11.5 8C106 393.6 59.8 330.8 59.8 257.4c0-91.8 70.2-161.5 162-161.5s166.2 69.7 166.2 161.5c.1 73.4-44.7 136.3-110.7 158.3c-8.4 1.5-11.5-3.7-11.5-8zm-90.5-54.8c-.2-1.5 1.1-2.8 3-3.2c1.9-.2 3.7 .6 3.9 1.9c.3 1.3-1 2.6-3 3c-1.9 .4-3.7-.4-3.9-1.7zm-9.1 3.2c-2.2 .2-3.7-.9-3.7-2.4c0-1.3 1.5-2.4 3.5-2.4c1.9-.2 3.7 .9 3.7 2.4c0 1.3-1.5 2.4-3.5 2.4zm-14.3-2.2c-1.9-.4-3.2-1.9-2.8-3.2s2.4-1.9 4.1-1.5c2 .6 3.3 2.1 2.8 3.4c-.4 1.3-2.4 1.9-4.1 1.3zm-12.5-7.3c-1.5-1.3-1.9-3.2-.9-4.1c.9-1.1 2.8-.9 4.3 .6c1.3 1.3 1.8 3.3 .9 4.1c-.9 1.1-2.8 .9-4.3-.6zm-8.5-10c-1.1-1.5-1.1-3.2 0-3.9c1.1-.9 2.8-.2 3.7 1.3c1.1 1.5 1.1 3.3 0 4.1c-.9 .6-2.6 0-3.7-1.5zm-6.3-8.8c-1.1-1.3-1.3-2.8-.4-3.5c.9-.9 2.4-.4 3.5 .6c1.1 1.3 1.3 2.8 .4 3.5c-.9 .9-2.4 .4-3.5-.6zm-6-6.4c-1.3-.6-1.9-1.7-1.5-2.6c.4-.6 1.5-.9 2.8-.4c1.3 .7 1.9 1.8 1.5 2.6c-.4 .9-1.7 1.1-2.8 .4z"/>
          </svg>
        </div>

        <hr className="border-t border-gray-200 dark:border-gray-700 my-6" />

        {/* Basic Section */}
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
          Basic
        </div>

        {/* Step 1 */}
        <div className="text-gray-900 dark:text-white text-sm font-medium mb-3">
          (1) Bind GitHub Repo
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <a
            href="/v1/diary-log/github-authenticate"
            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-center py-2.5 px-4 rounded-md text-sm font-medium transition-colors duration-200"
          >
            Bind GitHub Repo
          </a>
          <a
            href="/v1/diary-log/github-app-authenticate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-center py-2.5 px-4 rounded-md text-sm font-medium transition-colors duration-200"
          >
            Authorization GitHub App
          </a>
        </div>

        {/* Step 2 */}
        <div className="text-gray-900 dark:text-white text-sm font-medium mb-3">
          (2) Git Repo Path
        </div>
        <input
          type="text"
          placeholder="e.g.: Username/RepoName"
          value={gitRepoPath}
          onChange={(e) => setGitRepoPath(e.target.value)}
          className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400"
        />

        <hr className="border-t border-gray-200 dark:border-gray-700 my-6" />

        {/* Save Button */}
        <button
          onClick={handleSave}
          className="w-full bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md text-sm transition-colors duration-200 shadow-sm"
        >
          Save Changes and Test Connection
        </button>
      </div>
    </div>
  );
}