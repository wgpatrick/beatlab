import { useEffect, useRef, useState } from 'react'
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
const VELOCITY_DRAG_RANGE = 120 // px of vertical drag to sweep the full 0.1..1 velocity range

const BLACK = new Set([1, 3, 6, 8, 10])

const LENGTHS = [
  { label: '1/16', v: 1 },
  { label: '1/8', v: 2 },
  { label: '1/4', v: 4 },
  { label: '1/2', v: 8 },
  { label: '1 bar', v: 16 },
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
  mode: 'move' | 'resize' | 'velocity'
  startX: number
  startY: number
  origStart: number
  origPitch: number
  origDuration: number
  origVelocity: number
  moved: boolean
}

interface CreateDrag {
  pitch: number
  startCol: number
  startX: number
  moved: boolean
}

interface BoxSelectDrag {
  startX: number
  startY: number
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
  const createRef = useRef<CreateDrag | null>(null)
  const boxSelectRef = useRef<BoxSelectDrag | null>(null)
  const wheelSessionRef = useRef<number | null>(null)
  const [creating, setCreating] = useState<{ pitch: number; start: number; duration: number } | null>(null)
  const [velocityPreview, setVelocityPreview] = useState<{ noteId: string; velocity: number } | null>(null)
  const [selectionBox, setSelectionBox] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set())

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

  // a stale selection from a different track (or a different lesson's fresh notes) doesn't mean
  // anything once the track underneath it changes
  useEffect(() => {
    setSelectedNoteIds(new Set())
  }, [track.id, currentLessonId, mode])

  // Arrow keys nudge every selected note by one step/semitone (clamped as a group, so relative
  // spacing survives hitting an edge); Delete/Backspace removes the whole selection. Global
  // listener scoped to whichever PianoRoll is currently mounted, same pattern as App.tsx's
  // space/undo shortcuts.
  useEffect(() => {
    if (selectedNoteIds.size === 0) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
      const selected = track.notes.filter((n) => selectedNoteIds.has(n.id))
      if (!selected.length) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        pushHistory()
        for (const n of selected) removeNote(track.id, n.id)
        setSelectedNoteIds(new Set())
        return
      }

      let dStart = 0
      let dPitch = 0
      if (e.key === 'ArrowLeft') dStart = -1
      else if (e.key === 'ArrowRight') dStart = 1
      else if (e.key === 'ArrowUp') dPitch = 1
      else if (e.key === 'ArrowDown') dPitch = -1
      else return
      e.preventDefault()

      if (dStart !== 0) {
        const minStart = Math.min(...selected.map((n) => n.start))
        const maxEnd = Math.max(...selected.map((n) => n.start + n.duration))
        if (minStart + dStart < 0) dStart = -minStart
        if (maxEnd + dStart > steps) dStart = steps - maxEnd
        if (dStart === 0) return
      }
      if (dPitch !== 0) {
        const minPitch = Math.min(...selected.map((n) => n.pitch))
        const maxPitch = Math.max(...selected.map((n) => n.pitch))
        if (minPitch + dPitch < MIN_PITCH) dPitch = MIN_PITCH - minPitch
        if (maxPitch + dPitch > MAX_PITCH) dPitch = MAX_PITCH - maxPitch
        if (dPitch === 0) return
      }

      pushHistory()
      for (const n of selected) {
        updateNote(track.id, n.id, { start: n.start + dStart, pitch: n.pitch + dPitch })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNoteIds, track.notes, track.id, steps, pushHistory, updateNote, removeNote])

  const onGridPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (e.shiftKey) {
      e.currentTarget.setPointerCapture(e.pointerId)
      boxSelectRef.current = { startX: x, startY: y }
      setSelectionBox({ x1: x, y1: y, x2: x, y2: y })
      return
    }
    setSelectedNoteIds(new Set()) // starting a new note replaces any existing selection
    const col = Math.floor(x / CELL)
    const pitch = MAX_PITCH - Math.floor(y / ROW)
    if (col < 0 || col >= steps || pitch < MIN_PITCH || pitch > MAX_PITCH) return
    e.currentTarget.setPointerCapture(e.pointerId)
    createRef.current = { pitch, startCol: col, startX: e.clientX, moved: false }
  }

  const onGridPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (boxSelectRef.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      setSelectionBox({
        x1: boxSelectRef.current.startX,
        y1: boxSelectRef.current.startY,
        x2: e.clientX - rect.left,
        y2: e.clientY - rect.top,
      })
      return
    }
    const d = createRef.current
    if (!d) return
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < DRAG_THRESHOLD) return
      d.moved = true
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.min(steps - 1, Math.max(0, Math.floor((e.clientX - rect.left) / CELL)))
    setCreating({ pitch: d.pitch, start: Math.min(d.startCol, col), duration: Math.abs(col - d.startCol) + 1 })
  }

  const onGridPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (boxSelectRef.current) {
      const box = selectionBox
      boxSelectRef.current = null
      setSelectionBox(null)
      if (box) {
        const bx1 = Math.min(box.x1, box.x2)
        const bx2 = Math.max(box.x1, box.x2)
        const by1 = Math.min(box.y1, box.y2)
        const by2 = Math.max(box.y1, box.y2)
        const ids = new Set(
          track.notes
            .filter((n) => {
              const nx1 = n.start * CELL
              const nx2 = nx1 + n.duration * CELL
              const ny1 = (MAX_PITCH - n.pitch) * ROW
              const ny2 = ny1 + ROW
              return nx1 < bx2 && nx2 > bx1 && ny1 < by2 && ny2 > by1
            })
            .map((n) => n.id),
        )
        setSelectedNoteIds(ids)
      }
      return
    }
    const d = createRef.current
    createRef.current = null
    if (!d) return
    if (d.moved) {
      const rect = e.currentTarget.getBoundingClientRect()
      const col = Math.min(steps - 1, Math.max(0, Math.floor((e.clientX - rect.left) / CELL)))
      const start = Math.min(d.startCol, col)
      const duration = Math.abs(col - d.startCol) + 1
      addNote(track.id, d.pitch, start, duration)
    } else {
      addNote(track.id, d.pitch, d.startCol)
    }
    setCreating(null)
  }

  // Touch scrolling: the grid deliberately has no touch-action:none, so a finger drag pans the
  // roll and the browser fires pointercancel on whatever gesture was in flight. Abandon it —
  // without this a canceled touch would leave a phantom half-drawn note preview behind.
  const onGridPointerCancel = () => {
    boxSelectRef.current = null
    setSelectionBox(null)
    createRef.current = null
    setCreating(null)
  }

  const onNotePointerDown = (e: React.PointerEvent<HTMLDivElement>, note: Track['notes'][number]) => {
    e.stopPropagation()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    const mode: 'move' | 'resize' | 'velocity' = e.altKey
      ? 'velocity'
      : rect.right - e.clientX <= RESIZE_ZONE
        ? 'resize'
        : 'move'
    dragRef.current = {
      noteId: note.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origStart: note.start,
      origPitch: note.pitch,
      origDuration: note.duration,
      origVelocity: note.velocity,
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
    } else if (d.mode === 'velocity') {
      // Up = louder, down = softer — dy is negative when the pointer moves up.
      const velocity = Math.min(1, Math.max(0.1, d.origVelocity - dy / VELOCITY_DRAG_RANGE))
      updateNote(track.id, d.noteId, { velocity })
      setVelocityPreview({ noteId: d.noteId, velocity })
    } else {
      const start = Math.min(steps - 1, Math.max(0, d.origStart + Math.round(dx / CELL)))
      const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, d.origPitch - Math.round(dy / ROW)))
      updateNote(track.id, d.noteId, { start, pitch })
    }
  }

  const onNotePointerUp = (note: Track['notes'][number]) => {
    const d = dragRef.current
    dragRef.current = null
    setVelocityPreview(null)
    // Plain click (no drag) deletes — except an Alt+click held for velocity that never actually
    // moved, which would otherwise delete a note the user was just trying to nudge.
    if (d && !d.moved && d.mode !== 'velocity') removeNote(track.id, note.id)
  }

  // A canceled touch on a note must NOT fall through to onNotePointerUp's tap-deletes rule —
  // the user was scrolling, not deleting.
  const onNotePointerCancel = () => {
    dragRef.current = null
    setVelocityPreview(null)
  }

  const onNoteWheel = (e: React.WheelEvent<HTMLDivElement>, note: Track['notes'][number]) => {
    e.preventDefault()
    e.stopPropagation()
    // Group a burst of wheel ticks (scrolling to dial in a value) into one undo step instead of
    // one per tick, same "one step per gesture" rule as dragging — a pause of 600ms+ starts a new one.
    if (wheelSessionRef.current === null) pushHistory()
    else window.clearTimeout(wheelSessionRef.current)
    wheelSessionRef.current = window.setTimeout(() => {
      wheelSessionRef.current = null
    }, 600)
    const velocity = Math.min(1, Math.max(0.1, note.velocity + (e.deltaY < 0 ? 0.05 : -0.05)))
    updateNote(track.id, note.id, { velocity })
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
              title={selectedNoteIds.size ? `Set the ${selectedNoteIds.size} selected note(s) to this length` : 'Length for new notes'}
              onClick={() => {
                setNoteLength(l.v)
                if (selectedNoteIds.size) {
                  pushHistory()
                  for (const id of selectedNoteIds) updateNote(track.id, id, { duration: l.v })
                }
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
        {selectedNoteIds.size > 0 && (
          <span className="toolbar-label selection-count">{selectedNoteIds.size} selected</span>
        )}
        <span className="toolbar-label">Velocity {Math.round(noteVelocity * 100)}%</span>
        <input
          className="velocity-slider"
          type="range"
          min={0.1}
          max={1}
          step={0.01}
          value={noteVelocity}
          onChange={(e) => setNoteVelocity(Number(e.target.value))}
        />
        <span className="toolbar-tip">click: add note · drag: draw length · shift+drag: box-select · arrows: move selection · delete: remove selection · drag note: move · drag edge: resize · alt+drag note: velocity · scroll note: quick velocity · click note: delete</span>
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
                  onPointerDown={() => void engine.previewNote(track, pitch)}
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
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerCancel}
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
                className={`note ${selectedNoteIds.has(n.id) ? 'selected' : ''}`}
                title={`${noteName(n.pitch)} · velocity ${n.velocity.toFixed(2)} · drag to move, drag right edge to resize, alt+drag to change velocity, scroll for quick velocity, click to delete`}
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
                onPointerCancel={onNotePointerCancel}
                onWheel={(e) => onNoteWheel(e, n)}
              >
                {NOTE_NAMES[n.pitch % 12]}
              </div>
            ))}
            {velocityPreview && (() => {
              const n = track.notes.find((x) => x.id === velocityPreview.noteId)
              if (!n) return null
              return (
                <div className="velocity-readout" style={{ left: n.start * CELL, top: (MAX_PITCH - n.pitch) * ROW - 18 }}>
                  {Math.round(velocityPreview.velocity * 100)}%
                </div>
              )
            })()}
            {creating && (
              <div
                className="note note-creating"
                style={{
                  left: creating.start * CELL,
                  top: (MAX_PITCH - creating.pitch) * ROW,
                  width: creating.duration * CELL - 2,
                  height: ROW - 2,
                  background: track.color,
                }}
              />
            )}
            {currentStep >= 0 && (
              <div className="playhead" style={{ left: currentStep * CELL }} />
            )}
            {selectionBox && (
              <div
                className="selection-box"
                style={{
                  left: Math.min(selectionBox.x1, selectionBox.x2),
                  top: Math.min(selectionBox.y1, selectionBox.y2),
                  width: Math.abs(selectionBox.x2 - selectionBox.x1),
                  height: Math.abs(selectionBox.y2 - selectionBox.y1),
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
