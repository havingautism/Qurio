import { useEffect, useMemo, useRef } from 'react'
import { cn } from '../../lib/utils'

const withAlpha = (color, alpha) => {
  if (!color) return `rgba(0, 0, 0, ${alpha})`
  const normalized = String(color).trim()
  if (normalized.startsWith('rgba(')) return normalized
  if (normalized.startsWith('rgb(')) {
    return normalized.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }
  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1)
    if (hex.length !== 6) return normalized
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    if ([r, g, b].some(v => Number.isNaN(v))) return normalized
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return normalized
}

export const StableAuroraBackground = ({
  children,
  className,
  containerClassName,
  colors = [],
  darkColors = [],
  isDark = false,
  opacity = 0.55,
  blur = 46,
  lineCount = 5,
  speed = 0.14,
  showRadialGradient = true,
  ...props
}) => {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const resizeObserverRef = useRef(null)

  const palette = useMemo(() => {
    const fallback = isDark
      ? ['#22d3ee', '#38bdf8', '#818cf8', '#c084fc', '#f472b6']
      : ['#67e8f9', '#60a5fa', '#a5b4fc', '#c4b5fd', '#f9a8d4']
    const source = isDark ? darkColors : colors
    const resolved = Array.isArray(source) && source.length > 0 ? source : fallback
    return resolved.filter(Boolean)
  }, [colors, darkColors, isDark])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true })
    if (!ctx) return undefined

    let width = 0
    let height = 0
    let dpr = 1
    let lastFrame = 0
    const frameInterval = 1000 / 30

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }

    const drawBand = (now, index) => {
      const bandRatio = lineCount <= 1 ? 0.5 : index / (lineCount - 1)
      const centerOffset = bandRatio - 0.5
      const baseY = height * (0.48 + centerOffset * 0.42)
      const ampA = height * (0.035 + Math.abs(centerOffset) * 0.02)
      const ampB = ampA * 0.55
      const thickness = height * (0.12 - Math.abs(centerOffset) * 0.022)
      const colorA = palette[index % palette.length]
      const colorB = palette[(index + 1) % palette.length]
      const colorC = palette[(index + 2) % palette.length]
      const freqA = 0.006 + bandRatio * 0.002
      const freqB = 0.011 + bandRatio * 0.003
      const phase = now * (0.2 + bandRatio * 0.12)

      const gradient = ctx.createLinearGradient(0, baseY, width, baseY)
      gradient.addColorStop(0, withAlpha(colorA, Math.min(1, opacity * 0.58)))
      gradient.addColorStop(0.5, withAlpha(colorB, Math.min(1, opacity * 0.82)))
      gradient.addColorStop(1, withAlpha(colorC, Math.min(1, opacity * 0.58)))

      ctx.beginPath()
      for (let x = -20; x <= width + 20; x += 10) {
        const y =
          baseY +
          Math.sin(x * freqA + phase + index * 1.3) * ampA +
          Math.cos(x * freqB - phase * 0.7 - index * 0.8) * ampB
        if (x <= -20) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = gradient
      ctx.lineWidth = Math.max(18, thickness)
      ctx.shadowColor = withAlpha(colorB, isDark ? 0.36 : 0.24)
      ctx.shadowBlur = Math.max(20, blur)
      ctx.globalAlpha = 1
      ctx.stroke()

      ctx.strokeStyle = withAlpha(colorB, Math.min(1, opacity * 0.3))
      ctx.lineWidth = Math.max(10, thickness * 0.52)
      ctx.shadowBlur = Math.max(8, blur * 0.38)
      ctx.stroke()
      ctx.closePath()
    }

    const render = timestamp => {
      if (timestamp - lastFrame < frameInterval) {
        rafRef.current = window.requestAnimationFrame(render)
        return
      }
      lastFrame = timestamp
      const now = (timestamp * speed) / 1000
      ctx.clearRect(0, 0, width, height)
      for (let i = 0; i < lineCount; i += 1) {
        drawBand(now, i)
      }
      rafRef.current = window.requestAnimationFrame(render)
    }

    resize()
    resizeObserverRef.current = new ResizeObserver(resize)
    resizeObserverRef.current.observe(canvas.parentElement)
    rafRef.current = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(rafRef.current)
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect()
        resizeObserverRef.current = null
      }
    }
  }, [blur, isDark, lineCount, opacity, palette, speed])

  return (
    <div className={cn('relative h-full w-full overflow-hidden', containerClassName)}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 z-0',
          showRadialGradient
            ? 'mask-[radial-gradient(ellipse_at_50%_50%,black_26%,transparent_82%)]'
            : '',
        )}
      />
      <div className={cn('relative z-10', className)} {...props}>
        {children}
      </div>
    </div>
  )
}
