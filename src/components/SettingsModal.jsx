import React, { useState, useEffect } from 'react';
import { X, Settings, MessageSquare, Monitor, Box, Palette, User, Info, Key, Link, Database, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { saveSettings, loadSettings } from '../lib/settings';
import { testConnection } from '../lib/supabase';

const SettingsModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [OpenAICompatibilityKey, setOpenAICompatibilityKey] = useState('');
  const [OpenAICompatibilityUrl, setOpenAICompatibilityUrl] = useState('');
  const [apiProvider, setApiProvider] = useState('gemini');
  const [googleApiKey, setGoogleApiKey] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const menuItems = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'interface', label: 'Interface', icon: Monitor },
    { id: 'model', label: 'Model', icon: Box },
    { id: 'personalization', label: 'Personalization', icon: Palette },
    { id: 'account', label: 'Account', icon: User },
    { id: 'about', label: 'About', icon: Info },
  ];

  // TODO: useEffect to load settings from Supabase/LocalStorage on mount
  // Load settings when modal opens
  useEffect(() => {
    if (isOpen) {
      const settings = loadSettings();
      if (settings.supabaseUrl) setSupabaseUrl(settings.supabaseUrl);
      if (settings.supabaseKey) setSupabaseKey(settings.supabaseKey);
      if (settings.OpenAICompatibilityKey) setOpenAICompatibilityKey(settings.OpenAICompatibilityKey);
      if (settings.OpenAICompatibilityUrl) setOpenAICompatibilityUrl(settings.OpenAICompatibilityUrl);
      if (settings.apiProvider) setApiProvider(settings.apiProvider);
      if (settings.googleApiKey) setGoogleApiKey(settings.googleApiKey);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const result = await testConnection(supabaseUrl, supabaseKey);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = async () => {
    // TODO: Validate inputs

    await saveSettings({
      apiProvider,
      googleApiKey,
      OpenAICompatibilityKey,
      OpenAICompatibilityUrl,
      supabaseUrl,
      supabaseKey
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl h-[80vh] bg-white dark:bg-[#191a1a] rounded-2xl shadow-2xl flex overflow-hidden border border-gray-200 dark:border-zinc-800">

        {/* Sidebar */}
        <div className="w-64 bg-gray-50 dark:bg-[#202222] border-r border-gray-200 dark:border-zinc-800 p-4 flex flex-col">
          <h2 className="text-xl font-bold mb-6 px-2 text-gray-900 dark:text-white">Settings</h2>
          <nav className="flex flex-col gap-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeTab === item.id
                    ? "bg-gray-100 dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800"
                )}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-[#191a1a]">
          {/* Header */}
          <div className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-8">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{activeTab}</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {activeTab === 'general' && (
              <div className="flex flex-col gap-8 max-w-2xl">

                {/* API Provider Selection */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">API Provider</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Choose your preferred AI provider.</p>
                  </div>

                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">
                      <Box size={16} />
                    </div>
                    <select
                      defaultValue={loadSettings().apiProvider}
                      value={apiProvider}
                      onChange={(e) => setApiProvider(e.target.value)}
                      className="w-full pl-10 pr-10 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 appearance-none cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai_compatibility">OpenAI Compatible</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform group-hover:rotate-180 duration-200">
                      <ChevronDown size={16} />
                    </div>
                  </div>

                  {/* Google Settings */}
                  {apiProvider === 'gemini' && (
                    <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Google API Key</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Key size={16} />
                        </div>
                        <input
                          type="password"
                          value={googleApiKey}
                          onChange={(e) => setGoogleApiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        Add <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded">VITE_GOOGLE_API_KEY</code> to your .env file to persist this.
                      </p>
                    </div>
                  )}

                  {/* OpenAI Compatible Settings */}
                  {apiProvider === 'openai_compatibility' && (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">OpenAI Compatible API Key</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Key size={16} />
                          </div>
                          <input
                            type="password"
                            value={OpenAICompatibilityKey}
                            onChange={(e) => setOpenAICompatibilityKey(e.target.value)}
                            placeholder="sk-..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Base URL</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Link size={16} />
                          </div>
                          <input
                            type="text"
                            value={OpenAICompatibilityUrl}
                            onChange={(e) => setOpenAICompatibilityUrl(e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-gray-100 dark:bg-zinc-800" />

                {/* Supabase Config */}
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">Supabase Configuration</label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Used for syncing and storing chat history.</p>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Supabase URL</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Link size={16} />
                        </div>
                        <input
                          type="text"
                          value={supabaseUrl}
                          onChange={(e) => setSupabaseUrl(e.target.value)}
                          placeholder="https://your-project.supabase.co"
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Anon Key</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                          <Key size={16} />
                        </div>
                        <input
                          type="password"
                          value={supabaseKey}
                          onChange={(e) => setSupabaseKey(e.target.value)}
                          placeholder="••••••••••••••••••••••••••••••••"
                          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-zinc-600"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handleTestConnection}
                      disabled={testing || !supabaseUrl || !supabaseKey}
                      className="self-end px-4 py-2 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {testing ? 'Testing...' : 'Test Connection & Database Tables'}
                    </button>

                    {testResult && (
                      <div className={clsx(
                        "p-4 rounded-lg border",
                        testResult.success
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : testResult.connection
                            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                            : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      )}>
                        <div className="text-sm font-medium mb-2 text-gray-900 dark:text-white">
                          {testResult.message}
                        </div>

                        {testResult.connection && (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.spaces ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">spaces table</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.chat_sessions ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">chat_sessions table</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{testResult.tables.messages ? '✅' : '❌'}</span>
                              <span className="text-gray-700 dark:text-gray-300">messages table</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Footer */}
          <div className="h-20 border-t border-gray-200 dark:border-zinc-800 flex items-center justify-end px-8 gap-3 bg-gray-50/50 dark:bg-[#191a1a]">
            <button
              onClick={onClose}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 cursor-pointer py-2 rounded-lg text-sm font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
