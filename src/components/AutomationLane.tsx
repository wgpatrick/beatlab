import type { Track } from '../types'
import { useStore } from '../state/store'

// Basic single-parameter automation: a filter-cutoff breakpoint envelope over the loop. Click
// empty space to add/move a point (quantized to the same 16th-step grid as the piano roll),
// click an existing point to remove it — the same add/delete idiom as the piano roll itself.
const CELL = 26 // matches PianoRoll's step width, so the two visually line up when stacked
const HEIGHT = 56
const MIN_HZ = 40
const MAX_HZ = 16000

const hzToY = (hz: number) => HEIGHT - (Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * HEIGHT
const yToHz = (y: number) => MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, 1 - Math.min(1, Math.max(0, y / HEIGHT)))

export function AutomationLane({ track }: { track: Track }) {
  const loopBars = useStore((s) => s.loopBars)
  const setPoint = useStore((s) => s.setAutomationPoint)
  const removePoint = useStore((s) => s.removeAutomationPoint)
  const clearAutomation = useStore((s) => s.clearAutomation)

  const steps = loopBars * 16
  const width = steps * CELL
  const points = track.cutoffAutomation ?? []

  const timeToX = (time: number) => time * width

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // clicked near an existing point? remove it instead of adding a new one
    const hit = points.find((p) => Math.abs(timeToX(p.time) - x) < 7 && Math.abs(hzToY(p.value) - y) < 7)
    if (hit) {
      removePoint(track.id, hit.time)
      return
    }
    const step = Math.min(steps - 1, Math.max(0, Math.round(x / CELL)))
    setPoint(track.id, step / steps, yToHz(y))
  }

  const sorted = [...points].sort((a, b) => a.time - b.time)
  const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${timeToX(p.time)} ${hzToY(p.value)}`).join(' ')

  return (
    <div className="automation">
      <div className="editor-toolbar">
        <span className="editor-title">Filter Automation — {track.name}</span>
        <span className="toolbar-tip">click: add/move a cutoff breakpoint · click a point: remove it</span>
        <div className="spacer" />
        <button className="clear-btn" onClick={() => clearAutomation(track.id)}>
          Clear
        </button>
      </div>
      <div className="automation-scroll">
        <div className="automation-grid" style={{ width, height: HEIGHT }} onMouseDown={onClick}>
          {Array.from({ length: steps + 1 }, (_, i) => (
            <div key={i} className={`grid-vline ${i % 16 === 0 ? 'bar' : i % 4 === 0 ? 'beat' : ''}`} style={{ left: i * CELL }} />
          ))}
          {sorted.length > 0 && (
            <svg width={width} height={HEIGHT} className="automation-svg">
              <path d={path} stroke="var(--accent)" strokeWidth="2" fill="none" />
              {sorted.map((p) => (
                <circle key={p.time} cx={timeToX(p.time)} cy={hzToY(p.value)} r="4" fill="var(--accent)" />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
