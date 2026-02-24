import React, { useRef, useEffect } from 'react';

const TextAreaBox = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Automatically adjust height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // Reset height to prevent it from growing too tall
      textarea.style.height = `${textarea.scrollHeight}px`; // Set height to content height
    }
  }, [value]);

  return (
    <div className="flex flex-col justify-start items-start relative w-full h-auto bg-inherit dark:text-gray-300">
      <textarea
        id="log"
        name="log"
        ref={textareaRef}
        className="w-full max-h-[300px] my-1 text-base resize-none overflow-x-hidden overflow-y-auto bg-transparent outline-none whitespace-pre-wrap break-words"
        placeholder="any things ..."
        value={value}
        onChange={onChange}
      ></textarea>
    </div>
  );
};

export default TextAreaBox;
