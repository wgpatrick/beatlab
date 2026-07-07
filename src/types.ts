export type OscType = 'sine' | 'triangle' | 'sawtooth' | 'square'
// Wave 3: the main oscillator can also be a wavetable — a bank of spectra scanned by wtPos
// (Serum's WT POS). Only the main osc: osc2/osc3 stay classic shapes, like Serum's simpler SUB.
export type MainOsc = OscType | 'wavetable'
// 'custom' is the DRAW table: the user sketches two single-cycle frames (wtCustomA/B) and wtPos
// morphs between their spectra — Serum's draw-your-own-wavetable workflow at two-frame scale.
export type WtTable = 'analog' | 'pwm' | 'vocal' | 'custom'
export type FilterType = 'lowpass' | 'bandpass' | 'highpass'
// 'wtPos' scans the wavetable position around its static value — only audible when osc is
// 'wavetable' (silently inert otherwise, same convention as amp LFO on a muted track).
export type LfoDest = 'off' | 'pitch' | 'cutoff' | 'amp' | 'wtPos'
// LFO 1's shape: the classic sine, or a hand-drawn 16-step pattern (lfoSteps) — Serum's
// draw-your-own-LFO, at this engine's per-step control resolution.
export type LfoShape = 'sine' | 'custom'
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
  osc: MainOsc
  // wavetable scanning (only meaningful when osc === 'wavetable'): which built-in table, and the
  // position through it (0 = first frame, 1 = last). wtPos is automatable and LFO-modulatable.
  wtTable: WtTable
  wtPos: number // 0..1
  // the two hand-drawn frames of the 'custom' table: single cycles, 64 samples each, -1..1
  wtCustomA: number[]
  wtCustomB: number[]
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
  // Drawn LFO shape (LFO 1 only): when lfoShape is 'custom' the LFO reads lfoSteps — 16 levels
  // (0..1, mapped to the same bipolar range the sine covers) — instead of a sine. One full pass
  // through the 16 steps = one LFO cycle, so a synced rate of 1/1 spreads the drawing over a bar.
  lfoShape: LfoShape
  lfoSteps: number[] // 16 values, 0..1

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
  // -osc2Detune, reusing osc2Type/osc2Level rather than new params. Wave 3: 5 and 7 add outer
  // mirrored pairs at 1.6x and 2.4x the detune, at reduced level — Serum-style unison spread.
  unisonVoices: 1 | 2 | 3 | 5 | 7
  // Stereo width of the unison stack (0 = all voices center, exactly the old behavior; 1 = pairs
  // panned hard outward). Only applies when unisonVoices >= 3 — a lone osc2 layer stays centered.
  unisonWidth: number // 0..1
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

  // ---------- Drum voice sound design (drum-kind tracks only; every synth-kind track carries
  // these unused, same convention as every other kind-specific block above) ----------
  // Kick: a sine pitch-swept membrane, same recipe every kick-synthesis tutorial teaches — a fast
  // pitch envelope (kickPunch) gives the "click," the amplitude decay (kickDecay) gives the
  // "boom." Tuning kickTune to the bassline's key is the other named, near-universal technique.
  kickTune: number // Hz, base pitch of the kick's pitch envelope
  kickPunch: number // seconds, pitch-envelope decay — shorter = tighter click, longer = looser 808-style glide
  kickDecay: number // seconds, amplitude decay — short = 909-tight, long = 808-boomy
  // Snare: a tonal "shell" layer blended with filtered noise ("wires") — snareTone 0 = pure noise
  // (today's default, unchanged), higher blends in more body/pitch.
  snareTone: number // 0..1
  snareDecay: number // seconds
  // Hi-hat: closed vs open is mostly just decay length; hatTone is shared brightness (resonance
  // frequency) since both lanes are the same metallic voice at different lengths.
  hatDecay: number // seconds, closed hat
  openHatDecay: number // seconds, open hat
  hatTone: number // Hz, shared resonance/brightness for both hat lanes
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
  'eqLow', 'eqMid', 'eqHigh', 'compMix', 'distortionMix', 'bitcrushMix', 'duckAmount', 'wtPos',
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

// Default drawn LFO shape: one sine cycle sampled at 16 steps, so flipping to "draw" mode sounds
// familiar until the user actually draws something.
export const DEFAULT_LFO_STEPS: number[] = Array.from({ length: 16 }, (_, i) =>
  Math.round((0.5 + 0.5 * Math.sin((2 * Math.PI * i) / 16)) * 100) / 100,
)

