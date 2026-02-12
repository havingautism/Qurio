import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { cn } from '../../lib/utils'

const MAX_COLORS = 8

const frag = `
#define MAX_COLORS ${MAX_COLORS}
uniform vec2 uCanvas;
uniform float uTime;
uniform float uSpeed;
uniform vec2 uRot;
uniform int uColorCount;
uniform vec3 uColors[MAX_COLORS];
uniform int uTransparent;
uniform float uScale;
uniform float uFrequency;
uniform float uWarpStrength;
uniform vec2 uPointer;
uniform float uMouseInfluence;
uniform float uParallax;
uniform float uNoise;
varying vec2 vUv;

void main() {
  float t = uTime * uSpeed;
  vec2 p = vUv * 2.0 - 1.0;
  p += uPointer * uParallax * 0.1;
  vec2 rp = vec2(p.x * uRot.x - p.y * uRot.y, p.x * uRot.y + p.y * uRot.x);
  vec2 q = vec2(rp.x * (uCanvas.x / uCanvas.y), rp.y);
  q /= max(uScale, 0.0001);
  q /= 0.5 + 0.2 * dot(q, q);
  q += 0.2 * cos(t) - 7.56;
  vec2 toward = (uPointer - rp);
  q += toward * uMouseInfluence * 0.2;

  vec3 col = vec3(0.0);
  float a = 1.0;

  if (uColorCount > 0) {
    vec2 s = q;
    vec3 sumCol = vec3(0.0);
    float cover = 0.0;
    for (int i = 0; i < MAX_COLORS; ++i) {
      if (i >= uColorCount) break;
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(i)) / 4.0);
      float m = mix(m0, m1, kMix);
      float w = 1.0 - exp(-6.0 / exp(6.0 * m));
      sumCol += uColors[i] * w;
      cover = max(cover, w);
    }
    col = clamp(sumCol, 0.0, 1.0);
    a = uTransparent > 0 ? cover : 1.0;
  } else {
    vec2 s = q;
    for (int k = 0; k < 3; ++k) {
      s -= 0.01;
      vec2 r = sin(1.5 * (s.yx * uFrequency) + 2.0 * cos(s * uFrequency));
      float m0 = length(r + sin(5.0 * r.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float kBelow = clamp(uWarpStrength, 0.0, 1.0);
      float kMix = pow(kBelow, 0.3);
      float gain = 1.0 + max(uWarpStrength - 1.0, 0.0);
      vec2 disp = (r - s) * kBelow;
      vec2 warped = s + disp * gain;
      float m1 = length(warped + sin(5.0 * warped.y * uFrequency - 3.0 * t + float(k)) / 4.0);
      float m = mix(m0, m1, kMix);
      col[k] = 1.0 - exp(-6.0 / exp(6.0 * m));
    }
    a = uTransparent > 0 ? max(max(col.r, col.g), col.b) : 1.0;
  }

  if (uNoise > 0.0001) {
    float n = fract(sin(dot(gl_FragCoord.xy + vec2(uTime), vec2(12.9898, 78.233))) * 43758.5453123);
    col += (n - 0.5) * uNoise;
    col = clamp(col, 0.0, 1.0);
  }

  vec3 rgb = (uTransparent > 0) ? col * a : col;
  gl_FragColor = vec4(rgb, a);
}
`

const vert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

