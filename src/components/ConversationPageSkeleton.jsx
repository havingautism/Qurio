import ColorBendsBackground from './ui/ColorBendsBackground'

const Bone = ({ className = '' }) => (
  <div
    className={`relative overflow-hidden rounded-full bg-white/55 dark:bg-white/10 ${className}`}
  >
    <div className="absolute inset-y-0 -left-1/3 w-1/2 animate-[pulse_1.8s_ease-in-out_infinite] bg-white/45 blur-md dark:bg-white/10" />
  </div>
)

const MessageCardSkeleton = ({ align = 'left', compact = false }) => (
  <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
    <div
      className={`w-full ${align === 'right' ? 'max-w-[62%]' : 'max-w-[76%]'} rounded-3xl border p-4 shadow-sm backdrop-blur-xl ${
        align === 'right'
          ? 'border-white/35 bg-white/55 dark:border-white/10 dark:bg-white/5'
          : 'border-white/50 bg-white/70 dark:border-white/12 dark:bg-white/7'
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {align === 'left' && <Bone className="h-6 w-6 rounded-full" />}
        <Bone className={`h-3 ${align === 'left' ? 'w-20' : 'w-14'} rounded-md`} />
      </div>
      <div className="space-y-2">
        <Bone className="h-3 w-full rounded-md" />
        <Bone className={`h-3 rounded-md ${compact ? 'w-3/4' : 'w-11/12'}`} />
        {!compact && <Bone className="h-3 w-2/3 rounded-md" />}
      </div>
    </div>
  </div>
)

const ConversationPageSkeleton = () => {
  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-[var(--color-bg-primary)]">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-35 dark:opacity-20">
        <ColorBendsBackground blur={8} speed={0.12} autoRotate={0.35} />
      </div>

      <div className="relative z-10 flex h-full flex-1 flex-col">
        <div className="border-b border-white/35 bg-white/45 px-4 py-3 backdrop-blur-xl dark:border-white/8 dark:bg-black/30">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Bone className="h-10 w-10 rounded-2xl" />
              <div className="space-y-2">
                <Bone className="h-3 w-40 rounded-md" />
                <Bone className="h-2.5 w-24 rounded-md opacity-80" />
              </div>
            </div>
            <Bone className="h-9 w-24 rounded-xl" />
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden px-4 py-4 sm:px-6">
          <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/30 to-transparent dark:from-white/5" />
          <div className="relative mx-auto flex h-full w-full max-w-5xl flex-col gap-4">
            <MessageCardSkeleton align="left" />
            <MessageCardSkeleton align="right" compact />
            <MessageCardSkeleton align="left" />

            <div className="mt-2 rounded-3xl border border-white/40 bg-white/50 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
              <div className="mb-3 flex items-center gap-2">
                <Bone className="h-5 w-5 rounded-full" />
                <Bone className="h-3 w-28 rounded-md" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Bone className="h-14 rounded-2xl" />
                <Bone className="h-14 rounded-2xl" />
                <Bone className="hidden h-14 rounded-2xl sm:block" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/35 bg-white/45 px-4 py-3 backdrop-blur-xl dark:border-white/8 dark:bg-black/30">
          <div className="mx-auto w-full max-w-5xl">
            <div className="rounded-3xl border border-white/50 bg-white/65 p-3 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
              <div className="mb-2 flex items-center gap-2">
                <Bone className="h-7 w-7 rounded-xl" />
                <Bone className="h-2.5 w-20 rounded-md" />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Bone className="h-3 w-full rounded-md" />
                  <Bone className="h-3 w-2/3 rounded-md" />
                </div>
                <Bone className="h-10 w-10 rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConversationPageSkeleton
