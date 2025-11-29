import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import SpaceModal from './components/SpaceModal';

function App() {
  // Initialize theme based on system preference or default to dark
  const [theme, setTheme] = useState('system'); // 'light' | 'dark' | 'system'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'chat'

  // Space Modal State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [activeSpace, setActiveSpace] = useState(null);

  // Spaces Data
  const [spaces, setSpaces] = useState([
    { emoji: '🌍', label: 'Daily Life', description: 'Daily life search records' },
    { emoji: '💻', label: 'Development', description: 'Coding and development resources' },
    { emoji: '🤖', label: 'LLM Research', description: 'Large Language Model papers and news' },
    { emoji: '🎬', label: 'Movies', description: 'Movie reviews and recommendations' },
    { emoji: '💸', label: 'Finance', description: 'Market analysis and financial news' },
  ]);

  useEffect(() => {
    const root = document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

    const applyTheme = (t) => {
      if (t === 'dark' || (t === 'system' && systemTheme === 'dark')) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme(theme);

    // Listener for system theme changes if in system mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const cycleTheme = () => {
    setTheme(prev => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  };

  const handleNavigate = (view) => {
    setCurrentView(view);
    if (view !== 'space') {
      setActiveSpace(null);
    }
  };

  const handleNavigateToSpace = (space) => {
    setActiveSpace(space);
    setCurrentView('space');
  };

  const handleCreateSpace = () => {
    setEditingSpace(null);
    setIsSpaceModalOpen(true);
  };

  const handleEditSpace = (space) => {
    setEditingSpace(space);
    setIsSpaceModalOpen(true);
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-cyan-500/30">
      <Sidebar
        onOpenSettings={() => setIsSettingsOpen(true)}
        onNavigate={handleNavigate}
        onNavigateToSpace={handleNavigateToSpace}
        onCreateSpace={handleCreateSpace}
        onEditSpace={handleEditSpace}
        spaces={spaces}
        theme={theme}
        onToggleTheme={cycleTheme}
      />
      <MainContent
        currentView={currentView}
        activeSpace={activeSpace}
        spaces={spaces}
        onChatStart={() => setCurrentView('chat')}
        onEditSpace={handleEditSpace}
      />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <SpaceModal
        isOpen={isSpaceModalOpen}
        onClose={() => setIsSpaceModalOpen(false)}
        editingSpace={editingSpace}
      />
    </div>
  );
}

export default App;
