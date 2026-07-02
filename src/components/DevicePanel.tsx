import { DRUM_LABELS, DRUM_LANES, type OscType, type Track } from '../types'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'
import { Knob } from './Knob'

const WAVES: { type: OscType; label: string; path: string }[] = [
  { type: 'sine', label: 'Sine', path: 'M1 8 Q 4.5 0, 8 8 T 15 8' },
  { type: 'triangle', label: 'Tri', path: 'M1 12 L5 4 L9 12 L13 4 L15 8' },
  { type: 'sawtooth', label: 'Saw', path: 'M1 12 L8 4 L8 12 L15 4 L15 12' },
  { type: 'square', label: 'Sqr', path: 'M1 12 L1 4 L8 4 L8 12 L15 12 L15 4' },
]

const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)
const ms = (v: number) => (v >= 1 ? `${v.toFixed(1)}s` : `${Math.round(v * 1000)}ms`)

export function DevicePanel({ track }: { track: Track }) {
  const setSynth = useStore((s) => s.setSynth)

  if (track.kind === 'drums') {
    return (
      <div className="device">
        <div className="device-section">
          <div className="device-section-title">DRUM RACK</div>
          <div className="drum-pads">
            {DRUM_LANES.map((lane) => (
              <button key={lane} className="pad" onClick={() => void engine.previewDrum(lane)}>
                {DRUM_LABELS[lane]}
              </button>
            ))}
          </div>
        </div>
        <div className="device-note">
          909-style synthesized kit — kick from a pitched membrane, snare/clap from filtered noise,
          hats from inharmonic FM. Click a pad to audition.
        </div>
      </div>
    )
  }

  const p = track.synth
  const set = (patch: Partial<typeof p>) => setSynth(track.id, patch)

  return (
    <div className="device">
      <div className="device-section">
        <div className="device-section-title">OSC</div>
        <div className="wave-btns">
          {WAVES.map((w) => (
            <button
              key={w.type}
              className={`wave ${p.osc === w.type ? 'on' : ''}`}
              onClick={() => set({ osc: w.type })}
              title={w.type}
            >
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path d={w.path} stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <div className="device-section">
        <div className="device-section-title">FILTER</div>
        <div className="knob-row">
          <Knob label="Cutoff" value={p.cutoff} min={40} max={16000} log format={hz} onChange={(v) => set({ cutoff: v })} />
          <Knob label="Res" value={p.resonance} min={0.1} max={20} format={(v) => v.toFixed(1)} onChange={(v) => set({ resonance: v })} />
        </div>
      </div>
      <div className="device-section">
        <div className="device-section-title">ENVELOPE</div>
        <div className="knob-row">
          <Knob label="Attack" value={p.attack} min={0.001} max={2} log format={ms} onChange={(v) => set({ attack: v })} />
          <Knob label="Decay" value={p.decay} min={0.01} max={2} log format={ms} onChange={(v) => set({ decay: v })} />
          <Knob label="Sustain" value={p.sustain} min={0} max={1} format={(v) => v.toFixed(2)} onChange={(v) => set({ sustain: v })} />
          <Knob label="Release" value={p.release} min={0.01} max={4} log format={ms} onChange={(v) => set({ release: v })} />
        </div>
      </div>
      <div className="device-section">
        <div className="device-section-title">OUT</div>
        <div className="knob-row">
          <Knob label="Volume" value={p.volume} min={-30} max={0} format={(v) => `${v.toFixed(0)}dB`} onChange={(v) => set({ volume: v })} />
        </div>
      </div>
    </div>
  )
}
