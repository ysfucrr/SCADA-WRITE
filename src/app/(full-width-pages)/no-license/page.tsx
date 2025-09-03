'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import FileInput from '@/components/form/input/FileInput';
import { FiCopy, FiCheck } from 'react-icons/fi';
import { useAuth } from '@/hooks/use-auth';


export default function NoLicensePage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [machineId, setMachineId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    console.log("window: ", window)
    fetch('/api/license/machine-id')
      .then(res => res.json())
      .then(data => setMachineId(data.machineId))
      .catch(() => setMachineId('Error'));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    fetch('/api/license/validate')
      .then(res => res.json())
      .then(data => {
        console.log("data: ", data)
        if (data.valid) {
          if (user) {
            return router.replace('/');
          } else {
            return router.replace('/signin');
          }
        }
      });
  }, [authLoading]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] || null);
    setMessage('');
  };

  const copyToClipboard = () => {
    if (machineId) {
      navigator.clipboard.writeText(machineId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setMessage('Please select a license file.');
      return;
    }

    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        setMessage('License successfully uploaded. Redirecting to dashboard...');
        setTimeout(() => router.replace('/'), 2000);
      } else {
        setMessage(`Error: ${result.error}`);
      }
    } catch (error) {
      setMessage('An error occurred while uploading the license file.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    typeof window !== 'undefined' && window.electron?.isElectronEnvironment ?
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">License Required</h1>
            <p className="text-gray-600 dark:text-gray-300">Please upload a valid license file to continue</p>
          </div>

          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Device Machine ID:</span>
              {copied ?
                <span className="text-green-500 flex items-center text-sm"><FiCheck className="mr-1" /> Copied!</span> :
                null
              }
            </div>
            <div
              onClick={copyToClipboard}
              className="flex items-center justify-between bg-gray-100 dark:bg-gray-600 p-3 rounded-md cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
            >
              <code className="text-sm font-mono text-blue-600 dark:text-blue-400">{machineId || 'Loading...'}</code>
              <FiCopy className="text-gray-500 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400" />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Send this ID to the administrator to get your license file
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Upload License File
              </label>
              <FileInput
                accept=".json"
                onChange={handleFileChange}
                className="w-full"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isLoading ? 'Processing...' : 'Activate License'}
            </button>
          </form>

          {message && (
            <div className={`mt-4 p-3 rounded-md ${message.includes('Error') ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
      :
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">License Required</h1>
            <p className="text-gray-600 dark:text-gray-300">Please contact your system administrator to license the application</p>
          </div>
        </div>
      </div>
  );
}