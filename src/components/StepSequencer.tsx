import { DRUM_LABELS, DRUM_LANES, type Track } from '../types'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'

const velClass = (v: number) => (v <= 0 ? '' : v < 0.6 ? 'vel-soft' : v < 0.9 ? 'vel-med' : 'vel-hard')

export function StepSequencer({ track }: { track: Track }) {
  const currentStep = useStore((s) => s.currentStep)
  const toggleDrum = useStore((s) => s.toggleDrum)
  const clearTrack = useStore((s) => s.clearTrack)
  const clipboard = useStore((s) => s.clipboard)
  const copyTrack = useStore((s) => s.copyTrack)
  const pasteTrack = useStore((s) => s.pasteTrack)

  const playCol = currentStep >= 0 ? currentStep % 16 : -1

  return (
    <div className="stepseq">
      <div className="editor-toolbar">
        <span className="editor-title" style={{ color: track.color }}>
          {track.name}
        </span>
        <span className="toolbar-tip">
          16 steps = 1 bar · click a step to cycle soft/med/hard/off · pattern loops every bar
        </span>
        <div className="spacer" />
        <button className="clear-btn" onClick={() => copyTrack(track.id)}>
          Copy
        </button>
        <button className="clear-btn" disabled={!clipboard} onClick={() => pasteTrack(track.id)}>
          Paste
        </button>
        <button className="clear-btn" onClick={() => clearTrack(track.id)}>
          Clear
        </button>
      </div>
      <div className="seq-grid">
        <div className="seq-header">
          <div className="seq-label" />
          {Array.from({ length: 16 }, (_, i) => (
            <div key={i} className={`seq-num ${i % 4 === 0 ? 'beat' : ''} ${i === playCol ? 'playing' : ''}`}>
              {i % 4 === 0 ? i / 4 + 1 : '·'}
            </div>
          ))}
        </div>
        {DRUM_LANES.map((lane) => (
          <div key={lane} className="seq-row">
            <button className="seq-label" onClick={() => void engine.previewDrum(lane)} title="Click to preview">
              {DRUM_LABELS[lane]}
            </button>
            {track.pattern[lane].map((v, i) => (
              <button
                key={i}
                className={`step ${v > 0 ? 'on' : ''} ${velClass(v)} ${i % 8 < 4 ? 'grp-a' : 'grp-b'} ${i === playCol ? 'playing' : ''}`}
                title={v > 0 ? `velocity ${v}` : 'off'}
                onClick={() => toggleDrum(track.id, lane, i)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
