import React from "react";
import { useAppContext } from "../App";
import { useNavigate } from "@tanstack/react-router";
import {
  LayoutGrid,
  Plus,
  Clock,
  Brain,
  DollarSign,
  Laptop,
} from "lucide-react";
import clsx from "clsx";

const SpacesView = () => {
  const { spaces, onCreateSpace, isSidebarPinned } = useAppContext();
  const navigate = useNavigate();

  // Helper to format date
  const formatDate = (dateString) => {
    if (!dateString) return "Just now";
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Static examples data
  const exampleSpaces = [
    {
      id: "ex-1",
      emoji: "🧠",
      label: "Perplexity Support",
      icon: Brain,
      color: "text-pink-500",
      bgColor: "bg-pink-500/10",
    },
    {
      id: "ex-2",
      emoji: "💵",
      label: "What would Buffet say?",
      icon: DollarSign,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      id: "ex-3",
      emoji: "💻",
      label: "LLM Research",
      icon: Laptop,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
  ];

  return (
    <div
      className={clsx(
        "flex-1 min-h-screen bg-background text-foreground transition-all duration-300",
        isSidebarPinned ? "ml-80" : "ml-16"
      )}
    >
      <div className="w-full max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <LayoutGrid size={32} className="text-cyan-500" />
          <h1 className="text-3xl font-medium">Spaces</h1>
        </div>

        {/* My Spaces Section */}
        <div className="mb-12">
          <h2 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">
            My Spaces
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Create Card */}
            <div
              onClick={onCreateSpace}
              className="group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors flex flex-col justify-between min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <div>
                <h3 className="font-medium text-lg mb-1">Create a Space</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Set sources and invite others
                </p>
              </div>
            </div>

            {/* User Spaces */}
            {spaces.map((space) => (
              <div
                key={space.id}
                onClick={() =>
                  navigate({
                    to: "/space/$spaceId",
                    params: { spaceId: space.id },
                  })
                }
                className="group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors flex flex-col justify-between min-h-[160px]"
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-xl mb-4">
                  {space.emoji}
                </div>
                <div>
                  <h3 className="font-medium text-lg mb-1 truncate">
                    {space.label}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Clock size={12} />
                    <span>{formatDate(space.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Examples Section */}
        <div>
          <h2 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">
            Examples
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exampleSpaces.map((ex) => (
              <div
                key={ex.id}
                className="group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors flex flex-col justify-between min-h-[160px]"
              >
                <div
                  className={clsx(
                    "w-10 h-10 rounded-full flex items-center justify-center mb-4",
                    ex.bgColor,
                    ex.color
                  )}
                >
                  <ex.icon size={20} />
                </div>
                <div>
                  <h3 className="font-medium text-lg mb-1">{ex.label}</h3>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpacesView;
