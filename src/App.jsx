import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';

function App() {
  // Initialize theme based on system preference or default to dark
  const [isDarkMode, setIsDarkMode] = useState(true);

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

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-cyan-500/30">
      <Sidebar />
      <MainContent isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
    </div>
  );
}

export default App;
