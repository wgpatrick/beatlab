import { SECTION_TYPES, type SectionType } from '../types'
import { useStore } from '../state/store'

const SECTION_COLORS: Record<SectionType, string> = {
  Intro: '#61afef',
  Buildup: '#e5c07b',
  Drop: '#e06c75',
  Breakdown: '#56b6c2',
  Outro: '#98c379',
}

const SECTION_BLURBS: Record<SectionType, string> = {
  Intro: 'Sparse, mixable opening',
  Buildup: 'Rising tension',
  Drop: 'Full energy payoff',
  Breakdown: 'Strip back, breathe',
  Outro: 'Wind down to the end',
}

export function ArrangementView() {
  const arrangement = useStore((s) => s.arrangement)
  const tracks = useStore((s) => s.tracks)
  const currentStep = useStore((s) => s.currentStep)
  const setSection = useStore((s) => s.setSection)
  const toggleActive = useStore((s) => s.toggleActive)

  if (arrangement.mode === 'structure') {
    return (
      <div className="arrangement">
        <div className="editor-toolbar">
          <span className="editor-title">Arrangement — Song Structure</span>
          <span className="toolbar-tip">choose a section type for each slot, left to right</span>
        </div>
        <div className="structure-slots">
          {arrangement.sections.map((sec, i) => (
            <div
              key={i}
              className="slot"
              style={{ borderTopColor: sec ? SECTION_COLORS[sec] : '#3a3a3a' }}
            >
              <div className="slot-num">{i + 1}</div>
              <select
                value={sec ?? ''}
                onChange={(e) => setSection(i, e.target.value as SectionType)}
              >
                <option value="" disabled>
                  — pick —
                </option>
                {SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div className="legend">
          {SECTION_TYPES.map((t) => (
            <div key={t} className="legend-item">
              <span className="dot" style={{ background: SECTION_COLORS[t] }} />
              <b>{t}</b> — {SECTION_BLURBS[t]}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // energy mode: tracks × sections matrix
  const playBar = currentStep >= 0 ? Math.floor(currentStep / 16) : -1
  const playSection = playBar >= 0 ? Math.floor(playBar / arrangement.barsPerSection) : -1

  return (
    <div className="arrangement">
      <div className="editor-toolbar">
        <span className="editor-title">Arrangement — Energy Curve</span>
        <span className="toolbar-tip">
          toggle which tracks play in each section ({arrangement.barsPerSection} bars each) · press play to hear the whole arc
        </span>
      </div>
      <div className="energy-grid">
        <div className="energy-row header">
          <div className="energy-track" />
          {arrangement.sections.map((sec, i) => (
            <div
              key={i}
              className={`energy-section ${i === playSection ? 'playing' : ''}`}
              style={{ color: sec ? SECTION_COLORS[sec] : undefined }}
            >
              {sec}
            </div>
          ))}
        </div>
        {tracks.map((t) => (
          <div key={t.id} className="energy-row">
            <div className="energy-track" style={{ color: t.color }}>
              {t.name}
            </div>
            {arrangement.sections.map((_, i) => {
              const on = arrangement.active[t.id]?.[i] ?? false
              return (
                <button
                  key={i}
                  className={`energy-cell ${on ? 'on' : ''} ${i === playSection ? 'playing' : ''}`}
                  style={on ? { background: t.color } : undefined}
                  onClick={() => toggleActive(t.id, i)}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="energy-tip">
        Tip: click a track name in the strip above to edit its clip — the arrangement uses whatever is
        in each track.
      </div>
    </div>
  )
}
