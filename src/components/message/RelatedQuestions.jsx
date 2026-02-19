import { useEffect, useState } from 'react'
import { CornerRightDown } from 'lucide-react'
import DotLoader from '../DotLoader'
import EmojiDisplay from '../EmojiDisplay'

const RelatedQuestions = ({ t, questions, isLoading, onRelatedClick }) => {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={`transition-[max-height,opacity] duration-250 ease-out ${
        entered ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      <div className="mb-4 flex items-center gap-3 text-gray-900 dark:text-gray-100">
        <EmojiDisplay emoji="🔮" size="1.2em" className="mb-1" />
        <span className="text-sm font-semibold">{t('messageBubble.relatedQuestions')}</span>
      </div>
      <div className="flex flex-col gap-1 md:gap-2">
        {questions &&
          questions.map((question, index) => (
            <div
              key={index}
              onClick={() => onRelatedClick && onRelatedClick(question)}
              className="bg-user-bubble border-primary-100/50 hover:bg-user-bubble group flex cursor-pointer items-center justify-between rounded-2xl border border-1 px-3 py-2 transition-colors sm:hover:scale-102 dark:border-zinc-800/80 dark:bg-zinc-800/50 dark:hover:bg-zinc-800/50"
            >
              <span className="text-sm font-medium text-gray-700 md:text-balance dark:text-gray-300">
                {question}
              </span>
              <div className="text-primary-500 dark:text-primary-500 ml-2 opacity-100 sm:ml-0 sm:opacity-0 sm:group-hover:opacity-100">
                <CornerRightDown />
              </div>
            </div>
          ))}
        {isLoading && (
          <div className="flex items-center p-2 text-gray-500 dark:text-gray-400">
            <DotLoader />
          </div>
        )}
      </div>
    </div>
  )
}

export default RelatedQuestions
