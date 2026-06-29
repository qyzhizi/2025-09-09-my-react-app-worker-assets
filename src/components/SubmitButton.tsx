import React from 'react';
import { Loader2 } from 'lucide-react';

interface SubmitButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

const SubmitButton: React.FC<SubmitButtonProps> = ({ onClick, disabled = false }) => {
  return (
    <div className="w-full flex flex-row justify-end items-center py-1 dark:border-t-zinc-500">
      <div className="shrink-0 flex flex-row items-center">
        <button
          id="submit"
          className="flex flex-row items-center justify-center bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-3 py-1 rounded transition-opacity"
          type="button"
          onClick={onClick}
          disabled={disabled}
        >
          {disabled ? '保存中' : 'Save'}
          <span className="flex flex-row ml-1">
            {disabled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-send w-4 h-auto"
              >
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            )}
          </span>
        </button>
      </div>
    </div>
  );
};

export default SubmitButton;