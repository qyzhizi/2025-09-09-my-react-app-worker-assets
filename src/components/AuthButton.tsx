import { useState, useRef, useEffect } from "react";

import { navigate } from '@/Routers'; // 自定义导航函数
import { LogoutIcon } from "./Logout"; 
import { LoginIcon, Avatar } from "./Login"; 

type AuthButtonProps = {
    avatarUrl?: string | null;
    logout: () => Promise<void> | void;
};


export const AuthButton = ({ avatarUrl, logout }: AuthButtonProps) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const renderContent = () => {
    if (!avatarUrl) return <LoginIcon />;
    if (hover) return <LogoutIcon />;
    return <Avatar src={avatarUrl} />;
  };

  return (
    <div className="relative" ref={ref}>
      {/* 触发按钮 */}
      <button
        onClick={avatarUrl && hover ? handleLogout : () => setOpen(!open)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        {renderContent()}
      </button>
    </div>
  );
};
