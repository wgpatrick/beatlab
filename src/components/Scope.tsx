import { useEffect, useRef, useState } from 'react'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'

// A little surprise: a live, glowing oscilloscope/spectrum view of the master output, always
// visible in the device panel regardless of which track is selected or what a lesson exposes —
// not a gradable parameter, just something fun and genuinely useful to watch change in real time
// as a patch is tweaked (a sawtooth's buzz, a filter sweep opening up harmonics, an LFO wobble).
const WIDTH = 220
const HEIGHT = 72

export function Scope() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mode, setMode] = useState<'wave' | 'spectrum'>('wave')
  const masterLevel = useStore((s) => s.masterLevel)
  const levelRef = useRef(masterLevel)
  levelRef.current = masterLevel

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const w = canvas.width
      const h = canvas.height

      // Louder = brighter/more saturated glow — a little extra life tied to the same master
      // meter reading Phase K already tracks, rather than a static color.
      const level = levelRef.current ?? -60
      const intensity = Math.max(0, Math.min(1, (level + 40) / 40))
      const glow = 4 + intensity * 10
      const color = `hsl(${38 - intensity * 10}, 100%, ${52 + intensity * 15}%)`

      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()

      ctx.shadowColor = color
      ctx.shadowBlur = glow
      ctx.strokeStyle = color
      ctx.fillStyle = color

      if (mode === 'wave') {
        const data = engine.getWaveformData()
        if (data && data.length) {
          ctx.lineWidth = 1.5
          ctx.beginPath()
          for (let i = 0; i < data.length; i++) {
            const x = (i / (data.length - 1)) * w
            const y = h / 2 - data[i] * (h / 2 - 2)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }
      } else {
        const data = engine.getFftData()
        if (data && data.length) {
          const bars = 48 // downsample 256 bins to a cleaner bar count
          const binsPerBar = Math.floor(data.length / bars)
          const barW = w / bars
          for (let i = 0; i < bars; i++) {
            let sum = 0
            for (let j = 0; j < binsPerBar; j++) sum += data[i * binsPerBar + j]
            const db = sum / binsPerBar
            const norm = Math.max(0, Math.min(1, (db + 90) / 90))
            const barH = norm * (h - 4)
            ctx.fillRect(i * barW + 1, h - barH, barW - 2, barH)
          }
        }
      }
      ctx.shadowBlur = 0
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [mode])

  return (
    <div className="device-section scope-section">
      <div className="device-section-title scope-title" title="Live view of the whole mix">
        SCOPE
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        className="scope-canvas"
        title="Click to switch between waveform and spectrum"
        onClick={() => setMode((m) => (m === 'wave' ? 'spectrum' : 'wave'))}
      />
      <div className="device-note scope-label">{mode === 'wave' ? 'Waveform' : 'Spectrum'} · master out</div>
    </div>
  )
}
