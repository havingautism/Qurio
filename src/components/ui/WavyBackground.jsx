import { cn } from '../../lib/utils'
import { useEffect, useMemo, useRef } from 'react'
import { createNoise3D } from 'simplex-noise'

const withAlpha = (color, alpha) => {
  if (!color) return `rgba(0,0,0,${alpha})`
  if (color.startsWith('rgba(')) return color
  if (color.startsWith('rgb(')) {
    return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
  }
  if (color.startsWith('#')) {
    const hex = color.replace('#', '')
    if (hex.length !== 6) return color
    const r = Number.parseInt(hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return color
}

const resolveSpeed = speed => {
  if (typeof speed === 'number') return speed
  if (speed === 'slow') return 0.00075
  if (speed === 'fast') return 0.002
  return 0.0012
}

export const WavyBackground = ({
  children,
  className,
  containerClassName,
  colors = [],
  lineCount = 6,
  waveWidth = 48,
  focalPoint = 0.56,
  verticalSpread = 0.24,
  amplitude = 64,
  backgroundFill = 'transparent',
  blur = 12,
  speed = 'fast',
  waveOpacity = 0.35,
  blendMode = 'normal',
  ...props
}) => {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const noiseRef = useRef(createNoise3D())

  const palette = useMemo(() => {
    const fallback = ['#a78bfa', '#818cf8', '#60a5fa', '#22d3ee']
    return (Array.isArray(colors) && colors.length > 0 ? colors : fallback).filter(Boolean)
  }, [colors])

  const speedValue = useMemo(() => resolveSpeed(speed), [speed])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined

    let width = 0
    let height = 0
    let tick = 0

    const resize = () => {
      const parent = canvas.parentElement
      const rect = parent?.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect?.width || window.innerWidth))
      height = Math.max(1, Math.floor(rect?.height || window.innerHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.filter = `blur(${blur}px)`
    }

    const draw = () => {
      tick += speedValue

      if (backgroundFill === 'transparent') {
        ctx.clearRect(0, 0, width, height)
      } else {
        ctx.fillStyle = backgroundFill
        ctx.fillRect(0, 0, width, height)
      }

      const noise = noiseRef.current
      for (let line = 0; line < lineCount; line += 1) {
        const ratio = lineCount === 1 ? 0.5 : line / (lineCount - 1)
        const centered = ratio - 0.5
        const baseY = height * focalPoint + centered * height * verticalSpread
        const lineAmplitude = amplitude * (0.62 + Math.abs(centered) * 0.72)
        const freq = 0.0016 + ratio * 0.001
        const drift = 0.3 + ratio * 0.45
        const color = palette[line % palette.length]

        // Core stroke + glow stroke to approximate Aceternity's neon band look.
        const passes = [
          { width: waveWidth * (1.45 - Math.abs(centered) * 0.35), alpha: waveOpacity * 0.42 },
          { width: waveWidth * (0.92 - Math.abs(centered) * 0.18), alpha: waveOpacity * 0.95 },
        ]

        for (const pass of passes) {
          ctx.beginPath()
          ctx.lineWidth = Math.max(6, pass.width)
          ctx.strokeStyle = withAlpha(color, Math.min(1, pass.alpha))

          for (let x = -16; x <= width + 16; x += 8) {
            const n = noise(x * freq, ratio * 0.8, tick * drift)
            const y = baseY + n * lineAmplitude
            if (x <= -16) {
              ctx.moveTo(x, y)
            } else {
              ctx.lineTo(x, y)
            }
          }
          ctx.stroke()
          ctx.closePath()
        }
      }

      rafRef.current = window.requestAnimationFrame(draw)
    }

    resize()
    rafRef.current = window.requestAnimationFrame(draw)
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(rafRef.current)
    }
  }, [
    amplitude,
    backgroundFill,
    blur,
    focalPoint,
    lineCount,
    palette,
    speedValue,
    verticalSpread,
    waveOpacity,
    waveWidth,
  ])

  return (
    <div className={cn('relative h-full w-full overflow-hidden', containerClassName)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0"
        style={{ mixBlendMode: blendMode }}
      />
      <div className={cn('relative z-10', className)} {...props}>
        {children}
      </div>
    </div>
  )
}
