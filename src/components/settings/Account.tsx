import { useState, useEffect } from 'react';
import { EditAccountModal } from './EditAccount';
import PasswordChangeModal from './ChangePassword';

// 用户信息组件
type UserInfo = {
  avatar?: string;
  username: string;
  email?: string;
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
          {userInfo.avatar ? (
            <img
              src={userInfo.avatar}
              alt={userInfo.username}
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
          <p className="text-lg font-semibold text-gray-900 dark:text-white">{userInfo.username}</p>
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
  const [currentSyncFilename, setCurrentSyncFilename] = useState('');
  const [otherSyncFilenames, setOtherSyncFilenames] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);


  const handleSaveChanges = () => {
    if (!currentSyncFilename.trim()) {
      alert('Please enter the current sync file name');
      return;
    }
    console.log('Current Sync Filename:', currentSyncFilename);
    console.log('Other Sync Filenames:', otherSyncFilenames);
    alert('Changes saved successfully!');
  };

  const handlePullFromGithub = () => {
    console.log('Pulling current sync file to database...');
    alert('Pulling current sync file to database...');
  };

  const handleEditAccount = () => {
    setIsEditModalOpen(true);
  };

  const handleChangePassword = () => {
    setIsPasswordModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-transparent transition-colors duration-300">
      <div className="p-2 max-w-2xl mx-auto bg-transparent rounded-lg  transition-colors duration-300">
        
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
          
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <button
              onClick={handleEditAccount}
              className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-center py-2.5 px-4 rounded-md text-sm font-medium transition-colors duration-200"
            >
              Edit
            </button>
            <button
              onClick={handleChangePassword}
              className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white text-center py-2.5 px-4 rounded-md text-sm font-medium transition-colors duration-200"
            >
              Change Password
            </button>
          </div>
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
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400"
            />
          </div>

          {/* Other Sync File Names */}
          <div className="mb-6">
            <label className="block text-gray-900 dark:text-white text-sm font-medium mb-3">
              (2) Other Sync File Names
            </label>
            <input
              type="text"
              placeholder="comma-separated paths, e.g.: /path/2.md, /path/3.md"
              value={otherSyncFilenames}
              onChange={(e) => setOtherSyncFilenames(e.target.value)}
              className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 placeholder-gray-500 dark:placeholder-gray-400"
            />
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

      {/* 编辑账户模态框 */}
      <EditAccountModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />
      <PasswordChangeModal 
        isOpen={isPasswordModalOpen} 
        onClose={() => setIsPasswordModalOpen(false)}/>
    </div>
  );
}