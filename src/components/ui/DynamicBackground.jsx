import React, { useMemo, useEffect, useState } from 'react'
import ColorBendsBackground from './ColorBendsBackground'
import useSettings from '../../hooks/useSettings'
import { THEMES } from '../../lib/themes'

const hexToRgb = hex => {
  const cleaned = String(hex || '')
    .trim()
    .replace('#', '')
  if (cleaned.length !== 6) return null
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  if ([r, g, b].some(v => Number.isNaN(v))) return null
  return { r, g, b }
}

const mixHex = (base, accent, weight = 0.3) => {
  const a = hexToRgb(base)
  const b = hexToRgb(accent)
  if (!a || !b) return base || accent
  const w = Math.max(0, Math.min(1, weight))
  const r = Math.round(a.r * (1 - w) + b.r * w)
  const g = Math.round(a.g * (1 - w) + b.g * w)
  const bVal = Math.round(a.b * (1 - w) + b.b * w)
  return `#${[r, g, bVal].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

const rgbToHsl = ({ r, g, b }) => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0)
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: h * 60, s, l }
}

const hslToHex = ({ h, s, l }) => {
  const hue = ((h % 360) + 360) % 360
  if (s === 0) {
    const v = Math.round(l * 255)
    return `#${[v, v, v].map(n => n.toString(16).padStart(2, '0')).join('')}`
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = hue / 360
  const hueToRgb = t => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const r = Math.round(hueToRgb(hk + 1 / 3) * 255)
  const g = Math.round(hueToRgb(hk) * 255)
  const b = Math.round(hueToRgb(hk - 1 / 3) * 255)
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')}`
}

const shiftHexHue = (hex, deltaDeg, satBoost = 0, lightBoost = 0) => {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const hsl = rgbToHsl(rgb)
  return hslToHex({
    h: hsl.h + deltaDeg,
    s: Math.max(0, Math.min(1, hsl.s + satBoost)),
    l: Math.max(0, Math.min(1, hsl.l + lightBoost)),
  })
}

export default function DynamicBackground({ className }) {
  const { themeColor } = useSettings()
  const [isDarkMode, setIsDarkMode] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false,
  )

  useEffect(() => {
    const root = document.documentElement
    const update = () => setIsDarkMode(root.classList.contains('dark'))
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const activeTheme = THEMES[themeColor] || THEMES['violet']

  const waveColors = useMemo(() => {
    const p400 = activeTheme.colors['--color-primary-400']
    const p500 = activeTheme.colors['--color-primary-500']
    const p600 = activeTheme.colors['--color-primary-600']
    const p700 = activeTheme.colors['--color-primary-700'] || p600

    const base = isDarkMode ? p500 || p600 : p500 || p400
    // Increase saturation and lightness boosts for more pop
    const triadA = shiftHexHue(base, -40, isDarkMode ? 0.3 : 0.2, isDarkMode ? 0.1 : 0.15)
    const triadB = shiftHexHue(base, 0, isDarkMode ? 0.2 : 0.15, isDarkMode ? 0.05 : 0.1)
    const triadC = shiftHexHue(base, 45, isDarkMode ? 0.3 : 0.2, isDarkMode ? 0.1 : 0.15)

    // Mix heavily towards vibrant neon colors instead of muting them
    const neonViolet = mixHex(triadA, '#9d00ff', isDarkMode ? 0.7 : 0.5)
    const neonRose = mixHex(triadB, '#ff0055', isDarkMode ? 0.7 : 0.5)
    const neonAqua = mixHex(triadC, '#00ffcc', isDarkMode ? 0.7 : 0.5)

    // Reduce the muddiness (less mixing with black/white)
    return isDarkMode
      ? [
          mixHex(neonViolet, '#000000', 0.1), // Just 10% black to deepen
          mixHex(neonRose, '#000000', 0.15),
          mixHex(neonAqua, '#000000', 0.1),
        ]
      : [
          mixHex(neonViolet, '#ffffff', 0.05), // Just 5% white for pastel airiness
          mixHex(neonRose, '#ffffff', 0.05),
          mixHex(neonAqua, '#ffffff', 0.05),
        ]
  }, [activeTheme, isDarkMode])

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden select-none ${className || ''}`}
    >
      <ColorBendsBackground
        className="h-full"
        colors={waveColors}
        // Slightly increase speed and frequency to match the higher energy of vibrant colors
        speed={0.25}
        rotation={0}
        autoRotate={0.2}
        scale={1}
        frequency={1.5}
        warpStrength={1.2}
        mouseInfluence={0.75}
        parallax={0.5}
        noise={0.06}
        blur={isDarkMode ? 3.5 : 2.5} // Reduce blur slightly so colors don't wash out
        transparent
      />
    </div>
  )
}
