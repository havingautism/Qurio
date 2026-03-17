import DotLoader from './DotLoader'

const ConversationLoadingOverlay = () => {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="text-(--color-text-secondary) drop-shadow-[0_4px_18px_rgba(0,0,0,0.18)]">
        <DotLoader size="8px" gap="5px" />
      </div>
    </div>
  )
}

export default ConversationLoadingOverlay