// Default drawn wavetable frames: A = a sine cycle, B = a soft ramp — so the DRAW table makes a
// pleasant sine→saw-ish morph before the user has drawn anything.
export const DEFAULT_WT_FRAME_A: number[] = Array.from({ length: 64 }, (_, k) =>
  Math.round(Math.sin((2 * Math.PI * k) / 64) * 100) / 100,
)
export const DEFAULT_WT_FRAME_B: number[] = Array.from({ length: 64 }, (_, k) =>
  Math.round((((k + 32) % 64) / 32 - 1) * 100) / 100,
)

export const DEFAULT_SYNTH: SynthParams = {
  osc: 'sawtooth',
  wtTable: 'analog',
  wtPos: 0.5,
  wtCustomA: DEFAULT_WT_FRAME_A,
  wtCustomB: DEFAULT_WT_FRAME_B,
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
  lfoShape: 'sine',
  lfoSteps: DEFAULT_LFO_STEPS,
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
  unisonWidth: 0,
  glide: 0,
  arpOn: false,
  arpRate: 2,
  arpPattern: 'up',
  keytrackAmount: 0,
  velToFilterAmount: 0,
  // matches the previously-hardcoded kick/snare/hat synthesis exactly — no drum-kind track's
  // sound changes until a student actually turns one of these knobs
  kickTune: 32.7, // Hz — Tone.Frequency('C1').toFrequency()
  kickPunch: 0.05,
  kickDecay: 0.4,
  snareTone: 0,
  snareDecay: 0.13,
  hatDecay: 0.05,
  openHatDecay: 0.35,
  hatTone: 4000,
}

/** The drum voice params a kit preset bundles — the subset of SynthParams the KICK/SNARE/HI-HAT
 * device sections expose. */
export type DrumVoiceParams = Pick<
  SynthParams,
  'kickTune' | 'kickPunch' | 'kickDecay' | 'snareTone' | 'snareDecay' | 'hatDecay' | 'openHatDecay' | 'hatTone'
>

/** Character presets for the synthesized kit, modeled on the machines that defined whole genres
 * (see the Drum Machine Museum lesson): the 808's loose boomy analog kick (hip-hop/trap), the
 * 909's tight punchy snap (house/techno), and a LinnDrum-style fatter, darker "sampled" feel
 * (80s pop). 'init' is DEFAULT_SYNTH's values — the kit BeatLab has always shipped. These are
 * honest characters built from this engine's own voices, not recreations of the real circuits. */
export const DRUM_KIT_PRESETS: Record<'init' | 'tr808' | 'tr909' | 'linn', { label: string; blurb: string; params: DrumVoiceParams }> = {
  init: {
    label: 'Init',
    blurb: "BeatLab's stock 909-style kit — the sound every drum lesson so far used",
    params: { kickTune: 32.7, kickPunch: 0.05, kickDecay: 0.4, snareTone: 0, snareDecay: 0.13, hatDecay: 0.05, openHatDecay: 0.35, hatTone: 4000 },
  },
  tr808: {
    label: '808',
    blurb: 'Loose, boomy, all-analog — the sound of hip-hop and trap. Slow pitch glide, long ringing kick, snappy paper-thin snare',
    params: { kickTune: 38, kickPunch: 0.18, kickDecay: 0.9, snareTone: 0.35, snareDecay: 0.18, hatDecay: 0.03, openHatDecay: 0.5, hatTone: 6500 },
  },
  tr909: {
    label: '909',
    blurb: 'Tight, punchy, aggressive — the backbone of house and techno. Fast pitch snap, short kick, crisp bright hats',
    params: { kickTune: 48, kickPunch: 0.02, kickDecay: 0.28, snareTone: 0.45, snareDecay: 0.15, hatDecay: 0.06, openHatDecay: 0.3, hatTone: 8000 },
  },
  linn: {
    label: 'Linn',
    blurb: 'Fat, dark, "sampled"-feeling — the LinnDrum defined 80s pop and new wave. Weighty snare with real body, mellow hats',
    params: { kickTune: 42, kickPunch: 0.04, kickDecay: 0.35, snareTone: 0.65, snareDecay: 0.22, hatDecay: 0.09, openHatDecay: 0.45, hatTone: 3000 },
  },
}
