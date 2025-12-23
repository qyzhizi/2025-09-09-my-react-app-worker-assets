import ProfileUpdateForm from './UserInfoDialog';
// 编辑账户的模态框组件
type EditAccountModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function EditAccountModal({ isOpen, onClose }: EditAccountModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* 背景蒙版 */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-200"
        onClick={onClose}
      ></div>
      
      {/* 模态框 */}
      <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-96 transform transition-all duration-200">
          {/* 标题栏 */}
          <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit Account</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          {/* 内容 */}
          <ProfileUpdateForm />

          {/* 底部按钮 */}
          <div className="flex gap-3 p-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md text-sm font-medium transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}