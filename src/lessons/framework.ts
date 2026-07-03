import {
  DEFAULT_SYNTH,
  DRUM_LANES,
  noteName,
  type ArrangementState,
  type DrumLane,
  type DrumPattern,
  type Note,
  type SynthParams,
  type TargetPatch,
  type Track,
} from '../types'

// ---------- per-parameter ear-training scoring ----------
// Syntorial's actual mechanic: not audio comparison, a per-parameter value diff,
// tri-state (correct/close/wrong) with tolerance tuned to perceptibility rather
// than raw numeric distance (e.g. cutoff compared in octaves, not linear Hz).

export type ParamStatus = 'correct' | 'close' | 'wrong'
export type ScoreMap = Partial<Record<keyof SynthParams, ParamStatus>>

interface Tolerance {
  tight: number
  loose: number
  log?: boolean // compare in log2 space (octaves) instead of linear units
}

const PARAM_TOLERANCE: Record<Exclude<keyof SynthParams, 'osc'>, Tolerance> = {
  cutoff: { tight: 0.2, loose: 0.6, log: true },
  resonance: { tight: 1.5, loose: 4 },
  attack: { tight: 0.25, loose: 0.7, log: true },
  decay: { tight: 0.25, loose: 0.7, log: true },
  sustain: { tight: 0.08, loose: 0.2 },
  release: { tight: 0.3, loose: 0.8, log: true },
  volume: { tight: 3, loose: 8 },
  pan: { tight: 0.15, loose: 0.4 },
  sendReverb: { tight: 0.1, loose: 0.3 },
  sendDelay: { tight: 0.1, loose: 0.3 },
}

function scoreOne(key: keyof SynthParams, got: unknown, want: unknown): ParamStatus {
  if (key === 'osc') return got === want ? 'correct' : 'wrong'
  const tol = PARAM_TOLERANCE[key as Exclude<keyof SynthParams, 'osc'>]
  if (!tol) return got === want ? 'correct' : 'wrong'
  const g = got as number
  const w = want as number
  if (tol.log) {
    const diff = Math.abs(Math.log2(Math.max(g, 0.001) / Math.max(w, 0.001)))
    return diff <= tol.tight ? 'correct' : diff <= tol.loose ? 'close' : 'wrong'
  }
  const diff = Math.abs(g - w)
  return diff <= tol.tight ? 'correct' : diff <= tol.loose ? 'close' : 'wrong'
}

export function scorePatch(got: SynthParams, want: SynthParams, keys?: (keyof SynthParams)[]): ScoreMap {
  const use = keys ?? (Object.keys(want) as (keyof SynthParams)[])
  const out: ScoreMap = {}
  for (const k of use) out[k] = scoreOne(k, got[k], want[k])
  return out
}

export function scoreSummary(scores: ScoreMap) {
  const vals = Object.values(scores) as ParamStatus[]
  const correct = vals.filter((v) => v === 'correct').length
  const wrong = vals.filter((v) => v === 'wrong').length
  const total = vals.length
  const stars = total ? (Math.round((correct / total) * 3) as 0 | 1 | 2 | 3) : 0
  return { correct, wrong, total, stars, allGood: wrong === 0 }
}

// ---------- note & track builders ----------

let noteId = 0
export const n = (pitch: number, start: number, duration: number, velocity = 0.8): Note => ({
  id: `n${noteId++}`,
  pitch,
  start,
  duration,
  velocity,
})

export const emptyPattern = (): DrumPattern =>
  Object.fromEntries(DRUM_LANES.map((l) => [l, Array(16).fill(0)])) as DrumPattern

export const patternOf = (steps: Partial<Record<DrumLane, number[]>>): DrumPattern => {
  const p = emptyPattern()
  for (const [lane, idxs] of Object.entries(steps)) {
    for (const i of idxs ?? []) p[lane as DrumLane][i] = 1
  }
  return p
}

export function synthTrack(
  id: string,
  name: string,
  color: string,
  synth: Partial<SynthParams> = {},
  notes: Note[] = [],
): Track {
  return {
    id,
    name,
    color,
    kind: 'synth',
    notes,
    pattern: emptyPattern(),
    synth: { ...DEFAULT_SYNTH, ...synth },
    muted: false,
    clips: [],
  }
}

export function drumTrack(steps: Partial<Record<DrumLane, number[]>> = {}): Track {
  return {
    id: 'drums',
    name: 'Drums',
    color: '#e06c75',
    kind: 'drums',
    notes: [],
    pattern: patternOf(steps),
    synth: { ...DEFAULT_SYNTH },
    muted: false,
    clips: [],
  }
}

export const keysTrack = (notes: Note[] = []) =>
  synthTrack(
    'keys',
    'Keys',
    '#f7c948',
    { osc: 'triangle', cutoff: 5000, attack: 0.02, decay: 0.3, sustain: 0.6, release: 0.5, volume: -10 },
    notes,
  )

