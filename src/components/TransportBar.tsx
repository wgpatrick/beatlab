import { useStore } from '../state/store'

export function TransportBar() {
  const isPlaying = useStore((s) => s.isPlaying)
  const bpm = useStore((s) => s.bpm)
  const currentStep = useStore((s) => s.currentStep)
  const mode = useStore((s) => s.mode)
  const play = useStore((s) => s.play)
  const stop = useStore((s) => s.stop)
  const setBpm = useStore((s) => s.setBpm)
  const goToSandbox = useStore((s) => s.goToSandbox)
  const loadLesson = useStore((s) => s.loadLesson)
  const currentLessonId = useStore((s) => s.currentLessonId)

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
        <div className="position" title="bar . beat">
          {bar}.{beat}
        </div>
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
