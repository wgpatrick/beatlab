import { useEffect } from 'react'
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

export default function App() {
  const tracks = useStore((s) => s.tracks)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const arrangement = useStore((s) => s.arrangement)
  const mode = useStore((s) => s.mode)

  const selected = tracks.find((t) => t.id === selectedTrackId) ?? tracks[0]

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
    <div className="app">
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
        <div className="device-bar">{selected && <DevicePanel track={selected} />}</div>
      </main>
      <LessonPanel />
    </div>
  )
}
