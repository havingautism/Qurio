import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import MainContent from "./components/MainContent";
import SettingsModal from "./components/SettingsModal";
import SpaceModal from "./components/SpaceModal";
import { initSupabase } from "./lib/supabase";
import {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
} from "./lib/spacesService";
import { getConversation } from "./lib/conversationsService";
import { ToastProvider } from "./contexts/ToastContext";

function App() {
  // Initialize theme based on system preference or default to dark
  const [theme, setTheme] = useState("system"); // 'light' | 'dark' | 'system'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState("home"); // 'home' | 'chat'

  // Space Modal State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [activeSpace, setActiveSpace] = useState(null);
  const [activeConversation, setActiveConversation] = useState(null);
  const [hasSyncedPath, setHasSyncedPath] = useState(false);

  // Spaces Data
  const [spaces, setSpaces] = useState([]);
  const [spacesLoading, setSpacesLoading] = useState(false);

  // Sidebar pin state
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    return saved === "true";
  });

  useEffect(() => {
    const root = document.documentElement;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";

    const applyTheme = (t) => {
      if (t === "dark" || (t === "system" && systemTheme === "dark")) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    applyTheme(theme);

    // Listener for system theme changes if in system mode
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const cycleTheme = () => {
    setTheme((prev) => {
      if (prev === "light") return "dark";
      if (prev === "dark") return "system";
      return "light";
    });
  };

  const handleNavigate = (view) => {
    setCurrentView(view);
    if (view !== "space") {
      setActiveSpace(null);
    }
    if (view === "home") {
      setActiveConversation(null);
      window.history.replaceState(null, "", "/new_chat");
    }
    // Clear active states when navigating to spaces list view
    if (view === "spaces") {
      setActiveSpace(null);
      setActiveConversation(null);
    }
  };

  const handleNavigateToSpace = (space) => {
    setActiveSpace(space);
    setCurrentView("space");
    setActiveConversation(null);
  };

  const handleCreateSpace = () => {
    setEditingSpace(null);
    setIsSpaceModalOpen(true);
  };

  const handleEditSpace = (space) => {
    setEditingSpace(space);
    setIsSpaceModalOpen(true);
  };

  const handleOpenConversation = (conversation) => {
    setActiveConversation(conversation);
    if (conversation?.space_id) {
      const space = spaces.find((s) => s.id === conversation.space_id);
      setActiveSpace(space || null);
    }
    setCurrentView("chat");
    if (conversation?.id) {
      window.history.pushState(null, "", `/conversation/${conversation.id}`);
    }
  };

  // Load spaces from Supabase on mount
  useEffect(() => {
    const load = async () => {
      setSpacesLoading(true);
      try {
        initSupabase();
        const { data, error } = await listSpaces();
        if (!error && data) {
          setSpaces(data);
        } else {
          console.error("Failed to fetch spaces:", error);
        }
      } catch (err) {
        console.error("Unexpected error fetching spaces:", err);
      } finally {
        setSpacesLoading(false);
      }
    };
    load();
  }, []);

  const handleSaveSpace = async (payload) => {
    if (editingSpace) {
      const { data, error } = await updateSpace(editingSpace.id, payload);
      if (!error && data) {
        setSpaces((prev) => prev.map((s) => (s.id === data.id ? data : s)));
        if (activeSpace?.id === data.id) setActiveSpace(data);
      } else {
        console.error("Update space failed:", error);
      }
    } else {
      const { data, error } = await createSpace(payload);
      if (!error && data) {
        setSpaces((prev) => [...prev, data]);
      } else {
        console.error("Create space failed:", error);
      }
    }
    setIsSpaceModalOpen(false);
    setEditingSpace(null);
  };

  const handleDeleteSpace = async (id) => {
    const { error } = await deleteSpace(id);
    if (!error) {
      setSpaces((prev) => prev.filter((s) => s.id !== id));
      if (activeSpace?.id === id) {
        setActiveSpace(null);
        setCurrentView("home");
      }
    } else {
      console.error("Delete space failed:", error);
    }
    setIsSpaceModalOpen(false);
    setEditingSpace(null);
  };

  // Route sync on load / refresh
  useEffect(() => {
    const syncFromPath = async () => {
      const path = window.location.pathname;
      if (path.startsWith("/conversation/")) {
        const convoId = path.split("/conversation/")[1];
        if (convoId) {
          const { data } = await getConversation(convoId);
          if (data) {
            setActiveConversation(data);
            if (data.space_id) {
              const space = spaces.find((s) => s.id === data.space_id);
              setActiveSpace(space || null);
            }
            setCurrentView("chat");
            setHasSyncedPath(true);
            return;
          }
        }
      }
      // default
      setActiveConversation(null);
      setActiveSpace(null);
      setCurrentView("home");
      window.history.replaceState(null, "", "/new_chat");
      setHasSyncedPath(true);
    };

    syncFromPath();

    const onPop = () => syncFromPath();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [spaces]);

  useEffect(() => {
    // Ensure URL reflects new chat whenever we return home after initial path sync
    if (!hasSyncedPath) return;
    if (currentView === "home") {
      window.history.replaceState(null, "", "/new_chat");
    }
  }, [currentView, hasSyncedPath]);

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-background text-foreground font-sans selection:bg-cyan-500/30">
        <Sidebar
          onOpenSettings={() => setIsSettingsOpen(true)}
          onNavigate={handleNavigate}
          onNavigateToSpace={handleNavigateToSpace}
          onCreateSpace={handleCreateSpace}
          onEditSpace={handleEditSpace}
          onOpenConversation={handleOpenConversation}
          spaces={spaces}
          spacesLoading={spacesLoading}
          theme={theme}
          onToggleTheme={cycleTheme}
          activeConversationId={activeConversation?.id}
          onPinChange={setIsSidebarPinned}
        />
        <MainContent
          currentView={currentView}
          activeSpace={activeSpace}
          activeConversation={activeConversation}
          spaces={spaces}
          onChatStart={() => setCurrentView("chat")}
          onEditSpace={handleEditSpace}
          spacesLoading={spacesLoading}
          onOpenConversation={handleOpenConversation}
          onNavigate={handleNavigate}
          onNavigateToSpace={handleNavigateToSpace}
          onCreateSpace={handleCreateSpace}
          isSidebarPinned={isSidebarPinned}
        />
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
        <SpaceModal
          isOpen={isSpaceModalOpen}
          onClose={() => setIsSpaceModalOpen(false)}
          editingSpace={editingSpace}
          onSave={handleSaveSpace}
          onDelete={handleDeleteSpace}
        />
      </div>
    </ToastProvider>
  );
}

export default App;
