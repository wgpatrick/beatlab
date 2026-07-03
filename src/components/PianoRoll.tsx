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
const DRAG_THRESHOLD = 4 // px of movement before a click becomes a drag, not a delete
const RESIZE_ZONE = 7 // px from the right edge that grabs the resize handle instead of moving

const BLACK = new Set([1, 3, 6, 8, 10])

const LENGTHS = [
  { label: '1/16', v: 1 },
  { label: '1/8', v: 2 },
  { label: '1/4', v: 4 },
  { label: '1/2', v: 8 },
  { label: '1 bar', v: 16 },
]

const VELOCITIES = [
  { label: 'Soft', v: 0.5 },
  { label: 'Med', v: 0.8 },
  { label: 'Hard', v: 1 },
]

const SCALES: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  'Major Pentatonic': [0, 2, 4, 7, 9],
  'Minor Pentatonic': [0, 3, 5, 7, 10],
}
const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

interface NoteDrag {
  noteId: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origStart: number
  origPitch: number
  origDuration: number
  moved: boolean
}

export function PianoRoll({ track }: { track: Track }) {
  const loopBars = useStore((s) => s.loopBars)
  const currentStep = useStore((s) => s.currentStep)
  const noteLength = useStore((s) => s.noteLength)
  const setNoteLength = useStore((s) => s.setNoteLength)
  const noteVelocity = useStore((s) => s.noteVelocity)
  const setNoteVelocity = useStore((s) => s.setNoteVelocity)
  const addNote = useStore((s) => s.addNote)
  const removeNote = useStore((s) => s.removeNote)
  const updateNote = useStore((s) => s.updateNote)
  const pushHistory = useStore((s) => s.pushHistory)
  const clearTrack = useStore((s) => s.clearTrack)
  const clipboard = useStore((s) => s.clipboard)
  const copyTrack = useStore((s) => s.copyTrack)
  const pasteTrack = useStore((s) => s.pasteTrack)
  const saveClip = useStore((s) => s.saveClip)
  const loadClip = useStore((s) => s.loadClip)
  const scaleLock = useStore((s) => s.scaleLock)
  const setScaleLock = useStore((s) => s.setScaleLock)
  const mode = useStore((s) => s.mode)
  const currentLessonId = useStore((s) => s.currentLessonId)

  const lesson = mode === 'lesson' ? findLesson(currentLessonId) : undefined
  const scalePcs = lesson?.scalePcs ?? (scaleLock ? SCALES[scaleLock.scale].map((iv) => (iv + scaleLock.root) % 12) : undefined)

  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<NoteDrag | null>(null)

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

  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const col = Math.floor(x / CELL)
    const pitch = MAX_PITCH - Math.floor(y / ROW)
    if (col < 0 || col >= steps || pitch < MIN_PITCH || pitch > MAX_PITCH) return
    addNote(track.id, pitch, col)
  }

  const onNotePointerDown = (e: React.PointerEvent<HTMLDivElement>, note: Track['notes'][number]) => {
    e.stopPropagation()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const mode: 'move' | 'resize' = rect.right - e.clientX <= RESIZE_ZONE ? 'resize' : 'move'
    dragRef.current = {
      noteId: note.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStart: note.start,
      origPitch: note.pitch,
      origDuration: note.duration,
      moved: false,
    }
  }

  const onNotePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
      d.moved = true
      pushHistory() // one undo step for the whole gesture, not one per pixel
    }
    if (d.mode === 'resize') {
      const duration = Math.max(1, d.origDuration + Math.round(dx / CELL))
      updateNote(track.id, d.noteId, { duration })
    } else {
      const start = Math.min(steps - 1, Math.max(0, d.origStart + Math.round(dx / CELL)))
      const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, d.origPitch - Math.round(dy / ROW)))
      updateNote(track.id, d.noteId, { start, pitch })
    }
  }

  const onNotePointerUp = (note: Track['notes'][number]) => {
    const d = dragRef.current
    dragRef.current = null
    if (d && !d.moved) removeNote(track.id, note.id) // plain click, no drag — same as before
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
        <span className="toolbar-label">Velocity</span>
        <div className="seg">
          {VELOCITIES.map((vel) => (
            <button
              key={vel.label}
              className={Math.abs(noteVelocity - vel.v) < 0.05 ? 'on' : ''}
              onClick={() => setNoteVelocity(vel.v)}
            >
              {vel.label}
            </button>
          ))}
        </div>
        <span className="toolbar-tip">click: add note · drag: move · drag edge: resize · click note: delete</span>
        <div className="spacer" />
        <button className={`seg-toggle ${scaleLock ? 'on' : ''}`} onClick={() => setScaleLock(scaleLock ? null : { root: 9, scale: 'Minor' })}>
          Scale Lock
        </button>
        {scaleLock && (
          <>
            <select value={scaleLock.root} onChange={(e) => setScaleLock({ ...scaleLock, root: Number(e.target.value) })}>
              {ROOTS.map((r, i) => (
                <option key={r} value={i}>
                  {r}
                </option>
              ))}
            </select>
            <select value={scaleLock.scale} onChange={(e) => setScaleLock({ ...scaleLock, scale: e.target.value })}>
              {Object.keys(SCALES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </>
        )}
        {mode === 'sandbox' && (
          <div className="clip-strip">
            {track.clips.map((c) => (
              <button key={c.id} className="clip-chip" title="Load this clip" onClick={() => loadClip(track.id, c.id)}>
                {c.name}
              </button>
            ))}
            <button className="clip-add" title="Save current notes as a new clip" onClick={() => saveClip(track.id)}>
              +
            </button>
          </div>
        )}
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
            onPointerDown={onGridPointerDown}
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
                title={`${noteName(n.pitch)} · velocity ${n.velocity.toFixed(2)} · drag to move, drag right edge to resize, click to delete`}
                style={{
                  left: n.start * CELL,
                  top: (MAX_PITCH - n.pitch) * ROW,
                  width: n.duration * CELL - 2,
                  height: ROW - 2,
                  background: track.color,
                  opacity: 0.4 + n.velocity * 0.6,
                  touchAction: 'none',
                }}
                onPointerDown={(e) => onNotePointerDown(e, n)}
                onPointerMove={onNotePointerMove}
                onPointerUp={() => onNotePointerUp(n)}
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
