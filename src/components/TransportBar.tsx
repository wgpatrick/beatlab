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
  const midi = useStore((s) => s.midi)
  const connectMidi = useStore((s) => s.connectMidi)
  const isRecording = useStore((s) => s.isRecording)
  const toggleRecording = useStore((s) => s.toggleRecording)
  const quantizeStrength = useStore((s) => s.quantizeStrength)
  const setQuantizeStrength = useStore((s) => s.setQuantizeStrength)
  const masterLevel = useStore((s) => s.masterLevel)

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
        <button
          className={`tbtn recb ${isRecording ? 'active' : ''}`}
          title="Arm MIDI recording — captures notes played on a connected keyboard while playing"
          onClick={toggleRecording}
        >
          ●
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
        <label
          className="bpm-label"
          title="How much recorded MIDI notes snap to the grid at playback: 0 = play exactly as recorded, 100 = fully quantized"
        >
          <input
            className="bpm-input"
            type="number"
            min={0}
            max={100}
            value={quantizeStrength}
            onChange={(e) => setQuantizeStrength(Number(e.target.value))}
          />
          QUANTIZE
        </label>
        <div className="position" title="bar . beat">
          {bar}.{beat}
        </div>
      </div>
      <div className="transport-group midi-group">
        {!midi.supported ? (
          <span className="midi-status midi-unsupported" title="Safari doesn't implement the Web MIDI API — try Chrome, Edge, or Firefox">
            MIDI not supported in this browser
          </span>
        ) : midi.connected ? (
          <span className="midi-status midi-connected" title={midi.deviceName ?? undefined}>
            MIDI: {midi.deviceName}
          </span>
        ) : (
          <button className="tbtn midi-connect" onClick={() => void connectMidi()}>
            Connect MIDI
          </button>
        )}
        {midi.error && <span className="midi-status midi-error">{midi.error}</span>}
      </div>
      <div className="transport-group" title="Master bus level (approximate, instantaneous dBFS via a limiter+meter — not true integrated LUFS)">
        <span className="master-meter-label">MASTER</span>
        <div className="master-meter">
          <div
            className="master-meter-fill"
            style={{
              width: `${Math.max(0, Math.min(100, ((masterLevel ?? -60) + 60) * (100 / 60)))}%`,
              background: masterLevel !== null && masterLevel > -1 ? 'var(--red)' : 'var(--green)',
            }}
          />
        </div>
        <span className="master-meter-value">{masterLevel !== null ? `${masterLevel.toFixed(1)}dB` : '—'}</span>
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
