import { useStore } from '../state/store'

// Session-View analog: rows are scenes, columns are tracks. Each cell cycles through that
// track's saved clips (see PianoRoll/StepSequencer's clip strip for how clips get saved).
// Launching a scene loads every mapped track's clip at once, like clicking a scene in Ableton.
export function SceneLauncher() {
  const tracks = useStore((s) => s.tracks)
  const scenes = useStore((s) => s.scenes)
  const addScene = useStore((s) => s.addScene)
  const deleteScene = useStore((s) => s.deleteScene)
  const assignSceneClip = useStore((s) => s.assignSceneClip)
  const triggerScene = useStore((s) => s.triggerScene)

  const anyClips = tracks.some((t) => t.clips.length > 0)

  return (
    <div className="scenes">
      <div className="editor-toolbar">
        <span className="editor-title">Scenes</span>
        <span className="toolbar-tip">
          save clips per track (⊕ in the piano roll / step sequencer toolbar), then map them into a
          scene and launch the whole row at once
        </span>
        <div className="spacer" />
        <button className="clear-btn" onClick={addScene}>
          + Scene
        </button>
      </div>
      {!anyClips ? (
        <div className="device-note">No clips saved yet — save one from a track's editor toolbar first.</div>
      ) : (
        <div className="scene-grid">
          <div className="scene-row scene-header">
            <div className="scene-launch-col" />
            {tracks.map((t) => (
              <div key={t.id} className="scene-track-col" style={{ color: t.color }}>
                {t.name}
              </div>
            ))}
            <div className="scene-del-col" />
          </div>
          {scenes.map((sc) => (
            <div key={sc.id} className="scene-row">
              <button className="scene-launch" onClick={() => triggerScene(sc.id)} title="Launch this scene">
                ▶ {sc.name}
              </button>
              {tracks.map((t) => {
                const clipId = sc.clipIds[t.id] ?? null
                const clip = t.clips.find((c) => c.id === clipId)
                return (
                  <button
                    key={t.id}
                    className={`scene-cell ${clip ? 'assigned' : ''}`}
                    disabled={t.clips.length === 0}
                    title={t.clips.length === 0 ? 'No clips saved for this track' : 'Click to cycle clips'}
                    onClick={() => {
                      if (!t.clips.length) return
                      const idx = clip ? t.clips.findIndex((c) => c.id === clip.id) : -1
                      const next = t.clips[(idx + 1) % t.clips.length]
                      assignSceneClip(sc.id, t.id, idx + 1 >= t.clips.length && clip ? null : next.id)
                    }}
                  >
                    {clip ? clip.name : '—'}
                  </button>
                )
              })}
              <button className="scene-del" onClick={() => deleteScene(sc.id)} title="Delete scene">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
