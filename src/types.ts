export type OscType = 'sine' | 'triangle' | 'sawtooth' | 'square'
export type FilterType = 'lowpass' | 'bandpass' | 'highpass'
export type LfoDest = 'off' | 'pitch' | 'cutoff' | 'amp'
// Phase F: LFO 2's destination list is deliberately disjoint from the original LFO's (pitch/
// cutoff/amp) — a second, independent modulation route rather than a shared matrix data
// structure, so it adds real "more than one simultaneous mod route" capability without touching
// lfoDest's existing meaning (~10 Phase A-D lessons grade lfoDest/lfoRate/lfoDepth directly).
export type Lfo2Dest = 'off' | 'pan' | 'sendReverb' | 'sendDelay' | 'sendMod' | 'eqLow' | 'eqMid' | 'eqHigh' | 'distortionMix'
// Phase E: the three reorderable insert-effect slots between the filter and the panner. 'dist'
// is distortion chained into bitcrusher internally (a fixed sub-order) — only the three slots as
// a block are reorderable, matching the roadmap's "EQ -> compressor -> distortion" default chain.
export type InsertKind = 'eq' | 'comp' | 'dist'
// Tempo-synced LFO rate, as a fraction of a whole note (t = triplet, d = dotted) — when an LFO is
// synced its rate is derived from the current BPM instead of read directly from *Rate (Hz).
export type SyncDivision = '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/4t' | '1/8t' | '1/16t' | '1/4d' | '1/8d' | '1/16d'

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
  lfoRate: number // Hz, up to 1kHz — see the Rate knob's hint for what happens above ~20Hz
  lfoDepth: number // 0..1
  lfoDest: LfoDest
  // Tempo sync: when on, the LFO's rate is derived from bpm + lfoSyncRate instead of read from
  // lfoRate directly (lfoRate itself is left untouched so flipping sync off returns to whatever
  // Hz rate was dialed in before).
  lfoSync: boolean
  lfoSyncRate: SyncDivision

  // ---------- Phase E: mixing effects (insert chain: filter -> EQ/comp/dist in insertOrder -> panner) ----------
  eqLow: number // dB, -24..24
  eqMid: number
  eqHigh: number
  // compressor + manual dry/wet gain-summed mix (Tone.Compressor has no native wet) — compMix 0 = fully
  // dry (bypassed), 1 = fully compressed; anything between is parallel ("New York") compression.
  compThreshold: number // dB, -60..0
  compRatio: number // 1..20
  compAttack: number // seconds
  compRelease: number // seconds
  compMix: number // 0..1
  // distortion chained into bitcrusher, each with its own native wet mix
  distortionAmount: number // 0..1, drive
  distortionMix: number // 0..1
  bitcrushBits: number // 1..8 (integer)
  bitcrushMix: number // 0..1
  insertOrder: InsertKind[] // permutation of ['eq','comp','dist']
  // modulation-FX shared send bus: chorus -> phaser in series, mirrors sendReverb/sendDelay
  sendMod: number // 0..1
  // scheduled sidechain duck: ducks this track's volume whenever duckSource's kick lane hits —
  // not a real audio-analysis sidechain (see docs/ROADMAP.md Phase E item 23), scheduled from
  // pattern data the same way the filter envelope is.
  duckSource: string | null // another track's id, or null = off
  duckAmount: number // 0..1

  // ---------- Phase F: modulation matrix expansion (LFO 2) + macro ----------
  lfo2Rate: number // Hz, up to 1kHz
  lfo2Depth: number // 0..1
  lfo2Dest: Lfo2Dest
  lfo2Sync: boolean
  lfo2SyncRate: SyncDivision
  // Fixed single macro (not a user-remappable target list — see docs/ROADMAP.md Phase F item 30
  // for the scoping note): one knob drives cutoff, reverb send, and distortion mix together.
  macroValue: number // 0..1

  // ---------- Phase H: synth engine depth II ----------
  // FM voice: an additive layer alongside osc2/sub/noise (not a mode of the main oscillator,
  // which stays subtractive) — a 2-operator carrier/modulator via Tone.FMSynth, mixed in at
  // fmLevel (0 = off, matches every other oscillator-bank layer's convention).
  fmLevel: number // 0..1
  fmHarmonicity: number // carrier:modulator frequency ratio, ~0.5..8
  fmModIndex: number // modulation index, ~1..20
  // Unison: 1 = just the main oscillator (today's default patch, unchanged). 2 = adds osc2 at
  // +osc2Detune (exactly today's existing behavior). 3 adds a third, symmetric voice mirrored at
  // -osc2Detune, reusing osc2Type/osc2Level rather than new params — a real 3-voice unison stack,
  // though without per-voice stereo panning (deferred — see docs/ROADMAP.md Phase H item 39).
  unisonVoices: 1 | 2 | 3
  // Glide/portamento: seconds to slide between consecutive notes' pitches, 0 = off (discrete
  // steps, matches every prior patch).
  glide: number
  // Arpeggiator: fans out notes that share the same start step into a sequence across that
  // step's duration, instead of triggering them all at once as a stacked chord — see
  // docs/ROADMAP.md Phase H item 41 for why it's scoped to same-step chords specifically.
  arpOn: boolean
  arpRate: number // how many arp notes fit in one 16th-note step
  arpPattern: 'up' | 'down' | 'updown'
  // Keytracking/velocity-to-cutoff: shift this note's cutoff up/down at note-on, layered under
  // (and compounding with) filterEnvAmount's own envelope shape if that's also active — see
  // docs/ROADMAP.md Phase H item 42.
  keytrackAmount: number // 0..1, higher notes brighten the cutoff
  velToFilterAmount: number // 0..1, harder-played notes brighten the cutoff
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

