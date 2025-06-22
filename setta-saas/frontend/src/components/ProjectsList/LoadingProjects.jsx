import { useEffect, useState } from "react";

export default function LoadingProjects({ error, onRetry }) {
  const [loadingTime, setLoadingTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getLoadingMessage = () => {
    if (error) {
      return (
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-2">
            Failed to load projects
          </p>
          <p className="text-sm text-setta-500 dark:text-setta-400 mb-4">
            {error}
          </p>
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-setta-600 text-white rounded-md hover:bg-setta-500
                     dark:bg-setta-700 dark:hover:bg-setta-600 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (loadingTime > 10) {
      return (
        <div className="text-center">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-setta-600
                          dark:border-setta-400 mx-auto mb-4"
          ></div>
          <p className="text-setta-600 dark:text-setta-400 mb-2">
            Still loading projects...
          </p>
          <p className="text-sm text-setta-500 dark:text-setta-400">
            This is taking longer than usual. The server might be starting up.
          </p>
          {loadingTime > 20 && (
            <p className="text-xs text-setta-400 dark:text-setta-500 mt-2">
              Been waiting {loadingTime} seconds...
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-setta-600
                        dark:border-setta-400 mx-auto mb-4"
        ></div>
        <p className="text-setta-600 dark:text-setta-400">
          Loading projects...
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="p-12 bg-white dark:bg-setta-875 rounded-lg shadow">
        {getLoadingMessage()}
      </div>
    </div>
  );
}
