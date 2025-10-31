import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';

interface InstallToClientDialogProps {
  serverName?: string;
  groupId?: string;
  groupName?: string;
  config: any;
  onClose: () => void;
}

const InstallToClientDialog: React.FC<InstallToClientDialogProps> = ({
  serverName,
  groupId,
  groupName,
  config,
  onClose,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'cursor' | 'claude-code' | 'claude-desktop'>('cursor');
  const [copied, setCopied] = useState(false);

  // Generate configuration based on the active tab
  const generateConfig = () => {
    if (groupId) {
      // For groups, generate group-based configuration
      return {
        mcpServers: {
          [`mcphub-${groupId}`]: config,
        },
      };
    } else {
      // For individual servers
      return {
        mcpServers: {
          [serverName || 'mcp-server']: config,
        },
      };
    }
  };

  const configJson = JSON.stringify(generateConfig(), null, 2);

  const handleCopyConfig = () => {
    navigator.clipboard.writeText(configJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Generate deep link for Cursor (if supported in the future)
  const handleInstallToCursor = () => {
    // For now, just copy the config since deep linking may not be widely supported
    handleCopyConfig();
    // In the future, this could be:
    // const deepLink = `cursor://install-mcp?config=${encodeURIComponent(configJson)}`;
    // window.open(deepLink, '_blank');
  };

  const getStepsList = () => {
    const displayName = groupName || serverName || 'MCP server';
    
    switch (activeTab) {
      case 'cursor':
        return [
          t('install.step1Cursor'),
          t('install.step2Cursor'),
          t('install.step3Cursor'),
          t('install.step4Cursor', { name: displayName }),
        ];
      case 'claude-code':
        return [
          t('install.step1ClaudeCode'),
          t('install.step2ClaudeCode'),
          t('install.step3ClaudeCode'),
          t('install.step4ClaudeCode', { name: displayName }),
        ];
      case 'claude-desktop':
        return [
          t('install.step1ClaudeDesktop'),
          t('install.step2ClaudeDesktop'),
          t('install.step3ClaudeDesktop'),
          t('install.step4ClaudeDesktop', { name: displayName }),
        ];
      default:
        return [];
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">
            {groupId
              ? t('install.installGroupTitle', { name: groupName })
              : t('install.installServerTitle', { name: serverName })}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
            aria-label={t('common.close')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200 px-6 pt-4">
            <nav className="-mb-px flex space-x-4">
              <button
                onClick={() => setActiveTab('cursor')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  activeTab === 'cursor'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Cursor
              </button>
              <button
                onClick={() => setActiveTab('claude-code')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  activeTab === 'claude-code'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Claude Code
              </button>
              <button
                onClick={() => setActiveTab('claude-desktop')}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                  activeTab === 'claude-desktop'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Claude Desktop
              </button>
            </nav>
          </div>

          {/* Configuration Display */}
          <div className="p-6 space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-gray-700">{t('install.configCode')}</h3>
                <button
                  onClick={handleCopyConfig}
                  className="flex items-center space-x-2 px-3 py-1.5 bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors duration-200 text-sm"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? t('common.copied') : t('install.copyConfig')}</span>
                </button>
              </div>
              <pre className="bg-white border border-gray-200 rounded p-4 text-xs overflow-x-auto">
                <code>{configJson}</code>
              </pre>
            </div>

            {/* Installation Steps */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-3">{t('install.steps')}</h3>
              <ol className="space-y-3">
                {getStepsList().map((step, index) => (
                  <li key={index} className="flex items-start space-x-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-medium">
                      {index + 1}
                    </span>
                    <span className="text-sm text-blue-900 pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 transition-colors duration-200"
          >
            {t('common.close')}
          </button>
          <button
            onClick={handleInstallToCursor}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200 flex items-center space-x-2"
          >
            <Copy size={16} />
            <span>
              {activeTab === 'cursor' && t('install.installToCursor', { name: groupName || serverName })}
              {activeTab === 'claude-code' && t('install.installToClaudeCode', { name: groupName || serverName })}
              {activeTab === 'claude-desktop' && t('install.installToClaudeDesktop', { name: groupName || serverName })}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallToClientDialog;
