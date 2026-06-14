import { useState, useEffect } from 'react';

import AccountSettings from './Account';
import StorageSettings from './Storage';
import VectorIndexSettings from './VectorIndex';
import styles from './MainSettingPage.module.css';  // Import CSS module

// Navigation item configuration
const navItems = [
  {
    id: 'account',
    label: 'Account',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" height="20" width="17.5" viewBox="0 0 448 512">
        <path fill="currentColor" d="M304 128a80 80 0 1 0 -160 0 80 80 0 1 0 160 0zM96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM49.3 464H398.7c-8.9-63.3-63.3-112-129-112H178.3c-65.7 0-120.1 48.7-129 112zM0 482.3C0 383.8 79.8 304 178.3 304h91.4C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7H29.7C13.3 512 0 498.7 0 482.3z"></path>
      </svg>
    )
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><path d="M3 9h18M3 15h18"></path></svg>
    )
  },
  {
    id: 'vectorIndex',
    label: 'VectorIndex',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" height="20" width="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="5" cy="5" r="1.5"/>
        <circle cx="19" cy="5" r="1.5"/>
        <circle cx="12" cy="12" r="1.5"/>
        <circle cx="5" cy="19" r="1.5"/>
        <circle cx="19" cy="19" r="1.5"/>
        <line x1="6.5" y1="5" x2="10.5" y2="11"/>
        <line x1="17.5" y1="5" x2="13.5" y2="11"/>
        <line x1="10.5" y1="13" x2="6.5" y2="19"/>
        <line x1="13.5" y1="13" x2="17.5" y2="19"/>
      </svg>
    )

  }

];

// main component
export default function MainSettingPage() {
  const [activeTab, setActiveTab] = useState('storage');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Detect URL parameters and handle GitHub authorization callbacks
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubAuth = params.get('github_auth');
    const tab = params.get('tab');

    if (githubAuth === 'success' && tab === 'github') {
      setActiveTab('storage');
      setSuccessMessage('GitHub 授权成功！');
      setErrorMessage(null);
      // Clear URL parameters to avoid repeated display on refresh
      window.history.replaceState({}, '', '/settings-page');
      // Automatically clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } else if (githubAuth === 'error' && tab === 'github') {
      setActiveTab('storage');
      setErrorMessage('GitHub 授权失败，请重试。');
      setSuccessMessage(null);
      // Clear URL parameters
      window.history.replaceState({}, '', '/settings-page');
      // Automatically clear error message after 5 seconds
      setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountSettings />;
      case 'storage':
        return <StorageSettings
          successMessage={successMessage}
          errorMessage={errorMessage}
          setSuccessMessage={setSuccessMessage}
        />
      case 'vectorIndex':
        return <VectorIndexSettings />;
      default:
        return <StorageSettings
          successMessage={successMessage}
          errorMessage={errorMessage}
          setSuccessMessage={setSuccessMessage}
        />;
    }
  };

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className={styles.settingsContainer}>

        {/* Top navigation (small screen) */}
        <div className={styles.navTop}>
          <nav className=" mb-4 bg-gray-100 dark:bg-gray-700 dark:text-white">
            <div className="flex overflow-x-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-2 py-2 whitespace-nowrap transition-colors ${
                    activeTab === item.id
                      ? 'bg-blue-400 dark:bg-blue-500'
                      : 'hover:bg-gray-400 dark:hover:bg-gray-700'
                  }`}
                >
                  <span className="flex-shrink-0 text-gray-900 dark:text-gray-100">
                  {item.icon}
                  </span>
                
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex h-full">
          {/* Left navigation (large screen) */}
          <div className={styles.navSide}>
            <nav className="w-64 bg-gray-100 dark:bg-gray-800 dark:text-white h-full">
              <div className="p-6">
                <h1 className="text-xl font-bold mb-6">设置</h1>
                <div className="space-y-2">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                        activeTab === item.id
                          ? 'bg-blue-400 dark:bg-blue-500'
                          : 'hover:bg-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className="flex-shrink-0 text-gray-900 dark:text-gray-100">
                      {item.icon}
                      </span>

                      <span className="font-medium">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </nav>
          </div>

          {/* content area */}
          <main className="py-5 flex-1 bg-gray-100 dark:bg-gray-800 content-area">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
