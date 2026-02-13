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
          absolute md:relative
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
          <a className="px-6 py-3 flex items-center hover:bg-gray-200 dark:hover:bg-gray-700" href="/" aria-current="page">
            <svg className="h-5 w-5 mr-2 fill-current text-gray-900 dark:text-white" xmlns="http://www.w3.org/2000/svg" height="20" width="22.5" viewBox="0 0 576 512">
              <path d="M575.8 255.5c0 18-15 32.1-32 32.1h-32l.7 160.2c0 2.7-.2 5.4-.5 8.1V472c0 22.1-17.9 40-40 40H456c-1.1 0-2.2 0-3.3-.1c-1.4 .1-2.8 .1-4.2 .1H416 392c-22.1 0-40-17.9-40-40V448 384c0-17.7-14.3-32-32-32H256c-17.7 0-32 14.3-32 32v64 24c0 22.1-17.9 40-40 40H160 128.1c-1.5 0-3-.1-4.5-.2c-1.2 .1-2.4 .2-3.6 .2H104c-22.1 0-40-17.9-40-40V360c0-.9 0-1.9 .1-2.8V287.6H32c-18 0-32-14-32-32.1c0-9 3-17 10-24L266.4 8c7-7 15-8 22-8s15 2 21 7L564.8 231.5c8 7 12 15 11 24z"></path>
            </svg> Home
          </a>
          <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/local-store">
            local-store
          </a>          
          <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/settings-page">
            settings
          </a>
        </nav>
      </div>
    </>
  );
};
