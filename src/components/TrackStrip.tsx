import { useStore } from '../state/store'

export function TrackStrip() {
  const tracks = useStore((s) => s.tracks)
  const selectedTrackId = useStore((s) => s.selectedTrackId)
  const selectTrack = useStore((s) => s.selectTrack)
  const toggleMute = useStore((s) => s.toggleMute)

  return (
    <div className="track-strip">
      {tracks.map((t) => (
        <div
          key={t.id}
          className={`track-chip ${t.id === selectedTrackId ? 'selected' : ''} ${t.muted ? 'muted' : ''}`}
          onClick={() => selectTrack(t.id)}
        >
          <span className="track-dot" style={{ background: t.color }} />
          <span className="track-name">{t.name}</span>
          <button
            className="mute-btn"
            title={t.muted ? 'Unmute' : 'Mute'}
            onClick={(e) => {
              e.stopPropagation()
              toggleMute(t.id)
            }}
          >
            M
          </button>
        </div>
      ))}
    </div>
  )
}
