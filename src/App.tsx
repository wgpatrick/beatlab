import { useEffect, useRef, useState } from 'react'
import { useStore } from './state/store'
import { TransportBar } from './components/TransportBar'
import { LessonSidebar } from './components/LessonSidebar'
import { LessonPanel } from './components/LessonPanel'
import { TrackStrip } from './components/TrackStrip'
import { PianoRoll } from './components/PianoRoll'
import { StepSequencer } from './components/StepSequencer'
import { ArrangementView } from './components/ArrangementView'
import { DevicePanel } from './components/DevicePanel'
import { SceneLauncher } from './components/SceneLauncher'
import { AutomationLane } from './components/AutomationLane'

// Drag-to-resize for the device panel's height and the lesson panel's width. Persists to
// localStorage so a preferred layout survives a reload. `invert` flips which drag direction grows
// the panel — both of ours grow when dragged away from their own edge (up for the device panel,
// left for the lesson panel), not toward it.
function useResizablePanel(storageKey: string, initial: number, min: number, max: number, axis: 'x' | 'y', invert: boolean) {
  const [size, setSize] = useState(() => {
    const saved = Number(localStorage.getItem(storageKey))
    return saved >= min && saved <= max ? saved : initial
  })
  const sizeRef = useRef(size)
  sizeRef.current = size

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const startPos = axis === 'x' ? e.clientX : e.clientY
    const startSize = sizeRef.current
    const onMove = (ev: PointerEvent) => {
      const pos = axis === 'x' ? ev.clientX : ev.clientY
      const delta = invert ? startPos - pos : pos - startPos
      setSize(Math.min(max, Math.max(min, startSize + delta)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      localStorage.setItem(storageKey, String(sizeRef.current))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return { size, onPointerDown }
}

export default function App() {
  const tracks = useStore((s) => s.tracks)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const arrangement = useStore((s) => s.arrangement)
  const mode = useStore((s) => s.mode)

  const selected = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0]

  const deviceBar = useResizablePanel('beatlab-devicebar-h', 150, 90, 520, 'y', true)
  const lessonPanel = useResizablePanel('beatlab-lessonpanel-w', 300, 220, 640, 'x', true)

  // space bar = play/stop, ctrl/cmd+z = undo, ctrl/cmd+shift+z = redo — like every DAW
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
      const s = useStore.getState()
      if (e.code === 'Space') {
        e.preventDefault()
        if (s.isPlaying) s.stop()
        else void s.play()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showArrangement = arrangement.enabled

  return (
    <div className="app" style={{ gridTemplateColumns: `225px 1fr 6px ${lessonPanel.size}px` }}>
      <TransportBar />
      <LessonSidebar />
      <main className="main">
        <TrackStrip />
        {mode === 'sandbox' && <SceneLauncher />}
        <div className="editor-area">
          {showArrangement && arrangement.mode === 'structure' ? (
            <ArrangementView />
          ) : showArrangement && arrangement.mode === 'energy' ? (
            <div className="split">
              <ArrangementView />
              {selected && selected.kind === 'drums' && <StepSequencer track={selected} />}
              {selected && selected.kind === 'synth' && <PianoRoll track={selected} />}
            </div>
          ) : selected?.kind === 'drums' ? (
            <StepSequencer track={selected} />
          ) : selected ? (
            <>
              {mode === 'sandbox' && <AutomationLane track={selected} />}
              <PianoRoll track={selected} />
            </>
          ) : null}
        </div>
        <div className="resize-handle-y" title="Drag to resize the device panel" onPointerDown={deviceBar.onPointerDown} />
        <div className="device-bar" style={{ height: deviceBar.size }}>
          {selected && <DevicePanel track={selected} />}
        </div>
      </main>
      <div className="resize-handle-x" title="Drag to resize the lesson panel" onPointerDown={lessonPanel.onPointerDown} />
      <LessonPanel />
    </div>
  )
}
