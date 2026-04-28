import { useState } from "react";

// Top bar stays in layout; hamburger uses md breakpoint like Header sidebar.
export const TopBar = ({
  onMenuClick,
  onSearch,
}: {
  onMenuClick: () => void;
  onSearch: (query: string) => void;
}) => {
  const [query, setQuery] = useState("");

  return (
    <div className="sticky top-0 z-30 w-full h-14 shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 px-4 shadow-sm">
      <button
        type="button"
        className="md:hidden shrink-0 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
          viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div
        className="flex-1 flex justify-end min-w-0"
        role="search"
      >
        <div className="flex w-full max-w-md items-center gap-1 rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/80 px-2 focus-within:ring-2 focus-within:ring-blue-500/30 dark:focus-within:ring-blue-400/30">
          <label htmlFor="topbar-search" className="sr-only">
            Search
          </label>
          <input
            id="topbar-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = query.trim();
                onSearch(trimmed);
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const trimmed = query.trim();
              onSearch(trimmed);
            }}
            className="shrink-0 rounded p-1.5 text-gray-600 hover:bg-gray-200/80 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label="Submit search"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none"
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
