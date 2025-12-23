import { useState } from 'react';

interface PasswordChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function PasswordChangeModal({ isOpen, onClose }: PasswordChangeModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setError('');
    
    if (!newPassword.trim()) {
      setError('请输入新密码');
      return;
    }
    
    if (!confirmPassword.trim()) {
      setError('请确认新密码');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    
    if (newPassword.length < 6) {
      setError('密码至少需要6个字符');
      return;
    }

    setLoading(true);
    try {
      // Simulated API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      alert('密码修改成功!');
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      setError('密码修改失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
        {/* 背景蒙版 */}
        <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-200"
        onClick={onClose}
        ></div>
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 p-4">
        <div className="bg-gray-900 rounded-lg shadow-xl w-96 max-w-full mx-4">
            {/* Header */}
            <div className="flex justify-between items-center p-2 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white">修改密码</h2>
            <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            </div>

            {/* Content */}
            <div className="p-2">
            {/* New Password */}
            <div className="mb-2">
                <label className="block text-gray-300 text-sm font-medium mb-2">
                新密码
                </label>
                <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码"
                className="w-full bg-gray-800 text-white border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
            </div>

            {/* Confirm Password */}
            <div className="mb-2">
                <label className="block text-gray-300 text-sm font-medium mb-2">
                重复新密码
                </label>
                <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
                className="w-full bg-gray-800 text-white border border-gray-700 rounded px-4 py-3 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded text-red-400 text-sm">
                {error}
                </div>
            )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-2 border-t border-gray-700">
            <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-600 text-gray-300 rounded hover:bg-gray-800 transition-colors font-medium"
            >
                取消
            </button>
            <button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? '保存中...' : '保存'}
            </button>
            </div>
        </div>
        </div>
    </>
  );
}
export default PasswordChangeModal;