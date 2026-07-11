import { create } from 'zustand'
import type { ArrangementState, AutomatableParam, AutomationCurve, Clip, DrumLane, DrumPattern, Note, Scene, SectionType, SynthParams, Track } from '../types'
import { DEFAULT_SYNTH } from '../types'
import { engine, type SampleSlice } from '../audio/engine'
import { midiInput } from '../audio/midi'
import { handleMidiNoteOff, handleMidiNoteOn, releaseAllHeld } from '../audio/midiRecorder'
import { setComputerKeyboardEnabled as setComputerKeyboardListening, setComputerKeyboardHandlers } from '../audio/computerKeyboard'
import { findLesson, LESSONS, nextLessonId, sandboxTracks, type Lesson, type LessonParams } from '../lessons/curriculum'
import type { ScoreMap } from '../lessons/framework'
import { GROOVE_STEPS, bassGrooveNotes, chordProgressionNotes, drumTrack, emptyPattern, melodyNotes, synthTrack } from '../lessons/framework'
import { analyzeAudioBuffer, sectionAvg } from '../audio/analysis'
import { emptyTrackLab, type TrackLabState } from './trackLabState'
import {
  loadSandboxFromStorage,
  nextCountersAfterRestore,
  saveSandboxToStorage,
  serializeSandbox,
  type SandboxPayload,
} from './sandboxPersistence'

let clipCounter = 0
let sceneCounter = 0

// step-sequencer accent cycle: click cycles a step through these levels (0 = off)
const VELOCITY_LEVELS = [0, 0.5, 0.75, 1]
function nextVelocityLevel(v: number): number {
  const idx = VELOCITY_LEVELS.findIndex((lv) => Math.abs(lv - v) < 0.01)
  return VELOCITY_LEVELS[(idx + 1) % VELOCITY_LEVELS.length]
}

interface HistorySnapshot {
  tracks: Track[]
  arrangement: ArrangementState
}

interface Clipboard {
  notes: Note[]
  pattern: DrumPattern
}

const HISTORY_LIMIT = 50

const COMPLETED_KEY = 'beatlab-completed'

function loadCompleted(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COMPLETED_KEY) ?? '[]')
  } catch {
    return []
  }
}

const emptyArrangement = (): ArrangementState => ({
  enabled: false,
  mode: null,
  sections: [],
  barsPerSection: 2,
  active: {},
})

let noteCounter = 100000

// Restoring a payload from a previous session must not let a freshly-reset counter hand out an
// ID that already exists in the restored data — see nextCountersAfterRestore's doc comment.
function applyRestoredCounters(tracks: Track[], scenes: Scene[]) {
  const next = nextCountersAfterRestore(tracks, scenes)
  noteCounter = Math.max(noteCounter, next.noteCounter)
  clipCounter = Math.max(clipCounter, next.clipCounter)
  sceneCounter = Math.max(sceneCounter, next.sceneCounter)
}

/** BUG FIX (Stream D verification, docs/phase-10-clip-automation-verification.md in the dotbeat
 * repo): the daemon bridge hands clip automation points with `time` in the .beat format's own
 * unit — fractional 16th-note steps from the clip's start, the SAME convention as Note.start
 * (see beatlab-daw/docs/format-spec.md) — but this app's own AutomationPoint.time is a 0..1
 * fraction of the whole loop (confirmed here: AutomationLane.tsx's `timeToX = time * width`,
 * engine.ts's `interpolateAutomation`'s `frac` argument, and store.ts's own
 * `recordAutomationPoint(trackId, param, step / totalSteps, ...)` call, all consistently 0..1).
 * Nothing rescaled between the two, so a clip loaded from a .beat file played back a wrong
 * automation curve (point time 2 read literally as fraction 2.0 — past the end of the loop —
 * instead of "step 2 of a 32-step loop"). Convert on the way in here (steps -> fraction); the
 * mirrored fraction<-steps conversion on the way OUT lives in dawBridge.ts right before the
 * POST to the daemon. */
function stepsToFraction(automation: Track['automation'], loopBars: number): Track['automation'] {
  if (!automation) return automation
  const totalSteps = loopBars * 16
  if (!totalSteps) return automation
  return Object.fromEntries(
    Object.entries(automation).map(([param, points]) => [param, points!.map((p) => ({ ...p, time: p.time / totalSteps }))]),
  ) as Track['automation']
}

function rescaleClipsStepsToFraction(clips: Clip[] | undefined, loopBars: number): Clip[] | undefined {
  if (!clips) return clips
  return clips.map((c) => (c.automation ? { ...c, automation: stepsToFraction(c.automation, loopBars) } : c))
}

/** The track shape a `.beat` document reduces to — only the fields the format models. Everything
 * else (the other ~65 SynthParams fields, clips, automation, mute state) is merged from the
 * existing track when there is one, or from defaults when the track is new. Reconstituting a
 * full Track from this partial is deliberately THIS side's job, not the .beat core's — see
 * beatlab-daw/src/core/convert.ts (beatDocumentToPartialTracks) for why. */
export interface DawPartialTrack {
  id: string
  name: string
  color: string
  kind: 'synth' | 'drums'
  notes: Note[]
  synth: Partial<SynthParams>
  pattern?: Partial<DrumPattern>
  /** v0.4: when present, the file's clips REPLACE the track's clips (file is the document);
   * when absent, existing clips are preserved (a pre-v0.4 sync must not destroy them). */
  clips?: Clip[]
  /** v0.5: per-lane one-shot sample assignments. State-wise these are transparent (the engine
   * holds the audio); the daw bridge fetches the media and drives engine.loadLaneOneShot. */
  laneSamples?: Record<string, { sample: string; gainDb: number; tune: number }>
}

export interface DawPartialState {
  bpm: number
  loopBars: number
  selectedTrackId: string
  tracks: DawPartialTrack[]
  /** v0.4: when present, replaces the scene list (same file-wins rule as clips). */
  scenes?: Scene[]
  /** v0.4: non-null = enable the timeline arrangement (the song); null = explicitly no song
   * (clears a previous timeline back to loop mode); undefined = pre-v0.4 caller, leave
   * arrangement alone. */
  song?: { sceneId: string; bars: number }[] | null
  /** v0.5: the document's content-addressed media table (audio fetched by the bridge). */
  media?: { id: string; sha256: string; path: string }[]
}

