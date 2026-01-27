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
      <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-300 text-sm">Loading user info...</span>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
        <p className="text-red-500 text-sm">{userError}</p>
      </div>
    );
  }

  if (!userInfo) {
    return null;
  }

  return (
    <div className="mb-4 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
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
  return (
    <div className="h-full bg-transparent transition-colors duration-300">
      <div className="p-2 max-w-2xl mx-auto bg-transparent rounded-lg transition-colors duration-300">
        
        {/* Account Info Section */}
        <div className="mb-2">
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
            Account Info
          </div>

          {/* User Info Component */}
          <UserInfoCard />
        </div>

      </div>
    </div>
  );
}