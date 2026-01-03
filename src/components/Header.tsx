import { useState, useEffect, useRef } from "react";
import {AuthButton} from "@/components/AuthButton"
import {apiFetch} from "@/common";
import { logout } from "@/components/Logout";

// 左侧导航栏组件
export const Header = ({ 
  isOpen, 
  onClose, 
  onScrollRight 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onScrollRight: (deltaY: number) => void;
}) => {
  const headerRef = useRef<HTMLDivElement>(null);
  // fetch user information
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  // const { logout } = useAuth()

  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await apiFetch("/api/user/avatar-url");
        const data = await res.json();
        setUserAvatarUrl(data.avatar_url);
      } catch (error) {
        console.error("Failed to fetch user info:", error);
      }
    };
    fetchUserInfo();
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      onScrollRight(e.deltaY);
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [onScrollRight]);


  return (
    <>
      {/* 移动端遮罩层 */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* 侧边栏 */}
      <div 
        ref={headerRef}
        className={`
          fixed md:relative
          top-0 left-0
          p-3
          h-full md:h-screen
          w-48 md:w-64
          bg-gray-100 dark:bg-gray-900 
          shadow-md
          z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* 顶部区域 */}
        <div className="p-4 flex justify-between items-center border-b dark:border-gray-700">
          <AuthButton avatarUrl={userAvatarUrl} logout={logout} />
          {/* <span className="text-xl font-semibold">Menu</span> */}
          {/* 移动端关闭按钮 */}
          <button
            className="md:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={onClose}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* 导航内容 */}
        <nav className="flex flex-col space-y-2 text-lg">
          <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/">
            Hello
          </a>
          <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/loginput">
            loginput
          </a>
          <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/local-store">
            local-store
          </a>          
          <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/settings-page">
            settings
          </a>
          <a
            href="http://rin.qyzhizi.cn/"
            className="flex gap-2 items-center px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <span>lzp blog</span>
            <svg xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </nav>
      </div>
    </>
  );
};