export interface AppState {
  tracks: Track[]
  selectedTrackId: string
  bpm: number
  isPlaying: boolean
  loopBars: number
  currentStep: number
  noteLength: number
  noteVelocity: number
  swing: number
  mode: 'lesson' | 'sandbox' | 'tracklab'
  currentLessonId: string
  completed: string[]
  arrangement: ArrangementState
  lessonParams: LessonParams
  feedback: { pass: boolean; message: string } | null
  paramScores: ScoreMap | null
  sandboxSnapshot: { tracks: Track[]; bpm: number; loopBars: number; selectedTrackId: string; scenes: Scene[] } | null
  past: HistorySnapshot[]
  future: HistorySnapshot[]
  clipboard: Clipboard | null
  scenes: Scene[]
  /** User-toggleable scale highlighting (Ableton's "Scale Mode"), independent of any lesson's
   * own scalePcs — root is a pitch class 0..11. */
  scaleLock: { root: number; scale: string } | null
  /** Phase G: live MIDI input. isRecording only captures notes while isPlaying is also true —
   * arming without playback just gets you live monitoring, no capture. quantizeStrength (0..100)
   * blends every note's *playback* time toward the nearest grid step (0 = fully as recorded,
   * 100 = fully snapped); it's applied non-destructively in Engine.tick(), never written back
   * into a note. */
  midi: { supported: boolean; connected: boolean; deviceName: string | null; error: string | null }
  isRecording: boolean
  quantizeStrength: number
  /** Phase F: which track+param, if any, is armed for live automation-touch recording. While set
   * and isRecording+isPlaying are both true, Engine.tick() samples that param's current value
   * once per step into its automation lane — the same REC button Phase G uses for MIDI notes. */
  automationArm: { trackId: string; param: AutomatableParam } | null
  /** Phase I: a loaded sample (if any) replacing the synthesized drum kit lane-for-lane, set
   * directly by Engine (mirrors how it already sets currentStep). */
  sampleLoaded: { name: string } | null
  /** Manual slicing: each lane's current {start, dur, reversed} within the loaded sample, set
   * directly by Engine whenever a boundary moves or a lane's reverse is toggled — drives the
   * slice-editor waveform view and lets lessons grade "did you move a boundary / reverse a pad". */
  sampleSliceMeta: Partial<Record<DrumLane, SampleSlice>> | null
  /** How pad pitch is applied: 'speed' = playback-rate (classic chipmunk), 'warp' = granular
   * (length preserved). Set by Engine alongside sampleSliceMeta. */
  samplePitchMode: 'speed' | 'warp'
  /** Phase K: master bus loudness in dBFS (via Tone.Meter), set directly by Engine once per step
   * during playback — an approximate/instantaneous reading, not true integrated LUFS. */
  masterLevel: number | null
  /** "Musical typing" — a plain computer keyboard standing in for a MIDI keyboard, for anyone
   * without real MIDI hardware. Feeds the exact same recording/live-play pipeline as real MIDI. */
  computerKeyboardEnabled: boolean
  /** Track Lab (full-song deconstruction): analysis results + the student's structure map.
   * The audio buffer itself lives on the engine. */
  trackLab: TrackLabState

