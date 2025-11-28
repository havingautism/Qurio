import React, { useState, useEffect } from 'react';
import { Search, Paperclip, Mic, ArrowRight, Sun, Moon, Clock, Cloud, Github, Youtube, Coffee, Globe, Layers } from 'lucide-react';
import ChatInterface from './ChatInterface';
import { loadSettings } from '../lib/settings';

const MainContent = ({ currentView, spaces, onChatStart }) => {
  const [activeView, setActiveView] = useState(currentView); // Local state to manage view transition
  const [initialMessage, setInitialMessage] = useState('');
  const [initialAttachments, setInitialAttachments] = useState([]);
  const [initialToggles, setInitialToggles] = useState({ search: false, thinking: false });
  const [settings, setSettings] = useState(loadSettings());

  // Sync prop change to local state if needed (e.g. sidebar navigation)
  useEffect(() => {
    setActiveView(currentView);
  }, [currentView]);

  useEffect(() => {
    const handleSettingsChange = () => {
      setSettings(loadSettings());
      if (settings.apiProvider === 'openai_compatibility') {
        setIsHomeSearchActive(false);
      }
    };

    window.addEventListener('settings-changed', handleSettingsChange);
    return () => window.removeEventListener('settings-changed', handleSettingsChange);
  }, []);

  // ... (rest of the component)



  const suggestions = [
    { icon: Clock, title: 'Time in Tokyo', subtitle: 'Current local time' },
    { icon: Cloud, title: 'Weather', subtitle: 'San Francisco, CA' },
    { icon: Github, title: 'GitHub Trends', subtitle: 'Latest popular repos' },
    { icon: Youtube, title: 'YouTube', subtitle: 'Trending videos' },
    { icon: Coffee, title: 'Espresso vs Ristretto', subtitle: 'What is the difference?' },
    { icon: Search, title: 'History of AI', subtitle: 'Brief overview' },
  ];

  // Homepage Input State
  const [homeInput, setHomeInput] = useState('');
  const [isHomeSearchActive, setIsHomeSearchActive] = useState(false);
  const [isHomeThinkingActive, setIsHomeThinkingActive] = useState(false);
  const [homeAttachments, setHomeAttachments] = useState([]);

  const handleHomeFileUpload = () => {
    const url = prompt("Enter image URL for testing:");
    if (url) {
      setHomeAttachments(prev => [...prev, { type: 'image_url', image_url: { url } }]);
    }
  };

  const handleStartChat = async () => {
    if (!homeInput.trim() && homeAttachments.length === 0) return;

    // Set initial state for ChatInterface
    setInitialMessage(homeInput);
    setInitialAttachments(homeAttachments);
    setInitialToggles({ search: isHomeSearchActive, thinking: isHomeThinkingActive });

    // Switch to chat view
    setActiveView('chat');
    if (onChatStart) onChatStart();

    // Reset home input
    setHomeInput('');
    setHomeAttachments([]);
    setIsHomeSearchActive(false);
    setIsHomeThinkingActive(false);
  };

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground transition-colors duration-300 relative">
      {activeView === 'chat' ? (
        <ChatInterface
          spaces={spaces}
          initialMessage={initialMessage}
          initialAttachments={initialAttachments}
          initialToggles={initialToggles}
        />
      ) : (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 ml-16">
          {/* Main Container */}
          <div className="w-full max-w-3xl flex flex-col items-center gap-8">

            {/* Title */}
            <h1 className="text-4xl md:text-5xl !font-serif font-medium text-center mb-8 text-[#1f2937] dark:text-white">
              Where knowledge begins
            </h1>

            {/* Search Box */}
            <div className="w-full relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
                {homeAttachments.length > 0 && (
                  <div className="flex gap-2 mb-2 overflow-x-auto">
                    {homeAttachments.map((att, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded overflow-hidden border border-gray-300">
                        <img src={att.image_url.url} alt="attachment" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={homeInput}
                  onChange={(e) => setHomeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleStartChat();
                    }
                  }}
                  placeholder="Ask anything..."
                  className="w-full bg-transparent border-none outline-none resize-none text-lg placeholder-gray-400 dark:placeholder-gray-500 min-h-[60px]"
                  rows={1}
                />

                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={handleHomeFileUpload}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${homeAttachments.length > 0 ? 'text-cyan-500' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      <Paperclip size={18} />
                    </button>
                    <button
                      disabled={settings.apiProvider === 'openai_compatibility'}
                      value={isHomeSearchActive}
                      onClick={() => setIsHomeSearchActive(!isHomeSearchActive)}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${isHomeSearchActive ? 'text-cyan-500 bg-gray-100 dark:bg-zinc-800' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      <Globe size={18} />
                      <span>Search</span>
                    </button>
                    <button

                      onClick={() => setIsHomeThinkingActive(!isHomeThinkingActive)}
                      className={`p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2 text-xs font-medium ${isHomeThinkingActive ? 'text-cyan-500 bg-gray-100 dark:bg-zinc-800' : 'text-gray-500 dark:text-gray-400'}`}
                    >
                      <Layers size={18} />
                      <span>Think</span>
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleStartChat}
                      disabled={!homeInput.trim() && homeAttachments.length === 0}
                      className="p-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full transition-colors disabled:opacity-50"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Suggestions Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full mt-8">
              {suggestions.map((item, index) => (
                <div
                  key={index}
                  onClick={() => {
                    setHomeInput(item.title);
                    // Optional: auto-submit or just set input
                  }}
                  className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 cursor-pointer transition-all duration-200 flex flex-col gap-2"
                >
                  <div className="p-2 bg-white dark:bg-zinc-900 w-fit rounded-lg shadow-sm text-cyan-600 dark:text-cyan-400">
                    <item.icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{item.subtitle}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Footer */}
          <div className="absolute bottom-4 text-xs text-gray-400 dark:text-gray-600 flex gap-4">
            <a href="#" className="hover:underline">Pro</a>
            <a href="#" className="hover:underline">Enterprise</a>
            <a href="#" className="hover:underline">Store</a>
            <a href="#" className="hover:underline">Blog</a>
            <a href="#" className="hover:underline">Careers</a>
            <a href="#" className="hover:underline">English (English)</a>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainContent;