export const riffOneBar = (pitch: number) =>
  [0, 2, 4, 6, 8, 10, 12, 14].map((s) => n(s === 14 ? pitch + 12 : pitch, s, 2))

// ---------- shared musical content (A minor: Am - F - C - G) ----------

export const AM_SCALE = [9, 11, 0, 2, 4, 5, 7] // pitch classes of A natural minor
export const AM_PENTA = [9, 0, 2, 4, 7] // A minor pentatonic
export const CHORD_ROOTS_PC = [9, 5, 0, 7] // A, F, C, G
export const CHORD_PCS: number[][] = [
  [9, 0, 4], // Am
  [5, 9, 0], // F
  [0, 4, 7], // C
  [7, 11, 2], // G
]
export const CHORD_NAMES = ['A minor', 'F major', 'C major', 'G major']

export const CHORD_VOICINGS = [
  [57, 60, 64], // Am: A3 C4 E4
  [53, 57, 60], // F:  F3 A3 C4
  [55, 60, 64], // C:  G3 C4 E4
  [55, 59, 62], // G:  G3 B3 D4
]

export function chordProgressionNotes(totalBars: number): Note[] {
  const notes: Note[] = []
  for (let bar = 0; bar < totalBars; bar++) {
    for (const p of CHORD_VOICINGS[bar % 4]) notes.push(n(p, bar * 16, 16))
  }
  return notes
}

export const BASS_ROOTS = [33, 29, 36, 31] // A1 F1 C2 G1

export function bassGrooveNotes(totalBars: number): Note[] {
  const notes: Note[] = []
  for (let bar = 0; bar < totalBars; bar++) {
    const root = BASS_ROOTS[bar % 4]
    for (const off of [0, 2, 4, 6, 8, 10, 12, 14]) {
      notes.push(n(off === 14 ? root + 12 : root, bar * 16 + off, 2))
    }
  }
  return notes
}

const MELODY_4BARS: [number, number, number][] = [
  [69, 0, 4], [72, 4, 2], [71, 6, 2], [64, 8, 8],
  [65, 16, 4], [69, 20, 4], [72, 24, 8],
  [72, 32, 4], [71, 36, 4], [67, 40, 8],
  [74, 48, 4], [71, 52, 4], [67, 56, 4], [69, 60, 4],
]

export function melodyNotes(totalBars: number): Note[] {
  const notes: Note[] = []
  for (let rep = 0; rep < totalBars / 4; rep++) {
    for (const [p, s, d] of MELODY_4BARS) notes.push(n(p, rep * 64 + s, d))
  }
  return notes
}

export const GROOVE_STEPS: Partial<Record<DrumLane, number[]>> = {
  kick: [0, 4, 8, 12],
  clap: [4, 12],
  hat: [2, 6, 10, 14],
  openhat: [14],
}

export function sandboxTracks(): Track[] {
  return [
    drumTrack(GROOVE_STEPS),
    synthTrack('bass', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 700, attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.15, volume: -8 }, bassGrooveNotes(4)),
    synthTrack('chords', 'Chords', '#f7c948', { osc: 'triangle', cutoff: 3500, attack: 0.4, decay: 0.4, sustain: 0.6, release: 1.2, volume: -14 }, chordProgressionNotes(4)),
    synthTrack('lead', 'Lead', '#c678dd', { osc: 'square', cutoff: 4500, attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4, volume: -14 }, melodyNotes(4)),
  ]
}

export const bassTrack = (notes: Note[] = []) =>
  synthTrack('bass', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 700, attack: 0.005, decay: 0.25, sustain: 0.4, release: 0.15, volume: -8 }, notes)

export const leadTrack = (notes: Note[] = []) =>
  synthTrack('lead', 'Lead', '#c678dd', { osc: 'square', cutoff: 4500, attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.4, volume: -12 }, notes)

// ---------- lesson framework ----------

export type LessonParams = Record<string, any>

// dynamic values: plain, or computed from the drill's random params
export type Dyn<T> = T | ((params: LessonParams) => T)
export function resolveDyn<T>(d: Dyn<T>, params: LessonParams): T {
  return typeof d === 'function' ? (d as (p: LessonParams) => T)(params) : d
}

export interface LessonSetup {
  tracks: Track[]
  loopBars: number
  bpm: number
  selectedTrackId: string
  noteLength?: number
  arrangement?: Partial<ArrangementState>
  params?: LessonParams
}

export interface ValidateCtx {
  tracks: Track[]
  arrangement: ArrangementState
  params: LessonParams
}

export interface DrumHit {
  lane: DrumLane
  step: number
}

export interface ValidateResult {
  pass: boolean
  message: string
  paramScores?: ScoreMap
}

