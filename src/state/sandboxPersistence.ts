import type { ArrangementState, Scene, Track } from '../types'

const STORAGE_KEY = 'beatlab-sandbox-v1'
const CURRENT_VERSION = 1

export interface SandboxPayload {
  v: 1
  tracks: Track[]
  bpm: number
  loopBars: number
  selectedTrackId: string
  scenes: Scene[]
  swing: number
  arrangement: ArrangementState
  /** Informational only, not read on restore — lets a human glance at a `.beatlab.json` and know
   * when it was saved. */
  savedAt: string
}

export interface SandboxSource {
  tracks: Track[]
  bpm: number
  loopBars: number
  selectedTrackId: string
  scenes: Scene[]
  swing: number
  arrangement: ArrangementState
}

export function serializeSandbox(state: SandboxSource): SandboxPayload {
  return {
    v: CURRENT_VERSION,
    tracks: state.tracks,
    bpm: state.bpm,
    loopBars: state.loopBars,
    selectedTrackId: state.selectedTrackId,
    scenes: state.scenes,
    swing: state.swing,
    arrangement: state.arrangement,
    savedAt: new Date().toISOString(),
  }
}

// Loose structural check on a parsed JSON blob before trusting it as a SandboxPayload — guards
// against a corrupted localStorage entry, or a hand-edited/foreign JSON file dropped into the
// file-import picker, crashing the app instead of failing to load cleanly.
export function isSandboxPayload(x: unknown): x is SandboxPayload {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    o.v === 1 &&
    Array.isArray(o.tracks) &&
    typeof o.bpm === 'number' &&
    typeof o.loopBars === 'number' &&
    typeof o.selectedTrackId === 'string' &&
    Array.isArray(o.scenes)
  )
}

export function parseSandboxPayload(json: string): SandboxPayload | null {
  try {
    const parsed = JSON.parse(json)
    return isSandboxPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function loadSandboxFromStorage(): SandboxPayload | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? parseSandboxPayload(raw) : null
  } catch {
    return null // localStorage can throw in private-browsing/quota-exceeded contexts
  }
}

export function saveSandboxToStorage(payload: SandboxPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // losing an autosave silently beats crashing playback over a quota/private-browsing error
  }
}

function maxPrefixedNum(ids: string[], prefix: string): number {
  const re = new RegExp(`^${prefix}(\\d+)$`)
  let max = -1
  for (const id of ids) {
    const m = re.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** The module-level note/clip/scene ID counters in store.ts always restart at their initial
 * value on page load. Restoring a payload from a previous (possibly much longer) session could
 * otherwise hand out a "new" ID that already exists in the restored data. Returns the minimum
 * safe next value for each counter — callers should take Math.max(currentCounter, this). */
export function nextCountersAfterRestore(tracks: Track[], scenes: Scene[]) {
  const noteIds = tracks.flatMap((t) => [...t.notes.map((n) => n.id), ...t.clips.flatMap((c) => c.notes.map((n) => n.id))])
  const clipIds = tracks.flatMap((t) => t.clips.map((c) => c.id))
  const sceneIds = scenes.map((s) => s.id)
  return {
    noteCounter: maxPrefixedNum(noteIds, 'u') + 1,
    clipCounter: maxPrefixedNum(clipIds, 'clip') + 1,
    sceneCounter: maxPrefixedNum(sceneIds, 'scene') + 1,
  }
}
