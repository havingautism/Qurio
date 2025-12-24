const getHostname = url => {
  try {
    const hostname = new URL(url).hostname
    return hostname.replace(/^www\./, '')
  } catch (e) {
    return 'Source'
  }
}

const DesktopSourcesSection = ({ sources = [], isOpen }) => {
  return (
    <div
      className={`grid transition-all duration-300 ease-spring overflow-hidden w-full ${
        isOpen ? 'grid-rows-[1fr] opacity-100 mt-3 pb-2' : 'grid-rows-[0fr] opacity-0 mt-0'
      }`}
    >
      <div className="min-h-0 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {sources.map((source, idx) => (
            <a
              key={idx}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors group border border-gray-200 dark:border-zinc-700/50"
            >
              <div className="mt-0.5 shrink-0 w-4 h-4 rounded text-[9px] font-medium bg-white dark:bg-zinc-700 text-gray-500 dark:text-gray-400 flex items-center justify-center border border-gray-200 dark:border-zinc-600 shadow-sm">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                  {source.title}
                </div>
                <div className="flex items-center gap-1.5">
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${getHostname(source.url)}&sz=128`}
                    alt=""
                    className="w-3 h-3 opacity-60 grayscale group-hover:grayscale-0 transition-all rounded-full"
                  />
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {getHostname(source.url)}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default DesktopSourcesSection
