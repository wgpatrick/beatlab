import * as Tone from 'tone'
import { DRUM_LANES, type AutomatableParam, type AutomationPoint, type DrumLane, type InsertKind, type SyncDivision, type SynthParams, type TargetPatch, type Track } from '../types'
import { useStore } from '../state/store'
import { wtPartials } from './wavetables'
import { waveformPeaks } from './analysis'

// Tempo-synced LFO rate: each division's length in quarter-note beats (t = triplet, 2/3 the
// normal length so it fits 3-in-the-space-of-2, i.e. faster; d = dotted, 1.5x the normal length,
// i.e. slower). rateHz = one cycle per that many beats, scaled by the current bpm.
const DIVISION_BEATS: Record<SyncDivision, number> = {
  '1/1': 4, '1/2': 2, '1/4': 1, '1/8': 0.5, '1/16': 0.25, '1/32': 0.125,
  '1/4t': 2 / 3, '1/8t': 1 / 3, '1/16t': 1 / 6,
  '1/4d': 1.5, '1/8d': 0.75, '1/16d': 0.375,
}
// Wave 3: LFO 1's instantaneous value at time t — a sine, or the hand-drawn 16-step shape (one
// full pass through the steps = one cycle, so a synced 1/1 rate spreads the drawing over a bar).
// Bipolar -1..1 either way, so every destination's existing depth math is unchanged.
function lfoWaveValue(p: SynthParams, rateHz: number, t: number): number {
  if (p.lfoShape === 'custom' && p.lfoSteps?.length) {
    const phase = (((rateHz * t) % 1) + 1) % 1
    return (p.lfoSteps[Math.floor(phase * p.lfoSteps.length) % p.lfoSteps.length] ?? 0.5) * 2 - 1
  }
  return Math.sin(2 * Math.PI * rateHz * t)
}

function syncedRateHz(bpm: number, division: SyncDivision): number {
  return bpm / 60 / DIVISION_BEATS[division]
}

// Interpolates between breakpoints (frac: 0..1 through the loop). `log` compares in log-space —
// used only for cutoff, since frequency perception is logarithmic (a linear sweep rushes at the
// top); every other automatable param interpolates linearly. A point with curve:'hold' steps
// abruptly at the next point instead of ramping, for stab-like automated changes.
function interpolateAutomation(points: AutomationPoint[], frac: number, log: boolean): number {
  const pts = [...points].sort((a, b) => a.time - b.time)
  if (frac <= pts[0].time) return pts[0].value
  if (frac >= pts[pts.length - 1].time) return pts[pts.length - 1].value
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (frac >= a.time && frac <= b.time) {
      if (a.curve === 'hold') return a.value
      const t = (frac - a.time) / (b.time - a.time || 1)
      return log ? a.value * Math.pow(b.value / a.value, t) : a.value + (b.value - a.value) * t
    }
  }
  return pts[pts.length - 1].value
}

interface SynthChain {
  synth: Tone.PolySynth<Tone.Synth>
  // oscillator bank: osc2 (detuned unison layer) and sub (fixed sine, one octave down) are
  // separate PolySynths summed into the shared filter pre-filter, each gated by its own Gain so
  // level 0 is silent and byte-identical to the pre-Phase-D signal path.
  osc2: Tone.PolySynth<Tone.Synth>
  osc2Gain: Tone.Gain
  // Phase H: unison voice 3 — mirrors osc2Type/osc2Level at the opposite (negative) detune,
  // active only when unisonVoices === 3. Silent (Gain 0) otherwise.
  osc3: Tone.PolySynth<Tone.Synth>
  osc3Gain: Tone.Gain
  // Wave 3: per-voice panners for stereo unison width — osc2/osc3 pan ±0.5·width when the stack
  // is on (unisonVoices >= 3), and the outer pairs below pan wider still. Width 0 = all center,
  // byte-identical image to the pre-Wave-3 mono stack.
  osc2Pan: Tone.Panner
  osc3Pan: Tone.Panner
  // Outer unison pairs (voices 4/5 at ±1.6x detune, 6/7 at ±2.4x), mirroring osc2Type/osc2Level
  // at reduced level like Serum's outer-voice taper. Gain 0 unless unisonVoices >= minVoices.
  uniPairs: { poly: Tone.PolySynth<Tone.Synth>; pan: Tone.Panner; gain: Tone.Gain; mul: number; minVoices: number; level: number }[]
  // cache key of the main oscillator's current wave (shape name, or wavetable table+position) so
  // applyParams doesn't rebuild the PeriodicWave on every knob drag
  lastOscKey?: string
  sub: Tone.PolySynth<Tone.Synth>
  subGain: Tone.Gain
  noise: Tone.NoiseSynth
  noiseGain: Tone.Gain
  // Phase H: FM voice — an additive layer (like sub/noise), not a mode of the main oscillator.
  fm: Tone.PolySynth<Tone.FMSynth>
  fmGain: Tone.Gain
  filter: Tone.Filter
  panner: Tone.Panner
  vol: Tone.Volume
  reverbSend: Tone.Gain
  delaySend: Tone.Gain
  // Phase E: three reorderable insert slots between filter and panner (see wireInserts below).
  eq3: Tone.EQ3
  // parallel ("New York") compression: compIn fans out to a dry path and a compressor path,
  // both summed at compOut — Tone.Compressor has no native wet/mix, so this is built by hand.
  compIn: Tone.Gain
  compDry: Tone.Gain
  compressor: Tone.Compressor
  compWet: Tone.Gain
  compOut: Tone.Gain
  distortion: Tone.Distortion
  bitcrush: Tone.BitCrusher
  modSend: Tone.Gain
  lastInsertOrder: InsertKind[]
}

// Shared shape of "filter -> reorderable inserts -> panner" — wireInserts only ever touches
// these fields, so it works unchanged for both a synth voice's SynthChain and the drum bus below.
interface InsertNodes {
  filter: Tone.Filter
  eq3: Tone.EQ3
  compIn: Tone.Gain
  compOut: Tone.Gain
  distortion: Tone.Distortion
  bitcrush: Tone.BitCrusher
  panner: Tone.ToneAudioNode
  lastInsertOrder: InsertKind[]
}

// Sampling techniques research (filter sweeps, reverb/delay sends — the two most-cited chop
// effects in production tutorials) needs the drum/sample lanes routed through the same
// filter/EQ/comp/distortion/sends chain synth tracks already have. Every Track already carries an
// otherwise-unused `synth: SynthParams` even when kind === 'drums' — this bus is what finally
// gives those values somewhere to go. One shared bus, not one per drum track, matching the
// existing single global drum kit / sample-slice set (see triggerDrum).
interface DrumBus extends InsertNodes {
  panner: Tone.Panner
  vol: Tone.Volume
  reverbSend: Tone.Gain
  delaySend: Tone.Gain
  modSend: Tone.Gain
  compDry: Tone.Gain
  compressor: Tone.Compressor
  compWet: Tone.Gain
}

interface DrumKit {
  kick: Tone.MembraneSynth
  snare: Tone.NoiseSynth
  // the tonal "shell" layer blended under the snare's noise — see SynthParams.snareTone
  snareTone: Tone.MembraneSynth
  snareToneGain: Tone.Gain
  clap: Tone.NoiseSynth
  hat: Tone.MetalSynth
  openhat: Tone.MetalSynth
}

// Phase I: sampling lives on the existing 'drums' track/lane model rather than a new track kind
// or asset library — see docs/ROADMAP.md Phase I for the scoping note (avoids both bundling
// third-party audio into the repo and the much bigger lift of a fully separate sampler track
// type). Loading a file starts with 5 equal ("Region" mode) slice boundaries, one per existing
// drum lane. Boundaries are draggable (Manual mode) and each lane can be reversed independently —
// each lane's player owns exactly its own slice audio (not an offset into one shared buffer), so
// reversing a lane is just a reversed copy of its slice, no special-cased playback path.
export interface SampleSlice {
  start: number
  dur: number
  reversed: boolean
  /** semitones, -12..+12 — classic sampler playback-rate repitch (pitch and length change
   * together, formants shift: the honest "chipmunk effect" every hardware sampler has) */
  pitch: number
}

