import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import SpaceModal from "./components/SpaceModal";
import { initSupabase } from "./lib/supabase";
import {
  listSpaces,
  createSpace,
  updateSpace,
  deleteSpace,
} from "./lib/spacesService";
import { listConversations } from "./lib/conversationsService";
import { ToastProvider } from "./contexts/ToastContext";

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize theme based on system preference or default to dark
  const [theme, setTheme] = useState("system"); // 'light' | 'dark' | 'system'
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Space Modal State
  const [isSpaceModalOpen, setIsSpaceModalOpen] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);

  // Spaces Data
  const [spaces, setSpaces] = useState([]);

  // Conversations Data
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [spacesLoading, setSpacesLoading] = useState(false);

  // Sidebar pin state
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    const saved = localStorage.getItem("sidebar-pinned");
    return saved === "true";
  });

  // Derive current view from location
  const currentView = React.useMemo(() => {
    const path = location.pathname;
    if (path === "/" || path === "/new_chat") return "home";
    if (path.startsWith("/conversation/")) return "chat";
    if (path === "/spaces") return "spaces";
    if (path.startsWith("/space/")) return "space";
    if (path === "/library") return "library";
    if (path === "/bookmarks") return "bookmarks";
    return "home";
  }, [location]);

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
    switch (view) {
      case "home":
        navigate("/new_chat");
        break;
      case "spaces":
        navigate("/spaces");
        break;
      case "library":
        navigate("/library");
        break;
      case "bookmarks":
        navigate("/bookmarks");
        break;
      case "chat":
        navigate("/new_chat");
        break;
      default:
        navigate("/");
    }
  };

  const handleNavigateToSpace = (space) => {
    if (space) {
      navigate(`/space/${space.id}`);
    } else {
      navigate("/spaces");
    }
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
    if (conversation?.id) {
      navigate(`/conversation/${conversation.id}`);
    } else {
      navigate("/new_chat");
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

  // Load conversations from Supabase on mount
  useEffect(() => {
    const loadConversations = async () => {
      setConversationsLoading(true);
      try {
        const { data, error } = await listConversations();
        if (!error && data) {
          setConversations(data);
        } else {
          console.error("Failed to fetch conversations:", error);
        }
      } catch (err) {
        console.error("Unexpected error fetching conversations:", err);
      } finally {
        setConversationsLoading(false);
      }
    };
    loadConversations();

    // Listen for conversation changes
    const handleConversationsChanged = () => loadConversations();
    window.addEventListener(
      "conversations-changed",
      handleConversationsChanged
    );
    return () => {
      window.removeEventListener(
        "conversations-changed",
        handleConversationsChanged
      );
    };
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
      // Navigate away if currently viewing the deleted space
      if (location.pathname === `/space/${id}`) {
        navigate("/spaces");
      }
    } else {
      console.error("Delete space failed:", error);
    }
    setIsSpaceModalOpen(false);
    setEditingSpace(null);
  };

  // Remove old route sync logic - React Router handles this automatically

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
          isSidebarPinned={isSidebarPinned}
          onPinChange={setIsSidebarPinned}
        />
        <div
          className={`flex-1 relative transition-all duration-300 ${
            isSidebarPinned ? "ml-18" : "ml-0"
          }`}
        >
          <Outlet
            context={{
              spaces,
              conversations,
              conversationsLoading,
              spacesLoading,
              onNavigate: handleNavigate,
              onNavigateToSpace: handleNavigateToSpace,
              onOpenConversation: handleOpenConversation,
              onCreateSpace: handleCreateSpace,
              onEditSpace: handleEditSpace,
              isSidebarPinned,
            }}
          />
        </div>
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
