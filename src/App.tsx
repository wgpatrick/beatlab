import { useEffect, useRef, useState } from 'react'
import { useStore } from './state/store'
import { TransportBar } from './components/TransportBar'
import { LessonSidebar } from './components/LessonSidebar'
import { LessonPanel } from './components/LessonPanel'
import { TrackStrip } from './components/TrackStrip'
import { PianoRoll } from './components/PianoRoll'
import { StepSequencer } from './components/StepSequencer'
import { ArrangementView } from './components/ArrangementView'
import { SongView } from './components/SongView'
import { DevicePanel } from './components/DevicePanel'
import { SceneLauncher } from './components/SceneLauncher'
import { ProjectToolbar } from './components/ProjectToolbar'
import { AutomationLane } from './components/AutomationLane'
import { TrackLab } from './components/TrackLab'

// Drag-to-resize for the device panel's height and the lesson panel's width. Persists to
// localStorage so a preferred layout survives a reload. `invert` flips which drag direction grows
// the panel — both of ours grow when dragged away from their own edge (up for the device panel,
// left for the lesson panel), not toward it.
// Phone/tablet layout switch. Below this width the desktop grid (fixed sidebar + lesson column)
// can't fit, so the app swaps to a single-column layout with the curriculum as a slide-in drawer
// and the lesson panel as a bottom sheet. The height clause catches landscape phones (e.g.
// 844×390), which pass the width check but can't fit the desktop grid vertically. Live media
// query so rotating a device re-lays-out.
const MOBILE_QUERY = '(max-width: 840px), (max-height: 500px)'

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}

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
  const currentLessonId = useStore((s) => s.currentLessonId)

  const selected = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0]

  const deviceBar = useResizablePanel('beatlab-devicebar-h', 150, 90, 520, 'y', true)
  const lessonPanel = useResizablePanel('beatlab-lessonpanel-w', 300, 220, 640, 'x', true)

  const isMobile = useIsMobile()
  const [navOpen, setNavOpen] = useState(false)
  // The lesson sheet starts open on mobile so the first thing a phone visitor sees is the task,
  // not a bare instrument.
  const [lessonOpen, setLessonOpen] = useState(true)

  // Picking a lesson from the curriculum drawer: close the drawer, surface the task sheet.
  // Skip the very first render so a reload doesn't force the sheet over a sandbox session.
  const prevLessonRef = useRef(currentLessonId)
  useEffect(() => {
    if (prevLessonRef.current !== currentLessonId) {
      prevLessonRef.current = currentLessonId
      setNavOpen(false)
      if (mode === 'lesson') setLessonOpen(true)
    }
  }, [currentLessonId, mode])
  // Switching to Sandbox/Track Lab from the drawer should also dismiss it.
  useEffect(() => {
    setNavOpen(false)
  }, [mode])

  // space bar = play/stop, ctrl/cmd+z = undo, ctrl/cmd+shift+z = redo — like every DAW
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return
      const s = useStore.getState()
      if (e.code === 'Space') {
        e.preventDefault()
        // Track Lab plays the imported song, not the sequencer — space stops the section loop
        // there instead of firing up the drum machine underneath it
        if (s.mode === 'tracklab') {
          if (s.trackLab.playingSection !== null) s.playTrackLabSection(null)
          return
        }
        if (s.isPlaying) s.stop()
        else void s.play()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        // undo history covers sequencer state, which is invisible in Track Lab — a silent
        // undo there would mutate what you can't see
        if (s.mode === 'tracklab') return
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const showArrangement = arrangement.enabled

  const mobileClasses = isMobile
    ? ` app-mobile${navOpen ? ' nav-open' : ''}${lessonOpen ? ' lesson-open' : ''}`
    : ''

  return (
    <div
      className={`app${mobileClasses}`}
      style={isMobile ? undefined : { gridTemplateColumns: `225px 1fr 6px ${lessonPanel.size}px` }}
    >
      <TransportBar
        mobile={
          isMobile
            ? {
                navOpen,
                lessonOpen,
                onToggleNav: () => setNavOpen((v) => !v),
                onToggleLesson: () => setLessonOpen((v) => !v),
              }
            : undefined
        }
      />
      <LessonSidebar />
      {isMobile && navOpen && <div className="drawer-backdrop" onClick={() => setNavOpen(false)} />}
      {mode === 'tracklab' ? (
        <main className="main">
          <TrackLab />
        </main>
      ) : (
      <main className="main">
        <TrackStrip />
        {mode === 'sandbox' && <ProjectToolbar />}
        {mode === 'sandbox' && <SceneLauncher />}
        <div className="editor-area">
          {showArrangement && arrangement.mode === 'timeline' ? (
            <SongView />
          ) : showArrangement && arrangement.mode === 'structure' ? (
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
        {!isMobile && <div className="resize-handle-y" title="Drag to resize the device panel" onPointerDown={deviceBar.onPointerDown} />}
        <div className="device-bar" style={{ height: isMobile ? undefined : deviceBar.size }}>
          {selected && <DevicePanel track={selected} />}
        </div>
      </main>
      )}
      {!isMobile && <div className="resize-handle-x" title="Drag to resize the lesson panel" onPointerDown={lessonPanel.onPointerDown} />}
      <LessonPanel onClose={isMobile ? () => setLessonOpen(false) : undefined} />
    </div>
  )
}
