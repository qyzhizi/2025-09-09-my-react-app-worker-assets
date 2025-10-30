/*** components.tsx ***/
import { useState } from "react";
import { useEffect, useRef } from "react";

// 左侧导航栏组件
export const Header = ({ onScrollRight }: { onScrollRight: (deltaY: number) => void }) => {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // ✅ 禁止 body 滚动
      onScrollRight(e.deltaY); // ✅ 将滚动传递到右侧内容
    };

    // ✅ 添加非 passive 监听器，preventDefault 才会生效
    el.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      el.removeEventListener("wheel", handleWheel);
    };
  }, [onScrollRight]);

  return (
    <div ref={headerRef} className="md:w-64 w-full md:h-screen bg-gray-100 dark:bg-gray-800 shadow-md">
      {/* 顶部区域（移动端显示菜单按钮） */}
      <div className="p-4 flex justify-between items-center md:justify-center border-b dark:border-gray-700">
        <span className="text-xl font-semibold">Menu</span>
        <button
          className="md:hidden p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          onClick={() => setOpen(!open)}
        >
          {/* 汉堡按钮 */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
            viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>

      {/* 导航内容 */}
      <nav
        className={`flex flex-col space-y-2 text-lg transition-all duration-300 overflow-hidden
        ${open ? "max-h-96" : "max-h-0 md:max-h-full"} md:block`}
      >
        <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/">Hello</a>

        <a className="px-6 py-3 hover:bg-gray-200 dark:hover:bg-gray-700 block" href="/loginput">loginput</a>

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
  );
};

// App 布局组件：Header + 页面内容
export const App = ({ children }: { children: any }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScrollRight = (deltaY: number) => {
    if (contentRef.current) {
      contentRef.current.scrollTop += deltaY;
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full w-full">
      <Header onScrollRight={handleScrollRight} />
      <div ref={contentRef} className="flex-1 md:p-6 bg-white dark:bg-gray-900 text-black dark:text-white w-full overflow-y: auto overflow-x-hidden">
        {children}
      </div>
    </div>
  );
};
