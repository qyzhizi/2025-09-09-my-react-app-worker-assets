import { useState, useRef } from "react";
import { Header } from "@/components/Header";
import { MobileTopBar } from "@/components/MobileTopBar";

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