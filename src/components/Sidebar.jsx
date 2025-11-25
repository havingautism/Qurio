import React, { useState } from 'react';
import { Plus, Search, Compass, LayoutGrid, User, Globe, Map, BookOpen, Code, Film, Cpu, Wallet, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const Sidebar = () => {
  const [isHovered, setIsHovered] = useState(false);
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'discover', 'spaces'

  // Mock Data
  const historyData = [
    { label: 'Today', items: ['React 19 Features', 'Tailwind v4 Migration', 'Vite Config Setup'] },
    { label: 'Yesterday', items: ['AI Model Comparison', 'Next.js Routing', 'Supabase Auth'] },
    { label: 'Previous 7 Days', items: ['Docker Containers', 'Linux Commands', 'Rust Basics'] },
  ];

  const spacesData = [
    { icon: Globe, label: 'Daily Life', color: 'text-pink-500' },
    { icon: Code, label: 'Development', color: 'text-blue-500' },
    { icon: Cpu, label: 'LLM Research', color: 'text-purple-500' },
    { icon: Film, label: 'Movies', color: 'text-indigo-500' },
    { icon: Wallet, label: 'Finance', color: 'text-green-500' },
  ];

  const navItems = [
    { id: 'home', icon: Search, label: 'Home' },
    { id: 'discover', icon: Compass, label: 'Discover' },
    { id: 'spaces', icon: LayoutGrid, label: 'Spaces' },
  ];

  return (
    <div 
      className="fixed left-0 top-0 h-full z-50 flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1. Fixed Icon Strip */}
      <div className="w-16 h-full bg-sidebar  flex flex-col items-center py-4 z-20 relative">
        {/* Logo */}
        <div className="mb-6">
          <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
             <Globe size={20} />
          </div>
        </div>

        {/* New Thread Button (Icon Only) */}
        <div className="mb-6">
          <button className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 transition-colors">
            <Plus size={20} />
          </button>
        </div>

        {/* Nav Icons */}
        <div className="flex flex-col gap-4 w-full">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                "w-full h-10 flex items-center justify-center relative transition-colors",
                activeTab === item.id ? "text-cyan-500" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              )}
            >
              <item.icon size={24} />
              {/* Active Indicator */}
              {activeTab === item.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-500 rounded-r-full" />
              )}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Profile (Icon Only) */}
        <div className="mb-2">
           <button className="w-10 h-10 rounded-full bg-teal-600 flex items-center justify-center text-white font-bold text-xs hover:opacity-90 transition-opacity">
             U
           </button>
        </div>
      </div>

      {/* 2. Expanded Content Panel */}
      <div 
        className={clsx(
          "h-full bg-sidebar  transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
          isHovered && activeTab !== 'discover' ? "w-64 opacity-100 translate-x-0 shadow-2xl" : "w-0 opacity-0 -translate-x-4"
        )}
      >
        <div className="p-4 min-w-[256px]"> {/* min-w ensures content doesn't squash during transition */}
          
          {/* Header based on Tab */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-lg text-foreground">
              {activeTab === 'home' ? 'Library' : activeTab === 'spaces' ? 'Spaces' : ''}
            </h2>
            {activeTab === 'spaces' && (
               <button className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-gray-500">
                 <Plus size={16} />
               </button>
            )}
          </div>

          {/* HOME TAB CONTENT: History */}
          {activeTab === 'home' && (
            <div className="flex flex-col gap-6 overflow-y-auto h-[calc(100vh-100px)] pr-2 scrollbar-thin">
               {historyData.map((section, idx) => (
                 <div key={idx}>
                   <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{section.label}</h3>
                   <div className="flex flex-col gap-1">
                     {section.items.map((item, i) => (
                       <div key={i} className="text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-800 p-2 rounded cursor-pointer truncate transition-colors">
                         {item}
                       </div>
                     ))}
                   </div>
                 </div>
               ))}
            </div>
          )}

          {/* SPACES TAB CONTENT */}
          {activeTab === 'spaces' && (
            <div className="flex flex-col gap-2">
               {/* Create New Space */}
               <button className="flex items-center gap-3 p-2 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 text-gray-700 dark:text-gray-300 transition-colors mb-2">
                  <div className="w-8 h-8 rounded bg-gray-200 dark:bg-zinc-700 flex items-center justify-center">
                    <Plus size={16} />
                  </div>
                  <span className="text-sm font-medium">Create New Space</span>
               </button>

               <div className="h-px bg-border my-2" />

               {/* Spaces List */}
               {spacesData.map((space, idx) => (
                 <div key={idx} className="flex items-center gap-3 p-2 rounded hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors group">
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-zinc-800 border border-border flex items-center justify-center group-hover:border-gray-300 dark:group-hover:border-zinc-600">
                      <space.icon size={16} className={space.color} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{space.label}</span>
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