const hexToVec3 = hex => {
  const cleaned = String(hex || '').replace('#', '').trim()
  if (cleaned.length !== 6) return new THREE.Vector3(0, 0, 0)
  const r = Number.parseInt(cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return new THREE.Vector3(0, 0, 0)
  return new THREE.Vector3(r / 255, g / 255, b / 255)
}

export default function ColorBendsBackground({
  className,
  style,
  rotation = 26,
  speed = 0.18,
  colors = [],
  transparent = true,
  autoRotate = 0.6,
  scale = 1.05,
  frequency = 1,
  warpStrength = 1.1,
  mouseInfluence = 0.35,
  parallax = 0.28,
  noise = 0.04,
  blur = 0,
}) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const rafRef = useRef(null)
  const materialRef = useRef(null)
  const resizeObserverRef = useRef(null)
  const rotationRef = useRef(rotation)
  const autoRotateRef = useRef(autoRotate)
  const pointerTargetRef = useRef(new THREE.Vector2(0, 0))
  const pointerCurrentRef = useRef(new THREE.Vector2(0, 0))
  const pointerSmoothRef = useRef(7)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)
    const uColorsArray = Array.from({ length: MAX_COLORS }, () => new THREE.Vector3(0, 0, 0))
    const material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uCanvas: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uRot: { value: new THREE.Vector2(1, 0) },
        uColorCount: { value: 0 },
        uColors: { value: uColorsArray },
        uTransparent: { value: transparent ? 1 : 0 },
        uScale: { value: scale },
        uFrequency: { value: frequency },
        uWarpStrength: { value: warpStrength },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uMouseInfluence: { value: mouseInfluence },
        uParallax: { value: parallax },
        uNoise: { value: noise },
      },
      premultipliedAlpha: true,
      transparent: true,
    })
    materialRef.current = material

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: true,
    })
    rendererRef.current = renderer
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setClearColor(0x000000, transparent ? 0 : 1)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.filter = blur > 0 ? `blur(${blur}px)` : 'none'
    renderer.domElement.style.transform = blur > 0 ? 'scale(1.02)' : 'none'
    renderer.domElement.style.transformOrigin = 'center'
    container.appendChild(renderer.domElement)

    const clock = new THREE.Clock()

    const handleResize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h, false)
      material.uniforms.uCanvas.value.set(w, h)
    }

    handleResize()

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(handleResize)
      ro.observe(container)
      resizeObserverRef.current = ro
    } else {
      window.addEventListener('resize', handleResize)
    }

    const loop = () => {
      const dt = clock.getDelta()
      const elapsed = clock.elapsedTime
      material.uniforms.uTime.value = elapsed

      const deg = (rotationRef.current % 360) + autoRotateRef.current * elapsed
      const rad = (deg * Math.PI) / 180
      material.uniforms.uRot.value.set(Math.cos(rad), Math.sin(rad))

      const cur = pointerCurrentRef.current
      const tgt = pointerTargetRef.current
      const amt = Math.min(1, dt * pointerSmoothRef.current)
      cur.lerp(tgt, amt)
      material.uniforms.uPointer.value.copy(cur)

      renderer.render(scene, camera)
      rafRef.current = window.requestAnimationFrame(loop)
    }
    rafRef.current = window.requestAnimationFrame(loop)

    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current)
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect()
      else window.removeEventListener('resize', handleResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      if (renderer.domElement && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [blur, frequency, mouseInfluence, noise, parallax, scale, speed, transparent, warpStrength])

  useEffect(() => {
    const material = materialRef.current
    const renderer = rendererRef.current
    if (!material) return

    rotationRef.current = rotation
    autoRotateRef.current = autoRotate
    material.uniforms.uSpeed.value = speed
    material.uniforms.uScale.value = scale
    material.uniforms.uFrequency.value = frequency
    material.uniforms.uWarpStrength.value = warpStrength
    material.uniforms.uMouseInfluence.value = mouseInfluence
    material.uniforms.uParallax.value = parallax
    material.uniforms.uNoise.value = noise

    const arr = (colors || [])
      .filter(Boolean)
      .slice(0, MAX_COLORS)
      .map(hexToVec3)
    for (let i = 0; i < MAX_COLORS; i += 1) {
      const vec = material.uniforms.uColors.value[i]
      if (i < arr.length) vec.copy(arr[i])
      else vec.set(0, 0, 0)
    }
    material.uniforms.uColorCount.value = arr.length
    material.uniforms.uTransparent.value = transparent ? 1 : 0

    if (renderer) renderer.setClearColor(0x000000, transparent ? 0 : 1)
    if (renderer?.domElement) {
      renderer.domElement.style.filter = blur > 0 ? `blur(${blur}px)` : 'none'
      renderer.domElement.style.transform = blur > 0 ? 'scale(1.02)' : 'none'
    }
  }, [
    rotation,
    autoRotate,
    speed,
    scale,
    frequency,
    warpStrength,
    mouseInfluence,
    parallax,
    noise,
    blur,
    colors,
    transparent,
  ])

  useEffect(() => {
    const material = materialRef.current
    const container = containerRef.current
    if (!material || !container) return undefined

    const handlePointerMove = e => {
      const rect = container.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / (rect.width || 1)) * 2 - 1
      const y = -(((e.clientY - rect.top) / (rect.height || 1)) * 2 - 1)
      pointerTargetRef.current.set(x, y)
    }
    const handlePointerLeave = () => {
      pointerTargetRef.current.set(0, 0)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn('relative h-full w-full overflow-hidden', className)}
      style={style}
    />
  )
}