  lesson: () => Lesson | undefined
  selectTrack: (id: string) => void
  addNote: (trackId: string, pitch: number, start: number, duration?: number) => void
  removeNote: (trackId: string, noteId: string) => void
  updateNote: (trackId: string, noteId: string, patch: Partial<Pick<Note, 'start' | 'pitch' | 'duration' | 'velocity'>>) => void
  clearTrack: (trackId: string) => void
  toggleDrum: (trackId: string, lane: DrumLane, step: number) => void
  setSynth: (trackId: string, patch: Partial<SynthParams>) => void
  toggleMute: (trackId: string) => void
  setBpm: (bpm: number) => void
  setSwing: (swing: number) => void
  setNoteLength: (len: number) => void
  setNoteVelocity: (v: number) => void
  play: () => Promise<void>
  stop: () => void
  loadLesson: (id: string) => void
  goToSandbox: () => void
  /** Load a serialized sandbox payload (from localStorage or an imported `.beatlab.json` file)
   * as the live sandbox, switching to Sandbox mode. Bumps the note/clip/scene ID counters past
   * anything in the payload first, so newly-created content can't collide with restored IDs. */
  restoreSandboxPayload: (payload: SandboxPayload) => void
  /** Apply a `.beat` document (as partial tracks, from the daw daemon or the render CLI) onto
   * the live sandbox WITHOUT stopping playback or clearing undo history — hot reload, not
   * restore. Creates tracks that only exist in the file, drops tracks absent from it, preserves
   * everything the file doesn't model. Sandbox mode only (no-op otherwise). */
  applyDawState: (docState: DawPartialState) => void
  /** The current sandbox, serialized — the same shape saved to localStorage and downloadable as
   * a `.beatlab.json` file. Returns null outside Sandbox mode (nothing sandbox-shaped to save). */
  exportSandboxPayload: () => SandboxPayload | null
  /** Renders one loop pass of the current sandbox to a WAV blob (starting playback if it isn't
   * already running, and restoring the prior play/stop state afterward). Null outside Sandbox
   * mode. Takes roughly as long as the loop itself — see engine.ts's recordWav for why. */
  exportSandboxWav: () => Promise<Blob | null>
  check: () => void
  nextLesson: () => void
  setSection: (index: number, type: SectionType) => void
  toggleActive: (trackId: string, section: number) => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  copyTrack: (trackId: string) => void
  pasteTrack: (trackId: string) => void
  saveClip: (trackId: string) => void
  loadClip: (trackId: string, clipId: string) => void
  deleteClip: (trackId: string, clipId: string) => void
  addScene: () => void
  deleteScene: (sceneId: string) => void
  assignSceneClip: (sceneId: string, trackId: string, clipId: string | null) => void
  triggerScene: (sceneId: string) => void
  setAutomationPoint: (trackId: string, param: AutomatableParam, time: number, value: number, curve?: AutomationCurve) => void
  removeAutomationPoint: (trackId: string, param: AutomatableParam, time: number) => void
  clearAutomation: (trackId: string, param: AutomatableParam) => void
  recordAutomationPoint: (trackId: string, param: AutomatableParam, time: number, value: number) => void
  setAutomationArm: (arm: { trackId: string; param: AutomatableParam } | null) => void
  setMacroValue: (trackId: string, value: number) => void
  loadDrumSample: (file: File) => Promise<void>
  clearDrumSample: () => void
  setSampleSliceBoundary: (index: number, timeSec: number) => void
  toggleSampleSliceReverse: (lane: DrumLane) => void
  setSampleSlicePitch: (lane: DrumLane, semitones: number) => void
  setSamplePitchMode: (mode: 'speed' | 'warp') => void
  loadStarterSample: (url: string, name: string, startSec: number, durSec: number) => Promise<void>
  setComputerKeyboardEnabled: (on: boolean) => void
  setScaleLock: (lock: { root: number; scale: string } | null) => void
  connectMidi: () => Promise<void>
  toggleRecording: () => void
  setQuantizeStrength: (v: number) => void
  recordNote: (trackId: string, note: Omit<Note, 'id'>) => void
  goToTrackLab: () => void
  loadTrackLabFile: (file: File) => Promise<void>
  /** starter songs: stream a public-domain recording (Wikimedia Commons, CORS `*`) into the same
   * decode→analyze path as a dropped file — see STARTER_SONGS in TrackLab.tsx */
  loadTrackLabFromUrl: (url: string, name: string) => Promise<void>
  setTrackLabLabel: (index: number, type: SectionType) => void
  setTrackLabNote: (index: number, text: string) => void
  /** re-run the analysis at a corrected tempo (the x2 / ÷2 half/double-time fix) */
  setTrackLabBpmFactor: (factor: number) => void
  setTrackLabFeedback: (fb: { pass: boolean; message: string } | null) => void
  /** loop one detected section (null stops playback) */
  playTrackLabSection: (index: number | null) => void
  /** slice the first bars of a section onto the Phase I drum sampler pads */
  chopTrackLabSection: (index: number) => void
  /** export the labeled structure map as a sandbox arrangement (energy grid) */
  useTrackLabTemplate: () => void
}

const firstLesson = (() => {
  const completed = loadCompleted()
  return LESSONS.find((l) => !completed.includes(l.id))?.id ?? LESSONS[0].id
})()

const initialSetup = findLesson(firstLesson)!.setup()

