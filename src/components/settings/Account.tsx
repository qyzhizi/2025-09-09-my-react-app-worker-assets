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
        const response = await apiFetch('/api/user/info');
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

type OtherSyncVault = {
  vaultName: string;
  status: string;
};

export default function AccountSettingsUI() {
  const [currentSyncVault, setCurrentSyncVault] = useState('');
  const [otherSyncVaults, setOtherSyncVaults] = useState<OtherSyncVault[]>([]);
  const [archivedVaults, setArchivedVaults] = useState<OtherSyncVault[]>([]);
  // loading 用于追踪是否正在从 API 获取数据
  // true = 正在加载，false = 加载完成
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSyncVaults = async () => {
      try {
        // 开始加载，设置 loading 为 true
        setLoading(true);
        
        // 调用 API 获取当前同步文件名 Current Sync File
        const response = await apiFetch('/api/get-sync-vaults');
        
        if (!response.ok) {
          throw new Error('Failed to fetch sync vaults');
        }
        
        const data = await response.json();
        
        // 如果 API 返回的值为空，使用默认值
        setCurrentSyncVault(data.currentSyncVault || '');
        // 确保 otherSyncVaults 是正确的对象数组格式，只显示 active 和 disable 状态的 vault
        if (Array.isArray(data.otherSyncVaults)) {
          // 分离 active/disable 和 archived 状态的 vaults
          const activeVaults = data.otherSyncVaults
            .filter((vault: any) => vault.status === 'active' || vault.status === 'disable')
            .map((vault: any) => ({
              vaultName: vault.vaultName || '',
              status: vault.status || 'active'
            }));
          
          const archived = data.otherSyncVaults
            .filter((vault: any) => vault.status === 'archived')
            .map((vault: any) => ({
              vaultName: vault.vaultName || '',
              status: 'archived'
            }));
          
          setOtherSyncVaults(activeVaults);
          setArchivedVaults(archived);
        } else {
          setOtherSyncVaults([]);
          setArchivedVaults([]);
        }
      } catch (error) {
        console.error('Error fetching sync file name:', error);
      } finally {
        // 无论成功或失败，都将 loading 设置为 false
        setLoading(false);
      }
    };

    fetchSyncVaults();
  }, []); // 空依赖数组表示只在组件首次渲染时执行一次

  const handleSaveChanges = async () => {
    if (!currentSyncVault.trim()) {
      alert('Please enter the current sync file name');
      return;
    }
    // 过滤掉空字符串的 vaultName，并确保格式正确
    const filteredOtherSyncVaults = otherSyncVaults
      .filter(vault => vault.vaultName.trim() !== '')
      .map(vault => ({
        vaultName: vault.vaultName.trim(),
        status: vault.status || 'active'
      }));
    
    console.log('Current Sync Vault:', currentSyncVault);
    console.log('Other Sync Vaults:', filteredOtherSyncVaults);
    
    try {
      const response = await apiFetch('/api/update-sync-vaults', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentSyncVault, "OtherSyncVaults": filteredOtherSyncVaults }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert(error.error);
        throw new Error('Failed to update sync vaults');
      }
      
      const data = await response.json();
      console.log('Sync vaults updated successfully:', data);
      alert('Changes saved successfully!');
    } catch (error) {
      console.error('Error saving changes:', error);
    }
  };

  const handleAddOtherVault = () => {
    setOtherSyncVaults([{ vaultName: '', status: 'active' }, ...otherSyncVaults]);
  };

  const handleUpdateOtherVaults = (index: number, value: string) => {
    const newVaults = [...otherSyncVaults];
    newVaults[index] = {
      ...newVaults[index],
      vaultName: value
    };
    setOtherSyncVaults(newVaults);
  };

  const handleArchiveVault = (index: number) => {
    const vaultName = otherSyncVaults[index].vaultName || 'this vault';
    
    const confirmed = window.confirm(
      `Are you sure you want to archive "${vaultName}"?\n\n` +
      `⚠️ Warning:\n` +
      `• This vault will be archived\n` +
      `• You can restore it later using the restore button\n` +
      `• After restoring, you must run "Pull vaults To Database" to sync the data`
    );
    
    if (confirmed) {
      const vaultToArchive = otherSyncVaults[index];
      const newVaults = otherSyncVaults.filter((_, i) => i !== index);
      setOtherSyncVaults(newVaults);
      // 将归档的 vault 添加到归档列表，状态改为 archived
      setArchivedVaults([...archivedVaults, { ...vaultToArchive, status: 'archived' }]);
    }
  };

  const handleRestoreAllArchived = () => {
    if (archivedVaults.length === 0) {
      alert('No archived vaults to restore.');
      return;
    }

    const confirmed = window.confirm(
      `Restore all ${archivedVaults.length} archived vault(s)?\n\n` +
      `📦 The following vaults will be restored:\n` +
      archivedVaults.map(v => `• ${v.vaultName}`).join('\n') +
      `\n\n⚠️ Remember:\n` +
      `• Restored vaults will be set to "active" status\n` +
      `• You must run "Pull vaults To Database" to sync the data`
    );

    if (confirmed) {
      // 将所有归档的 vaults 恢复，状态改为 active
      const restoredVaults = archivedVaults.map(v => ({ ...v, status: 'active' }));
      setOtherSyncVaults([...restoredVaults, ...otherSyncVaults]);
      setArchivedVaults([]);
      alert(`Successfully restored ${restoredVaults.length} vault(s)!`);
    }
  };

  const handleToggleVaultStatus = (index: number) => {
    const newVaults = [...otherSyncVaults];
    const currentStatus = newVaults[index].status;
    newVaults[index] = {
      ...newVaults[index],
      status: currentStatus === 'active' ? 'disable' : 'active'
    };
    setOtherSyncVaults(newVaults);
  };

  const handlePullFromGithub = () => {
    console.log('Pulling sync vaults to database...');
    alert('Pulling sync vaults to database...');
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
            Sync Settings
          </div>

          {/* Current Sync File Name */}
          <div className="mb-6">
            <label className="block text-gray-900 dark:text-white text-sm font-medium mb-3">
              (1) Current Sync Vault
            </label>
            <input
              type="text"
              placeholder="e.g.: MemoflowVault"
              value={currentSyncVault}
              onChange={(e) => setCurrentSyncVault(e.target.value)}
              // 当正在加载时，禁用输入框，防止用户在数据加载完成前输入
              disabled={loading}
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {/* 当正在加载时，显示加载提示 */}
            {loading && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading sync file name...</p>
            )}
          </div>

          {/* Other Sync File Names */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-gray-900 dark:text-white text-sm font-medium">
                (2) Other Sync Vaults
              </label>
              <div className="flex items-center gap-2">
                {archivedVaults.length > 0 && (
                  <button
                    type="button"
                    onClick={handleRestoreAllArchived}
                    disabled={loading}
                    className="flex items-center justify-center w-8 h-8 bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-700 text-white rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={`Restore ${archivedVaults.length} archived vault(s)`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 512 512" fill="currentColor">
                      <path d="M32 32C14.3 32 0 46.3 0 64S14.3 96 32 96H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H32zM0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160H0zm384 96c0-8.8 7.2-16 16-16h48c8.8 0 16 7.2 16 16s-7.2 16-16 16H400c-8.8 0-16-7.2-16-16z"/>
                    </svg>
                    <span className="ml-1 text-xs font-semibold">{archivedVaults.length}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddOtherVault}
                  disabled={loading}
                  className="flex items-center justify-center w-8 h-8 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add new file path"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" height="16" width="16" viewBox="0 0 448 512" fill="currentColor">
                    <path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32V224H48c-17.7 0-32 14.3-32 32s14.3 32 32 32H192V432c0 17.7 14.3 32 32 32s32-14.3 32-32V288H400c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {otherSyncVaults.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 italic">No file paths added. Click the + button to add one.</p>
              ) : (
                otherSyncVaults.map((vault, index) => {
                  const isDisabled = vault.status === 'disable';
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="e.g.: OtherVault"
                        value={vault.vaultName}
                        onChange={(e) => handleUpdateOtherVaults(index, e.target.value)}
                        disabled={loading || isDisabled}
                        className={`flex-1 border rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400 ${
                          isDisabled
                            ? 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-500 border-gray-300 dark:border-gray-700 cursor-not-allowed opacity-60'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleVaultStatus(index)}
                        disabled={loading}
                        className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isDisabled
                            ? 'bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-700 text-white'
                            : 'bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white'
                        }`}
                        title={isDisabled ? 'Activate this vault' : 'Disable this vault'}
                      >
                        {isDisabled ? (
                          <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 0 512 512" fill="currentColor">
                            <path d="M367.2 412.5L99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192c41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3C435.1 335.9 448 297.5 448 256c0-106-86-192-192-192c-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 0 448 512" fill="currentColor">
                            <path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/>
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveVault(index)}
                        disabled={loading}
                        className="flex items-center justify-center w-8 h-8 bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="archive this vault"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 0 512 512" fill="currentColor">
                          <path d="M32 32C14.3 32 0 46.3 0 64S14.3 96 32 96H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H32zM0 160V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V160H0zM96 288c0-17.7 14.3-32 32-32s32 14.3 32 32s-14.3 32-32 32s-32-14.3-32-32z"/>
                        </svg>
                      </button>
                    </div>
                  );
                })
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
            Pull vaults To Database
          </button>
        </div>
      </div>
    </div>
  );
}