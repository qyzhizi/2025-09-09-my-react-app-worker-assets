import React from 'react';

interface SubmitButtonProps {
  /** onClick 不接收事件对象，直接回调 */
  onClick: () => void;
}


const SubmitButton : React.FC<SubmitButtonProps>  = ({ onClick }) => {
  return (
    <div className="w-full flex flex-row justify-end items-center py-1 dark:border-t-zinc-500">
      <div className="shrink-0 flex flex-row items-center">
        <button
          id="submit"
          className="flex flex-row items-center justify-center css-button-save"
          type="button"
          onClick={onClick}
        >
          保存
          <span className="flex flex-row">
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
          </span>
        </button>
      </div>
    </div>
  );
};

export default SubmitButton;
