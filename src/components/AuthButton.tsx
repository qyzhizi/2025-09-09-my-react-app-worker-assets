import { useState } from "react";

import { navigate } from '@/Routers'; // Custom navigation function
import { LogoutIcon } from "./Logout"; 
import { LoginIcon, Avatar } from "./Login"; 

type AuthButtonProps = {
    avatarUrl?: string | null;
    logout: () => Promise<void> | void;
};


export const AuthButton = ({ avatarUrl, logout }: AuthButtonProps) => {
  const [hover, setHover] = useState(false);

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
    <div className="relative">
      {/* trigger button */}
      <button
        onClick={avatarUrl && hover ? handleLogout : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
      >
        {renderContent()}
      </button>
    </div>
  );
};
