import React, { useRef, useEffect } from 'react';

const TextAreaBox = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动调整高度
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto'; // 重置高度，防止高度增高后不能变小
      textarea.style.height = `${textarea.scrollHeight}px`; // 设置为内容高度
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
