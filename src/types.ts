export type OscType = 'sine' | 'triangle' | 'sawtooth' | 'square'
export type FilterType = 'lowpass' | 'bandpass' | 'highpass'
export type LfoDest = 'off' | 'pitch' | 'cutoff' | 'amp'

export interface SynthParams {
  osc: OscType
  cutoff: number // Hz
  resonance: number // filter Q
  filterType: FilterType
  attack: number // seconds
  decay: number
  sustain: number // 0..1
  release: number
  volume: number // dB
  pan: number // -1 (left) .. 1 (right)
  sendReverb: number // 0..1, shared reverb return
  sendDelay: number // 0..1, shared delay return
  // second oscillator: same envelope as osc, detuned in cents, mixed in at osc2Level (0 = off)
  osc2Type: OscType
  osc2Level: number // 0..1
  osc2Detune: number // cents
  // sub-oscillator: fixed sine, one octave below osc, mixed in at subLevel (0 = off)
  subLevel: number // 0..1
  // noise generator: fixed white noise, mixed in at noiseLevel (0 = off)
  noiseLevel: number // 0..1
  // filter envelope: separate ADSR applied to filter cutoff per note-on, on top of the static
  // cutoff/automation value. filterEnvAmount 0 = no movement (off, matches pre-Phase-D behavior).
  filterEnvAmount: number // 0..1, sweep range up to ~4 octaves at full amount
  filterEnvAttack: number
  filterEnvDecay: number
  filterEnvSustain: number // 0..1, fraction of the sweep held during the note
  filterEnvRelease: number
  // one LFO, fixed destination list (mirrors the reference course's synth), lfoDest 'off' = no effect
  lfoRate: number // Hz
  lfoDepth: number // 0..1
  lfoDest: LfoDest
}

export interface Note {
  id: string
  pitch: number // MIDI note number, C4 = 60
  start: number // in 16th-note steps from loop start
  duration: number // in 16th-note steps
  velocity: number // 0..1, how hard the note is struck
}

export const DRUM_LANES = ['kick', 'snare', 'clap', 'hat', 'openhat'] as const
export type DrumLane = (typeof DRUM_LANES)[number]

export const DRUM_LABELS: Record<DrumLane, string> = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  hat: 'Closed Hat',
  openhat: 'Open Hat',
}

// 0 = off, otherwise the step's velocity (0..1] — a step sequencer "accent" cycle
export type DrumPattern = Record<DrumLane, number[]>

export interface Track {
  id: string
  name: string
  color: string
  kind: 'drums' | 'synth'
  notes: Note[]
  pattern: DrumPattern
  synth: SynthParams
  muted: boolean
  /** Saved variations of this track's content (sandbox only — lesson tracks don't use this).
   * A clip is a named snapshot: saving copies the live notes/pattern in, loading copies them
   * back out. Combined with Scene below this is BeatLab's Session-View analog. */
  clips: Clip[]
  /** Optional filter-cutoff breakpoint envelope over the loop (synth tracks only). Undefined =
   * cutoff stays at the static SynthParams.cutoff value, as before. */
  cutoffAutomation?: AutomationPoint[]
}

/** time: 0..1 fraction of the way through the loop. value: filter cutoff in Hz. */
export interface AutomationPoint {
  time: number
  value: number
}

export interface Clip {
  id: string
  name: string
  notes: Note[]
  pattern: DrumPattern
}

export interface Scene {
  id: string
  name: string
  /** trackId -> clipId. Launching a scene loads each mapped track's clip; unmapped tracks
   * are left alone. */
  clipIds: Record<string, string>
}

export const SECTION_TYPES = ['Intro', 'Buildup', 'Drop', 'Breakdown', 'Outro'] as const
export type SectionType = (typeof SECTION_TYPES)[number]

export interface ArrangementState {
  enabled: boolean
  mode: 'structure' | 'energy' | null
  sections: (SectionType | null)[]
  barsPerSection: number
  // trackId -> one on/off flag per section (energy mode)
  active: Record<string, boolean[]>
}

export interface TargetPatch {
  params: SynthParams
  // phrase times/durations in seconds
  phrase: { pitch: number; time: number; dur: number }[]
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteName(pitch: number): string {
  return NOTE_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1)
}

export const DEFAULT_SYNTH: SynthParams = {
  osc: 'sawtooth',
  cutoff: 9000,
  resonance: 0.8,
  filterType: 'lowpass',
  attack: 0.01,
  decay: 0.2,
  sustain: 0.7,
  release: 0.3,
  volume: -10,
  pan: 0,
  sendReverb: 0,
  sendDelay: 0,
  osc2Type: 'sawtooth',
  osc2Level: 0,
  osc2Detune: 12,
  subLevel: 0,
  noiseLevel: 0,
  filterEnvAmount: 0,
  filterEnvAttack: 0.01,
  filterEnvDecay: 0.2,
  filterEnvSustain: 0.3,
  filterEnvRelease: 0.2,
  lfoRate: 4,
  lfoDepth: 0,
  lfoDest: 'off',
}
