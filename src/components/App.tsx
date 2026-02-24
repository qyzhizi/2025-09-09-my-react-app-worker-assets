import { useState, useRef } from "react";
import { Header } from "@/components/Header";
import { MobileTopBar } from "@/components/MobileTopBar";

// App layout components
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
      {/* <div className="max-w-container min-w-container relative mx-auto flex"> */}
        <Header 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onScrollRight={handleScrollRight}
        />
        {/* content */}
        <div className="flex-1 flex flex-col w-full md:w-auto ">
          <MobileTopBar onMenuClick={() => setIsSidebarOpen(true)} />
        
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