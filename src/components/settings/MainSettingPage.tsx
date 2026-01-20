import { useState, useEffect } from 'react';

import GithubSettings from './Github'
import AccountSettings from './Account';
import styles from './MainSettingPage.module.css';  // 导入 CSS 模块

// 导航项配置
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
    id: 'github',
    label: 'Github',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" height="20" width="19.375" viewBox="0 0 496 512">
        <path fill="currentColor" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"></path>
      </svg>
    )
  },
  {
    id: 'jianguoyun',
    label: 'JianGuoYun',
    icon: (
      <svg fill="currentColor" height="20" width="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <path d="M394.86,136.98c-39.168-36.505-90.246-56.611-143.812-56.611c-56.993,0-108.743,22.754-146.744,59.608 C93.39,126.618,60,77.501,98.835,15.37c2.938-4.704,1.511-10.899-3.198-13.843c-4.694-2.938-10.899-1.511-13.843,3.198 C34.512,80.378,78.6,140.691,90.492,154.708c-31.396,36.841-50.407,84.542-50.407,136.625c0,53.575,20.107,105.046,56.611,144.204 c1.859,1.996,4.449,3.595,7.172,3.595c0.059,0,0.118,0,0.177,0c2.663,0,5.219-1.452,7.103-3.341L395.115,151.63 c1.928-1.928,2.987-4.751,2.943-7.478C398.009,141.424,396.857,138.839,394.86,136.98z M104.495,413.63 c-28.651-34.278-44.319-77.311-44.319-122.297c0-105.247,85.626-190.872,190.872-190.872c44.976,0,88.014,15.667,122.302,44.319 L104.495,413.63z"></path>
        <path d="M470.097,338.35c-7-51.809-33.65-103.137-75.045-144.528c-3.924-3.924-10.281-3.924-14.206,0L153.533,421.13 c-1.884,1.884-2.943,4.439-2.943,7.103c0,2.663,1.06,5.219,2.943,7.103C203.831,485.634,267.099,512,324.308,512 c40.812,0,78.543-13.421,106.262-41.145C463.2,438.23,477.239,391.169,470.097,338.35z M423.119,449.197l-14.279-14.278 c-3.924-3.924-10.281-3.924-14.205,0c-3.924,3.924-3.924,10.281,0,14.205l14.276,14.276 c-58.436,48.948-159.361,33.934-233.938-35.299l212.843-212.838c34.317,36.932,56.356,81.25,62.37,125.775 C455.933,383.565,446.319,421.528,423.119,449.197z"></path>
      </svg>
    )
  }
];


const JianGuoYunSettings = () => (
  <div className="p-6">
    <h2 className="text-2xl font-bold mb-4">坚果云设置</h2>
    <p className="text-gray-600 dark:text-gray-300">这里是坚果云设置页面的内容</p>
  </div>
);

// 主组件
export default function MainSettingPage() {
  const [activeTab, setActiveTab] = useState('account');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 检测 URL 参数，处理 GitHub 授权回调
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const githubAuth = params.get('github_auth');
    const tab = params.get('tab');

    if (githubAuth === 'success' && tab === 'github') {
      setActiveTab('github');
      setSuccessMessage('GitHub 授权成功！');
      setErrorMessage(null);
      // 清除 URL 参数，避免刷新时重复显示
      window.history.replaceState({}, '', '/settings-page');
      // 3秒后自动清除成功消息
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } else if (githubAuth === 'error' && tab === 'github') {
      setActiveTab('github');
      setErrorMessage('GitHub 授权失败，请重试。');
      setSuccessMessage(null);
      // 清除 URL 参数
      window.history.replaceState({}, '', '/settings-page');
      // 5秒后自动清除错误消息
      setTimeout(() => {
        setErrorMessage(null);
      }, 5000);
    }
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return <AccountSettings />;
      case 'github':
        return <GithubSettings successMessage={successMessage} errorMessage={errorMessage} />;
      case 'jianguoyun':
        return <JianGuoYunSettings />;
      default:
        return <AccountSettings />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      <div className={styles.settingsContainer}>

        {/* 顶部导航（小屏） */}
        <div className={styles.navTop}>
          <nav className="max-w-2xl mx-auto  bg-gray-100 dark:bg-gray-800 dark:text-white">
            <div className="flex overflow-x-auto">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-6 py-4 whitespace-nowrap transition-colors ${
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

        <div className="flex">
          {/* 左侧导航（大屏） */}
          <div className={styles.navSide}>
            <nav className="w-64 bg-gray-100 dark:bg-gray-800 dark:text-white min-h-screen">
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

          {/* 内容区域 */}
          <main className="flex-1 bg-gray-100 dark:bg-gray-800 content-area">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  );
}
