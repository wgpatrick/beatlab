import { useRef, useState } from 'react'
import { useStore } from '../state/store'
import { parseSandboxPayload } from '../state/sandboxPersistence'

// Sandbox-only: save the current project as a downloadable .beatlab.json, or load one back in.
// Uses the exact same serialized shape as the localStorage autosave (sandboxPersistence.ts) —
// export/import is that same payload going through a file instead of localStorage.
export function ProjectToolbar() {
  const exportSandboxPayload = useStore((s) => s.exportSandboxPayload)
  const restoreSandboxPayload = useStore((s) => s.restoreSandboxPayload)
  const exportSandboxWav = useStore((s) => s.exportSandboxWav)
  const [error, setError] = useState<string | null>(null)
  const [exportingWav, setExportingWav] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSave = () => {
    const payload = exportSandboxPayload()
    if (!payload) return
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `beatlab-${payload.savedAt.slice(0, 10)}.beatlab.json`
    a.click()
    URL.revokeObjectURL(url)
    setError(null)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // clear so re-selecting the same file later still fires onChange
    if (!file) return
    const payload = parseSandboxPayload(await file.text())
    if (!payload) {
      setError(`"${file.name}" isn't a valid BeatLab project file.`)
      return
    }
    restoreSandboxPayload(payload)
    setError(null)
  }

  const handleExportWav = async () => {
    setError(null)
    setExportingWav(true)
    try {
      const blob = await exportSandboxWav()
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `beatlab-${new Date().toISOString().slice(0, 10)}.wav`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not export audio — try again.')
    } finally {
      setExportingWav(false)
    }
  }

  return (
    <div className="project-toolbar">
      <button className="clear-btn" onClick={handleSave} title="Download the current sandbox as a .beatlab.json file">
        Save Project
      </button>
      <button className="clear-btn" onClick={() => fileInputRef.current?.click()} title="Load a previously saved .beatlab.json file">
        Load Project
      </button>
      <button
        className="clear-btn"
        onClick={handleExportWav}
        disabled={exportingWav}
        title="Render one loop pass to a WAV file — takes about as long as the loop itself"
      >
        {exportingWav ? 'Exporting…' : 'Export WAV'}
      </button>
      <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFileChange} style={{ display: 'none' }} />
      {error && <span className="project-toolbar-error">{error}</span>}
    </div>
  )
}
