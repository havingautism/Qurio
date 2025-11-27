import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import SettingsModal from './components/SettingsModal';
import SpaceModal from './components/SpaceModal';

function App() {
  // Initialize theme based on system preference or default to dark
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'chat'
  
  // Space Modal State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
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
      />
      <MainContent isDarkMode={isDarkMode} toggleTheme={toggleTheme} currentView={currentView} />
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
