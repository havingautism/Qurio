import React from "react";
import { Plus, Clock } from "lucide-react";
import FancyLoader from "./FancyLoader";

const SpacesListView = ({
  spaces = [],
  spacesLoading = false,
  onCreateSpace,
  onNavigateToSpace,
}) => {
  return (
    <div className="flex flex-col min-h-screen p-8 ml-16 bg-background text-foreground">
      <div className="w-full max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-lg">
            <svg
              className="w-6 h-6 text-gray-700 dark:text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-white">
            Spaces
          </h1>
        </div>

        {/* My Spaces Section */}
        <div className="mb-8">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            My Spaces
          </h2>

          {/* Loading State */}
          {spacesLoading && (
            <div className="flex items-center justify-center py-12">
              <FancyLoader />
            </div>
          )}

          {/* Spaces Grid */}
          {!spacesLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Create New Space Card */}
              <button
                onClick={onCreateSpace}
                className="group relative bg-white dark:bg-zinc-900 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl p-6 hover:border-cyan-500 dark:hover:border-cyan-500 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-all duration-200 cursor-pointer min-h-[180px] flex flex-col items-center justify-center"
              >
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 dark:bg-cyan-500/20 flex items-center justify-center mb-3 group-hover:bg-cyan-500/20 dark:group-hover:bg-cyan-500/30 transition-colors">
                  <Plus className="w-6 h-6 text-cyan-500" />
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                  Create a Space
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Set sources and invite others
                </p>
              </button>

              {/* Space Cards */}
              {spaces.map((space) => (
                <button
                  key={space.id}
                  onClick={() => onNavigateToSpace && onNavigateToSpace(space)}
                  className="group relative bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 hover:border-cyan-500/50 dark:hover:border-cyan-500/50 hover:shadow-lg dark:hover:shadow-cyan-500/10 transition-all duration-200 cursor-pointer min-h-[180px] flex flex-col"
                >
                  {/* Space Icon */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center mb-4 text-2xl">
                    {space.emoji || "📁"}
                  </div>

                  {/* Space Name */}
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2 text-left group-hover:text-cyan-500 transition-colors">
                    {space.label}
                  </h3>

                  {/* Space Meta Info */}
                  <div className="flex items-center gap-2 mt-auto text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>
                      {space.created_at
                        ? new Date(space.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )
                        : "Recently"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!spacesLoading && spaces.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p className="text-sm">
                No spaces yet. Create your first space to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpacesListView;
