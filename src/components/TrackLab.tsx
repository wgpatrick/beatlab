import { useEffect, useRef, useState } from 'react'
import { SECTION_TYPES, type SectionType } from '../types'
import { useStore } from '../state/store'
import { gradeStructureMap } from '../lessons/deconstruction'
import { SECTION_COLORS } from './ArrangementView'

// Track Lab: import any song you own, see its skeleton — tempo, energy curve, LOW/MID/HIGH band
// activity, proposed section boundaries — then do the producer's deconstruction exercise on it:
// label the structure, table the elements, and steal the skeleton/break into BeatLab itself.
// All analysis is local (audio/analysis.ts); nothing is uploaded anywhere.

const BAND_ROWS = [
  { key: 'rms', label: 'ENERGY', color: '#ffb02e' },
  { key: 'low', label: 'LOW', color: '#e06c75' },
  { key: 'mid', label: 'MID', color: '#f7c948' },
  { key: 'high', label: 'HIGH', color: '#56b6c2' },
] as const

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TrackLab() {
  const trackLab = useStore((s) => s.trackLab)
  const loadTrackLabFile = useStore((s) => s.loadTrackLabFile)
  const setTrackLabLabel = useStore((s) => s.setTrackLabLabel)
  const setTrackLabNote = useStore((s) => s.setTrackLabNote)
  const setTrackLabBpmFactor = useStore((s) => s.setTrackLabBpmFactor)
  const setTrackLabFeedback = useStore((s) => s.setTrackLabFeedback)
  const playTrackLabSection = useStore((s) => s.playTrackLabSection)
  const chopTrackLabSection = useStore((s) => s.chopTrackLabSection)
  const useTrackLabTemplate = useStore((s) => s.useTrackLabTemplate)

  const fileInput = useRef<HTMLInputElement>(null)
  const waveCanvas = useRef<HTMLCanvasElement>(null)
  const bandCanvas = useRef<HTMLCanvasElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const { analysis, labels, notes, status, playingSection } = trackLab

  const onFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void loadTrackLabFile(file)
  }

  // waveform overview + section boundaries
  useEffect(() => {
    const canvas = waveCanvas.current
    if (!canvas || !analysis) return
    const W = (canvas.width = canvas.clientWidth * 2)
    const H = (canvas.height = canvas.clientHeight * 2)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    // playing-section backdrop
    if (playingSection !== null && analysis.sections[playingSection]) {
      const s = analysis.sections[playingSection]
      const x0 = ((analysis.firstBeatSec + s.startBar * analysis.barSec) / analysis.durationSec) * W
      const x1 = ((analysis.firstBeatSec + s.endBar * analysis.barSec) / analysis.durationSec) * W
      ctx.fillStyle = 'rgba(255,176,46,0.12)'
      ctx.fillRect(x0, 0, x1 - x0, H)
    }
    // waveform
    ctx.fillStyle = '#5a6a7a'
    const n = analysis.peaks.length
    const bw = W / n
    for (let i = 0; i < n; i++) {
      const h = Math.max(2, analysis.peaks[i] * H * 0.92)
      ctx.fillRect(i * bw, (H - h) / 2, Math.max(1, bw * 0.8), h)
    }
    // section boundaries
    for (const s of analysis.sections) {
      const x = ((analysis.firstBeatSec + s.startBar * analysis.barSec) / analysis.durationSec) * W
      ctx.strokeStyle = 'rgba(255,176,46,0.75)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, H)
      ctx.stroke()
    }
  }, [analysis, playingSection])

  // per-bar ENERGY / LOW / MID / HIGH heat strips
  useEffect(() => {
    const canvas = bandCanvas.current
    if (!canvas || !analysis) return
    const W = (canvas.width = canvas.clientWidth * 2)
    const H = (canvas.height = canvas.clientHeight * 2)
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)
    const rowH = H / BAND_ROWS.length
    const span = analysis.durationSec
    for (let r = 0; r < BAND_ROWS.length; r++) {
      const { key, color } = BAND_ROWS[r]
      for (let b = 0; b < analysis.barCount; b++) {
        const v = analysis.bars[b][key]
        const x0 = ((analysis.firstBeatSec + b * analysis.barSec) / span) * W
        const x1 = ((analysis.firstBeatSec + (b + 1) * analysis.barSec) / span) * W
        ctx.globalAlpha = 0.12 + v * 0.88
        ctx.fillStyle = color
        ctx.fillRect(x0, r * rowH + 2, Math.max(1, x1 - x0 - 1), rowH - 4)
      }
    }
    ctx.globalAlpha = 1
  }, [analysis])

  if (status === 'empty' || status === 'error' || status === 'analyzing') {
    return (
      <div className="tracklab">
        <div
          className={`tl-dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            onFiles(e.dataTransfer.files)
          }}
          onClick={() => fileInput.current?.click()}
        >
          {status === 'analyzing' ? (
            <>
              <div className="tl-drop-title">Analyzing “{trackLab.fileName}”…</div>
              <div className="tl-drop-sub">detecting tempo · measuring band energy · finding section boundaries</div>
            </>
          ) : (
            <>
              <div className="tl-drop-title">Drop in a song you love</div>
              <div className="tl-drop-sub">
                mp3 · wav · m4a · flac — BeatLab X-rays it: tempo, energy curve, LOW/MID/HIGH bands, and
                proposed sections. Analysis runs entirely in your browser; nothing is uploaded.
              </div>
              {status === 'error' && (
                <div className="tl-error">Couldn't analyze “{trackLab.fileName}”: {trackLab.error}</div>
              )}
              <div className="tl-drop-hint">click to browse, or drag a file here</div>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac"
            style={{ display: 'none' }}
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
      </div>
    )
  }

  if (!analysis) return null
  const allLabeled = labels.length > 0 && labels.every((l) => l !== null)
  const mapPassed = trackLab.feedback?.pass && allLabeled

  return (
    <div className="tracklab">
      <div className="editor-toolbar">
        <span className="editor-title">Track Lab — {trackLab.fileName}</span>
        <span className="tl-stat">{fmtTime(analysis.durationSec)}</span>
        <span className="tl-stat tl-bpm" title="Detected tempo (approximate). If it hears double/half time, correct it — the bar grid depends on it.">
          {analysis.bpm} BPM
          <button className="tl-mini" title="Tempo is actually double" onClick={() => setTrackLabBpmFactor(2)}>×2</button>
          <button className="tl-mini" title="Tempo is actually half" onClick={() => setTrackLabBpmFactor(0.5)}>÷2</button>
        </span>
        <span className="tl-stat">{analysis.barCount} bars · {analysis.sections.length} sections</span>
        <span className="toolbar-tip">boundaries + grid are honest approximations — your ears outrank them</span>
        <div className="spacer" />
        {playingSection !== null && (
          <button className="tl-btn" onClick={() => playTrackLabSection(null)}>■ Stop</button>
        )}
        <button className="tl-btn" onClick={() => fileInput.current?.click()}>New Song…</button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac"
          style={{ display: 'none' }}
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      <canvas ref={waveCanvas} className="tl-wave" />
      <div className="tl-bands-row">
        <div className="tl-band-labels">
          {BAND_ROWS.map((r) => (
            <div key={r.key} style={{ color: r.color }}>{r.label}</div>
          ))}
        </div>
        <canvas ref={bandCanvas} className="tl-bands" />
      </div>

      <div className="tl-sections">
        {analysis.sections.map((s, i) => {
          const barLen = s.endBar - s.startBar
          const label = labels[i]
          return (
            <div
              key={i}
              className={`tl-section ${playingSection === i ? 'playing' : ''}`}
              style={{ flexGrow: barLen, borderTopColor: label ? SECTION_COLORS[label] : '#3a3a3a' }}
            >
              <div className="tl-section-head">
                <button
                  className="tl-play"
                  title={playingSection === i ? 'Stop' : `Loop bars ${s.startBar + 1}–${s.endBar}`}
                  onClick={() => playTrackLabSection(playingSection === i ? null : i)}
                >
                  {playingSection === i ? '■' : '▶'}
                </button>
                <span className="tl-bars">{barLen} bars</span>
                <button
                  className="tl-chop"
                  title={`Chop the first ${Math.min(2, barLen)} bar(s) of this section onto the 5 drum pads`}
                  onClick={() => chopTrackLabSection(i)}
                >
                  ✂
                </button>
              </div>
              <select
                value={label ?? ''}
                onChange={(e) => setTrackLabLabel(i, e.target.value as SectionType)}
                style={label ? { color: SECTION_COLORS[label] } : undefined}
              >
                <option value="" disabled>— label —</option>
                {SECTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                className="tl-note"
                placeholder="elements you hear…"
                value={notes[i] ?? ''}
                onChange={(e) => setTrackLabNote(i, e.target.value)}
              />
            </div>
          )
        })}
      </div>

      <div className="tl-actions">
        <button
          className="check-btn tl-check"
          onClick={() => setTrackLabFeedback(gradeStructureMap(analysis, labels))}
        >
          Check Map
        </button>
        <button
          className="tl-btn tl-template"
          disabled={!mapPassed}
          title={mapPassed ? 'Rebuild this structure as a BeatLab arrangement' : 'Label all sections and pass Check Map first'}
          onClick={useTrackLabTemplate}
        >
          Use as Template →
        </button>
        {analysis.sections.length > 8 && (
          <span className="tl-stat">template uses the first 8 sections</span>
        )}
      </div>
      {trackLab.feedback && (
        <div className={`feedback tl-feedback ${trackLab.feedback.pass ? 'pass' : 'fail'}`}>
          <div className="feedback-head">{trackLab.feedback.pass ? '✓' : '✕'}</div>
          {trackLab.feedback.message}
        </div>
      )}
    </div>
  )
}
