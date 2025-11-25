import React from 'react';
import { Search, Paperclip, Mic, ArrowRight, Sun, Moon, Clock, Cloud, Github, Youtube, Coffee } from 'lucide-react';
import clsx from 'clsx';

const MainContent = ({ isDarkMode, toggleTheme }) => {
  const suggestions = [
    { icon: Clock, title: 'Time in Tokyo', subtitle: 'Current local time' },
    { icon: Cloud, title: 'Weather', subtitle: 'San Francisco, CA' },
    { icon: Github, title: 'GitHub Trends', subtitle: 'Latest popular repos' },
    { icon: Youtube, title: 'YouTube', subtitle: 'Trending videos' },
    { icon: Coffee, title: 'Espresso vs Ristretto', subtitle: 'What is the difference?' },
    { icon: Search, title: 'History of AI', subtitle: 'Brief overview' },
  ];

  return (
    <div className="flex-1 min-h-screen bg-background text-foreground transition-colors duration-300 flex flex-col items-center justify-center relative p-4 ml-16">
      {/* Theme Toggle (Absolute Top Right) */}
      <button 
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
      >
        {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
      </button>

      {/* Main Container */}
      <div className="w-full max-w-3xl flex flex-col items-center gap-8">
        
        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-serif font-medium text-center mb-4 opacity-90">
          Where knowledge begins
        </h1>

        {/* Search Box */}
        <div className="w-full relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 p-4">
            <textarea 
              placeholder="Ask anything..." 
              className="w-full bg-transparent border-none outline-none resize-none text-lg placeholder-gray-400 dark:placeholder-gray-500 min-h-[60px]"
              rows={1}
            />
            
            <div className="flex justify-between items-center mt-2">
              <div className="flex gap-2">
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-gray-500 transition-colors flex items-center gap-2 text-sm font-medium">
                   <span className="bg-gray-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-xs">Focus</span>
                </button>
                <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg text-gray-500 transition-colors">
                  <Paperclip size={20} />
                </button>
              </div>
              
              <div className="flex gap-2">
                 <button className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-gray-500 transition-colors">
                  <Mic size={20} />
                </button>
                <button className="p-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full transition-colors disabled:opacity-50">
                  <ArrowRight size={20} />
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
      </div>
    </div>
  );
};

export default MainContent;