class Engine {
  private chains = new Map<string, SynthChain>()
  private drums: DrumKit | null = null
  // kick pitch is set per-trigger (triggerAttackRelease takes a frequency argument, not a settable
  // instrument property like the other drum voice params below), so it's cached here instead.
  private kickTuneHz = 32.7
  private repeatId: number | null = null
  private ready = false
  private startPromise: Promise<void> | null = null
  // shared mixer return buses — every synth chain's reverb/delay send taps into these, matching
  // the "one shared reverb + one shared delay return" minimal mixer every DAW tutorial starts with
  private reverbBus: Tone.Reverb | null = null
  private delayBus: Tone.FeedbackDelay | null = null
  // Phase E: a second shared return bus, chorus -> phaser in series, one combined send level
  private chorusBus: Tone.Chorus | null = null
  private phaserBus: Tone.Phaser | null = null
  // The drum/sample bus's filter+inserts+sends chain — see the DrumBus interface above.
  private drumBus: DrumBus | null = null
  // Phase I: loaded sample (if any) that replaces the synthesized drum kit lane-for-lane.
  private sampleFullBuffer: AudioBuffer | null = null
  private sliceBoundaries: number[] = [] // length DRUM_LANES.length + 1: [0, b1, b2, b3, duration]
  private reversedLanes = new Set<DrumLane>()
  private lanePitches: Partial<Record<DrumLane, number>> = {} // semitones, absent = 0
  // 'speed' = Tone.Player playbackRate (pitch and length together, the classic sampler chipmunk);
  // 'warp' = Tone.GrainPlayer detune (granular: length preserved, formants roughly kept — the
  // same idea behind Simpler/Serum's warp modes, at Tone.js quality)
  private samplePitchMode: 'speed' | 'warp' = 'speed'
  private samplePlayers: Partial<Record<DrumLane, Tone.Player | Tone.GrainPlayer>> = {}
  private sampleGains: Partial<Record<DrumLane, Tone.Gain>> = {}
  private sampleSlices: Partial<Record<DrumLane, SampleSlice>> = {}
  // Phase K: everything that used to connect straight to Tone.getDestination() now connects here
  // instead — a shared master bus feeding a limiter (safety ceiling, not user-adjustable) and a
  // meter (read once per step in tick(), pushed to the store for the UI's loudness readout).
  private masterBus: Tone.Gain | null = null
  private masterLimiter: Tone.Limiter | null = null
  private masterMeter: Tone.Meter | null = null
  // Scope: passive taps on the master bus (analysers don't consume/alter the signal, just read
  // it) driving a live oscilloscope/spectrum view in the device panel — a "watch the waveform
  // change as you turn the knob" visualization of the whole mix.
  private waveformAnalyser: Tone.Analyser | null = null
  private fftAnalyser: Tone.Analyser | null = null

  private getMaster(): Tone.Gain {
    if (!this.masterBus) {
      this.masterBus = new Tone.Gain(1)
      this.masterLimiter = new Tone.Limiter(-1)
      this.masterMeter = new Tone.Meter({ smoothing: 0.8 })
      this.waveformAnalyser = new Tone.Analyser('waveform', 1024)
      this.fftAnalyser = new Tone.Analyser('fft', 256)
      // the meter is a side-tap (like the analysers), NOT an in-chain hop: a metering node in
      // the signal path could impose its own channel count on everything downstream, and the
      // Wave 3 stereo unison image must survive to the speakers untouched
      this.masterBus.chain(this.masterLimiter, Tone.getDestination())
      this.masterLimiter.connect(this.masterMeter)
      this.masterLimiter.connect(this.waveformAnalyser)
      this.masterLimiter.connect(this.fftAnalyser)
    }
    return this.masterBus
  }

  /** Live time-domain samples (-1..1) of the master output, once per animation frame — or null
   * before anything has ever played (the analyser is created lazily alongside the master bus). */
  getWaveformData(): Float32Array | null {
    this.getMaster() // lazily creates the analysers even before ensureStarted() has ever run
    return this.waveformAnalyser!.getValue() as Float32Array
  }

  /** Live frequency-bin magnitudes (dB, typically -100..0) of the master output. */
  getFftData(): Float32Array | null {
    this.getMaster()
    return this.fftAnalyser!.getValue() as Float32Array
  }

  // Pre-existing race, found via Phase J's capstone lesson testing: toggleDrum/addNote fire their
  // preview sound without awaiting it (`void engine.previewDrum(...)`), so rapidly programming
  // several different drum lanes before ever pressing Play — a plausible first interaction with a
  // lesson — could fire this concurrently many times while `ready` was still false, racing
  // multiple `Tone.start()` + `buildDrums()` calls and corrupting the shared kit's scheduling
  // state ("Start time must be strictly greater than previous start time"). Guarding with a single
  // in-flight promise makes every concurrent caller await the same one-time startup instead.
  async ensureStarted() {
    if (this.ready) return
    if (!this.startPromise) {
      this.startPromise = (async () => {
        await Tone.start()
        this.buildDrums()
        // buildDrums() constructs fresh instruments at the hardcoded defaults — if a drums track's
        // params were already adjusted (or loaded from a lesson) before this first play/interaction,
        // re-apply them now so that work isn't silently discarded.
        const drumsTrack = useStore.getState().tracks.find((t) => t.kind === 'drums')
        if (drumsTrack) this.applyDrumVoiceParams(drumsTrack.synth)
        Tone.getDestination().volume.value = -2
        this.ready = true
      })()
    }
    await this.startPromise
  }

