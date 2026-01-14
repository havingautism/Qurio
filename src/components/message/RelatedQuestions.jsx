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
      <div className="flex items-center gap-3 mb-3 text-gray-900 dark:text-gray-100">
        <EmojiDisplay emoji="🔮" size="1.2em" className="mb-1" />
        <span className="text-sm font-semibold">{t('messageBubble.relatedQuestions')}</span>
      </div>
      <div className="flex flex-col gap-1 md:gap-2">
        {questions &&
          questions.map((question, index) => (
            <div
              key={index}
              onClick={() => onRelatedClick && onRelatedClick(question)}
              className="flex items-center rounded-2xl border sm:hover:scale-102 border-gray-200 dark:border-zinc-800 bg-user-bubble dark:bg-zinc-800/50 justify-between p-2 hover:bg-user-bubble dark:hover:bg-zinc-800/50 cursor-pointer transition-colors group"
            >
              <span className="text-gray-700 dark:text-gray-300 font-medium text-sm md:text-balance">
                {question}
              </span>
              <div className="ml-2 sm:ml-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-primary-500 dark:text-primary-500">
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
