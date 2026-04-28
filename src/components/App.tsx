import { useState, useRef } from "react";
import { Header } from "@/components/Header";
import { TopBar } from "@/components/TopBar";
import { navigate } from "@/RouterLite";


// App layout components
export const App = ({ children }: { children: any }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScrollRight = (deltaY: number) => {
    if (contentRef.current) {
      contentRef.current.scrollTop += deltaY;
    }
  };

  /** Navigates to dedicated search route; empty query returns to logs home. */
  const handleSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      navigate("/", true);
      return;
    }
    const timestamp = Date.now();
    navigate(`/search?q=${encodeURIComponent(trimmed)}&t=${timestamp}`, true);
  };

  return (
    <div className="flex h-screen w-full ">
      {/* <div className="max-w-container min-w-container relative mx-auto flex"> */}
        <Header 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onScrollRight={handleScrollRight}
        />
        {/* content */}
        <div className="flex-1 flex flex-col w-full md:w-auto ">
          <TopBar
            onMenuClick={() => setIsSidebarOpen(true)}
            onSearch={handleSearch}
          />
        
          <div 
            ref={contentRef}
            className="flex flex-1 px-2 py-5 justify-center bg-gray-100 dark:bg-gray-900 text-black dark:text-white overflow-x-hidden"
          >
            {children}
          </div>
        </div>

      </div>
    // </div>
  );
};