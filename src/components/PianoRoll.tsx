import { useEffect, useRef } from 'react'
import { NOTE_NAMES, noteName, type Track } from '../types'
import { findLesson } from '../lessons/curriculum'
import { engine } from '../audio/engine'
import { useStore } from '../state/store'

const CELL = 26
const ROW = 16
const MAX_PITCH = 84 // C6
const MIN_PITCH = 33 // A1
const KEYS_W = 52

const BLACK = new Set([1, 3, 6, 8, 10])

const LENGTHS = [
  { label: '1/16', v: 1 },
  { label: '1/8', v: 2 },
  { label: '1/4', v: 4 },
  { label: '1/2', v: 8 },
  { label: '1 bar', v: 16 },
]

export function PianoRoll({ track }: { track: Track }) {
  const loopBars = useStore((s) => s.loopBars)
  const currentStep = useStore((s) => s.currentStep)
  const noteLength = useStore((s) => s.noteLength)
  const setNoteLength = useStore((s) => s.setNoteLength)
  const addNote = useStore((s) => s.addNote)
  const removeNote = useStore((s) => s.removeNote)
  const clearTrack = useStore((s) => s.clearTrack)
  const mode = useStore((s) => s.mode)
  const currentLessonId = useStore((s) => s.currentLessonId)

  const lesson = mode === 'lesson' ? findLesson(currentLessonId) : undefined
  const scalePcs = lesson?.scalePcs

  const scrollRef = useRef<HTMLDivElement>(null)

  const steps = loopBars * 16
  const rows = MAX_PITCH - MIN_PITCH + 1
  const gridW = steps * CELL
  const gridH = rows * ROW

  // scroll to the musically relevant range when the lesson/track changes
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const center = lesson?.centerPitch ?? 58
    el.scrollTop = (MAX_PITCH - center) * ROW - el.clientHeight / 2
    el.scrollLeft = 0
  }, [currentLessonId, mode, track.id])

  const onGridMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const col = Math.floor(x / CELL)
    const pitch = MAX_PITCH - Math.floor(y / ROW)
    if (col < 0 || col >= steps || pitch < MIN_PITCH || pitch > MAX_PITCH) return
    addNote(track.id, pitch, col)
  }

  return (
    <div className="pianoroll">
      <div className="editor-toolbar">
        <span className="editor-title" style={{ color: track.color }}>
          {track.name}
        </span>
        <span className="toolbar-label">Note length</span>
        <div className="seg">
          {LENGTHS.map((l) => (
            <button
              key={l.v}
              className={noteLength === l.v ? 'on' : ''}
              onClick={() => setNoteLength(l.v)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="toolbar-tip">click: add note · click note: delete</span>
        <div className="spacer" />
        <button className="clear-btn" onClick={() => clearTrack(track.id)}>
          Clear
        </button>
      </div>
      <div className="pianoroll-scroll" ref={scrollRef}>
        <div className="pianoroll-inner" style={{ width: KEYS_W + gridW, height: gridH }}>
          <div className="keys" style={{ width: KEYS_W }}>
            {Array.from({ length: rows }, (_, i) => {
              const pitch = MAX_PITCH - i
              const pc = pitch % 12
              return (
                <div
                  key={pitch}
                  className={`key ${BLACK.has(pc) ? 'black' : 'white'}`}
                  style={{ height: ROW }}
                  onMouseDown={() => void engine.previewNote(track, pitch)}
                >
                  {pc === 0 ? noteName(pitch) : ''}
                </div>
              )
            })}
          </div>
          <div
            className="grid"
            style={{ width: gridW, height: gridH, left: KEYS_W }}
            onMouseDown={onGridMouseDown}
          >
            {Array.from({ length: rows }, (_, i) => {
              const pitch = MAX_PITCH - i
              const pc = pitch % 12
              const inScale = scalePcs?.includes(pc)
              return (
                <div
                  key={pitch}
                  className={`grid-row ${BLACK.has(pc) ? 'row-black' : ''} ${inScale ? 'row-scale' : ''} ${pc === 0 ? 'row-c' : ''}`}
                  style={{ height: ROW }}
                />
              )
            })}
            {Array.from({ length: steps + 1 }, (_, i) => (
              <div
                key={i}
                className={`grid-vline ${i % 16 === 0 ? 'bar' : i % 4 === 0 ? 'beat' : ''}`}
                style={{ left: i * CELL }}
              />
            ))}
            {track.notes.map((n) => (
              <div
                key={n.id}
                className="note"
                title={noteName(n.pitch)}
                style={{
                  left: n.start * CELL,
                  top: (MAX_PITCH - n.pitch) * ROW,
                  width: n.duration * CELL - 2,
                  height: ROW - 2,
                  background: track.color,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  removeNote(track.id, n.id)
                }}
              >
                {n.duration >= 4 ? NOTE_NAMES[n.pitch % 12] : ''}
              </div>
            ))}
            {currentStep >= 0 && (
              <div className="playhead" style={{ left: currentStep * CELL }} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
