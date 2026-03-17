import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

const toStops = colors => {
  const palette = (Array.isArray(colors) ? colors : []).filter(Boolean)
  const resolved =
    palette.length > 0 ? palette : ['#3b82f6', '#a5b4fc', '#93c5fd', '#ddd6fe', '#60a5fa']
  const count = resolved.length
  return resolved
    .map((color, idx) => `${color} ${10 + (idx * 70) / Math.max(1, count - 1)}%`)
    .join(', ')
}

export const AuroraBackground = ({
  children,
  className,
  containerClassName,
  colors = [],
  darkColors = [],
  isDark = false,
  showRadialGradient = true,
  enableDifferenceLayer = true,
  useScreenBlendInDark = true,
  pauseOnVisibilityChange = false,
  resumeDelayMs = 180,
  opacity = 0.45,
  blur = 18,
  panDuration = 30,
  driftDuration = 14,
  differenceDuration = 42,
  secondaryDuration = 46,
  ...props
}) => {
  const [isPageVisible, setIsPageVisible] = useState(true)
  const [isAnimationReady, setIsAnimationReady] = useState(true)
  const resumeTimerRef = useRef(null)
  const isAnimationRunning = !pauseOnVisibilityChange || (isPageVisible && isAnimationReady)

  useEffect(() => {
    if (typeof document === 'undefined' || !pauseOnVisibilityChange) return undefined
    setIsPageVisible(document.visibilityState !== 'hidden')
    const handleVisibility = () => {
      const visible = document.visibilityState !== 'hidden'
      setIsPageVisible(visible)
      if (!visible) {
        if (resumeTimerRef.current) {
          window.clearTimeout(resumeTimerRef.current)
          resumeTimerRef.current = null
        }
        setIsAnimationReady(false)
        return
      }
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current)
      }
      // Delay restart to avoid compositor flash when switching back to tab/window.
      resumeTimerRef.current = window.setTimeout(
        () => {
          setIsAnimationReady(true)
          resumeTimerRef.current = null
        },
        Math.max(0, resumeDelayMs),
      )
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
    }
  }, [pauseOnVisibilityChange, resumeDelayMs])

  const lightStops = useMemo(() => toStops(colors), [colors])
  const darkStops = useMemo(() => toStops(darkColors), [darkColors])

  return (
    <div className={cn('relative isolate h-full w-full overflow-hidden', containerClassName)}>
      <style>
        {`
          @keyframes qurio-aurora-pan {
            0% { background-position: 0% 50%, 50% 50%; }
            50% { background-position: 100% 50%, 40% 60%; }
            100% { background-position: 0% 50%, 50% 50%; }
          }
          @keyframes qurio-aurora-drift {
            0% { transform: translate3d(-1.1%, -0.6%, 0) scale(1); }
            50% { transform: translate3d(1.1%, 0.6%, 0) scale(1.025); }
            100% { transform: translate3d(-1.1%, -0.6%, 0) scale(1); }
          }
        `}
      </style>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          '--aurora-light': `repeating-linear-gradient(100deg, ${lightStops})`,
          '--aurora-dark': `repeating-linear-gradient(100deg, ${darkStops || lightStops})`,
          '--stripe-light':
            'repeating-linear-gradient(100deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.95) 8%, transparent 11%, transparent 14%, rgba(255,255,255,0.95) 18%)',
          '--stripe-dark':
            'repeating-linear-gradient(100deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.95) 8%, transparent 11%, transparent 14%, rgba(0,0,0,0.95) 18%)',
        }}
      >
        <div
          className={cn(
            'absolute -inset-[12%] will-change-transform',
            showRadialGradient &&
              'mask-[radial-gradient(ellipse_at_50%_48%,black_18%,transparent_75%)]',
          )}
          style={{
            filter: `blur(${blur}px)`,
            opacity,
            mixBlendMode: isDark && useScreenBlendInDark ? 'screen' : 'normal',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            willChange: 'transform, opacity, background-position',
            backgroundImage: isDark
              ? 'var(--stripe-dark), var(--aurora-dark)'
              : 'var(--stripe-light), var(--aurora-light)',
            backgroundSize: '300% 220%, 200% 200%',
            animation: `qurio-aurora-pan ${panDuration}s linear infinite, qurio-aurora-drift ${driftDuration}s ease-in-out infinite`,
            animationPlayState: isAnimationRunning ? 'running' : 'paused',
          }}
        />
        {enableDifferenceLayer && (
          <div
            className={cn(
              'absolute -inset-[12%] will-change-transform',
              showRadialGradient &&
                'mask-[radial-gradient(ellipse_at_50%_48%,black_18%,transparent_75%)]',
            )}
            style={{
              filter: `blur(${Math.max(8, blur - 4)}px)`,
              opacity: isDark ? opacity * 0.62 : opacity * 0.42,
              mixBlendMode: 'difference',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              willChange: 'transform, opacity, background-position',
              backgroundImage: isDark
                ? 'var(--stripe-dark), var(--aurora-dark)'
                : 'var(--stripe-light), var(--aurora-light)',
              backgroundSize: '220% 170%, 130% 130%',
              animation: `qurio-aurora-pan ${differenceDuration}s linear infinite reverse`,
              animationPlayState: isAnimationRunning ? 'running' : 'paused',
            }}
          />
        )}
        <div
          className={cn(
            'absolute -inset-[18%] will-change-transform',
            showRadialGradient &&
              'mask-[radial-gradient(ellipse_at_50%_56%,black_10%,transparent_72%)]',
          )}
          style={{
            filter: `blur(${blur + 12}px)`,
            opacity: opacity * 0.55,
            mixBlendMode: isDark && useScreenBlendInDark ? 'screen' : 'normal',
            transform: 'translateZ(0)',
            backfaceVisibility: 'hidden',
            willChange: 'transform, opacity, background-position',
            backgroundImage: isDark ? 'var(--aurora-dark)' : 'var(--aurora-light)',
            backgroundSize: '210% 210%',
            backgroundPosition: '50% 55%',
            animation: `qurio-aurora-pan ${secondaryDuration}s linear infinite reverse`,
            animationPlayState: isAnimationRunning ? 'running' : 'paused',
          }}
        />
      </div>

      <div className={cn('relative z-10', className)} {...props}>
        {children}
      </div>
    </div>
  )
}
