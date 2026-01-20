import { useState, useEffect } from 'react';
import { apiFetch } from '@/common';

// 用户信息组件
type UserInfo = {
  id?: string;
  name: string;
  email?: string;
  avatarUrl?: string;
};

function UserInfoCard() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        setLoadingUser(true);
        const response = await fetch('/api/user/info');
        if (!response.ok) {
          throw new Error('Failed to fetch user info');
        }
        const data = await response.json();
        setUserInfo(data);
        setUserError(null);
      } catch (error) {
        console.error('Error fetching user info:', error);
        setUserError('Failed to load user information');
      } finally {
        setLoadingUser(false);
      }
    };

    fetchUserInfo();
  }, []);

  if (loadingUser) {
    return (
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-300 text-sm">Loading user info...</span>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
        <p className="text-red-500 text-sm">{userError}</p>
      </div>
    );
  }

  if (!userInfo) {
    return null;
  }

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-md">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0">
          {userInfo.avatarUrl ? (
            <img
              src={userInfo.avatarUrl}
              alt={userInfo.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" height="32" width="32" viewBox="0 0 448 512">
                <path className="fill-gray-600 dark:fill-gray-400" d="M304 128a80 80 0 1 0 -160 0 80 80 0 1 0 160 0zM96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM49.3 464H398.7c-8.9-63.3-63.3-112-129-112H178.3c-65.7 0-120.1 48.7-129 112zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3z"/>
              </svg>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Username</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{userInfo.name}</p>
          {userInfo.email && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Email</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{userInfo.email}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


export default function AccountSettingsUI() {
  // 同步文件名的状态
  const [currentSyncFilename, setCurrentSyncFilename] = useState('');
  const [otherSyncFilenames, setOtherSyncFilenames] = useState<string[]>([]);
  
  // loadingSyncFile 用于追踪是否正在从 API 获取数据
  // true = 正在加载，false = 加载完成
  const [loadingSyncFile, setLoadingSyncFile] = useState(true);

  // 组件加载时自动获取当前同步文件名
  useEffect(() => {
    const fetchSyncFileNames = async () => {
      try {
        // 开始加载，设置 loading 为 true
        setLoadingSyncFile(true);
        
        // 调用 API 获取当前同步文件名 Current Sync File
        const response = await fetch('/api/get-sync-file-names');
        
        if (!response.ok) {
          throw new Error('Failed to fetch sync file name');
        }
        
        const data = await response.json();
        
        // 如果 API 返回的值为空，使用默认值
        setCurrentSyncFilename(data.current_sync_file || '');
        setOtherSyncFilenames(Array.isArray(data.other_sync_file_names) ? data.other_sync_file_names : []);
        
      } catch (error) {
        console.error('Error fetching sync file name:', error);
        // 如果请求失败，使用默认值
        // setCurrentSyncFilename('/path/default.md');
      } finally {
        // 无论成功或失败，都将 loading 设置为 false
        setLoadingSyncFile(false);
      }
    };

    fetchSyncFileNames();
  }, []); // 空依赖数组表示只在组件首次渲染时执行一次

  const handleSaveChanges = async () => {
    if (!currentSyncFilename.trim()) {
      alert('Please enter the current sync file name');
      return;
    }
    // 过滤掉空字符串
    const filteredOtherSyncFilenames = otherSyncFilenames.filter(filename => filename.trim() !== '');
    console.log('Current Sync Filename:', currentSyncFilename);
    console.log('Other Sync Filenames:', filteredOtherSyncFilenames);
    const response = await apiFetch('/api/update-sync-file-names', {
      method: 'POST',
      body: JSON.stringify({ current_sync_file: currentSyncFilename, other_sync_file_names: filteredOtherSyncFilenames }),
    });
    if (!response.ok) {
      const error = await response.json();
      alert(error.error);
      throw new Error('Failed to update sync file name');
    }
    const data = await response.json();
    console.log('Sync file name updated successfully:', data);
    alert('Changes saved successfully!');
  };

  // 添加新的文件路径行
  const handleAddFilename = () => {
    setOtherSyncFilenames(['', ...otherSyncFilenames]);
  };

  // 更新指定索引的文件路径
  const handleUpdateFilename = (index: number, value: string) => {
    const newFilenames = [...otherSyncFilenames];
    newFilenames[index] = value;
    setOtherSyncFilenames(newFilenames);
  };

  // 删除指定索引的文件路径
  const handleDeleteFilename = (index: number) => {
    const newFilenames = otherSyncFilenames.filter((_, i) => i !== index);
    setOtherSyncFilenames(newFilenames);
  };

  const handlePullFromGithub = () => {
    console.log('Pulling current sync file to database...');
    alert('Pulling current sync file to database...');
  };

  return (
    <div className="min-h-screen bg-transparent transition-colors duration-300">
      <div className="p-2 max-w-2xl mx-auto bg-transparent rounded-lg transition-colors duration-300">
        
        {/* Account Icon */}
        <div className="flex justify-center mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" height="50" width="50" viewBox="0 0 448 512">
            <path className="fill-gray-900 dark:fill-white" d="M304 128a80 80 0 1 0 -160 0 80 80 0 1 0 160 0zM96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM49.3 464H398.7c-8.9-63.3-63.3-112-129-112H178.3c-65.7 0-120.1 48.7-129 112zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3z"/>
          </svg>
        </div>

        <hr className="border-t border-gray-200 dark:border-gray-700 my-6" />

        {/* Account Info Section */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
            Account Info
          </div>

          {/* User Info Component */}
          <UserInfoCard />
        </div>

        <hr className="border-t border-gray-200 dark:border-gray-700 my-6" />

        {/* Sync File Settings Section */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
            Sync File Settings
          </div>

          {/* Current Sync File Name */}
          <div className="mb-6">
            <label className="block text-gray-900 dark:text-white text-sm font-medium mb-3">
              (1) Current Sync File Name
            </label>
            <input
              type="text"
              placeholder="e.g.: /path/1.md"
              value={currentSyncFilename}
              onChange={(e) => setCurrentSyncFilename(e.target.value)}
              // 当正在加载时，禁用输入框，防止用户在数据加载完成前输入
              disabled={loadingSyncFile}
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {/* 当正在加载时，显示加载提示 */}
            {loadingSyncFile && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading sync file name...</p>
            )}
          </div>

          {/* Other Sync File Names */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-gray-900 dark:text-white text-sm font-medium">
                (2) Other Sync File Names
              </label>
              <button
                type="button"
                onClick={handleAddFilename}
                disabled={loadingSyncFile}
                className="flex items-center justify-center w-8 h-8 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Add new file path"
              >
                <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 448 512" fill="currentColor">
                  <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/>
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              {otherSyncFilenames.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No file paths added. Click the + button to add one.</p>
              ) : (
                otherSyncFilenames.map((filename, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g.: /path/file.md"
                      value={filename}
                      onChange={(e) => handleUpdateFilename(index, e.target.value)}
                      disabled={loadingSyncFile}
                      className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteFilename(index)}
                      disabled={loadingSyncFile}
                      className="flex items-center justify-center w-8 h-8 bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete this file path"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 0 448 512" fill="currentColor">
                        <path d="M135.2 17.7C140.6 6.8 151.7 0 163.8 0H284.2c12.1 0 23.2 6.8 28.6 17.7L320 32h96c17.7 0 32 14.3 32 32s-14.3 32-32 32H32C14.3 96 0 81.7 0 64S14.3 32 32 32h96l7.2-14.3zM32 128H416V448c0 35.3-28.7 64-64 64H96c-35.3 0-64-28.7-64-64V128zM111 257c-9.4 9.4-9.4 24.6 0 33.9l47 47-47 47c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l47-47 47 47c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-47-47 47-47c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-47 47-47-47c-9.4-9.4-24.6-9.4-33.9 0z"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Save Changes Button */}
          <button
            onClick={handleSaveChanges}
            className="w-full bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md text-sm transition-colors duration-200 shadow-sm"
          >
            Save Changes
          </button>
        </div>

        <hr className="border-t border-gray-200 dark:border-gray-700 my-6" />

        {/* Action Section */}
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-4">
            Action
          </div>
          
          <button
            onClick={handlePullFromGithub}
            className="w-full bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white font-medium py-3 px-6 rounded-md text-sm transition-colors duration-200 shadow-sm"
          >
            Pull Current Sync File To Database
          </button>
        </div>
      </div>
    </div>
  );
}