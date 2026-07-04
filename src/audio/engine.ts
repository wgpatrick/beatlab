import * as Tone from 'tone'
import { DRUM_LANES, type AutomationPoint, type DrumLane, type SynthParams, type TargetPatch, type Track } from '../types'
import { useStore } from '../state/store'

// log-space interpolation between breakpoints (frac: 0..1 through the loop) — cutoff perception
// is logarithmic, so this reads as an evenly-paced sweep rather than one that rushes at the top.
function interpolateAutomation(points: AutomationPoint[], frac: number): number {
  const pts = [...points].sort((a, b) => a.time - b.time)
  if (frac <= pts[0].time) return pts[0].value
  if (frac >= pts[pts.length - 1].time) return pts[pts.length - 1].value
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (frac >= a.time && frac <= b.time) {
      const t = (frac - a.time) / (b.time - a.time || 1)
      return a.value * Math.pow(b.value / a.value, t)
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
  sub: Tone.PolySynth<Tone.Synth>
  subGain: Tone.Gain
  noise: Tone.NoiseSynth
  noiseGain: Tone.Gain
  filter: Tone.Filter
  panner: Tone.Panner
  vol: Tone.Volume
  reverbSend: Tone.Gain
  delaySend: Tone.Gain
}

interface DrumKit {
  kick: Tone.MembraneSynth
  snare: Tone.NoiseSynth
  clap: Tone.NoiseSynth
  hat: Tone.MetalSynth
  openhat: Tone.MetalSynth
}

class Engine {
  private chains = new Map<string, SynthChain>()
  private drums: DrumKit | null = null
  private repeatId: number | null = null
  private ready = false
  // shared mixer return buses — every synth chain's reverb/delay send taps into these, matching
  // the "one shared reverb + one shared delay return" minimal mixer every DAW tutorial starts with
  private reverbBus: Tone.Reverb | null = null
  private delayBus: Tone.FeedbackDelay | null = null

  async ensureStarted() {
    if (this.ready) return
    await Tone.start()
    this.buildDrums()
    Tone.getDestination().volume.value = -2
    this.ready = true
  }

  // Lazy on purpose: ensureChain (via sync()) can run before the user has interacted with the
  // page at all, i.e. before ensureStarted()/Tone.start() — Tone nodes can be constructed before
  // the audio context starts, they just won't produce sound until it does.
  private getBuses() {
    if (!this.reverbBus) {
      this.reverbBus = new Tone.Reverb({ decay: 2.2, wet: 1 }).toDestination()
      this.delayBus = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.3, wet: 1 }).toDestination()
    }
    return { reverb: this.reverbBus, delay: this.delayBus! }
  }

  private buildDrums() {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 7,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
    }).toDestination()
    kick.volume.value = -2

    const snareFilter = new Tone.Filter(1800, 'highpass').toDestination()
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
    }).connect(snareFilter)
    snare.volume.value = -8

    const clapFilter = new Tone.Filter(1100, 'bandpass').toDestination()
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
    }).toDestination()
    hat.volume.value = -18

    const openhat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.35, release: 0.05 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).toDestination()
    openhat.volume.value = -20

    this.drums = { kick, snare, clap, hat, openhat }
  }

  triggerDrum(lane: DrumLane, time?: number, velocity = 1) {
    if (!this.drums) return
    switch (lane) {
      case 'kick':
        this.drums.kick.triggerAttackRelease('C1', '8n', time, velocity)
        break
      case 'snare':
        this.drums.snare.triggerAttackRelease('8n', time, velocity)
        break
      case 'clap':
        this.drums.clap.triggerAttackRelease('8n', time, velocity)
        break
      case 'hat':
        this.drums.hat.triggerAttackRelease(300, '32n', time, velocity)
        break
      case 'openhat':
        this.drums.openhat.triggerAttackRelease(300, '16n', time, velocity)
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
      const { reverb, delay } = this.getBuses()
      const filter = new Tone.Filter(track.synth.cutoff, 'lowpass')
      const panner = new Tone.Panner(track.synth.pan)
      const vol = new Tone.Volume(track.synth.volume)
      const reverbSend = new Tone.Gain(track.synth.sendReverb)
      const delaySend = new Tone.Gain(track.synth.sendDelay)
      const synth = new Tone.PolySynth(Tone.Synth)
      const osc2 = new Tone.PolySynth(Tone.Synth)
      const osc2Gain = new Tone.Gain(0)
      const sub = new Tone.PolySynth(Tone.Synth)
      const subGain = new Tone.Gain(0)
      const noise = new Tone.NoiseSynth({ noise: { type: 'white' } })
      const noiseGain = new Tone.Gain(0)
      synth.connect(filter)
      osc2.chain(osc2Gain, filter)
      sub.chain(subGain, filter)
      noise.chain(noiseGain, filter)
      filter.chain(panner, vol, Tone.getDestination())
      panner.connect(reverbSend)
      reverbSend.connect(reverb)
      panner.connect(delaySend)
      delaySend.connect(delay)
      chain = { synth, osc2, osc2Gain, sub, subGain, noise, noiseGain, filter, panner, vol, reverbSend, delaySend }
      this.chains.set(track.id, chain)
    }
    this.applyParams(chain, track.synth)
    return chain
  }

  private applyParams(chain: SynthChain, p: SynthParams) {
    const env = { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release }
    chain.synth.set({ oscillator: { type: p.osc }, envelope: env })
    chain.osc2.set({ oscillator: { type: p.osc2Type }, envelope: env })
    chain.sub.set({ oscillator: { type: 'sine' }, envelope: env })
    chain.noise.set({ envelope: env })
    chain.osc2Gain.gain.value = p.osc2Level
    chain.subGain.gain.value = p.subLevel
    chain.noiseGain.gain.value = p.noiseLevel
    chain.filter.type = p.filterType
    chain.filter.frequency.rampTo(p.cutoff, 0.02)
    chain.filter.Q.value = p.resonance
    chain.panner.pan.value = p.pan
    chain.vol.volume.value = p.volume
    chain.reverbSend.gain.value = p.sendReverb
    chain.delaySend.gain.value = p.sendDelay
  }

  updateSynth(track: Track) {
    const chain = this.chains.get(track.id)
    if (chain) this.applyParams(chain, track.synth)
  }

  sync(tracks: Track[]) {
    const synthIds = new Set(tracks.filter((t) => t.kind === 'synth').map((t) => t.id))
    for (const [id, chain] of this.chains) {
      if (!synthIds.has(id)) {
        chain.synth.dispose()
        chain.osc2.dispose()
        chain.osc2Gain.dispose()
        chain.sub.dispose()
        chain.subGain.dispose()
        chain.noise.dispose()
        chain.noiseGain.dispose()
        chain.filter.dispose()
        chain.panner.dispose()
        chain.vol.dispose()
        chain.reverbSend.dispose()
        chain.delaySend.dispose()
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
    if (p.subLevel > 0) chain.sub.triggerAttack(freq / 2, undefined, velocity)
    if (p.noiseLevel > 0) chain.noise.triggerAttack(undefined, velocity)
  }

  liveNoteOff(track: Track, pitch: number) {
    const chain = this.chains.get(track.id)
    if (!chain) return
    const freq = Tone.Frequency(pitch, 'midi').toFrequency()
    // triggerRelease on a note that was never attacked (e.g. osc2 was off at note-on) is a no-op
    // in Tone.js's PolySynth, so it's safe to call all four unconditionally rather than tracking
    // which layers were actually sounding.
    chain.synth.triggerRelease(freq)
    chain.osc2.triggerRelease(freq * Math.pow(2, track.synth.osc2Detune / 1200))
    chain.sub.triggerRelease(freq / 2)
    chain.noise.triggerRelease()
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

    for (const tr of s.tracks) {
      if (tr.muted) continue
      if (s.arrangement.enabled && s.arrangement.mode === 'energy') {
        const section = Math.floor(bar / s.arrangement.barsPerSection)
        if (!s.arrangement.active[tr.id]?.[section]) continue
      }
      if (tr.kind === 'drums') {
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
        // slow rates an LFO is used for in this app.
        const lfoOn = p.lfoDest !== 'off' && p.lfoDepth > 0
        const lfoValue = lfoOn ? Math.sin(2 * Math.PI * p.lfoRate * time) : 0

        let baseCutoff = p.cutoff
        if (tr.cutoffAutomation && tr.cutoffAutomation.length) {
          baseCutoff = interpolateAutomation(tr.cutoffAutomation, step / totalSteps)
        }
        if (p.lfoDest === 'cutoff' && lfoOn) {
          const hz = baseCutoff * Math.pow(2, p.lfoDepth * lfoValue)
          chain.filter.frequency.linearRampToValueAtTime(hz, swingTime + stepSeconds)
        } else if (tr.cutoffAutomation && tr.cutoffAutomation.length) {
          chain.filter.frequency.linearRampToValueAtTime(baseCutoff, swingTime + stepSeconds)
        }
        if (p.lfoDest === 'amp' && lfoOn) {
          chain.vol.volume.linearRampToValueAtTime(p.volume + p.lfoDepth * lfoValue * 12, swingTime + stepSeconds)
        }

        for (const n of tr.notes) {
          // Notes are stored in continuous (possibly fractional) step units — MIDI-recorded notes
          // (Phase G) land between grid lines on purpose. quantizeStrength (0..100) blends a note's
          // raw start toward the nearest whole step at *playback* time only; it never mutates the
          // stored note. At strength 0 (default) or an already-grid-aligned note, effStart === n.start
          // exactly, so this reduces to the pre-Phase-G `n.start === step` check with zero behavior change.
          const effStart =
            s.quantizeStrength > 0
              ? n.start + (Math.round(n.start) - n.start) * (s.quantizeStrength / 100)
              : n.start
          if (Math.floor(effStart) !== step) continue
          const noteTime = swingTime + (effStart - step) * stepSeconds
          const dur = Math.max(n.duration * stepSeconds * 0.9, 0.05)
          let freq = Tone.Frequency(n.pitch, 'midi').toFrequency()
          if (p.lfoDest === 'pitch' && lfoOn) freq *= Math.pow(2, (p.lfoDepth * lfoValue * 100) / 1200)
          chain.synth.triggerAttackRelease(freq, dur, noteTime, n.velocity)
          if (p.osc2Level > 0) chain.osc2.triggerAttackRelease(freq * Math.pow(2, p.osc2Detune / 1200), dur, noteTime, n.velocity)
          if (p.subLevel > 0) chain.sub.triggerAttackRelease(freq / 2, dur, noteTime, n.velocity)
          if (p.noiseLevel > 0) chain.noise.triggerAttackRelease(dur, noteTime, n.velocity)
          if (p.filterEnvAmount > 0) {
            const peak = Math.max(baseCutoff * Math.pow(2, p.filterEnvAmount * 4), 20)
            const sustainHz = Math.max(baseCutoff * Math.pow(2, p.filterEnvAmount * 4 * p.filterEnvSustain), 20)
            chain.filter.frequency.cancelScheduledValues(noteTime)
            chain.filter.frequency.setValueAtTime(Math.max(baseCutoff, 20), noteTime)
            chain.filter.frequency.exponentialRampToValueAtTime(peak, noteTime + Math.max(p.filterEnvAttack, 0.001))
            chain.filter.frequency.exponentialRampToValueAtTime(sustainHz, noteTime + Math.max(p.filterEnvAttack, 0.001) + Math.max(p.filterEnvDecay, 0.001))
            chain.filter.frequency.exponentialRampToValueAtTime(Math.max(baseCutoff, 20), noteTime + dur + Math.max(p.filterEnvRelease, 0.001))
          }
        }
      }
    }

    Tone.getDraw().schedule(() => {
      useStore.setState({ currentStep: step })
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
    synth.set({ oscillator: { type: p.osc }, envelope: env })
    osc2.set({ oscillator: { type: p.osc2Type }, envelope: env })
    sub.set({ oscillator: { type: 'sine' }, envelope: env })
    noise.set({ envelope: env })
    synth.connect(filter)
    osc2.chain(osc2Gain, filter)
    sub.chain(subGain, filter)
    noise.chain(noiseGain, filter)
    filter.chain(vol, Tone.getDestination())

    // LFO/filter-envelope here are sampled once per phrase note (there's no transport tick loop
    // driving a one-shot preview like this) — same tradeoff as the main tick(), just at phrase-note
    // resolution instead of 16th-note resolution.
    const lfoOn = p.lfoDest !== 'off' && p.lfoDepth > 0
    const now = Tone.now() + 0.05
    let end = 0
    for (const n of target.phrase) {
      const noteTime = now + n.time
      const lfoValue = lfoOn ? Math.sin(2 * Math.PI * p.lfoRate * n.time) : 0
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
