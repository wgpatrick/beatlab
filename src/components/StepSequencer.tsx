import { DRUM_LABELS, DRUM_LANES, type Track } from '../types'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'

export function StepSequencer({ track }: { track: Track }) {
  const currentStep = useStore((s) => s.currentStep)
  const toggleDrum = useStore((s) => s.toggleDrum)
  const clearTrack = useStore((s) => s.clearTrack)

  const playCol = currentStep >= 0 ? currentStep % 16 : -1

  return (
    <div className="stepseq">
      <div className="editor-toolbar">
        <span className="editor-title" style={{ color: track.color }}>
          {track.name}
        </span>
        <span className="toolbar-tip">16 steps = 1 bar · 4 steps = 1 beat · pattern loops every bar</span>
        <div className="spacer" />
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
            {track.pattern[lane].map((on, i) => (
              <button
                key={i}
                className={`step ${on ? 'on' : ''} ${i % 8 < 4 ? 'grp-a' : 'grp-b'} ${i === playCol ? 'playing' : ''}`}
                onClick={() => toggleDrum(track.id, lane, i)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
