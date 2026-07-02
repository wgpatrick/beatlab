import { useStore } from '../state/store'

export function TransportBar() {
  const isPlaying = useStore((s) => s.isPlaying)
  const bpm = useStore((s) => s.bpm)
  const swing = useStore((s) => s.swing)
  const currentStep = useStore((s) => s.currentStep)
  const mode = useStore((s) => s.mode)
  const play = useStore((s) => s.play)
  const stop = useStore((s) => s.stop)
  const setBpm = useStore((s) => s.setBpm)
  const setSwing = useStore((s) => s.setSwing)
  const goToSandbox = useStore((s) => s.goToSandbox)
  const loadLesson = useStore((s) => s.loadLesson)
  const currentLessonId = useStore((s) => s.currentLessonId)
  const past = useStore((s) => s.past)
  const future = useStore((s) => s.future)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)

  const bar = currentStep >= 0 ? Math.floor(currentStep / 16) + 1 : 1
  const beat = currentStep >= 0 ? Math.floor((currentStep % 16) / 4) + 1 : 1

  return (
    <header className="transport">
      <div className="logo">
        BEAT<span>LAB</span>
      </div>
      <div className="transport-group">
        <button
          className={`tbtn play ${isPlaying ? 'active' : ''}`}
          title="Play (Space)"
          onClick={() => void play()}
        >
          ▶
        </button>
        <button className="tbtn stopb" title="Stop (Space)" onClick={stop}>
          ■
        </button>
      </div>
      <div className="transport-group">
        <label className="bpm-label">
          <input
            className="bpm-input"
            type="number"
            min={60}
            max={200}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
          BPM
        </label>
        <label className="bpm-label" title="Swing: 50 = straight, higher = more shuffle">
          <input
            className="bpm-input"
            type="number"
            min={50}
            max={75}
            value={swing}
            onChange={(e) => setSwing(Number(e.target.value))}
          />
          SWING
        </label>
        <div className="position" title="bar . beat">
          {bar}.{beat}
        </div>
      </div>
      <div className="transport-group">
        <button className="tbtn" title="Undo (Ctrl/Cmd+Z)" disabled={!past.length} onClick={undo}>
          ↺
        </button>
        <button className="tbtn" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!future.length} onClick={redo}>
          ↻
        </button>
      </div>
      <div className="spacer" />
      <div className="mode-toggle">
        <button className={mode === 'lesson' ? 'on' : ''} onClick={() => loadLesson(currentLessonId)}>
          Lessons
        </button>
        <button className={mode === 'sandbox' ? 'on' : ''} onClick={goToSandbox}>
          Sandbox
        </button>
      </div>
    </header>
  )
}
