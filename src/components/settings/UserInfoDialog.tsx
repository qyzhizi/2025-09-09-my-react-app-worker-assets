import { useState, useRef } from 'react';
import { X, Camera } from 'lucide-react';

export default function ProfileUpdateForm() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState<string | null>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          setAvatar(result);
        }
      };
      reader.readAsDataURL(file);
    }
    // Reset the input value so that the same file can be selected next time.
    e.target.value = '';
  };

  const handleDeleteAvatar = () => {
    setAvatar(null);
  };

  return (
    <div className=" bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white transition-colors duration-300">
      {/* Form Container */}
      <div className="max-w-md mx-auto p-3">
        {/* Avatar Section */}
        <div className="mb-2">
          <div className="flex items-center gap-4">
            <div 
              onClick={handleAvatarClick}
              className="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity relative overflow-hidden"
            >
              {avatar ? (
                <img 
                  src={typeof avatar === 'string' && avatar.startsWith('data:') ? avatar : avatar}
                  alt="User Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Camera size={24} className="text-gray-400 dark:text-gray-500" />
              )}
            </div>
            {avatar && (
              <button 
                onClick={handleDeleteAvatar}
                className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800 rounded transition-colors"
              >
                <X size={20} />
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Username Field */}
        <div className="mb-2">
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Username (for login)
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            placeholder="输入用户名"
          />
        </div>

        {/* Email Field */}
        <div className="mb-2">
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Email (optional)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            placeholder="Enter email address"
          />
        </div>
      </div>
    </div>
  );
}