  // Lazy on purpose: ensureChain (via sync()) can run before the user has interacted with the
  // page at all, i.e. before ensureStarted()/Tone.start() — Tone nodes can be constructed before
  // the audio context starts, they just won't produce sound until it does.
  private getBuses() {
    if (!this.reverbBus) {
      this.reverbBus = new Tone.Reverb({ decay: 2.2, wet: 1 }).connect(this.getMaster())
      this.delayBus = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 1 }).connect(this.getMaster())
      // series, not parallel: chorus feeds into phaser, only the phaser's output reaches the
      // destination — otherwise the chorus-only signal would double up alongside the phased one.
      this.chorusBus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 1 }).start()
      this.phaserBus = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 1000, wet: 1 }).connect(this.getMaster())
      this.chorusBus.connect(this.phaserBus)
    }
    return { reverb: this.reverbBus, delay: this.delayBus!, mod: this.chorusBus! }
  }

  private getDrumBus(): DrumBus {
    if (!this.drumBus) {
      const { reverb, delay, mod } = this.getBuses()
      const filter = new Tone.Filter(12000, 'lowpass')
      const panner = new Tone.Panner({ pan: 0, channelCount: 2 })
      const vol = new Tone.Volume(0)
      const reverbSend = new Tone.Gain(0)
      const delaySend = new Tone.Gain(0)
      const modSend = new Tone.Gain(0)
      const eq3 = new Tone.EQ3()
      const compIn = new Tone.Gain()
      const compDry = new Tone.Gain(1)
      const compressor = new Tone.Compressor()
      const compWet = new Tone.Gain(0)
      const compOut = new Tone.Gain()
      const distortion = new Tone.Distortion({ distortion: 0, wet: 0 })
      const bitcrush = new Tone.BitCrusher(8)

      compIn.fan(compDry, compressor)
      compressor.connect(compWet)
      compDry.connect(compOut)
      compWet.connect(compOut)
      distortion.connect(bitcrush)

      panner.chain(vol, this.getMaster())
      panner.connect(reverbSend)
      reverbSend.connect(reverb)
      panner.connect(delaySend)
      delaySend.connect(delay)
      panner.connect(modSend)
      modSend.connect(mod)

      this.drumBus = { filter, panner, vol, reverbSend, delaySend, modSend, eq3, compIn, compDry, compressor, compWet, compOut, distortion, bitcrush, lastInsertOrder: [] }
      this.wireInserts(this.drumBus, [])
    }
    return this.drumBus
  }

  private applyDrumBusParams(p: SynthParams) {
    const bus = this.getDrumBus()
    bus.filter.frequency.value = p.cutoff
    bus.filter.Q.value = p.resonance
    bus.filter.type = p.filterType
    bus.panner.pan.value = p.pan
    bus.vol.volume.value = p.volume
    bus.reverbSend.gain.value = p.sendReverb
    bus.delaySend.gain.value = p.sendDelay
    bus.modSend.gain.value = p.sendMod
    bus.eq3.low.value = p.eqLow
    bus.eq3.mid.value = p.eqMid
    bus.eq3.high.value = p.eqHigh
    bus.compressor.threshold.value = p.compThreshold
    bus.compressor.ratio.value = p.compRatio
    bus.compressor.attack.value = p.compAttack
    bus.compressor.release.value = p.compRelease
    bus.compWet.gain.value = p.compMix
    bus.compDry.gain.value = 1 - p.compMix
    bus.distortion.distortion = p.distortionAmount
    bus.distortion.wet.value = p.distortionMix
    bus.bitcrush.bits.value = Math.round(p.bitcrushBits)
    bus.bitcrush.wet.value = p.bitcrushMix
    this.wireInserts(bus, p.insertOrder)
  }

  private applyDrumVoiceParams(p: SynthParams) {
    if (!this.drums) return
    this.kickTuneHz = p.kickTune
    this.drums.kick.set({ pitchDecay: p.kickPunch, envelope: { decay: p.kickDecay } })
    this.drums.snare.set({ envelope: { decay: p.snareDecay } })
    this.drums.snareTone.set({ envelope: { decay: p.snareDecay } })
    this.drums.snareToneGain.gain.value = p.snareTone
    this.drums.hat.set({ envelope: { decay: p.hatDecay }, resonance: p.hatTone })
    this.drums.openhat.set({ envelope: { decay: p.openHatDecay }, resonance: p.hatTone })
  }

  private buildDrums() {
    // every synthesized voice below feeds the drum bus's filter (not master directly), so the
    // bus's filter/EQ/comp/distortion/sends — the same chain synth tracks already have — apply to
    // the whole kit, sample-loaded or not (see DrumBus above).
    const busIn = this.getDrumBus().filter
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 7,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
    }).connect(busIn)
    kick.volume.value = -2

    const snareFilter = new Tone.Filter(1800, 'highpass').connect(busIn)
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
    }).connect(snareFilter)
    snare.volume.value = -8

    // Body/shell tone, additive under the noise — silent (gain 0) at the default snareTone: 0,
    // so a snare-only lesson's sound is unchanged until a student actually turns this up.
    const snareToneGain = new Tone.Gain(0).connect(busIn)
    const snareTone = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 4,
      envelope: { attack: 0.001, decay: 0.13, sustain: 0, release: 0.05 },
    }).connect(snareToneGain)

    const clapFilter = new Tone.Filter(1100, 'bandpass').connect(busIn)
    clapFilter.Q.value = 1.2
    const clap = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.004, decay: 0.2, sustain: 0 },
    }).connect(clapFilter)
    clap.volume.value = -2

    const hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(busIn)
    hat.volume.value = -18

    const openhat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.35, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).connect(busIn)
    openhat.volume.value = -20

    this.drums = { kick, snare, snareTone, snareToneGain, clap, hat, openhat }
  }

  // ---------- Phase I: sampling (loads onto the existing 5 drum lanes) ----------

  /** Core, testable slicing logic — takes an already-decoded AudioBuffer so it can be exercised
   * with any valid buffer (including a synthetically rendered one in tests/dev tools), without
   * needing a real file or file picker. loadDrumSampleFromFile below is the thin file-reading
   * wrapper around this. */
  loadDrumSampleFromBuffer(buffer: AudioBuffer, name: string) {
    this.clearDrumSample()
    this.sampleFullBuffer = buffer
    const n = DRUM_LANES.length
    this.sliceBoundaries = Array.from({ length: n + 1 }, (_, i) => (i / n) * buffer.duration)
    this.rebuildSlicePlayers()
    useStore.setState({ sampleLoaded: { name } })
  }

  async loadDrumSampleFromFile(file: File) {
    await this.ensureStarted()
    const arrayBuf = await file.arrayBuffer()
    const audioBuf = await Tone.getContext().rawContext.decodeAudioData(arrayBuf)
    this.loadDrumSampleFromBuffer(audioBuf, file.name)
  }

  /** Starter samples: stream a public-domain recording straight from its home (Wikimedia Commons
   * serves CORS `*`), decode, and load a [startSec, startSec+durSec) window of it. Nothing is
   * bundled in the repo — the app stays audio-free, the PD source stays credited at its URL. */
  async loadDrumSampleFromUrl(url: string, name: string, startSec = 0, durSec = 12) {
    await this.ensureStarted()
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`)
    const arrayBuf = await resp.arrayBuffer()
    const src = await Tone.getContext().rawContext.decodeAudioData(arrayBuf)
    const s0 = Math.max(0, Math.min(src.length - 1, Math.floor(startSec * src.sampleRate)))
    const s1 = Math.min(src.length, Math.floor((startSec + durSec) * src.sampleRate))
    const len = Math.max(1, s1 - s0)
    const ctx = Tone.getContext().rawContext
    const windowed = ctx.createBuffer(src.numberOfChannels, len, src.sampleRate)
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const data = new Float32Array(len)
      src.copyFromChannel(data, ch, s0)
      windowed.copyToChannel(data, ch)
    }
    this.loadDrumSampleFromBuffer(windowed, name)
  }

  clearDrumSample() {
    for (const lane of DRUM_LANES) {
      this.samplePlayers[lane]?.dispose()
      this.sampleGains[lane]?.dispose()
      delete this.samplePlayers[lane]
      delete this.sampleGains[lane]
      delete this.sampleSlices[lane]
    }
    this.sampleFullBuffer = null
    this.sliceBoundaries = []
    this.reversedLanes.clear()
    this.lanePitches = {}
    this.samplePitchMode = 'speed'
    useStore.setState({ sampleLoaded: null, sampleSliceMeta: null, samplePitchMode: 'speed' })
  }

  /** Copy [startSec, startSec+durSec) of the loaded sample into its own small buffer, optionally
   * reversed. Each lane's player owns one of these outright rather than seeking into one shared
   * buffer, which is what makes per-lane reverse a plain data transform instead of needing a
   * negative-rate playback path Tone.Player doesn't have. */
  private extractSlice(startSec: number, durSec: number, reversed: boolean): AudioBuffer {
    const src = this.sampleFullBuffer!
    const s0 = Math.max(0, Math.floor(startSec * src.sampleRate))
    const s1 = Math.min(src.length, Math.floor((startSec + durSec) * src.sampleRate))
    const len = Math.max(1, s1 - s0)
    const ctx = Tone.getContext().rawContext
    const out = ctx.createBuffer(src.numberOfChannels, len, src.sampleRate)
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const data = new Float32Array(len)
      src.copyFromChannel(data, ch, s0)
      if (reversed) data.reverse()
      out.copyToChannel(data, ch)
    }
    return out
  }

  /** Nearest zero-crossing to timeSec within a 10ms window — the standard sampler trick to avoid
   * an audible click at a manually-placed slice boundary. */
  private snapToZeroCrossing(timeSec: number): number {
    const src = this.sampleFullBuffer
    if (!src) return timeSec
    const data = src.getChannelData(0)
    const center = Math.round(timeSec * src.sampleRate)
    const window = Math.round(0.01 * src.sampleRate)
    let best = center
    let bestDist = Infinity
    const lo = Math.max(1, center - window)
    const hi = Math.min(data.length - 1, center + window)
    for (let i = lo; i < hi; i++) {
      if ((data[i - 1] < 0 && data[i] >= 0) || (data[i - 1] > 0 && data[i] <= 0)) {
        const dist = Math.abs(i - center)
        if (dist < bestDist) {
          bestDist = dist
          best = i
        }
      }
    }
    return best / src.sampleRate
  }

  private rebuildSlicePlayers() {
    if (!this.sampleFullBuffer) return
    for (const lane of DRUM_LANES) {
      this.samplePlayers[lane]?.dispose()
      this.sampleGains[lane]?.dispose()
    }
    const meta: Partial<Record<DrumLane, SampleSlice>> = {}
    DRUM_LANES.forEach((lane, i) => {
      const start = this.sliceBoundaries[i]
      const dur = Math.max(0.01, this.sliceBoundaries[i + 1] - start)
      const reversed = this.reversedLanes.has(lane)
      const pitch = this.lanePitches[lane] ?? 0
      const region = this.extractSlice(start, dur, reversed)
      const gain = new Tone.Gain(1).connect(this.getDrumBus().filter)
      let player: Tone.Player | Tone.GrainPlayer
      if (this.samplePitchMode === 'warp') {
        // granular repitch: detune in cents, duration unchanged — hear the grain texture
        player = new Tone.GrainPlayer(new Tone.ToneAudioBuffer(region)).connect(gain)
        player.detune = pitch * 100
      } else {
        // classic sampler repitch: playback rate 2^(semi/12) — pitch and duration move together
        player = new Tone.Player(new Tone.ToneAudioBuffer(region)).connect(gain)
        player.playbackRate = Math.pow(2, pitch / 12)
      }
      this.samplePlayers[lane] = player
      this.sampleGains[lane] = gain
      this.sampleSlices[lane] = { start, dur, reversed, pitch }
      meta[lane] = { start, dur, reversed, pitch }
    })
    useStore.setState({ sampleSliceMeta: meta })
  }

  /** Move an interior slice boundary (index 1..DRUM_LANES.length-1 — the endpoints at 0 and the
   * sample's duration are fixed), snapped to the nearest zero-crossing, then rebuild every lane's
   * player since a moved boundary reshapes both neighbouring slices. */
  setSliceBoundary(index: number, timeSec: number) {
    if (!this.sampleFullBuffer || index < 1 || index >= this.sliceBoundaries.length - 1) return
    const min = this.sliceBoundaries[index - 1] + 0.02
    const max = this.sliceBoundaries[index + 1] - 0.02
    if (min >= max) return
    const clamped = Math.min(Math.max(timeSec, min), max)
    this.sliceBoundaries[index] = this.snapToZeroCrossing(clamped)
    this.rebuildSlicePlayers()
  }

  toggleSliceReverse(lane: DrumLane) {
    if (!this.sampleFullBuffer) return
    if (this.reversedLanes.has(lane)) this.reversedLanes.delete(lane)
    else this.reversedLanes.add(lane)
    this.rebuildSlicePlayers()
  }

  setSlicePitch(lane: DrumLane, semitones: number) {
    if (!this.sampleFullBuffer) return
    const clamped = Math.max(-12, Math.min(12, Math.round(semitones)))
    this.lanePitches[lane] = clamped
    // pitch is settable live on the existing player — no buffer rebuild needed, so this is
    // the one slice edit that doesn't go through rebuildSlicePlayers' dispose-and-recreate path.
    const player = this.samplePlayers[lane]
    if (player instanceof Tone.GrainPlayer) player.detune = clamped * 100
    else if (player) player.playbackRate = Math.pow(2, clamped / 12)
    if (this.sampleSlices[lane]) this.sampleSlices[lane]!.pitch = clamped
    const meta = useStore.getState().sampleSliceMeta
    if (meta?.[lane]) {
      useStore.setState({ sampleSliceMeta: { ...meta, [lane]: { ...meta[lane]!, pitch: clamped } } })
    }
  }

  setSamplePitchMode(mode: 'speed' | 'warp') {
    if (!this.sampleFullBuffer || mode === this.samplePitchMode) return
    this.samplePitchMode = mode
    this.rebuildSlicePlayers()
    useStore.setState({ samplePitchMode: mode })
  }

  getSliceBoundaries(): number[] {
    return this.sliceBoundaries
  }

  /** Downsampled peaks of the loaded sample for the slice editor's waveform view. */
  getSampleWaveformPeaks(buckets = 400): number[] {
    const src = this.sampleFullBuffer
    if (!src) return []
    return waveformPeaks(src.getChannelData(0), buckets)
  }

  // ---------- Track Lab: full-song deconstruction ----------
  // The imported song's buffer lives here (non-serializable, like sampleBuffer above); all the
  // *analysis* of it is pure math in analysis.ts and its results live in the store. Playback is
  // one Tone.Player looping a [start, start+dur) window — deliberately independent of the
  // transport, since the imported song has its own tempo/grid.

  private trackLabBuffer: AudioBuffer | null = null
  private trackLabPlayer: Tone.Player | null = null

  async decodeAudioFile(file: File): Promise<AudioBuffer> {
    await this.ensureStarted()
    const arrayBuf = await file.arrayBuffer()
    return await Tone.getContext().rawContext.decodeAudioData(arrayBuf)
  }

  setTrackLabBuffer(buffer: AudioBuffer | null) {
    this.stopTrackLab()
    this.trackLabBuffer = buffer
  }

  getTrackLabBuffer(): AudioBuffer | null {
    return this.trackLabBuffer
  }

  async playTrackLabRange(startSec: number, durSec: number) {
    if (!this.trackLabBuffer) return
    await this.ensureStarted()
    this.stopTrackLab()
    const player = new Tone.Player(new Tone.ToneAudioBuffer(this.trackLabBuffer)).connect(this.getMaster())
    player.loop = true
    player.loopStart = startSec
    player.loopEnd = Math.min(this.trackLabBuffer.duration, startSec + durSec)
    this.trackLabPlayer = player
    player.start(undefined, startSec)
  }

  stopTrackLab() {
    if (this.trackLabPlayer) {
      this.trackLabPlayer.stop()
      this.trackLabPlayer.dispose()
      this.trackLabPlayer = null
    }
  }

  /** Copy a [startSec, startSec+durSec) window of the imported song into a fresh AudioBuffer —
   * used to hand a section's audio to the Phase I drum sampler ("steal the break"). */
  sliceTrackLabRange(startSec: number, durSec: number): AudioBuffer | null {
    const src = this.trackLabBuffer
    if (!src) return null
    const s0 = Math.max(0, Math.floor(startSec * src.sampleRate))
    const s1 = Math.min(src.length, Math.floor((startSec + durSec) * src.sampleRate))
    const len = s1 - s0
    if (len <= 0) return null
    const ctx = Tone.getContext().rawContext
    const out = ctx.createBuffer(src.numberOfChannels, len, src.sampleRate)
    for (let ch = 0; ch < src.numberOfChannels; ch++) {
      const data = new Float32Array(len)
      src.copyFromChannel(data, ch, s0)
      out.copyToChannel(data, ch)
    }
    return out
  }

  // Preview clock, monotonically increasing across calls regardless of lane/instrument. Found via
  // Phase J's capstone lesson testing: previewDrum passes time=undefined ("right now"), and the
  // kick/snare/clap/hat/openhat voices are each a single (non-polyphonic) instance — rapidly
  // programming several different lanes before ever pressing Play (toggleDrum fires an unawaited
  // preview per click) can call the *same* instrument's triggerAttackRelease more than once within
  // one JS tick, all resolving to the same underlying audio-clock "now" and violating Tone.js's
  // per-instrument monotonically-increasing-start-time invariant. Explicitly bumping each preview
  // at least ~5ms past the last one sidesteps that without audibly delaying anything.
  private lastPreviewTime = 0
  private nextPreviewTime(): number {
    const t = Math.max(Tone.now(), this.lastPreviewTime + 0.005)
    this.lastPreviewTime = t
    return t
  }

  triggerDrum(lane: DrumLane, time?: number, velocity = 1) {
    const t = time ?? this.nextPreviewTime()
    const player = this.samplePlayers[lane]
    if (player) {
      // Approximate per-hit velocity via the slice's own gain node rather than a real per-voice
      // envelope — Tone.Player has no built-in velocity concept, and re-creating one for a single
      // shared player per lane isn't worth it for a step-resolution teaching engine. Each player's
      // buffer already IS just this lane's slice (forward or reversed), so start(t) with no
      // offset plays the whole thing from its own beginning.
      this.sampleGains[lane]!.gain.value = velocity
      player.start(t)
      return
    }
    if (!this.drums) return
    switch (lane) {
      case 'kick':
        this.drums.kick.triggerAttackRelease(this.kickTuneHz, '8n', t, velocity)
        break
      case 'snare':
        this.drums.snare.triggerAttackRelease('8n', t, velocity)
        // body/shell tone layer — silent unless snareTone > 0 (snareToneGain), see applyDrumVoiceParams
        this.drums.snareTone.triggerAttackRelease('A2', '8n', t, velocity)
        break
      case 'clap':
        this.drums.clap.triggerAttackRelease('8n', t, velocity)
        break
      case 'hat':
        this.drums.hat.triggerAttackRelease(300, '32n', t, velocity)
        break
      case 'openhat':
        this.drums.openhat.triggerAttackRelease(300, '16n', t, velocity)
        break
    }
  }

  async previewDrum(lane: DrumLane, velocity = 1) {
    await this.ensureStarted()
    this.triggerDrum(lane, undefined, velocity)
  }

  private ensureChain(track: Track): SynthChain {
    let chain = this.chains.get(track.id)
    if (!chain) {
      const { reverb, delay, mod } = this.getBuses()
      const filter = new Tone.Filter(track.synth.cutoff, 'lowpass')
      // channelCount 2: Tone.Panner defaults to mono input, which would fold the unison stack's
      // stereo image (Wave 3 width panners upstream) back to center before it ever left the track
      const panner = new Tone.Panner({ pan: track.synth.pan, channelCount: 2 })
      const vol = new Tone.Volume(track.synth.volume)
      const reverbSend = new Tone.Gain(track.synth.sendReverb)
      const delaySend = new Tone.Gain(track.synth.sendDelay)
      const modSend = new Tone.Gain(track.synth.sendMod)
      const synth = new Tone.PolySynth(Tone.Synth)
      const osc2 = new Tone.PolySynth(Tone.Synth)
      const osc2Gain = new Tone.Gain(0)
      const osc3 = new Tone.PolySynth(Tone.Synth)
      const osc3Gain = new Tone.Gain(0)
      const osc2Pan = new Tone.Panner(0)
      const osc3Pan = new Tone.Panner(0)
      const uniPairs = [
        { mul: 1.6, minVoices: 5, level: 0.7 },
        { mul: -1.6, minVoices: 5, level: 0.7 },
        { mul: 2.4, minVoices: 7, level: 0.55 },
        { mul: -2.4, minVoices: 7, level: 0.55 },
      ].map((d) => ({ ...d, poly: new Tone.PolySynth(Tone.Synth), pan: new Tone.Panner(0), gain: new Tone.Gain(0) }))
      const sub = new Tone.PolySynth(Tone.Synth)
      const subGain = new Tone.Gain(0)
      const noise = new Tone.NoiseSynth({ noise: { type: 'white' } })
      const noiseGain = new Tone.Gain(0)
      const fm = new Tone.PolySynth(Tone.FMSynth)
      const fmGain = new Tone.Gain(0)

      // Phase E insert effects — filter feeds into these (order decided by wireInserts below),
      // which feed into panner.
      const eq3 = new Tone.EQ3()
      const compIn = new Tone.Gain()
      const compDry = new Tone.Gain(1)
      const compressor = new Tone.Compressor()
      const compWet = new Tone.Gain(0)
      const compOut = new Tone.Gain()
      const distortion = new Tone.Distortion({ distortion: 0, wet: 0 })
      const bitcrush = new Tone.BitCrusher(8) // wet applied in applyParams, which always runs right after

      synth.connect(filter)
      osc2.chain(osc2Pan, osc2Gain, filter)
      osc3.chain(osc3Pan, osc3Gain, filter)
      for (const u of uniPairs) u.poly.chain(u.pan, u.gain, filter)
      sub.chain(subGain, filter)
      noise.chain(noiseGain, filter)
      fm.chain(fmGain, filter)

      // Parallel ("New York") compression split — static, doesn't move with insertOrder.
      compIn.fan(compDry, compressor)
      compressor.connect(compWet)
      compDry.connect(compOut)
      compWet.connect(compOut)
      // Distortion -> bitcrusher fixed sub-chain (only the three slots as a block reorder).
      distortion.connect(bitcrush)

      panner.chain(vol, this.getMaster())
      panner.connect(reverbSend)
      reverbSend.connect(reverb)
      panner.connect(delaySend)
      delaySend.connect(delay)
      panner.connect(modSend)
      modSend.connect(mod)

      chain = {
        synth, osc2, osc2Gain, osc3, osc3Gain, osc2Pan, osc3Pan, uniPairs, sub, subGain, noise, noiseGain, fm, fmGain, filter, panner, vol, reverbSend, delaySend,
        eq3, compIn, compDry, compressor, compWet, compOut, distortion, bitcrush, modSend, lastInsertOrder: [],
      }
      this.chains.set(track.id, chain)
      this.wireInserts(chain, track.synth.insertOrder)
    }
    this.applyParams(chain, track.synth)
    return chain
  }

  // Rewires filter -> [EQ/comp/dist in the given order] -> panner. Only touches the graph when
  // the order actually changed (compared to the last-applied order), so normal knob drags — which
  // call applyParams constantly but never touch insertOrder — don't tear down and rebuild
  // connections on every frame.
  private wireInserts(chain: InsertNodes, order: InsertKind[]) {
    if (chain.lastInsertOrder.join(',') === order.join(',')) return
    chain.filter.disconnect()
    chain.eq3.disconnect()
    chain.compOut.disconnect()
    chain.bitcrush.disconnect()
    const slot = (k: InsertKind) =>
      k === 'eq' ? { in: chain.eq3 as Tone.ToneAudioNode, out: chain.eq3 as Tone.ToneAudioNode }
      : k === 'comp' ? { in: chain.compIn as Tone.ToneAudioNode, out: chain.compOut as Tone.ToneAudioNode }
      : { in: chain.distortion as Tone.ToneAudioNode, out: chain.bitcrush as Tone.ToneAudioNode }
    let prevOut: Tone.ToneAudioNode = chain.filter
    for (const k of order) {
      const { in: nodeIn, out: nodeOut } = slot(k)
      prevOut.connect(nodeIn)
      prevOut = nodeOut
    }
    prevOut.connect(chain.panner)
    chain.lastInsertOrder = [...order]
  }

  // Sets the main oscillator's wave — a named shape, or the wavetable's interpolated spectrum at
  // `pos` (normally p.wtPos; the tick loop passes an LFO/automation-scanned position instead).
  // Cached on lastOscKey so applyParams' constant knob-drag calls don't rebuild the PeriodicWave.
  private applyMainOsc(chain: SynthChain, p: SynthParams, pos: number) {
    // the DRAW table's cache key must also track the drawings themselves — a cheap position-
    // weighted sum is plenty to distinguish two sketches without stringifying 128 floats
    const frameHash = (arr: number[]) => arr.reduce((h, v, i) => h + v * (i + 1), 0).toFixed(3)
    const custom = p.wtTable === 'custom' ? `:${frameHash(p.wtCustomA)}:${frameHash(p.wtCustomB)}` : ''
    const key = p.osc === 'wavetable' ? `wt:${p.wtTable}:${pos.toFixed(3)}${custom}` : p.osc
    if (chain.lastOscKey === key) return
    if (p.osc === 'wavetable') {
      chain.synth.set({ oscillator: { type: 'custom', partials: wtPartials(p.wtTable, pos, { a: p.wtCustomA, b: p.wtCustomB }) } })
    } else {
      chain.synth.set({ oscillator: { type: p.osc } })
    }
    chain.lastOscKey = key
  }

  private applyParams(chain: SynthChain, p: SynthParams) {
    const env = { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release }
    // Glide/portamento applies to every pitched voice so a slide sounds consistent across the
    // whole oscillator bank, not just the main osc.
    chain.synth.set({ envelope: env, portamento: p.glide })
    this.applyMainOsc(chain, p, p.wtPos)
    chain.osc2.set({ oscillator: { type: p.osc2Type }, envelope: env, portamento: p.glide })
    // Unison voice 3: same waveform/level as osc2, mirrored at the opposite detune — only active
    // (audible) when unisonVoices === 3; osc3Gain otherwise stays 0 regardless of osc2Level.
    chain.osc3.set({ oscillator: { type: p.osc2Type }, envelope: env, portamento: p.glide })
    // Wave 3: stereo unison width — only spreads once a real stack is on (>= 3 voices); a lone
    // osc2 "OSC B" layer stays centered exactly as before.
    const width = p.unisonVoices >= 3 ? p.unisonWidth : 0
    chain.osc2Pan.pan.value = width * 0.5
    chain.osc3Pan.pan.value = -width * 0.5
    for (const u of chain.uniPairs) {
      u.poly.set({ oscillator: { type: p.osc2Type }, envelope: env, portamento: p.glide })
      u.gain.gain.value = p.unisonVoices >= u.minVoices ? p.osc2Level * u.level : 0
      u.pan.pan.value = Math.sign(u.mul) * width * (u.minVoices === 5 ? 0.8 : 1)
    }
    chain.sub.set({ oscillator: { type: 'sine' }, envelope: env, portamento: p.glide })
    chain.noise.set({ envelope: env })
    chain.fm.set({
      envelope: env,
      harmonicity: p.fmHarmonicity,
      modulationIndex: p.fmModIndex,
    })
    chain.osc2Gain.gain.value = p.osc2Level
    chain.osc3Gain.gain.value = p.unisonVoices >= 3 ? p.osc2Level : 0
    chain.subGain.gain.value = p.subLevel
    chain.noiseGain.gain.value = p.noiseLevel
    chain.fmGain.gain.value = p.fmLevel
    chain.filter.type = p.filterType
    chain.filter.frequency.rampTo(p.cutoff, 0.02)
    chain.filter.Q.value = p.resonance
    chain.panner.pan.value = p.pan
    chain.vol.volume.value = p.volume
    chain.reverbSend.gain.value = p.sendReverb
    chain.delaySend.gain.value = p.sendDelay

    chain.eq3.low.value = p.eqLow
    chain.eq3.mid.value = p.eqMid
    chain.eq3.high.value = p.eqHigh
    chain.compressor.threshold.value = p.compThreshold
    chain.compressor.ratio.value = p.compRatio
    chain.compressor.attack.value = p.compAttack
    chain.compressor.release.value = p.compRelease
    chain.compDry.gain.value = 1 - p.compMix
    chain.compWet.gain.value = p.compMix
    chain.distortion.distortion = p.distortionAmount
    chain.distortion.wet.value = p.distortionMix
    chain.bitcrush.bits.value = Math.round(p.bitcrushBits)
    chain.bitcrush.wet.value = p.bitcrushMix
    chain.modSend.gain.value = p.sendMod
    this.wireInserts(chain, p.insertOrder)
  }

  updateSynth(track: Track) {
    if (track.kind === 'drums') {
      this.applyDrumBusParams(track.synth)
      this.applyDrumVoiceParams(track.synth)
      return
    }
    const chain = this.chains.get(track.id)
    if (chain) this.applyParams(chain, track.synth)
  }

  sync(tracks: Track[]) {
    const drumsTrack = tracks.find((t) => t.kind === 'drums')
    if (drumsTrack) {
      this.applyDrumBusParams(drumsTrack.synth)
      this.applyDrumVoiceParams(drumsTrack.synth)
    }
    const synthIds = new Set(tracks.filter((t) => t.kind === 'synth').map((t) => t.id))
    for (const [id, chain] of this.chains) {
      if (!synthIds.has(id)) {
        chain.synth.dispose()
        chain.osc2.dispose()
        chain.osc2Gain.dispose()
        chain.osc3.dispose()
        chain.osc3Gain.dispose()
        chain.osc2Pan.dispose()
        chain.osc3Pan.dispose()
        for (const u of chain.uniPairs) {
          u.poly.dispose()
          u.pan.dispose()
          u.gain.dispose()
        }
        chain.sub.dispose()
        chain.subGain.dispose()
        chain.noise.dispose()
        chain.noiseGain.dispose()
        chain.fm.dispose()
        chain.fmGain.dispose()
        chain.filter.dispose()
        chain.panner.dispose()
        chain.vol.dispose()
        chain.reverbSend.dispose()
        chain.delaySend.dispose()
        chain.eq3.dispose()
        chain.compIn.dispose()
        chain.compDry.dispose()
        chain.compressor.dispose()
        chain.compWet.dispose()
        chain.compOut.dispose()
        chain.distortion.dispose()
        chain.bitcrush.dispose()
        chain.modSend.dispose()
        this.chains.delete(id)
      }
    }
    for (const t of tracks) if (t.kind === 'synth') this.ensureChain(t)
  }

  async previewNote(track: Track, pitch: number) {
    await this.ensureStarted()
    const chain = this.ensureChain(track)
    chain.synth.triggerAttackRelease(Tone.Frequency(pitch, 'midi').toFrequency(), '8n')
  }

  // ---------- live MIDI monitoring (Phase G) ----------
  // Real attack/release (not triggerAttackRelease) so a held key sustains for as long as it's
  // physically held, same as playing any hardware synth.

  async liveNoteOn(track: Track, pitch: number, velocity: number) {
    await this.ensureStarted()
    const chain = this.ensureChain(track)
    const p = track.synth
    const freq = Tone.Frequency(pitch, 'midi').toFrequency()
    chain.synth.triggerAttack(freq, undefined, velocity)
    if (p.osc2Level > 0) chain.osc2.triggerAttack(freq * Math.pow(2, p.osc2Detune / 1200), undefined, velocity)
    if (p.unisonVoices >= 3 && p.osc2Level > 0) chain.osc3.triggerAttack(freq * Math.pow(2, -p.osc2Detune / 1200), undefined, velocity)
    for (const u of chain.uniPairs)
      if (p.unisonVoices >= u.minVoices && p.osc2Level > 0) u.poly.triggerAttack(freq * Math.pow(2, (u.mul * p.osc2Detune) / 1200), undefined, velocity)
    if (p.subLevel > 0) chain.sub.triggerAttack(freq / 2, undefined, velocity)
    if (p.noiseLevel > 0) chain.noise.triggerAttack(undefined, velocity)
    if (p.fmLevel > 0) chain.fm.triggerAttack(freq, undefined, velocity)
  }

  liveNoteOff(track: Track, pitch: number) {
    const chain = this.chains.get(track.id)
    if (!chain) return
    const freq = Tone.Frequency(pitch, 'midi').toFrequency()
    // triggerRelease on a note that was never attacked (e.g. osc2 was off at note-on) is a no-op
    // in Tone.js's PolySynth, so it's safe to call all these unconditionally rather than tracking
    // which layers were actually sounding.
    chain.synth.triggerRelease(freq)
    chain.osc2.triggerRelease(freq * Math.pow(2, track.synth.osc2Detune / 1200))
    chain.osc3.triggerRelease(freq * Math.pow(2, -track.synth.osc2Detune / 1200))
    for (const u of chain.uniPairs) u.poly.triggerRelease(freq * Math.pow(2, (u.mul * track.synth.osc2Detune) / 1200))
    chain.sub.triggerRelease(freq / 2)
    chain.noise.triggerRelease()
    chain.fm.triggerRelease(freq)
  }

  async play() {
    await this.ensureStarted()
    const s = useStore.getState()
    this.sync(s.tracks)
    const t = Tone.getTransport()
    t.bpm.value = s.bpm
    t.loop = true
    t.loopStart = 0
    t.loopEnd = `${s.loopBars}m`
    if (this.repeatId !== null) t.clear(this.repeatId)
    this.repeatId = t.scheduleRepeat((time) => this.tick(time), '16n', 0)
    t.position = 0
    t.start()
  }

  stop() {
    const t = Tone.getTransport()
    t.stop()
    if (this.repeatId !== null) {
      t.clear(this.repeatId)
      this.repeatId = null
    }
    useStore.setState({ currentStep: -1 })
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm
  }

  private tick(time: number) {
    const s = useStore.getState()
    const transport = Tone.getTransport()
    const totalSteps = s.loopBars * 16
    const ticksPerStep = transport.PPQ / 4
    const step = Math.round(transport.getTicksAtTime(time) / ticksPerStep) % totalSteps
    const bar = Math.floor(step / 16)

    const stepSeconds = Tone.Time('16n').toSeconds()
    // swing: push odd-numbered 16ths later, toward the following even step. 50% = straight,
    // ~66% ≈ triplet shuffle. Applied as a scheduling offset, not a pattern change.
    const swingTime = step % 2 === 1 ? time + stepSeconds * (2 * (s.swing / 100) - 1) : time

    // Phase F: live "touch" automation recording — same REC arm as Phase G's MIDI notes, just
    // capturing whatever value the armed param currently holds (i.e. whatever the user is live-
    // dragging in the device panel) once per step, rather than a note.
    if (s.automationArm && s.isRecording) {
      const { trackId, param } = s.automationArm
      const armedTrack = s.tracks.find((t) => t.id === trackId)
      if (armedTrack && armedTrack.kind === 'synth') {
        useStore.getState().recordAutomationPoint(trackId, param, step / totalSteps, armedTrack.synth[param])
      }
    }

    for (const tr of s.tracks) {
      if (tr.muted) continue
      if (s.arrangement.enabled && s.arrangement.mode === 'energy') {
        const section = Math.floor(bar / s.arrangement.barsPerSection)
        if (!s.arrangement.active[tr.id]?.[section]) continue
      }
      if (tr.kind === 'drums') {
        // Filter sweep — the single most-cited chop effect in production tutorials — reusing the
        // exact same LFO->cutoff math synth tracks use, just aimed at the drum bus's filter
        // instead of a per-voice one. Everything else on tr.synth (static filter/EQ/comp/
        // distortion/sends) is applied reactively by applyDrumBusParams whenever the user drags a
        // knob; only the continuously-moving LFO sweep needs to run every step like this.
        const p = tr.synth
        if ((p.lfoDest === 'cutoff' || p.lfoDest === 'amp') && p.lfoDepth > 0) {
          const lfoRateHz = p.lfoSync ? syncedRateHz(s.bpm, p.lfoSyncRate) : p.lfoRate
          const lfoValue = lfoWaveValue(p, lfoRateHz, time)
          const bus = this.getDrumBus()
          if (p.lfoDest === 'cutoff') {
            const hz = p.cutoff * Math.pow(2, p.lfoDepth * lfoValue)
            bus.filter.frequency.linearRampToValueAtTime(hz, swingTime + stepSeconds)
          } else {
            bus.vol.volume.linearRampToValueAtTime(p.volume + p.lfoDepth * lfoValue * 12, swingTime + stepSeconds)
          }
        }
        for (const lane of DRUM_LANES) {
          const vel = tr.pattern[lane][step % 16]
          if (vel) this.triggerDrum(lane, swingTime, vel)
        }
      } else {
        const chain = this.chains.get(tr.id)
        if (!chain) continue
        const p = tr.synth
        // sampled once per 16th-note step (not audio-rate) — cheap and matches the resolution of
        // every other per-step modulation here (swing, cutoff automation); plenty smooth at the
        // slow rates an LFO is used for in this app. Rates well above the ~8-16Hz step-sampling
        // rate at typical tempos alias into a stepped/buzzy texture rather than a clean fast
        // wobble — a real, audible limitation of sampling once per step, not a bug (see the Rate
        // knob's tooltip). Tempo sync (lfoSync) just changes what feeds this same Hz value.
        const lfoOn = p.lfoDest !== 'off' && p.lfoDepth > 0
        const lfoRateHz = p.lfoSync ? syncedRateHz(s.bpm, p.lfoSyncRate) : p.lfoRate
        const lfoValue = lfoOn ? lfoWaveValue(p, lfoRateHz, time) : 0

        const cutoffAuto = tr.automation?.cutoff
        let baseCutoff = p.cutoff
        if (cutoffAuto && cutoffAuto.length) {
          baseCutoff = interpolateAutomation(cutoffAuto, step / totalSteps, true)
        }
        if (p.lfoDest === 'cutoff' && lfoOn) {
          const hz = baseCutoff * Math.pow(2, p.lfoDepth * lfoValue)
          chain.filter.frequency.linearRampToValueAtTime(hz, swingTime + stepSeconds)
        } else if (cutoffAuto && cutoffAuto.length) {
          chain.filter.frequency.linearRampToValueAtTime(baseCutoff, swingTime + stepSeconds)
        }
        if (p.lfoDest === 'amp' && lfoOn) {
          chain.vol.volume.linearRampToValueAtTime(p.volume + p.lfoDepth * lfoValue * 12, swingTime + stepSeconds)
        }
        // Wave 3: LFO -> wavetable position, scanning ±half the table around the static wtPos.
        // Rebuilds the main osc's spectrum once per step — the same control-rate resolution as
        // every other modulation here (spectra swap discretely; that stepping is audible and
        // documented, like fast LFO rates).
        if (p.lfoDest === 'wtPos' && lfoOn && p.osc === 'wavetable') {
          this.applyMainOsc(chain, p, Math.max(0, Math.min(1, p.wtPos + 0.5 * p.lfoDepth * lfoValue)))
        }

        // Phase F: generic breakpoint automation for every other automatable param (cutoff is
        // handled above since it also interacts with the original LFO; duckAmount is handled
        // below since it also interacts with the sidechain duck). Known limitation: an automated
        // param that's *also* driven by LFO2 (below) or the original LFO/duck will have whichever
        // block runs last win within the same tick — same documented tradeoff as the duck/amp-LFO
        // case, not worth a full modulation-mixing pass for a step-resolution teaching engine.
        const rampTime = swingTime + stepSeconds
        if (tr.automation) {
          for (const key of Object.keys(tr.automation) as AutomatableParam[]) {
            if (key === 'cutoff' || key === 'duckAmount') continue
            const points = tr.automation[key]
            if (!points || !points.length) continue
            const val = interpolateAutomation(points, step / totalSteps, false)
            switch (key) {
              case 'resonance': chain.filter.Q.linearRampToValueAtTime(val, rampTime); break
              case 'volume': chain.vol.volume.linearRampToValueAtTime(val, rampTime); break
              case 'pan': chain.panner.pan.linearRampToValueAtTime(val, rampTime); break
              case 'sendReverb': chain.reverbSend.gain.linearRampToValueAtTime(val, rampTime); break
              case 'sendDelay': chain.delaySend.gain.linearRampToValueAtTime(val, rampTime); break
              case 'sendMod': chain.modSend.gain.linearRampToValueAtTime(val, rampTime); break
              case 'eqLow': chain.eq3.low.linearRampToValueAtTime(val, rampTime); break
              case 'eqMid': chain.eq3.mid.linearRampToValueAtTime(val, rampTime); break
              case 'eqHigh': chain.eq3.high.linearRampToValueAtTime(val, rampTime); break
              case 'compMix':
                chain.compDry.gain.linearRampToValueAtTime(1 - val, rampTime)
                chain.compWet.gain.linearRampToValueAtTime(val, rampTime)
                break
              case 'distortionMix': chain.distortion.wet.linearRampToValueAtTime(val, rampTime); break
              case 'bitcrushMix': chain.bitcrush.wet.linearRampToValueAtTime(val, rampTime); break
              // not a ramped AudioParam — the spectrum steps once per tick, same limitation as
              // the LFO->wtPos route above (which wins over this lane if both are active, per the
              // documented last-write tradeoff)
              case 'wtPos': if (p.osc === 'wavetable') this.applyMainOsc(chain, p, Math.max(0, Math.min(1, val))); break
            }
          }
        }

        // Phase F: LFO 2 — a second, independent modulation route to a disjoint destination set
        // (see Lfo2Dest in types.ts), additive on top of that destination's static/automated value.
        const lfo2On = p.lfo2Dest !== 'off' && p.lfo2Depth > 0
        if (lfo2On) {
          const lfo2RateHz = p.lfo2Sync ? syncedRateHz(s.bpm, p.lfo2SyncRate) : p.lfo2Rate
          const lfo2Value = Math.sin(2 * Math.PI * lfo2RateHz * time)
          const d = p.lfo2Depth * lfo2Value
          const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
          switch (p.lfo2Dest) {
            case 'pan': chain.panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, p.pan + d)), rampTime); break
            case 'sendReverb': chain.reverbSend.gain.linearRampToValueAtTime(clamp01(p.sendReverb + d * 0.5), rampTime); break
            case 'sendDelay': chain.delaySend.gain.linearRampToValueAtTime(clamp01(p.sendDelay + d * 0.5), rampTime); break
            case 'sendMod': chain.modSend.gain.linearRampToValueAtTime(clamp01(p.sendMod + d * 0.5), rampTime); break
            case 'eqLow': chain.eq3.low.linearRampToValueAtTime(p.eqLow + d * 12, rampTime); break
            case 'eqMid': chain.eq3.mid.linearRampToValueAtTime(p.eqMid + d * 12, rampTime); break
            case 'eqHigh': chain.eq3.high.linearRampToValueAtTime(p.eqHigh + d * 12, rampTime); break
            case 'distortionMix': chain.distortion.wet.linearRampToValueAtTime(clamp01(p.distortionMix + d * 0.5), rampTime); break
          }
        }

        // Phase E scheduled sidechain duck: not a real audio-analysis sidechain (there's no
        // envelope follower here) — it ducks this track's volume whenever duckSource's kick lane
        // has a hit at this step, scheduled from pattern data the same way everything else in this
        // engine is. duckAmount can itself be automated (Phase F) — if so, the automated value
        // wins over the static p.duckAmount for this step.
        if (p.duckSource) {
          const duckAuto = tr.automation?.duckAmount
          const duckAmt = duckAuto && duckAuto.length ? interpolateAutomation(duckAuto, step / totalSteps, false) : p.duckAmount
          if (duckAmt > 0) {
            const source = s.tracks.find((x) => x.id === p.duckSource)
            const kickHit = source?.kind === 'drums' ? source.pattern.kick[step % 16] : 0
            if (kickHit) {
              const dipDb = duckAmt * 24
              chain.vol.volume.cancelScheduledValues(swingTime)
              chain.vol.volume.setValueAtTime(p.volume, swingTime)
              chain.vol.volume.linearRampToValueAtTime(p.volume - dipDb, swingTime + 0.005)
              chain.vol.volume.linearRampToValueAtTime(p.volume, swingTime + 0.16)
            }
          }
        }

        // Notes are stored in continuous (possibly fractional) step units — MIDI-recorded notes
        // (Phase G) land between grid lines on purpose. quantizeStrength (0..100) blends a note's
        // raw start toward the nearest whole step at *playback* time only; it never mutates the
        // stored note. At strength 0 (default) or an already-grid-aligned note, effStart === n.start
        // exactly, so this reduces to the pre-Phase-G `n.start === step` check with zero behavior change.
        const due: { note: (typeof tr.notes)[number]; effStart: number }[] = []
        for (const noteObj of tr.notes) {
          const effStart =
            s.quantizeStrength > 0
              ? noteObj.start + (Math.round(noteObj.start) - noteObj.start) * (s.quantizeStrength / 100)
              : noteObj.start
          if (Math.floor(effStart) === step) due.push({ note: noteObj, effStart })
        }

        // Phase H arpeggiator: notes sharing this exact step (a stacked chord) fan out across the
        // chord's own held duration instead of firing together — scoped to same-step chords, not a
        // continuously-held/sustained arpeggiation across many bars (see docs/ROADMAP.md Phase H
        // item 41). A single note "group" of size 1 is unaffected either way.
        const arpeggiating = p.arpOn && due.length > 1
        let ordered = due
        if (arpeggiating) {
          const up = [...due].sort((a, b) => a.note.pitch - b.note.pitch)
          ordered =
            p.arpPattern === 'down' ? [...up].reverse()
            : p.arpPattern === 'updown' && up.length > 2 ? [...up, ...[...up].reverse().slice(1, -1)]
            : up
        }
        const slotSeconds = stepSeconds / Math.max(1, p.arpRate)
        const chordDurSteps = due.length ? Math.max(...due.map((d) => d.note.duration)) : 0
        const arpSlots = arpeggiating ? Math.max(1, Math.round((chordDurSteps * stepSeconds) / slotSeconds)) : ordered.length

        for (let i = 0; i < arpSlots; i++) {
          const { note: noteObj, effStart } = arpeggiating ? ordered[i % ordered.length] : ordered[i]
          const noteTime = arpeggiating
            ? swingTime + (effStart - step) * stepSeconds + i * slotSeconds
            : swingTime + (effStart - step) * stepSeconds
          const dur = arpeggiating ? Math.max(slotSeconds * 0.85, 0.03) : Math.max(noteObj.duration * stepSeconds * 0.9, 0.05)
          let freq = Tone.Frequency(noteObj.pitch, 'midi').toFrequency()
          if (p.lfoDest === 'pitch' && lfoOn) freq *= Math.pow(2, (p.lfoDepth * lfoValue * 100) / 1200)
          chain.synth.triggerAttackRelease(freq, dur, noteTime, noteObj.velocity)
          if (p.osc2Level > 0) chain.osc2.triggerAttackRelease(freq * Math.pow(2, p.osc2Detune / 1200), dur, noteTime, noteObj.velocity)
          if (p.unisonVoices >= 3 && p.osc2Level > 0)
            chain.osc3.triggerAttackRelease(freq * Math.pow(2, -p.osc2Detune / 1200), dur, noteTime, noteObj.velocity)
          for (const u of chain.uniPairs)
            if (p.unisonVoices >= u.minVoices && p.osc2Level > 0)
              u.poly.triggerAttackRelease(freq * Math.pow(2, (u.mul * p.osc2Detune) / 1200), dur, noteTime, noteObj.velocity)
          if (p.subLevel > 0) chain.sub.triggerAttackRelease(freq / 2, dur, noteTime, noteObj.velocity)
          if (p.noiseLevel > 0) chain.noise.triggerAttackRelease(dur, noteTime, noteObj.velocity)
          if (p.fmLevel > 0) chain.fm.triggerAttackRelease(freq, dur, noteTime, noteObj.velocity)
          if (p.filterEnvAmount > 0 || p.keytrackAmount > 0 || p.velToFilterAmount > 0) {
            // Keytracking/velocity shift *this note's* cutoff at note-on; filterEnvAmount's shape
            // (if any) then sweeps relative to that shifted value rather than the raw baseCutoff.
            const keytrackMult = Math.pow(2, (p.keytrackAmount * (noteObj.pitch - 60)) / 12)
            const velMult = Math.pow(2, p.velToFilterAmount * (noteObj.velocity - 0.5) * 4)
            const noteCutoff = Math.max(baseCutoff * keytrackMult * velMult, 20)
            const peak = Math.max(noteCutoff * Math.pow(2, p.filterEnvAmount * 4), 20)
            const sustainHz = Math.max(noteCutoff * Math.pow(2, p.filterEnvAmount * 4 * p.filterEnvSustain), 20)
            chain.filter.frequency.cancelScheduledValues(noteTime)
            chain.filter.frequency.setValueAtTime(noteCutoff, noteTime)
            chain.filter.frequency.exponentialRampToValueAtTime(peak, noteTime + Math.max(p.filterEnvAttack, 0.001))
            chain.filter.frequency.exponentialRampToValueAtTime(sustainHz, noteTime + Math.max(p.filterEnvAttack, 0.001) + Math.max(p.filterEnvDecay, 0.001))
            chain.filter.frequency.exponentialRampToValueAtTime(noteCutoff, noteTime + dur + Math.max(p.filterEnvRelease, 0.001))
          }
        }
      }
    }

    Tone.getDraw().schedule(() => {
      useStore.setState({ currentStep: step, masterLevel: this.masterMeter?.getValue() as number | undefined })
    }, time)
  }

  async playTargetDrums(hits: { lane: DrumLane; step: number }[], bpm: number) {
    await this.ensureStarted()
    const stepSec = 60 / bpm / 4
    const now = Tone.now() + 0.1
    for (const h of hits) this.triggerDrum(h.lane, now + h.step * stepSec)
  }

  async playTarget(target: TargetPatch) {
    await this.ensureStarted()
    const p = target.params
    const filter = new Tone.Filter(p.cutoff, p.filterType)
    filter.Q.value = p.resonance
    const vol = new Tone.Volume(p.volume)
    const synth = new Tone.PolySynth(Tone.Synth)
    const osc2 = new Tone.PolySynth(Tone.Synth)
    const osc2Gain = new Tone.Gain(p.osc2Level)
    const sub = new Tone.PolySynth(Tone.Synth)
    const subGain = new Tone.Gain(p.subLevel)
    const noise = new Tone.NoiseSynth({ noise: { type: 'white' } })
    const noiseGain = new Tone.Gain(p.noiseLevel)
    const env = { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release }
    // wavetable targets preview at their static wtPos (no per-note scanning — same phrase-note
    // resolution tradeoff as the LFO sampling below)
    if (p.osc === 'wavetable') synth.set({ oscillator: { type: 'custom', partials: wtPartials(p.wtTable, p.wtPos, { a: p.wtCustomA, b: p.wtCustomB }) }, envelope: env })
    else synth.set({ oscillator: { type: p.osc }, envelope: env })
    osc2.set({ oscillator: { type: p.osc2Type }, envelope: env })
    sub.set({ oscillator: { type: 'sine' }, envelope: env })
    noise.set({ envelope: env })
    synth.connect(filter)
    osc2.chain(osc2Gain, filter)
    sub.chain(subGain, filter)
    noise.chain(noiseGain, filter)
    filter.chain(vol, this.getMaster())

    // LFO/filter-envelope here are sampled once per phrase note (there's no transport tick loop
    // driving a one-shot preview like this) — same tradeoff as the main tick(), just at phrase-note
    // resolution instead of 16th-note resolution.
    const lfoOn = p.lfoDest !== 'off' && p.lfoDepth > 0
    const lfoRateHz = p.lfoSync ? syncedRateHz(useStore.getState().bpm, p.lfoSyncRate) : p.lfoRate
    const now = Tone.now() + 0.05
    let end = 0
    for (const n of target.phrase) {
      const noteTime = now + n.time
      const lfoValue = lfoOn ? lfoWaveValue(p, lfoRateHz, n.time) : 0
      let freq = Tone.Frequency(n.pitch, 'midi').toFrequency()
      if (p.lfoDest === 'pitch' && lfoOn) freq *= Math.pow(2, (p.lfoDepth * lfoValue * 100) / 1200)
      synth.triggerAttackRelease(freq, n.dur, noteTime)
      if (p.osc2Level > 0) osc2.triggerAttackRelease(freq * Math.pow(2, p.osc2Detune / 1200), n.dur, noteTime)
      if (p.subLevel > 0) sub.triggerAttackRelease(freq / 2, n.dur, noteTime)
      if (p.noiseLevel > 0) noise.triggerAttackRelease(n.dur, noteTime)
      if (p.lfoDest === 'cutoff' && lfoOn) {
        filter.frequency.setValueAtTime(Math.max(p.cutoff * Math.pow(2, p.lfoDepth * lfoValue), 20), noteTime)
      }
      if (p.lfoDest === 'amp' && lfoOn) {
        vol.volume.setValueAtTime(p.volume + p.lfoDepth * lfoValue * 12, noteTime)
      }
      if (p.filterEnvAmount > 0) {
        const peak = Math.max(p.cutoff * Math.pow(2, p.filterEnvAmount * 4), 20)
        const sustainHz = Math.max(p.cutoff * Math.pow(2, p.filterEnvAmount * 4 * p.filterEnvSustain), 20)
        filter.frequency.cancelScheduledValues(noteTime)
        filter.frequency.setValueAtTime(Math.max(p.cutoff, 20), noteTime)
        filter.frequency.exponentialRampToValueAtTime(peak, noteTime + Math.max(p.filterEnvAttack, 0.001))
        filter.frequency.exponentialRampToValueAtTime(sustainHz, noteTime + Math.max(p.filterEnvAttack, 0.001) + Math.max(p.filterEnvDecay, 0.001))
        filter.frequency.exponentialRampToValueAtTime(Math.max(p.cutoff, 20), noteTime + n.dur + Math.max(p.filterEnvRelease, 0.001))
      }
      end = Math.max(end, n.time + n.dur)
    }
    setTimeout(() => {
      synth.dispose()
      osc2.dispose()
      osc2Gain.dispose()
      sub.dispose()
      subGain.dispose()
      noise.dispose()
      noiseGain.dispose()
      filter.dispose()
      vol.dispose()
    }, (end + p.release + p.filterEnvRelease + 0.6) * 1000)
  }
}

export const engine = new Engine()

if (import.meta.env.DEV) {
  ;(window as unknown as { __engine: typeof engine }).__engine = engine
}
