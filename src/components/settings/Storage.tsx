import GithubSettings from './Github'

interface StorageSettingsProps {
  successMessage: string | null;
  errorMessage: string | null;
  setSuccessMessage: (message: string | null) => void;
}

export default function StorageSettings({
  successMessage,
  errorMessage,
  setSuccessMessage }: StorageSettingsProps) {

  return (
    <div className="px-2 max-w-2xl mx-auto bg-transparent rounded-lg transition-colors duration-300 relative">
      {/* Success/Error Messages - Absolutely position the upper right corner */}
      <div className="absolute -translate-y-full left-1/2 -translate-x-1/2 z-10 flex flex-col items-center space-y-2">

        {successMessage && (
          <div className="px-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md shadow">
            <p className="text-sm text-green-700 dark:text-green-300">{successMessage}</p>
          </div>
        )}
        {errorMessage && (
          <div className="px-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md shadow">
            <p className="text-sm text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        )}
      </div>

      {/* Render corresponding settings component based on selection */}
      <div className="mt-2">
        <GithubSettings setSuccessMessage={setSuccessMessage}/>
      </div>
    </div>
  );
}