import { create } from 'zustand'
import type { ArrangementState, DrumLane, Note, SectionType, SynthParams, Track } from '../types'
import { engine } from '../audio/engine'
import { findLesson, LESSONS, nextLessonId, sandboxTracks, type Lesson, type LessonParams } from '../lessons/curriculum'
import type { ScoreMap } from '../lessons/framework'

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

export interface AppState {
  tracks: Track[]
  selectedTrackId: string
  bpm: number
  isPlaying: boolean
  loopBars: number
  currentStep: number
  noteLength: number
  mode: 'lesson' | 'sandbox'
  currentLessonId: string
  completed: string[]
  arrangement: ArrangementState
  lessonParams: LessonParams
  feedback: { pass: boolean; message: string } | null
  paramScores: ScoreMap | null
  sandboxSnapshot: { tracks: Track[]; bpm: number; loopBars: number; selectedTrackId: string } | null

  lesson: () => Lesson | undefined
  selectTrack: (id: string) => void
  addNote: (trackId: string, pitch: number, start: number) => void
  removeNote: (trackId: string, noteId: string) => void
  clearTrack: (trackId: string) => void
  toggleDrum: (trackId: string, lane: DrumLane, step: number) => void
  setSynth: (trackId: string, patch: Partial<SynthParams>) => void
  toggleMute: (trackId: string) => void
  setBpm: (bpm: number) => void
  setNoteLength: (len: number) => void
  play: () => Promise<void>
  stop: () => void
  loadLesson: (id: string) => void
  goToSandbox: () => void
  check: () => void
  nextLesson: () => void
  setSection: (index: number, type: SectionType) => void
  toggleActive: (trackId: string, section: number) => void
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
  mode: 'lesson',
  currentLessonId: firstLesson,
  completed: loadCompleted(),
  arrangement: { ...emptyArrangement(), ...initialSetup.arrangement },
  lessonParams: initialSetup.params ?? {},
  feedback: null,
  paramScores: null,
  sandboxSnapshot: null,

  lesson: () => (get().mode === 'lesson' ? findLesson(get().currentLessonId) : undefined),

  selectTrack: (id) => set({ selectedTrackId: id }),

  addNote: (trackId, pitch, start) => {
    const { noteLength, tracks } = get()
    const track = tracks.find((t) => t.id === trackId)
    if (!track) return
    // don't add overlapping same-pitch notes
    const collides = track.notes.some(
      (x) => x.pitch === pitch && start < x.start + x.duration && start + noteLength > x.start,
    )
    if (collides) return
    const note: Note = { id: `u${noteCounter++}`, pitch, start, duration: noteLength }
    set({
      tracks: tracks.map((t) => (t.id === trackId ? { ...t, notes: [...t.notes, note] } : t)),
    })
    void engine.previewNote(track, pitch)
  },

  removeNote: (trackId, noteId) =>
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId ? { ...t, notes: t.notes.filter((x) => x.id !== noteId) } : t,
      ),
    }),

  clearTrack: (trackId) =>
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              notes: [],
              pattern: Object.fromEntries(
                Object.entries(t.pattern).map(([k, v]) => [k, v.map(() => false)]),
              ) as Track['pattern'],
            }
          : t,
      ),
    }),

  toggleDrum: (trackId, lane, step) => {
    const turningOn = !get().tracks.find((t) => t.id === trackId)?.pattern[lane][step]
    set({
      tracks: get().tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              pattern: {
                ...t.pattern,
                [lane]: t.pattern[lane].map((v, i) => (i === step ? !v : v)),
              },
            }
          : t,
      ),
    })
    if (turningOn) void engine.previewDrum(lane)
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

  setNoteLength: (len) => set({ noteLength: len }),

  play: async () => {
    set({ isPlaying: true })
    await engine.play()
  },

  stop: () => {
    engine.stop()
    set({ isPlaying: false })
  },

  loadLesson: (id) => {
    const lesson = findLesson(id)
    if (!lesson) return
    const state = get()
    if (state.isPlaying) state.stop()
    const snapshot =
      state.mode === 'sandbox'
        ? { tracks: state.tracks, bpm: state.bpm, loopBars: state.loopBars, selectedTrackId: state.selectedTrackId }
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
    })
    engine.sync(s.tracks)
  },

  goToSandbox: () => {
    const state = get()
    if (state.mode === 'sandbox') return
    if (state.isPlaying) state.stop()
    const snap = state.sandboxSnapshot ?? {
      tracks: sandboxTracks(),
      bpm: 124,
      loopBars: 4,
      selectedTrackId: 'drums',
    }
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
    })
    engine.sync(snap.tracks)
  },

  check: () => {
    const state = get()
    const lesson = findLesson(state.currentLessonId)
    if (!lesson) return
    const result = lesson.validate({ tracks: state.tracks, arrangement: state.arrangement, params: state.lessonParams })
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
    const a = get().arrangement
    const sections = a.sections.map((s, i) => (i === index ? type : s))
    set({ arrangement: { ...a, sections } })
  },

  toggleActive: (trackId, section) => {
    const a = get().arrangement
    const cur = a.active[trackId] ?? []
    const active = { ...a.active, [trackId]: cur.map((v, i) => (i === section ? !v : v)) }
    set({ arrangement: { ...a, active } })
  },
}))

// expose for debugging / testing in dev
if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}
