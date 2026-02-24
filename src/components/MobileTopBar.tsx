// Mobile top bar component
export const MobileTopBar = ({ onMenuClick }: { onMenuClick: () => void }) => {
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