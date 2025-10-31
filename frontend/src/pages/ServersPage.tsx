import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Server } from '@/types';
import ServerCard from '@/components/ServerCard';
import AddServerForm from '@/components/AddServerForm';
import EditServerForm from '@/components/EditServerForm';
import { useServerData } from '@/hooks/useServerData';
import DxtUploadForm from '@/components/DxtUploadForm';
import JSONImportForm from '@/components/JSONImportForm';
import { apiGet } from '@/utils/fetchInterceptor';

const ServersPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    servers,
    error,
    setError,
    isLoading,
    handleServerAdd,
    handleServerEdit,
    handleServerRemove,
    handleServerToggle,
    triggerRefresh
  } = useServerData({ refreshOnMount: true });
  const [editingServer, setEditingServer] = useState<Server | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDxtUpload, setShowDxtUpload] = useState(false);
  const [showJsonImport, setShowJsonImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.65);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Server[] | null>(null);

  const handleEditClick = async (server: Server) => {
    const fullServerData = await handleServerEdit(server);
    if (fullServerData) {
      setEditingServer(fullServerData);
    }
  };

  const handleEditComplete = () => {
    setEditingServer(null);
    triggerRefresh();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      triggerRefresh();
      // Add a slight delay to make the spinner visible
      await new Promise(resolve => setTimeout(resolve, 500));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDxtUploadSuccess = (_serverConfig: any) => {
    // Close upload dialog and refresh servers
    setShowDxtUpload(false);
    triggerRefresh();
  };

  const handleJsonImportSuccess = () => {
    // Close import dialog and refresh servers
    setShowJsonImport(false);
    triggerRefresh();
  };

  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setIsSearching(true);
    try {
      const result = await apiGet(`/servers/search?query=${encodeURIComponent(searchQuery)}&threshold=${similarityThreshold}`);
      if (result.success && result.data) {
        setSearchResults(result.data.servers);
      } else {
        setError(result.message || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('pages.servers.title')}</h1>
        <div className="flex space-x-4">
          <button
            onClick={() => navigate('/market')}
            className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3z" />
            </svg>
            {t('nav.market')}
          </button>
          <AddServerForm onAdd={handleServerAdd} />
          <button
            onClick={() => setShowJsonImport(true)}
            className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            {t('jsonImport.button')}
          </button>
          <button
            onClick={() => setShowDxtUpload(true)}
            className="px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.413V13H5.5z" />
            </svg>
            {t('dxt.upload')}
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`px-4 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200 ${isRefreshing ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isRefreshing ? (
              <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
            )}
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {/* Semantic Search Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6 page-card">
        <div className="space-y-4">
          <div className="flex space-x-4">
            <div className="flex-grow">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSemanticSearch()}
                placeholder={t('pages.servers.semanticSearchPlaceholder')}
                className="shadow appearance-none border border-gray-200 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline form-input"
              />
            </div>
            <button
              onClick={handleSemanticSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="px-6 py-2 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 flex items-center btn-primary transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSearching ? (
                <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              )}
              {t('pages.servers.searchButton')}
            </button>
            {searchResults && (
              <button
                onClick={handleClearSearch}
                className="border border-gray-300 text-gray-700 font-medium py-2 px-4 rounded hover:bg-gray-50 btn-secondary transition-all duration-200"
              >
                {t('pages.servers.clearSearch')}
              </button>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <label className="text-sm text-gray-700 font-medium min-w-max">{t('pages.servers.similarityThreshold')}: {similarityThreshold.toFixed(2)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
              className="flex-grow h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-gray-500">{t('pages.servers.similarityThresholdHelp')}</span>
          </div>
        </div>
      </div>

      {searchResults && (
        <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
          <p className="text-blue-800">
            {searchResults.length > 0
              ? t('pages.servers.searchResults', { count: searchResults.length })
              : t('pages.servers.noSearchResults')}
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded shadow-sm error-box">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-gray-500 hover:text-gray-700 transition-colors duration-200 btn-secondary"
              aria-label={t('app.closeButton')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 011.414 0L10 8.586l4.293-4.293a1 1 111.414 1.414L11.414 10l4.293 4.293a1 1 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 01-1.414-1.414L8.586 10 4.293 5.707a1 1 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="bg-white shadow rounded-lg p-6 flex items-center justify-center loading-container">
          <div className="flex flex-col items-center">
            <svg className="animate-spin h-10 w-10 text-blue-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">{t('app.loading')}</p>
          </div>
        </div>
      ) : (searchResults ? searchResults : servers).length === 0 ? (
        <div className="bg-white shadow rounded-lg p-6 empty-state">
          <p className="text-gray-600">{searchResults ? t('pages.servers.noSearchResults') : t('app.noServers')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {(searchResults || servers).map((server, index) => (
            <ServerCard
              key={index}
              server={server}
              onRemove={handleServerRemove}
              onEdit={handleEditClick}
              onToggle={handleServerToggle}
              onRefresh={triggerRefresh}
            />
          ))}
        </div>
      )}

      {editingServer && (
        <EditServerForm
          server={editingServer}
          onEdit={handleEditComplete}
          onCancel={() => setEditingServer(null)}
        />
      )}

      {showDxtUpload && (
        <DxtUploadForm
          onSuccess={handleDxtUploadSuccess}
          onCancel={() => setShowDxtUpload(false)}
        />
      )}

      {showJsonImport && (
        <JSONImportForm
          onSuccess={handleJsonImportSuccess}
          onCancel={() => setShowJsonImport(false)}
        />
      )}
    </div>
  );
};

export default ServersPage;