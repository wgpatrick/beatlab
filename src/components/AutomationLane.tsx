import { useState } from 'react'
import { AUTOMATABLE_PARAMS, type AutomatableParam, type Track } from '../types'
import { useStore } from '../state/store'

// Phase F: generalized from a cutoff-only lane (Phase C) to any AutomatableParam. Click empty
// space to add/move a breakpoint (quantized to the same 16th-step grid as the piano roll), click
// an existing point to remove it, shift-click to place a 'hold' (step, not ramp) point — the same
// add/delete idiom as the piano roll itself, plus one modifier key for the one extra curve shape.
const CELL = 26 // matches PianoRoll's step width, so the two visually line up when stacked
const HEIGHT = 56

interface ParamConfig {
  label: string
  min: number
  max: number
  log?: boolean
  format: (v: number) => string
}

const PARAM_CONFIG: Record<AutomatableParam, ParamConfig> = {
  cutoff: { label: 'Cutoff', min: 40, max: 16000, log: true, format: (v) => `${Math.round(v)}Hz` },
  resonance: { label: 'Resonance', min: 0.1, max: 20, format: (v) => v.toFixed(1) },
  volume: { label: 'Volume', min: -30, max: 0, format: (v) => `${v.toFixed(0)}dB` },
  pan: { label: 'Pan', min: -1, max: 1, format: (v) => v.toFixed(2) },
  sendReverb: { label: 'Reverb Send', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  sendDelay: { label: 'Delay Send', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  sendMod: { label: 'Mod FX Send', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  eqLow: { label: 'EQ Low', min: -24, max: 24, format: (v) => `${v.toFixed(1)}dB` },
  eqMid: { label: 'EQ Mid', min: -24, max: 24, format: (v) => `${v.toFixed(1)}dB` },
  eqHigh: { label: 'EQ High', min: -24, max: 24, format: (v) => `${v.toFixed(1)}dB` },
  compMix: { label: 'Comp Mix', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  distortionMix: { label: 'Distortion Mix', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  bitcrushMix: { label: 'Bitcrush Mix', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
  duckAmount: { label: 'Duck Depth', min: 0, max: 1, format: (v) => `${Math.round(v * 100)}%` },
}

function valueToY(cfg: ParamConfig, v: number): number {
  if (cfg.log) return HEIGHT - (Math.log(v / cfg.min) / Math.log(cfg.max / cfg.min)) * HEIGHT
  return HEIGHT - ((v - cfg.min) / (cfg.max - cfg.min)) * HEIGHT
}
function yToValue(cfg: ParamConfig, y: number): number {
  const frac = 1 - Math.min(1, Math.max(0, y / HEIGHT))
  if (cfg.log) return cfg.min * Math.pow(cfg.max / cfg.min, frac)
  return cfg.min + frac * (cfg.max - cfg.min)
}

export function AutomationLane({ track }: { track: Track }) {
  const loopBars = useStore((s) => s.loopBars)
  const setPoint = useStore((s) => s.setAutomationPoint)
  const removePoint = useStore((s) => s.removeAutomationPoint)
  const clearAutomation = useStore((s) => s.clearAutomation)
  const automationArm = useStore((s) => s.automationArm)
  const setAutomationArm = useStore((s) => s.setAutomationArm)
  const [param, setParam] = useState<AutomatableParam>('cutoff')

  const cfg = PARAM_CONFIG[param]
  const steps = loopBars * 16
  const width = steps * CELL
  const points = track.automation?.[param] ?? []
  const armed = automationArm?.trackId === track.id && automationArm?.param === param

  const timeToX = (time: number) => time * width

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = points.find((p) => Math.abs(timeToX(p.time) - x) < 7 && Math.abs(valueToY(cfg, p.value) - y) < 7)
    if (hit) {
      removePoint(track.id, param, hit.time)
      return
    }
    const step = Math.min(steps - 1, Math.max(0, Math.round(x / CELL)))
    setPoint(track.id, param, step / steps, yToValue(cfg, y), e.shiftKey ? 'hold' : undefined)
  }

  const sorted = [...points].sort((a, b) => a.time - b.time)
  const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'} ${timeToX(p.time)} ${valueToY(cfg, p.value)}`).join(' ')

  return (
    <div className="automation">
      <div className="editor-toolbar">
        <span className="editor-title">Automation — {track.name}</span>
        <select className="automation-param-select" value={param} onChange={(e) => setParam(e.target.value as AutomatableParam)}>
          {AUTOMATABLE_PARAMS.map((p) => (
            <option key={p} value={p}>
              {PARAM_CONFIG[p].label}
            </option>
          ))}
        </select>
        <button
          className={`tbtn recb ${armed ? 'active' : ''}`}
          title="Arm this lane for live recording — drag its knob in the device panel while playing + recording"
          onClick={() => setAutomationArm(armed ? null : { trackId: track.id, param })}
        >
          ●
        </button>
        <span className="toolbar-tip">
          click: add/move a breakpoint · shift-click: hold (step, not ramp) · click a point: remove it
        </span>
        <div className="spacer" />
        <button className="clear-btn" onClick={() => clearAutomation(track.id, param)}>
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
                <circle
                  key={p.time}
                  cx={timeToX(p.time)}
                  cy={valueToY(cfg, p.value)}
                  r="4"
                  fill={p.curve === 'hold' ? 'var(--close)' : 'var(--accent)'}
                />
              ))}
            </svg>
          )}
        </div>
      </div>
    </div>
  )
}
