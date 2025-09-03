"use client";

import React, { useState, useRef, useEffect } from 'react';
import { 
  LogLevel, 
  LogMessage, 
  LogFilter, 
  useLogContext 
} from '@/context/LogContext';

// UI Bileşenleri
const LogLevelBadge = ({ level }: { level: LogLevel }) => {
  const levelColors: Record<LogLevel, { bg: string; text: string }> = {
    [LogLevel.ERROR]: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
    [LogLevel.WARNING]: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
    [LogLevel.INFO]: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
    [LogLevel.DEBUG]: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200' }
  };

  const { bg, text } = levelColors[level];

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {level}
    </span>
  );
};

export default function SystemLogsPage() {
  // Log Context'ten verileri ve metodları al
  const { 
    logs, 
    isConnected, 
    isPaused, 
    isAutoScroll,
    setPaused, 
    setAutoScroll, 
    clearLogs, 
    filterLogs, 
    refreshLogs, 
    exportLogs 
  } = useLogContext();

  // State'ler
  const [displayLogs, setDisplayLogs] = useState<LogMessage[]>([]);
  const [filter, setFilter] = useState<LogFilter>({
    level: 'ALL',
    source: '',
    search: ''
  });
  
  // Referanslar
  const logContainerRef = useRef<HTMLDivElement>(null);
  
  // Log filtreleme fonksiyonu
  const handleFilterChange = (newFilter: Partial<LogFilter>) => {
    const updatedFilter = { ...filter, ...newFilter };
    setFilter(updatedFilter);
    const filtered = filterLogs(updatedFilter);
    setDisplayLogs(filtered);
  };

  // Sayfa yüklendiğinde başlangıç filtrelemesi yap
  useEffect(() => {
    setDisplayLogs(logs);
  }, [logs]);
  
  // Auto-scroll işlevi
  useEffect(() => {
    if (isAutoScroll && logContainerRef.current && !isPaused) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [displayLogs, isAutoScroll, isPaused]);

  // Tarih/zaman formatla
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4 sm:mb-0">
          System Logs
        </h1>
        
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setPaused(!isPaused)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              isPaused 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-yellow-600 text-white hover:bg-yellow-700'
            }`}
          >
            {isPaused ? 'Resume Logs' : 'Pause Logs'}
          </button>
          
          <button 
            onClick={() => setAutoScroll(!isAutoScroll)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              isAutoScroll 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'bg-gray-500 text-white hover:bg-gray-600'
            }`}
          >
            {isAutoScroll ? 'Auto-Scroll On' : 'Auto-Scroll Off'}
          </button>
          
          <button 
            onClick={refreshLogs}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Refresh
          </button>
          
          <button 
            onClick={clearLogs}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700"
          >
            Clear Logs
          </button>
          
          <button 
            onClick={exportLogs}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-white hover:bg-gray-700"
          >
            Export
          </button>
        </div>
      </div>
      
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Log Level Filter */}
        <div>
          <label htmlFor="level-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Log Level
          </label>
          <select
            id="level-filter"
            value={filter.level}
            onChange={(e) => handleFilterChange({ level: e.target.value as LogLevel | 'ALL' })}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="ALL">All Levels</option>
            {Object.values(LogLevel).map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </div>
        
        {/* Source Filter */}
        <div>
          <label htmlFor="source-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Log Source
          </label>
          <input
            id="source-filter"
            type="text"
            value={filter.source}
            onChange={(e) => handleFilterChange({ source: e.target.value })}
            placeholder="Filter by source"
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>
        
        {/* Search Filter */}
        <div>
          <label htmlFor="search-filter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Search
          </label>
          <input
            id="search-filter"
            type="text"
            value={filter.search}
            onChange={(e) => handleFilterChange({ search: e.target.value })}
            placeholder="Search in logs"
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>
      </div>
      
      {/* Connection Status */}
      <div className="mb-4">
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          isConnected 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        }`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        
        <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">
          {displayLogs.length} logs
        </span>
      </div>
      
      {/* Logs Container */}
      <div 
        ref={logContainerRef}
        className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-auto bg-white dark:bg-gray-800"
        style={{ height: 'calc(100vh - 300px)' }}
      >
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Level</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Message</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {displayLogs.map((log, idx) => (
              <tr key={`${log.timestamp}-${idx}`} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                  {formatTimestamp(log.timestamp)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <LogLevelBadge level={log.level} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-300">
                  {log.source}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                  {log.message}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                  {log.details && (
                    <details>
                      <summary className="cursor-pointer text-blue-600 dark:text-blue-400">View Details</summary>
                      <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
            
            {displayLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                  No logs available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