// Phase F: which SynthParams it makes sense to draw a breakpoint automation lane for — numeric,
// continuously variable, audible when swept. Excludes string/enum fields (osc, filterType,
// lfoDest...) and structural fields (insertOrder, duckSource) that have no meaningful "in-between".
export const AUTOMATABLE_PARAMS = [
  'cutoff', 'resonance', 'volume', 'pan', 'sendReverb', 'sendDelay', 'sendMod',
  'eqLow', 'eqMid', 'eqHigh', 'compMix', 'distortionMix', 'bitcrushMix', 'duckAmount',
] as const
export type AutomatableParam = (typeof AUTOMATABLE_PARAMS)[number]
export type AutomationMap = Partial<Record<AutomatableParam, AutomationPoint[]>>

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
  /** Optional breakpoint automation over the loop (synth tracks only), one lane per automated
   * param. Undefined/missing key = that param stays at its static SynthParams value, as before —
   * this generalizes what was a single cutoff-only lane (Phase C) to any AutomatableParam
   * (Phase F), including live "touch" capture — see automationArm in state/store.ts. */
  automation?: AutomationMap
}

/** time: 0..1 fraction of the way through the loop. curve: shape of the segment FROM this point
 * to the next — 'ramp' (default) interpolates smoothly (log-space for cutoff, linear otherwise),
 * 'hold' steps abruptly at the next point instead, for stab-like automated changes rather than
 * sweeps. */
export type AutomationCurve = 'ramp' | 'hold'
export interface AutomationPoint {
  time: number
  value: number
  curve?: AutomationCurve
}

export interface Clip {
  id: string
  name: string
  notes: Note[]
  pattern: DrumPattern
  /** Phase F: automation travels with the clip, same save-in/load-out snapshot model as
   * notes/pattern — this is what makes "clip-level" vs "arrangement-level" automation a real
   * distinction: a clip's sweep comes along when it's duplicated/rearranged, instead of being
   * fixed to one timeline position. */
  automation?: AutomationMap
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
  lfoSync: false,
  lfoSyncRate: '1/4',
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  compThreshold: -24,
  compRatio: 4,
  compAttack: 0.02,
  compRelease: 0.25,
  compMix: 0,
  distortionAmount: 0,
  distortionMix: 0,
  bitcrushBits: 8,
  bitcrushMix: 0,
  insertOrder: ['eq', 'comp', 'dist'],
  sendMod: 0,
  duckSource: null,
  duckAmount: 0,
  lfo2Rate: 3,
  lfo2Depth: 0,
  lfo2Dest: 'off',
  lfo2Sync: false,
  lfo2SyncRate: '1/4',
  macroValue: 0,
  fmLevel: 0,
  fmHarmonicity: 1,
  fmModIndex: 5,
  unisonVoices: 1,
  glide: 0,
  arpOn: false,
  arpRate: 2,
  arpPattern: 'up',
  keytrackAmount: 0,
  velToFilterAmount: 0,
}
