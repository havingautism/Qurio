import React, { useState, useEffect } from 'react';
import { Plus, Search, Compass, LayoutGrid, User, Globe, Map, BookOpen, Code, Film, Cpu, Wallet, ChevronRight, Settings, Sun, Moon, Laptop } from 'lucide-react';
import clsx from 'clsx';
import ClarityLogo from './Logo';
import { listConversations } from '../lib/conversationsService';

const Sidebar = ({ onOpenSettings, onNavigate, onNavigateToSpace, onCreateSpace, onEditSpace, onOpenConversation, spaces, spacesLoading = false, theme, onToggleTheme }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [activeTab, setActiveTab] = useState('library'); // 'library', 'discover', 'spaces'
  const [hoveredTab, setHoveredTab] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isConversationsLoading, setIsConversationsLoading] = useState(false);

  const displayTab = hoveredTab || activeTab;

  useEffect(() => {
    const fetchData = async () => {
      setIsConversationsLoading(true);
      const { data, error } = await listConversations();
      if (!error && data) {
        setConversations(data);
      } else {
        console.error('Failed to load conversations:', error);
      }
      setIsConversationsLoading(false);
    };
    fetchData();
  }, []);

  const navItems = [
    { id: 'library', icon: Search, label: 'Library' },
    // { id: 'discover', icon: Compass, label: 'Discover' },
    { id: 'spaces', icon: LayoutGrid, label: 'Spaces' },
  ];

  const getThemeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={20} />;
      case 'dark': return <Moon size={20} />;
      case 'system': return <Laptop size={20} />;
      default: return <Laptop size={20} />;
    }
  };

  return (
    <div
      className="fixed left-0 top-0 h-full z-50 flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setHoveredTab(null);
      }}
    >
      {/* 1. Fixed Icon Strip */}
      <div className="w-18 h-full bg-sidebar  flex flex-col items-center py-4 z-20 relative">

        {/* Logo */}
        <div className="mb-6">
          <div className="w-8 h-8 flex items-center justify-center text-gray-900 dark:text-white font-bold text-xl">
            <ClarityLogo size={32} />
          </div>
        </div>

        {/* New Thread Button (Icon Only) */}
        <div className="mb-6">
          <button
            onClick={() => onNavigate('home')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#9c9d8a29] dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* Nav Icons */}
        <div className="flex flex-col gap-4 w-full">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              onMouseEnter={() => setHoveredTab(item.id)}
              className={clsx(
                "flex flex-col items-center justify-center gap-1 py-2 mx-2 rounded-xl transition-all duration-200 cursor-pointer",
                activeTab === item.id
                  ? "bg-[#9c9d8a29] dark:bg-zinc-700 text-[#13343bbf] dark:text-white"
                  : "text-[#13343bbf] dark:text-gray-400 hover:bg-[#9c9d8a29] dark:hover:bg-zinc-800/50 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <item.icon size={24} />
              <span className="text-xs  font-medium">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Theme Toggle Button */}
        <div className="mb-2">
          <button
            onClick={onToggleTheme}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#9c9d8a29] dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          //  title={`Current theme: ${theme}`}
          >
            {getThemeIcon()}
          </button>
        </div>

        {/* Settings Button (Icon Only) */}
        <div className="mb-2">
          <button
            onClick={onOpenSettings}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-[#9c9d8a29] dark:bg-zinc-800 text-gray-600 dark:text-gray-300 transition-transform duration-200 hover:scale-110 active:scale-95 cursor-pointer"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* 2. Expanded Content Panel */}
      <div
        className={clsx(
          "h-full bg-sidebar  transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
          isHovered && displayTab !== 'discover' ? "w-64 opacity-100 translate-x-0 shadow-2xl" : "w-0 opacity-0 -translate-x-4"
        )}
      >
        <div className="p-4 min-w-[256px]"> {/* min-w ensures content doesn't squash during transition */}

          {/* Header based on Tab */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-lg text-foreground">
              {displayTab === 'library' ? 'Library' : displayTab === 'spaces' ? 'Spaces' : ''}
            </h2>
            {displayTab === 'spaces' && (
              <button className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-gray-500">
              </button>
            )}
          </div>

          {/* HOME TAB CONTENT: History */}
          {displayTab === 'library' && (
            <div className="flex flex-col gap-2 overflow-y-auto h-[calc(100vh-100px)] pr-2 scrollbar-thin">
              {isConversationsLoading && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">Loading conversations...</div>
              )}
              {!isConversationsLoading && conversations.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">No conversations yet.</div>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => onOpenConversation && onOpenConversation(conv)}
                  className="text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-800 p-2 rounded cursor-pointer truncate transition-colors flex items-center justify-between"
                  title={conv.title}
                >
                  <span className="truncate">{conv.title}</span>
                  <span className="text-[10px] text-gray-400 ml-2">{new Date(conv.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}

          {/* SPACES TAB CONTENT */}
          {displayTab === 'spaces' && (
            <div className="flex flex-col gap-2">
              {/* Create New Space */}
              <button
                onClick={onCreateSpace}
                className="flex items-center gap-3 p-2 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 transition-colors mb-2 w-full text-left cursor-pointer"
              >
                <div className="w-8 h-8 rounded bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
                  <Plus size={16} />
                </div>
                <span className="text-sm font-medium">Create New Space</span>
              </button>

              <div className="h-px bg-border my-2" />

              {/* Spaces List */}
              {spacesLoading && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">Loading spaces...</div>
              )}
              {!spacesLoading && spaces.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-1">No spaces yet.</div>
              )}
              {spaces.map((space) => (
                <div
                  key={space.id || space.label}
                  onClick={() => onNavigateToSpace(space)}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-zinc-800  flex items-center justify-center group-hover:border-gray-300 dark:group-hover:border-zinc-600 text-lg">
                      {space.emoji}
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{space.label}</span>
                  </div>

                  {/* Edit Button (Visible on Hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditSpace(space);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-gray-300 dark:hover:bg-zinc-700 text-gray-500 dark:text-gray-400 transition-all"
                  >
                    <Settings size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Sidebar;
