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
import { engine } from '../audio/engine'
import type { DrumLane } from '../types'

// True while an incoming document is being applied, so the store subscription below doesn't
// POST the daemon's own change straight back at it. Zustand fires subscriptions synchronously
// during set(), which is what makes a plain flag sufficient.
let applyingFromDaemon = false

export function initDawBridge(): void {
  const port = new URLSearchParams(window.location.search).get('daw')
  if (!port || !/^\d+$/.test(port)) return
  const base = `http://localhost:${port}`

  console.log(`[daw] bridging to beat daemon at ${base}`)

  // v0.5 lane samples: the bridge fetches media bytes from the daemon (transport), decodes,
  // and hands buffers to the engine's per-lane loader. Cached by (sampleId, sha256) so a doc
  // push that didn't change a lane doesn't refetch; a lane whose assignment vanished is cleared.
  const bufferCache = new Map<string, AudioBuffer>()
  const laneState = new Map<DrumLane, string>() // lane -> "sampleId|gainDb|tune" applied
  async function syncLaneSamples(docState: DawPartialState) {
    const media = new Map((docState.media ?? []).map((m) => [m.id, m]))
    const wanted = new Map<DrumLane, { sample: string; gainDb: number; tune: number }>()
    for (const t of docState.tracks) {
      for (const [lane, ref] of Object.entries(t.laneSamples ?? {})) wanted.set(lane as DrumLane, ref)
    }
    for (const lane of [...laneState.keys()]) {
      if (!wanted.has(lane)) {
        engine.clearLaneOneShot(lane)
        laneState.delete(lane)
      }
    }
    for (const [lane, ref] of wanted) {
      const key = `${ref.sample}|${ref.gainDb}|${ref.tune}`
      if (laneState.get(lane) === key) continue
      const entry = media.get(ref.sample)
      if (!entry) {
        console.warn(`[daw] lane ${lane}: sample "${ref.sample}" not in media table`)
        continue
      }
      try {
        const cacheKey = `${entry.id}:${entry.sha256}`
        let buffer = bufferCache.get(cacheKey)
        if (!buffer) {
          const res = await fetch(`${base}/media/${encodeURIComponent(entry.path)}`)
          if (!res.ok) throw new Error(`GET /media: HTTP ${res.status}`)
          buffer = await new AudioContext().decodeAudioData(await res.arrayBuffer())
          bufferCache.set(cacheKey, buffer)
        }
        engine.loadLaneOneShot(lane, buffer, entry.id, { gainDb: ref.gainDb, tune: ref.tune })
        laneState.set(lane, key)
        console.log(`[daw] lane ${lane} <- sample "${entry.id}" (${ref.gainDb} dB, ${ref.tune} st)`)
      } catch (err) {
        console.warn(`[daw] lane ${lane}: could not load sample "${ref.sample}":`, err)
      }
    }
  }

  function applyDoc(docState: DawPartialState) {
    applyingFromDaemon = true
    try {
      const s = useStore.getState()
      if (s.mode !== 'sandbox') s.goToSandbox()
      useStore.getState().applyDawState(docState)
    } finally {
      applyingFromDaemon = false
    }
    void syncLaneSamples(docState)
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
      // Bug fix (Stream D verification): mirror-image of store.ts's stepsToFraction on the way
      // in — the .beat format's clip automation `time` is in fractional 16th-steps from the
      // clip's start (Note.start's convention), but this app's live AutomationPoint.time is a
      // 0..1 loop fraction. Rescale on the way OUT too, so a knob-drawn automation lane the user
      // just edited round-trips back into the file in the format's own unit instead of writing
      // 0..1 fractions into a field the format defines as step counts. Payload-local only — never
      // mutates the live store (localStorage autosave, which also calls serializeSandbox, must
      // keep the app's native fraction units).
      const totalSteps = payload.loopBars * 16
      const outgoing = totalSteps
        ? {
            ...payload,
            tracks: payload.tracks.map((t) =>
              t.clips.length === 0
                ? t
                : {
                    ...t,
                    clips: t.clips.map((c) =>
                      !c.automation
                        ? c
                        : {
                            ...c,
                            automation: Object.fromEntries(
                              Object.entries(c.automation).map(([param, points]) => [
                                param,
                                points!.map((p) => ({ ...p, time: p.time * totalSteps })),
                              ]),
                            ) as typeof c.automation,
                          },
                    ),
                  },
            ),
          }
        : payload
      sendQueue = sendQueue.then(() =>
        fetch(`${base}/state`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(outgoing),
        }).catch((err) => console.warn('[daw] could not sync state to daemon:', err)),
      )
    }, 250)
  })
}
