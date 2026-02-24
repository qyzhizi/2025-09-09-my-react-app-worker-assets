import { useState, useEffect } from 'react';
import {apiFetch} from "@/common";

import GithubSettings from './Github'



const JianGuoYunSettings = () => (
  <div className="p-6">
    <h2 className="text-2xl font-bold mb-4">坚果云设置</h2>
    <p className="text-gray-600 dark:text-gray-300">这里是坚果云设置页面的内容</p>
  </div>
);

// Remote storage selection components
type StorageType = 'github' | 'jianguoyun';

function RemoteStorageSelector({ 
  selectedStorage, 
  onStorageChange,
  saving 
}: { 
  selectedStorage: StorageType;
  onStorageChange: (type: StorageType) => void;
  saving: boolean;
}) {
  return (
    <div className="mb-2">
      <div className="space-y-3">
        {/* GitHub Option */}
        <label
          className={`flex items-center p-2 rounded-lg border-2 cursor-pointer transition-all ${
            selectedStorage === 'github'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500'
          }`}
        >
          <input
            type="radio"
            name="storage"
            value="github"
            checked={selectedStorage === 'github'}
            onChange={() => onStorageChange('github')}
            disabled={saving}
            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
          />
          <div className="ml-3 flex items-center gap-3 flex-1">
            <svg className="w-6 h-6 fill-gray-900 dark:fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">GitHub</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Store your data on GitHub repositories</p>
            </div>
          </div>
        </label>

        {/* JianGuoYun Option */}
        <label
          className={`flex items-center p-2 rounded-lg border-2 cursor-pointer transition-all ${
            selectedStorage === 'jianguoyun'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500'
          }`}
        >
          <input
            type="radio"
            name="storage"
            value="jianguoyun"
            checked={selectedStorage === 'jianguoyun'}
            onChange={() => onStorageChange('jianguoyun')}
            disabled={saving}
            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
          />
          <div className="ml-3 flex items-center gap-3 flex-1">
            <div className="w-6 h-6 rounded bg-green-500 flex items-center justify-center">
              <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900 dark:text-white">坚果云 (JianGuoYun)</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Store your data on JianGuoYun cloud storage</p>
            </div>
          </div>
        </label>
      </div>
    </div>
  );
}

interface StorageSettingsProps {
  successMessage: string | null;
  errorMessage: string | null;
  setSuccessMessage: (message: string | null) => void;
  setErrorMessage: (message: string | null) => void;
}

export default function StorageSettings({
  successMessage,
  errorMessage,
  setSuccessMessage,
  setErrorMessage }: StorageSettingsProps) {
  const [selectedStorage, setSelectedStorage] = useState<StorageType>('github');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // const [error, setError] = useState<string | null>(null);

  // Fetch storage preference
  useEffect(() => {
    const fetchStoragePreference = async () => {
      try {
        setLoading(true);
        const response = await apiFetch('/api/storage/preference');
        if (response.ok) {
          const data = await response.json();
          setSelectedStorage(data.storageType || 'github');
        }
      } catch (error) {
        console.error('Error fetching storage preference:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStoragePreference();
  }, []);

  // Handle storage type change
  const handleStorageChange = async (storageType: StorageType) => {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      const response = await apiFetch('/api/storage/preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ storageType }),
      });

      if (!response.ok) {
        throw new Error('Failed to update storage preference');
      }

      setSelectedStorage(storageType);
      setSuccessMessage('Storage updated successfully');
      
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (error) {
      console.error('Error updating storage preference:', error);
      setErrorMessage('Failed to update storage preference');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-2 max-w-2xl mx-auto">
        <div className="mb-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-md">
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-300 text-sm">Loading storage settings...</span>
          </div>
        </div>
      </div>
    );
  }

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

      {/* Remote Storage Section */}
      <div className="mb-2">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Remote Storage
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
          Choose where to store your data remotely
        </p>

        {/* Remote Storage Selector Component */}
        <RemoteStorageSelector 
          selectedStorage={selectedStorage}
          onStorageChange={handleStorageChange}
          saving={saving}
        />

        {/* Success/Error Messages for Storage Change */}
        {/* {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )} */}

        {/* Saving Indicator */}
        {saving && (
          <div className="mt-4 flex items-center text-sm text-gray-600 dark:text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
            Saving...
          </div>
        )}
      </div>

      {/* Render corresponding settings component based on selection */}
      <div className="mt-2">
        {selectedStorage === 'github' && <GithubSettings 
          setSuccessMessage={setSuccessMessage}/>}
        {selectedStorage === 'jianguoyun' && <JianGuoYunSettings />}
      </div>
    </div>
  );
}