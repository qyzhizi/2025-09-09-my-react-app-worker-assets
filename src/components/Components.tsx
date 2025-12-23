import { useState, useEffect, useRef } from "react";

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
          <span className="text-xl font-semibold">Menu</span>
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

// 移动端顶部栏组件
const MobileTopBar = ({ onMenuClick }: { onMenuClick: () => void }) => {
  return (
    <div className="md:hidden sticky top-0 z-30 w-full h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 shadow-sm">
      <button
        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={onMenuClick}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
          viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="ml-4 text-lg font-semibold">Memo</span>
    </div>
  );
};

// App 布局组件
export const App = ({ children }: { children: any }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScrollRight = (deltaY: number) => {
    if (contentRef.current) {
      contentRef.current.scrollTop += deltaY;
    }
  };

  return (
    <div className="flex h-screen w-full ">
      <Header 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onScrollRight={handleScrollRight}
      />
      
      <div className="flex-1 flex flex-col w-full md:w-auto ">
        <MobileTopBar onMenuClick={() => setIsSidebarOpen(true)} />
        
        <div 
          ref={contentRef}
          className="flex-1 p-6 bg-gray-100 dark:bg-gray-900 text-black dark:text-white overflow-y-auto overflow-x-hidden"
        >
          {children}
        </div>
      </div>
    </div>
  );
};