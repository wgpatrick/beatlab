// Dev-only bridge to a local `beat daemon` (see the beatlab-daw repo: src/daemon/daemon.ts and
// docs/phase-1-plan.md). Connects the running GUI to a .beat file on disk, two ways:
//
//   file → GUI   the daemon's SSE stream pushes the re-parsed document whenever the file
//                changes on disk; applied via the store's applyDawState (hot reload — playback
//                keeps running, undo survives, un-modeled state is preserved)
//   GUI → file   a store subscription (same slice-gating as the localStorage autosave) POSTs
//                the serialized sandbox to the daemon, which canonically serializes it and
//                writes the file only if it musically changed — a knob turn becomes a one-line
//                `git diff`
//
// This module is deliberately transport-only: ALL state-reconciliation logic lives in the
// store's applyDawState action (one apply path, shared with the render CLI — the openDAW
// lesson: a small typed boundary, never shared objects, keeps headless use nearly free).
//
// Activation: dev builds only, and only when the page URL carries ?daw=<port>, e.g.
//   http://localhost:5173/musiclearning/?daw=8420
// Production builds tree-shake this away entirely (the call site is inside import.meta.env.DEV).

import { useStore, type DawPartialState } from './store'
import { serializeSandbox } from './sandboxPersistence'

// True while an incoming document is being applied, so the store subscription below doesn't
// POST the daemon's own change straight back at it. Zustand fires subscriptions synchronously
// during set(), which is what makes a plain flag sufficient.
let applyingFromDaemon = false

export function initDawBridge(): void {
  const port = new URLSearchParams(window.location.search).get('daw')
  if (!port || !/^\d+$/.test(port)) return
  const base = `http://localhost:${port}`

  console.log(`[daw] bridging to beat daemon at ${base}`)

  function applyDoc(docState: DawPartialState) {
    applyingFromDaemon = true
    try {
      const s = useStore.getState()
      if (s.mode !== 'sandbox') s.goToSandbox()
      useStore.getState().applyDawState(docState)
    } finally {
      applyingFromDaemon = false
    }
  }

  async function pullDoc() {
    try {
      const res = await fetch(`${base}/doc`)
      if (!res.ok) throw new Error(`GET /doc: HTTP ${res.status}`)
      applyDoc((await res.json()) as DawPartialState)
    } catch (err) {
      console.warn('[daw] could not load document from daemon:', err)
    }
  }

  const events = new EventSource(`${base}/events`)
  // `open` fires on first connect AND every auto-reconnect — re-pulling there covers both the
  // initial load (the file wins on connect: it's the project) and events missed while down.
  events.addEventListener('open', () => void pullDoc())
  events.addEventListener('doc', (e) => {
    applyDoc(JSON.parse((e as MessageEvent).data) as DawPartialState)
  })
  events.addEventListener('parse-error', (e) => {
    // A momentarily-invalid hand edit (mid-save, typo). The daemon keeps serving the last good
    // document; the GUI just keeps playing it. Surfaced in the console, not as UI noise.
    console.warn('[daw] file edit did not parse:', (JSON.parse((e as MessageEvent).data) as { message: string }).message)
  })

  // GUI → daemon. Chained through `sendQueue` so POSTs can't arrive out of order (a slow write
  // overtaken by a fast later one would put stale state on disk last-writer-wins style).
  let sendTimer: ReturnType<typeof setTimeout> | null = null
  let sendQueue: Promise<unknown> = Promise.resolve()
  useStore.subscribe((state, prev) => {
    if (applyingFromDaemon) return
    if (state.mode !== 'sandbox') return
    const changed =
      state.tracks !== prev.tracks ||
      state.bpm !== prev.bpm ||
      state.loopBars !== prev.loopBars ||
      state.selectedTrackId !== prev.selectedTrackId
    if (!changed) return
    if (sendTimer) clearTimeout(sendTimer)
    sendTimer = setTimeout(() => {
      const payload = serializeSandbox(useStore.getState())
      sendQueue = sendQueue.then(() =>
        fetch(`${base}/state`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch((err) => console.warn('[daw] could not sync state to daemon:', err)),
      )
    }, 250)
  })
}