export interface Lesson {
  id: string
  module: string
  title: string
  summary: string
  task: Dyn<string>
  hints: string[]
  centerPitch?: number
  scalePcs?: number[]
  target?: Dyn<TargetPatch>
  drumTarget?: Dyn<DrumHit[]>
  drill?: boolean
  /** Which SynthParams the device panel should expose for this lesson. Undefined = show everything
   * (the default for lessons outside the Synthesis/Ear Training curriculum). Progressive reveal: each
   * synthesis lesson lists everything taught up to and including itself. */
  visibleParams?: (keyof SynthParams)[]
  setup: () => LessonSetup
  validate: (ctx: ValidateCtx) => ValidateResult
}

export interface Module {
  name: string
  lessons: Lesson[]
}

export const pass = (message: string, paramScores?: ScoreMap): ValidateResult => ({ pass: true, message, paramScores })
export const fail = (message: string, paramScores?: ScoreMap): ValidateResult => ({ pass: false, message, paramScores })

export const track = (ctx: ValidateCtx, id: string) => ctx.tracks.find((t) => t.id === id)!
export const laneSteps = (t: Track, lane: DrumLane) =>
  t.pattern[lane].map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
export const sameSet = (a: number[], b: number[]) =>
  a.length === b.length &&
  [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i])

export const barNotes = (t: Track, bar: number) =>
  t.notes.filter((x) => x.start >= bar * 16 && x.start < (bar + 1) * 16)

export const rand = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

export const PC_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

// ---------- reusable validators ----------

export function checkAscendingSequence(t: Track, expected: number[], label: string, patternDesc: string, successMsg: string) {
  const notes = [...t.notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch)
  if (notes.length === 0) return fail('The piano roll is empty — click in the grid to place notes.')
  if (notes.length !== expected.length)
    return fail(`This needs exactly ${expected.length} notes played one after another (you have ${notes.length}).`)
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].start <= notes[i - 1].start)
      return fail('Play the notes one after another, not stacked — give each note its own time slot, left to right.')
  }
  for (let i = 0; i < expected.length; i++) {
    if (notes[i].pitch !== expected[i]) {
      return fail(
        `Note ${i + 1} should be ${noteName(expected[i])}, but it's ${noteName(notes[i].pitch)}. ` +
          `The ${label} pattern is ${patternDesc} — count semitones on the keyboard (1 row = 1 semitone).`,
      )
    }
  }
  return pass(successMsg)
}

export function checkStack(t: Track, pitches: number[], chordName: string, hint: string, successMsg: string) {
  const notes = t.notes
  if (notes.length === 0) return fail(`Place ${pitches.length} notes stacked at the same time position.`)
  if (notes.length !== pitches.length)
    return fail(`This chord has exactly ${pitches.length} notes. You have ${notes.length}.`)
  const starts = new Set(notes.map((x) => x.start))
  if (starts.size !== 1) return fail('All notes must start at the same time — stack them vertically.')
  const got = notes.map((x) => x.pitch).sort((a, b) => a - b)
  const want = [...pitches].sort((a, b) => a - b)
  if (!sameSet(got, want)) {
    return fail(
      `Not quite — you played ${got.map(noteName).join(' – ')}. The ${chordName} is ${want.map(noteName).join(' – ')}. ${hint}`,
    )
  }
  return pass(successMsg)
}

// pitch-class match per bar (voicing free)
export function checkChordBars(
  t: Track,
  bars: { pcs: number[]; name: string }[],
  minNotes: number,
  successMsg: string,
) {
  if (t.notes.length === 0) return fail('The piano roll is empty. Stack chords at the start of each bar.')
  for (let bar = 0; bar < bars.length; bar++) {
    const bn = barNotes(t, bar)
    if (bn.length < minNotes) return fail(`Bar ${bar + 1} needs at least ${minNotes} notes (a full ${bars[bar].name}).`)
    const pcs = [...new Set(bn.map((x) => x.pitch % 12))].sort((a, b) => a - b)
    const want = [...bars[bar].pcs].sort((a, b) => a - b)
    if (!sameSet(pcs, want)) {
      return fail(
        `Bar ${bar + 1} should be ${bars[bar].name}. Right now it contains ${pcs.map((p) => PC_NAMES[p]).join(', ')} — check the hints for the chord tones.`,
      )
    }
  }
  return pass(successMsg)
}

// exact pitches per bar (voicing matters — inversions etc.)
export function checkExactBars(t: Track, bars: { pitches: number[]; label: string }[], successMsg: string) {
  for (let bar = 0; bar < bars.length; bar++) {
    const bn = barNotes(t, bar)
    if (bn.length === 0) return fail(`Bar ${bar + 1} is empty — it needs ${bars[bar].label}.`)
    const got = bn.map((x) => x.pitch).sort((a, b) => a - b)
    const want = [...bars[bar].pitches].sort((a, b) => a - b)
    if (!sameSet(got, want)) {
      return fail(
        `Bar ${bar + 1} should be ${bars[bar].label}: ${want.map(noteName).join(' – ')} exactly. You have ${got.map(noteName).join(' – ')}.`,
      )
    }
  }
  return pass(successMsg)
}

export { noteName }
