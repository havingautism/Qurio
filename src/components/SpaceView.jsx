import React from "react";
import { Layers, MoreHorizontal, Pencil } from "lucide-react";

const SpaceView = ({
  space,
  conversations = [],
  conversationsLoading = false,
  onEditSpace,
  onOpenConversation,
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 ml-16 bg-background text-foreground">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="text-4xl">{space.emoji}</div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                {space.label}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {space.description || `${space.label} search records`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditSpace && onEditSpace(space)}
              className="w-8 h-8 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-gray-500 hover:bg-gray-300 dark:hover:bg-zinc-700 transition-colors"
              title="Edit space"
            >
              <Pencil size={16} />
            </button>
          </div>
        </div>

        {space.prompt && (
          <div className="w-full bg-gray-50 dark:bg-zinc-900 border border-dashed border-gray-300 dark:border-zinc-700 rounded-xl p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              Space Prompt
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed whitespace-pre-line">
              {space.prompt}
            </p>
          </div>
        )}

        {/* Section: My Topics (Mock Data) */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
            <Layers size={18} />
            <span>My Topics</span>
          </div>

          {/* Topics List */}
          <div className="flex flex-col gap-4">
            {conversationsLoading && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            )}
            {!conversationsLoading && conversations.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No conversations yet.
              </div>
            )}
            {conversations.map((conv, i) => (
              <div
                key={conv.id || i}
                className="group cursor-pointer"
                onClick={() => onOpenConversation && onOpenConversation(conv)}
              >
                <div className="flex items-start gap-3">
                  {/* <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0 mt-1">
                                        <span className="text-xs font-bold">{conv.title?.[0]?.toUpperCase() || "T"}</span>
                                    </div> */}
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-cyan-500 transition-colors">
                      {conv.title || "Untitled"}
                    </h3>
                    {/* <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                                            {conv.description || "Conversation in this space."}
                                        </p> */}
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <span>
                        {new Date(conv.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded text-gray-400 transition-all">
                    <MoreHorizontal
                      size={16}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    />
                  </button>
                </div>
                {i < conversations.length - 1 && (
                  <div className="h-px bg-gray-100 dark:bg-zinc-800 mt-4" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpaceView;
