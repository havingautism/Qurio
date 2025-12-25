import clsx from 'clsx'
import { Bot, Plus, Sparkles } from 'lucide-react'
import { useAppContext } from '../App'
import EmojiDisplay from '../components/EmojiDisplay'
import { useState } from 'react'

const AgentsView = () => {
  const { onCreateAgent, onEditAgent, isSidebarPinned } = useAppContext()
  // Mock data for agents since backend is out of scope for now
  // In a real app, this would come from useAppContext or a query
  const [agents] = useState([
    {
      id: '1',
      name: 'Coding Assistant',
      emoji: '💻',
      description: 'Expert in React and Node.js',
      provider: 'gemini',
    },
    {
      id: '2',
      name: 'Creative Writer',
      emoji: '✍️',
      description: 'Helps with storytelling and poetry',
      provider: 'openai_compatibility',
    },
    {
      id: '3',
      name: 'Translator',
      emoji: '🌐',
      description: 'Translates between EN and CN',
      provider: 'deepl',
    },
  ])

  return (
    <div
      className={clsx(
        'flex-1 h-full overflow-y-auto bg-background text-foreground transition-all duration-300',
        isSidebarPinned ? 'ml-0 sm:ml-80' : 'ml-0 sm:ml-16',
      )}
    >
      <div className="w-full max-w-5xl mx-auto sm:px-6 sm:py-8 px-3 py-5">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Bot size={32} className="text-primary-500" />
          <h1 className="text-3xl font-medium">Agents</h1>
        </div>

        {/* My Agents Section */}
        <div className="mb-12">
          <h2 className="text-lg font-medium mb-4 text-gray-700 dark:text-gray-300">My Agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Create Card */}
            <div
              onClick={onCreateAgent}
              className="group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors flex flex-col justify-between min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-full bg-primary-500 flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform">
                <Plus size={24} />
              </div>
              <div>
                <h3 className="font-medium text-lg mb-1">Create Agent</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Custom AI assistant with specific prompt and model settings.
                </p>
              </div>
            </div>

            {/* Agent Cards */}
            {agents.map(agent => (
              <div
                key={agent.id}
                onClick={() => onEditAgent(agent)}
                className="group p-6 rounded-xl bg-gray-100 dark:bg-zinc-900 hover:bg-gray-200 dark:hover:bg-zinc-800 cursor-pointer transition-colors flex flex-col justify-between min-h-[160px]"
              >
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center text-xl mb-4">
                  <EmojiDisplay emoji={agent.emoji} />
                </div>
                <div>
                  <h3 className="font-medium text-lg mb-1 truncate">{agent.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                    {agent.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                    <Sparkles size={12} />
                    <span className="capitalize">{agent.provider || 'Default'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AgentsView
