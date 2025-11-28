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

  // Spaces Data
  const [spaces, setSpaces] = useState([
    { emoji: '🌍', label: 'Daily Life' },
    { emoji: '💻', label: 'Development' },
    { emoji: '🤖', label: 'LLM Research' },
    { emoji: '🎬', label: 'Movies' },
    { emoji: '💸', label: 'Finance' },
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
        onCreateSpace={handleCreateSpace}
        onEditSpace={handleEditSpace}
        spaces={spaces}
        theme={theme}
        onToggleTheme={cycleTheme}
      />
      <MainContent
        currentView={currentView}
        spaces={spaces}
        onChatStart={() => setCurrentView('chat')}
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