export const useStore = create<AppState>()((set, get) => ({
  tracks: initialSetup.tracks,
  selectedTrackId: initialSetup.selectedTrackId,
  bpm: initialSetup.bpm,
  isPlaying: false,
  loopBars: initialSetup.loopBars,
  currentStep: -1,
  noteLength: initialSetup.noteLength ?? 2,
  noteVelocity: 0.8,
  swing: 50,
  mode: 'lesson',
  currentLessonId: firstLesson,
  completed: loadCompleted(),
  arrangement: { ...emptyArrangement(), ...initialSetup.arrangement },
  lessonParams: initialSetup.params ?? {},
  feedback: null,
  paramScores: null,
  sandboxSnapshot: null,
  past: [],
  future: [],
  clipboard: null,
  scenes: [],
  scaleLock: null,
  midi: { supported: midiInput.supported, connected: false, deviceName: null, error: null },
  isRecording: false,
  quantizeStrength: 0,
  automationArm: null,
  sampleLoaded: null,
  sampleSliceMeta: null,
  samplePitchMode: 'speed',
  masterLevel: null,
  computerKeyboardEnabled: false,
  trackLab: emptyTrackLab(),

  lesson: () => (get().mode === 'lesson' ? findLesson(get().currentLessonId) : undefined),

  selectTrack: (id) => set({ selectedTrackId: id }),

  addNote: (trackId, pitch, start, duration) => {
    const { noteLength, noteVelocity, tracks } = get()
    const dur = duration ?? noteLength
    const track = tracks.find((t) => t.id === trackId)
    if (!track) return
    // don't add overlapping same-pitch notes
    const collides = track.notes.some(
      (x) => x.pitch === pitch && start < x.start + x.duration && start + dur > x.start,
    )
    if (collides) return
    get().pushHistory()
    const note: Note = { id: `u${noteCounter++}`, pitch, start, duration: dur, velocity: noteVelocity }
    set({
      tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, notes: [...t.notes, note] } : t)),
    })
    void engine.previewNote(track, pitch)
  },

  removeNote: (trackId, noteId) => {
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId ? { ...t, notes: t.notes.filter((x) => x.id !== noteId) } : t,
      ),
    })
  },

  // Deliberately does not call pushHistory — used for the live-updating part of a drag gesture.
  // The caller pushes history once at drag-start so a whole drag is a single undo step, not one
  // entry per pixel of movement.
  updateNote: (trackId, noteId, patch) =>
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? { ...t, notes: t.notes.map((x) => (x.id === noteId ? { ...x, ...patch } : x)) }
          : t,
      ),
    }),

  clearTrack: (trackId) => {
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              notes: [],
              pattern: Object.fromEntries(
                Object.entries(t.pattern).map(([k, v]) => [k, v.map(() => 0)]),
              ) as Track['pattern'],
            }
          : t,
      ),
    })
  },

  toggleDrum: (trackId, lane, step) => {
    const current = get().tracks.find((t) => t.id === trackId)?.pattern[lane][step] ?? 0
    const next = nextVelocityLevel(current)
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              pattern: {
                ...t.pattern,
                [lane]: t.pattern[lane].map((v, i) => (i === step ? next : v)),
              },
            }
          : t,
      ),
    })
    if (next > 0) void engine.previewDrum(lane, next)
  },

  setSynth: (trackId, patch) => {
    const tracks = get().tracks.map((t) =>
      t.id === trackId ? { ...t, synth: { ...t.synth, ...patch } } : t,
    )
    set({ tracks })
    const track = tracks.find((t) => t.id === trackId)
    if (track) engine.updateSynth(track)
  },

  toggleMute: (trackId) =>
    set({
      tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
    }),

  setBpm: (bpm) => {
    const clamped = Math.min(200, Math.max(60, Math.round(bpm)))
    set({ bpm: clamped })
    engine.setBpm(clamped)
  },

  setSwing: (swing) => set({ swing: Math.min(75, Math.max(50, Math.round(swing))) }),

  setNoteLength: (len) => set({ noteLength: len }),

  setNoteVelocity: (v) => set({ noteVelocity: Math.min(1, Math.max(0.1, v)) }),

  play: async () => {
    set({ isPlaying: true })
    await engine.play()
  },

  stop: () => {
    engine.stop()
    releaseAllHeld() // don't leave a MIDI note stuck sounding past the end of a take
    set({ isPlaying: false, isRecording: false })
  },

  loadLesson: (id) => {
    const lesson = findLesson(id)
    if (!lesson) return
    const state = get()
    if (state.isPlaying) state.stop()
    engine.stopTrackLab()
    if (state.trackLab.playingSection !== null) set({ trackLab: { ...state.trackLab, playingSection: null } })
    const snapshot =
      state.mode === 'sandbox'
        ? { tracks: state.tracks, bpm: state.bpm, loopBars: state.loopBars, selectedTrackId: state.selectedTrackId, scenes: state.scenes }
        : state.sandboxSnapshot
    const s = lesson.setup()
    set({
      mode: 'lesson',
      currentLessonId: id,
      tracks: s.tracks,
      loopBars: s.loopBars,
      bpm: s.bpm,
      selectedTrackId: s.selectedTrackId,
      noteLength: s.noteLength ?? 2,
      arrangement: { ...emptyArrangement(), ...s.arrangement },
      lessonParams: s.params ?? {},
      feedback: null,
      paramScores: null,
      currentStep: -1,
      sandboxSnapshot: snapshot,
      scenes: [],
      past: [],
      future: [],
    })
    engine.sync(s.tracks)
  },

  goToSandbox: () => {
    const state = get()
    if (state.mode === 'sandbox') return
    if (state.isPlaying) state.stop()
    engine.stopTrackLab()
    if (state.trackLab.playingSection !== null) set({ trackLab: { ...state.trackLab, playingSection: null } })

    // Three sources, in priority order: (1) the in-memory snapshot from switching away from
    // Sandbox earlier THIS session — always freshest; (2) a payload restored from localStorage
    // — the previous session's sandbox, if this is a fresh page load; (3) the default starter
    // groove, if neither exists (first-ever visit, or storage was cleared).
    if (state.sandboxSnapshot) {
      const snap = state.sandboxSnapshot
      set({
        mode: 'sandbox',
        tracks: snap.tracks,
        bpm: snap.bpm,
        loopBars: snap.loopBars,
        selectedTrackId: snap.selectedTrackId,
        arrangement: emptyArrangement(),
        feedback: null,
        paramScores: null,
        currentStep: -1,
        noteLength: 2,
        scenes: snap.scenes,
        past: [],
        future: [],
      })
      engine.sync(snap.tracks)
      return
    }

    const stored = loadSandboxFromStorage()
    if (stored) {
      get().restoreSandboxPayload(stored)
      return
    }

    const tracks = sandboxTracks()
    set({
      mode: 'sandbox',
      tracks,
      bpm: 124,
      loopBars: 4,
      selectedTrackId: 'drums',
      arrangement: emptyArrangement(),
      feedback: null,
      paramScores: null,
      currentStep: -1,
      noteLength: 2,
      scenes: [],
      past: [],
      future: [],
    })
    engine.sync(tracks)
  },

  restoreSandboxPayload: (payload) => {
    const state = get()
    if (state.isPlaying) state.stop()
    applyRestoredCounters(payload.tracks, payload.scenes)
    set({
      mode: 'sandbox',
      tracks: payload.tracks,
      bpm: payload.bpm,
      loopBars: payload.loopBars,
      selectedTrackId: payload.selectedTrackId,
      arrangement: { ...emptyArrangement(), ...payload.arrangement },
      feedback: null,
      paramScores: null,
      currentStep: -1,
      noteLength: 2,
      scenes: payload.scenes,
      swing: payload.swing,
      sandboxSnapshot: null, // discard any stale in-memory snapshot — the payload just loaded wins
      past: [],
      future: [],
    })
    engine.sync(payload.tracks)
  },

  applyDawState: (docState) => {
    const state = get()
    // Sandbox only: a synced .beat file must never stomp lesson state. The daw bridge switches
    // to sandbox mode before its first apply; this guards mid-session mode changes.
    if (state.mode !== 'sandbox') return
    const byId = new Map(state.tracks.map((t) => [t.id, t]))
    const tracks: Track[] = docState.tracks.map((dt) => {
      const existing = byId.get(dt.id)
      const notes = dt.kind === 'synth' ? dt.notes.map((n) => ({ ...n })) : (existing?.notes ?? [])
      const pattern =
        dt.kind === 'drums' && dt.pattern
          ? ({ ...emptyPattern(), ...Object.fromEntries(Object.entries(dt.pattern).map(([k, v]) => [k, [...(v as number[])]])) } as DrumPattern)
          : (existing?.pattern ?? emptyPattern())
      // Bug fix: rescale clip automation time from the .beat format's step units into this app's
      // 0..1 loop-fraction units — see stepsToFraction's comment above.
      const clips = rescaleClipsStepsToFraction(dt.clips, docState.loopBars)
      if (existing) {
        // The file only models some fields; everything else (automation, mute, the other ~65
        // synth params) is preserved from the live track — hot reload, not restore. Clips are
        // file-owned SINCE v0.4 when the partial carries them, preserved otherwise.
        return { ...existing, name: dt.name, color: dt.color, notes, pattern, synth: { ...existing.synth, ...dt.synth }, clips: clips ?? existing.clips }
      }
      // A track that exists only in the file: the file is the root document, so it becomes real
      // here — partial synth merged onto defaults (the "importing side's job" from
      // beatlab-daw's converter contract).
      return { id: dt.id, name: dt.name, color: dt.color, kind: dt.kind, notes, pattern, synth: { ...DEFAULT_SYNTH, ...dt.synth }, muted: false, clips: clips ?? [] }
    })
    // Tracks absent from the file are dropped (file order wins too) — engine.sync disposes
    // their audio chains. Deliberately NOT touching: isPlaying (keep jamming through a file
    // edit), undo history (git is the undo story for external edits), swing (not modeled).
    // Scenes and the timeline arrangement ARE file-owned since v0.4 — when the partial carries
    // them, the file wins; when it doesn't (pre-v0.4 daemon), they're preserved untouched.
    const scenes = docState.scenes ?? state.scenes
    applyRestoredCounters(tracks, scenes)
    const selectedTrackId = tracks.some((t) => t.id === docState.selectedTrackId)
      ? docState.selectedTrackId
      : (tracks[0]?.id ?? state.selectedTrackId)
    let arrangement = state.arrangement
    if (docState.song !== undefined) {
      if (docState.song !== null && docState.song.length > 0) {
        arrangement = { ...state.arrangement, enabled: true, mode: 'timeline', timeline: docState.song.map((e) => ({ ...e })) }
      } else if (state.arrangement.mode === 'timeline') {
        // file explicitly has no song: clear OUR timeline, but never stomp a lesson's
        // energy/structure arrangement (those aren't file-owned)
        arrangement = { ...state.arrangement, enabled: false, mode: null, timeline: undefined }
      }
    }
    set({ tracks, scenes, arrangement, bpm: docState.bpm, loopBars: docState.loopBars, selectedTrackId })
    engine.sync(tracks)
  },

  exportSandboxPayload: () => {
    const state = get()
    return state.mode === 'sandbox' ? serializeSandbox(state) : null
  },

  exportSandboxWav: async () => {
    const state = get()
    if (state.mode !== 'sandbox') return null
    const wasPlaying = state.isPlaying
    if (!wasPlaying) await state.play()
    const loopSeconds = (state.loopBars * 16 * 60) / state.bpm / 4 // 16 steps/bar, 4 steps/beat
    const blob = await engine.recordWav(loopSeconds, 1)
    if (!wasPlaying) get().stop()
    return blob
  },

  check: () => {
    const state = get()
    const lesson = findLesson(state.currentLessonId)
    if (!lesson) return
    const result = lesson.validate({
      tracks: state.tracks,
      arrangement: state.arrangement,
      params: state.lessonParams,
      sampleLoaded: state.sampleLoaded,
      sampleSliceMeta: state.sampleSliceMeta,
      samplePitchMode: state.samplePitchMode,
      trackLab: state.trackLab,
    })
    let completed = state.completed
    if (result.pass && !completed.includes(lesson.id)) {
      completed = [...completed, lesson.id]
      localStorage.setItem(COMPLETED_KEY, JSON.stringify(completed))
    }
    set({ feedback: result, paramScores: result.paramScores ?? null, completed })
  },

  nextLesson: () => {
    const next = nextLessonId(get().currentLessonId)
    if (next) get().loadLesson(next)
  },

  setSection: (index, type) => {
    get().pushHistory()
    const a = get().arrangement
    const sections = a.sections.map((s, i) => (i === index ? type : s))
    set({ arrangement: { ...a, sections } })
  },

  toggleActive: (trackId, section) => {
    get().pushHistory()
    const a = get().arrangement
    const cur = a.active[trackId] ?? []
    const active = { ...a.active, [trackId]: cur.map((v, i) => (i === section ? !v : v)) }
    set({ arrangement: { ...a, active } })
  },

  // Undo/redo covers discrete edits (notes, drum steps, arrangement, copy/paste) — not
  // continuous knob drags (setSynth fires per pixel of movement, which would flood the stack).
  pushHistory: () => {
    const { tracks, arrangement, past } = get()
    const next = [...past, { tracks, arrangement }].slice(-HISTORY_LIMIT)
    set({ past: next, future: [] })
  },

  undo: () => {
    const { past, tracks, arrangement, future } = get()
    if (!past.length) return
    const prev = past[past.length - 1]
    set({
      past: past.slice(0, -1),
      future: [{ tracks, arrangement }, ...future],
      tracks: prev.tracks,
      arrangement: prev.arrangement,
    })
    engine.sync(prev.tracks)
  },

  redo: () => {
    const { future, tracks, arrangement, past } = get()
    if (!future.length) return
    const next = future[0]
    set({
      future: future.slice(1),
      past: [...past, { tracks, arrangement }],
      tracks: next.tracks,
      arrangement: next.arrangement,
    })
    engine.sync(next.tracks)
  },

  copyTrack: (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track) return
    set({
      clipboard: {
        notes: track.notes.map((n) => ({ ...n })),
        pattern: Object.fromEntries(Object.entries(track.pattern).map(([k, v]) => [k, [...v]])) as DrumPattern,
      },
    })
  },

  pasteTrack: (trackId) => {
    const clipboard = get().clipboard
    if (!clipboard) return
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              notes: clipboard.notes.map((n) => ({ ...n, id: `u${noteCounter++}` })),
              pattern: Object.fromEntries(Object.entries(clipboard.pattern).map(([k, v]) => [k, [...v]])) as DrumPattern,
            }
          : t,
      ),
    })
    engine.sync(get().tracks)
  },

  // ---------- clips + scenes (Session-View analog, sandbox only) ----------
  // A clip is a named snapshot of a track's live notes/pattern: saving copies them in,
  // loading copies them back out. This trades a fully live-referenced clip model for one
  // that needs zero changes to the engine, the store's note/pattern actions, or any of the
  // existing lesson validators — all of which read a track's notes/pattern directly.

  saveClip: (trackId) => {
    const track = get().tracks.find((t) => t.id === trackId)
    if (!track) return
    const clip = {
      id: `clip${clipCounter++}`,
      name: `Clip ${track.clips.length + 1}`,
      notes: track.notes.map((n) => ({ ...n })),
      pattern: Object.fromEntries(Object.entries(track.pattern).map(([k, v]) => [k, [...v]])) as DrumPattern,
      // Phase F: automation travels with the clip — see AUTOMATABLE_PARAMS comment in types.ts.
      automation: track.automation
        ? (Object.fromEntries(Object.entries(track.automation).map(([k, v]) => [k, v!.map((p) => ({ ...p }))])) as Track['automation'])
        : undefined,
    }
    set({
      tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
    })
  },

  loadClip: (trackId, clipId) => {
    const track = get().tracks.find((t) => t.id === trackId)
    const clip = track?.clips.find((c) => c.id === clipId)
    if (!track || !clip) return
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              notes: clip.notes.map((n) => ({ ...n, id: `u${noteCounter++}` })),
              pattern: Object.fromEntries(Object.entries(clip.pattern).map(([k, v]) => [k, [...v]])) as DrumPattern,
              // Loading a clip replaces the live automation entirely (or clears it), same
              // save-in/load-out snapshot semantics as notes/pattern above.
              automation: clip.automation
                ? (Object.fromEntries(Object.entries(clip.automation).map(([k, v]) => [k, v!.map((p) => ({ ...p }))])) as Track['automation'])
                : undefined,
            }
          : t,
      ),
    })
    engine.sync(get().tracks)
  },

  deleteClip: (trackId, clipId) => {
    set({
      tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t)),
      scenes: get().scenes.map((s) => {
        if (s.clipIds[trackId] !== clipId) return s
        const clipIds = { ...s.clipIds }
        delete clipIds[trackId]
        return { ...s, clipIds }
      }),
    })
  },

  addScene: () => {
    sceneCounter += 1
    const scene: Scene = { id: `scene${sceneCounter}`, name: `Scene ${sceneCounter}`, clipIds: {} }
    set({ scenes: [...get().scenes, scene] })
  },

  deleteScene: (sceneId) => set({ scenes: get().scenes.filter((s) => s.id !== sceneId) }),

  assignSceneClip: (sceneId, trackId, clipId) => {
    set({
      scenes: get().scenes.map((s) => {
        if (s.id !== sceneId) return s
        const clipIds = { ...s.clipIds }
        if (clipId) clipIds[trackId] = clipId
        else delete clipIds[trackId]
        return { ...s, clipIds }
      }),
    })
  },

  triggerScene: (sceneId) => {
    const scene = get().scenes.find((s) => s.id === sceneId)
    if (!scene) return
    get().pushHistory()
    const tracks = get().tracks.map((t) => {
      const clipId = scene.clipIds[t.id]
      const clip = clipId ? t.clips.find((c) => c.id === clipId) : undefined
      if (!clip) return t
      return {
        ...t,
        notes: clip.notes.map((n) => ({ ...n, id: `u${noteCounter++}` })),
        pattern: Object.fromEntries(Object.entries(clip.pattern).map(([k, v]) => [k, [...v]])) as DrumPattern,
      }
    })
    set({ tracks })
    engine.sync(tracks)
  },

  // ---------- Phase F: generalized breakpoint automation (any AutomatableParam, not just cutoff) ----------

  setAutomationPoint: (trackId, param, time, value, curve) => {
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) => {
        if (t.id !== trackId) return t
        const existing = t.automation?.[param] ?? []
        const withoutNear = existing.filter((p) => Math.abs(p.time - time) > 0.001)
        const point = curve ? { time, value, curve } : { time, value }
        return { ...t, automation: { ...t.automation, [param]: [...withoutNear, point].sort((a, b) => a.time - b.time) } }
      }),
    })
  },

  removeAutomationPoint: (trackId, param, time) => {
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? { ...t, automation: { ...t.automation, [param]: (t.automation?.[param] ?? []).filter((p) => Math.abs(p.time - time) > 0.001) } }
          : t,
      ),
    })
  },

  clearAutomation: (trackId, param) => {
    get().pushHistory()
    set({
      tracks: get().tracks.map((t) => {
        if (t.id !== trackId) return t
        const automation = { ...t.automation }
        delete automation[param]
        return { ...t, automation }
      }),
    })
  },

  // Live "touch" recording: while armed + isRecording + isPlaying, Engine.tick() calls this once
  // per step with the armed param's current (live-dragged) value — no pushHistory here, since it
  // rides on the single history entry toggleRecording already pushed when the take started (same
  // pattern as Phase G's recordNote).
  recordAutomationPoint: (trackId, param, time, value) => {
    set({
      tracks: get().tracks.map((t) => {
        if (t.id !== trackId) return t
        const existing = t.automation?.[param] ?? []
        const withoutNear = existing.filter((p) => Math.abs(p.time - time) > 0.001)
        return { ...t, automation: { ...t.automation, [param]: [...withoutNear, { time, value }].sort((a, b) => a.time - b.time) } }
      }),
    })
  },

  setAutomationArm: (arm) => set({ automationArm: arm }),

  setMacroValue: (trackId, value) => {
    const clamped = Math.min(1, Math.max(0, value))
    // Fixed mapping (not a user-remappable target list — see docs/ROADMAP.md Phase F item 30):
    // one knob sweeps cutoff (log, 300Hz-8kHz), reverb send, and distortion mix together.
    const cutoff = 300 * Math.pow(8000 / 300, clamped)
    get().setSynth(trackId, { macroValue: clamped, cutoff, sendReverb: clamped * 0.6, distortionMix: clamped * 0.5 })
  },

  setScaleLock: (lock) => set({ scaleLock: lock }),

  // ---------- Phase I: sampling ----------

  loadDrumSample: async (file) => {
    await engine.loadDrumSampleFromFile(file)
  },

  clearDrumSample: () => engine.clearDrumSample(),

  setSampleSliceBoundary: (index, timeSec) => engine.setSliceBoundary(index, timeSec),

  toggleSampleSliceReverse: (lane) => engine.toggleSliceReverse(lane),

  setSampleSlicePitch: (lane, semitones) => engine.setSlicePitch(lane, semitones),

  setSamplePitchMode: (mode) => engine.setSamplePitchMode(mode),

  loadStarterSample: async (url, name, startSec, durSec) => {
    await engine.loadDrumSampleFromUrl(url, name, startSec, durSec)
  },

  // ---------- Musical typing (computer keyboard as a MIDI stand-in) ----------

  setComputerKeyboardEnabled: (on) => {
    setComputerKeyboardHandlers({ onNoteOn: handleMidiNoteOn, onNoteOff: handleMidiNoteOff })
    setComputerKeyboardListening(on)
    set({ computerKeyboardEnabled: on })
  },

  // ---------- MIDI input (Phase G) ----------

  connectMidi: async () => {
    midiInput.setHandlers({ onNoteOn: handleMidiNoteOn, onNoteOff: handleMidiNoteOff })
    // Refreshes the UI live if a keyboard shows up *after* this connect() call already resolved
    // (e.g. plugged in a moment after clicking Connect MIDI with none attached yet) — Web MIDI's
    // own onstatechange event still fires post-grant, midi.ts just didn't used to forward it here.
    midiInput.setOnDevicesChanged((devices) => {
      set({
        midi: {
          supported: midiInput.supported,
          connected: devices.length > 0,
          deviceName: devices[0]?.name ?? null,
          error: devices.length ? null : 'No MIDI devices found — plug in a keyboard and reconnect.',
        },
      })
    })
    try {
      const devices = await midiInput.connect()
      set({
        midi: {
          supported: midiInput.supported,
          connected: devices.length > 0,
          deviceName: devices[0]?.name ?? null,
          error: devices.length ? null : 'No MIDI devices found — plug in a keyboard and reconnect.',
        },
      })
    } catch (err) {
      set({
        midi: {
          supported: midiInput.supported,
          connected: false,
          deviceName: null,
          error: err instanceof Error ? err.message : String(err),
        },
      })
    }
  },

  // Arming pushes one history entry for the whole take (like a drag gesture) rather than one per
  // recorded note; individual notes land via recordNote below without touching history again.
  toggleRecording: () => {
    const recording = !get().isRecording
    if (recording) get().pushHistory()
    else releaseAllHeld()
    set({ isRecording: recording })
  },

  setQuantizeStrength: (v) => set({ quantizeStrength: Math.min(100, Math.max(0, Math.round(v))) }),

  recordNote: (trackId, note) => {
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId ? { ...t, notes: [...t.notes, { id: `u${noteCounter++}`, ...note }] } : t,
      ),
    })
  },

  // ---------- Track Lab: full-song deconstruction ----------
  // The imported audio lives on the engine; everything here is the serializable analysis +
  // the student's structure map (see state/trackLabState.ts). The grading logic lives with the
  // Track Deconstruction lessons (lessons/deconstruction.ts) so the in-view CHECK MAP button
  // and the lesson's own Check use the identical grader.

  goToTrackLab: () => {
    const state = get()
    if (state.mode === 'tracklab') return
    if (state.isPlaying) state.stop()
    // same snapshot semantics as loadLesson: leaving the sandbox keeps its contents restorable
    const snapshot =
      state.mode === 'sandbox'
        ? { tracks: state.tracks, bpm: state.bpm, loopBars: state.loopBars, selectedTrackId: state.selectedTrackId, scenes: state.scenes }
        : state.sandboxSnapshot
    set({ mode: 'tracklab', sandboxSnapshot: snapshot, feedback: null })
  },

  loadTrackLabFile: async (file) => {
    const state = get()
    if (state.isPlaying) state.stop()
    engine.stopTrackLab()
    set({ trackLab: { ...emptyTrackLab(), status: 'analyzing', fileName: file.name } })
    // yield a frame so the "analyzing" state paints before the synchronous DSP pass below
    await new Promise((r) => setTimeout(r, 30))
    try {
      const buffer = await engine.decodeAudioFile(file)
      engine.setTrackLabBuffer(buffer)
      const analysis = analyzeAudioBuffer(buffer)
      set({
        trackLab: {
          ...emptyTrackLab(),
          status: 'ready',
          fileName: file.name,
          analysis,
          labels: Array(analysis.sections.length).fill(null),
          notes: Array(analysis.sections.length).fill(''),
        },
      })
    } catch (err) {
      engine.setTrackLabBuffer(null)
      set({
        trackLab: {
          ...emptyTrackLab(),
          status: 'error',
          fileName: file.name,
          error: err instanceof Error ? err.message : 'Could not decode this file as audio.',
        },
      })
    }
  },

  loadTrackLabFromUrl: async (url, name) => {
    // show the analyzing card during the network fetch too — a starter song is 10-20MB, so the
    // wait is real; the decode/analyze pass afterwards reuses loadTrackLabFile unchanged
    set({ trackLab: { ...emptyTrackLab(), status: 'analyzing', fileName: name } })
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`download failed (${resp.status})`)
      const blob = await resp.blob()
      await get().loadTrackLabFile(new File([blob], name, { type: blob.type || 'audio/mpeg' }))
    } catch (err) {
      set({
        trackLab: {
          ...emptyTrackLab(),
          status: 'error',
          fileName: name,
          error: err instanceof Error ? `${err.message} — starter songs stream from the web, so check your connection.` : 'Download failed.',
        },
      })
    }
  },

  setTrackLabLabel: (index, type) => {
    const tl = get().trackLab
    set({ trackLab: { ...tl, labels: tl.labels.map((l, i) => (i === index ? type : l)), feedback: null } })
  },

  setTrackLabNote: (index, text) => {
    const tl = get().trackLab
    set({ trackLab: { ...tl, notes: tl.notes.map((n, i) => (i === index ? text : n)) } })
  },

  setTrackLabBpmFactor: (factor) => {
    const tl = get().trackLab
    const buffer = engine.getTrackLabBuffer()
    if (!tl.analysis || !buffer) return
    engine.stopTrackLab()
    const analysis = analyzeAudioBuffer(buffer, { forceBpm: tl.analysis.bpm * factor })
    // the bar grid changed, so the section list (and any labels/notes on it) must reset too
    set({
      trackLab: {
        ...tl,
        analysis,
        labels: Array(analysis.sections.length).fill(null),
        notes: Array(analysis.sections.length).fill(''),
        feedback: null,
        playingSection: null,
      },
    })
  },

  setTrackLabFeedback: (fb) => set({ trackLab: { ...get().trackLab, feedback: fb } }),

  playTrackLabSection: (index) => {
    const tl = get().trackLab
    if (index === null || !tl.analysis) {
      engine.stopTrackLab()
      set({ trackLab: { ...tl, playingSection: null } })
      return
    }
    const state = get()
    if (state.isPlaying) state.stop()
    const sec = tl.analysis.sections[index]
    if (!sec) return
    const start = tl.analysis.firstBeatSec + sec.startBar * tl.analysis.barSec
    const dur = (sec.endBar - sec.startBar) * tl.analysis.barSec
    void engine.playTrackLabRange(start, dur)
    set({ trackLab: { ...tl, playingSection: index } })
  },

  chopTrackLabSection: (index) => {
    const tl = get().trackLab
    if (!tl.analysis) return
    const sec = tl.analysis.sections[index]
    if (!sec) return
    // chop the section's first 2 bars (or 1 if it's that short) -- a classic loop length; the
    // sampler then splits whatever it gets into 5 equal pad slices (Phase I region mode)
    const bars = Math.min(2, sec.endBar - sec.startBar)
    const start = tl.analysis.firstBeatSec + sec.startBar * tl.analysis.barSec
    const dur = bars * tl.analysis.barSec
    const slice = engine.sliceTrackLabRange(start, dur)
    if (!slice) return
    engine.loadDrumSampleFromBuffer(slice, `${tl.fileName ?? 'track'} · bars ${sec.startBar + 1}–${sec.startBar + bars}`)
    set({
      trackLab: {
        ...get().trackLab,
        chopped: true,
        feedback: {
          pass: true,
          message: `Chopped bars ${sec.startBar + 1}–${sec.startBar + bars} onto the drum pads, split into 5 slices. Any step sequencer now plays them — head to a lesson or the Sandbox and flip the break.`,
        },
      },
    })
  },

  useTrackLabTemplate: () => {
    const tl = get().trackLab
    const a = tl.analysis
    if (!a || tl.labels.length === 0 || tl.labels.some((l) => l === null)) return
    engine.stopTrackLab()
    // scaled miniature: each analyzed section becomes one 2-bar slot in the energy grid
    // (capped at 8 slots -- the grid's readable width -- favoring the front of the track)
    const count = Math.min(8, a.sections.length)
    const sections = (tl.labels as SectionType[]).slice(0, count)
    const used = a.sections.slice(0, count)
    const avgs = used.map((sec) => sectionAvg(a, sec))
    const maxOf = (k: 'rms' | 'low' | 'mid' | 'high') => Math.max(1e-6, ...avgs.map((x) => x[k]))
    const mr = maxOf('rms'), ml = maxOf('low'), mm = maxOf('mid'), mh = maxOf('high')
    // starting guess from the band analysis: low band => drums+bass, mids => chords, highs => lead
    const active: Record<string, boolean[]> = {
      drums: avgs.map((x) => x.rms > 0.5 * mr),
      bass: avgs.map((x) => x.low > 0.5 * ml),
      chords: avgs.map((x) => x.mid > 0.55 * mm),
      lead: avgs.map((x) => x.high > 0.6 * mh),
    }
    const bars = count * 2
    const tracks = [
      drumTrack(GROOVE_STEPS),
      synthTrack('bass', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 700, attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.15, volume: -8 }, bassGrooveNotes(bars)),
      synthTrack('chords', 'Chords', '#f7c948', { osc: 'triangle', cutoff: 3500, attack: 0.4, decay: 0.4, sustain: 0.6, release: 1.2, volume: -14 }, chordProgressionNotes(bars)),
      synthTrack('lead', 'Lead', '#c678dd', { osc: 'square', cutoff: 4500, attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4, volume: -14 }, melodyNotes(bars)),
    ]
    set({
      mode: 'sandbox',
      tracks,
      bpm: Math.min(200, Math.max(60, Math.round(a.bpm))),
      loopBars: bars,
      selectedTrackId: 'drums',
      arrangement: { enabled: true, mode: 'energy', sections, barsPerSection: 2, active },
      scenes: [],
      feedback: null,
      paramScores: null,
      currentStep: -1,
      noteLength: 2,
      past: [],
      future: [],
      trackLab: { ...tl, templated: true, playingSection: null },
    })
    engine.sync(tracks)
  },
}))

// Autosave the sandbox to localStorage, debounced, whenever its content actually changes. Guards
// on reference-equality of the relevant slices first so this is a no-op on every other state
// change (e.g. masterLevel/currentStep tick once per playback step) without doing any real work.
let sandboxSaveTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe((state, prev) => {
  if (state.mode !== 'sandbox') return
  const changed =
    state.tracks !== prev.tracks ||
    state.bpm !== prev.bpm ||
    state.loopBars !== prev.loopBars ||
    state.selectedTrackId !== prev.selectedTrackId ||
    state.scenes !== prev.scenes ||
    state.swing !== prev.swing ||
    state.arrangement !== prev.arrangement
  if (!changed) return
  if (sandboxSaveTimer) clearTimeout(sandboxSaveTimer)
  sandboxSaveTimer = setTimeout(() => {
    saveSandboxToStorage(serializeSandbox(state))
  }, 500)
})

// expose for debugging / testing in dev
if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}
