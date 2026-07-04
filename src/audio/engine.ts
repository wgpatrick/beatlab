import * as Tone from 'tone'
import { DRUM_LANES, type AutomatableParam, type AutomationPoint, type DrumLane, type InsertKind, type SynthParams, type TargetPatch, type Track } from '../types'
import { useStore } from '../state/store'

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
  // Phase E: a second shared return bus, chorus -> phaser in series, one combined send level
  private chorusBus: Tone.Chorus | null = null
  private phaserBus: Tone.Phaser | null = null

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
      // series, not parallel: chorus feeds into phaser, only the phaser's output reaches the
      // destination — otherwise the chorus-only signal would double up alongside the phased one.
      this.chorusBus = new Tone.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.7, wet: 1 }).start()
      this.phaserBus = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 1000, wet: 1 }).toDestination()
      this.chorusBus.connect(this.phaserBus)
    }
    return { reverb: this.reverbBus, delay: this.delayBus!, mod: this.chorusBus! }
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
      const { reverb, delay, mod } = this.getBuses()
      const filter = new Tone.Filter(track.synth.cutoff, 'lowpass')
      const panner = new Tone.Panner(track.synth.pan)
      const vol = new Tone.Volume(track.synth.volume)
      const reverbSend = new Tone.Gain(track.synth.sendReverb)
      const delaySend = new Tone.Gain(track.synth.sendDelay)
      const modSend = new Tone.Gain(track.synth.sendMod)
      const synth = new Tone.PolySynth(Tone.Synth)
      const osc2 = new Tone.PolySynth(Tone.Synth)
      const osc2Gain = new Tone.Gain(0)
      const osc3 = new Tone.PolySynth(Tone.Synth)
      const osc3Gain = new Tone.Gain(0)
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
      osc2.chain(osc2Gain, filter)
      osc3.chain(osc3Gain, filter)
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

      panner.chain(vol, Tone.getDestination())
      panner.connect(reverbSend)
      reverbSend.connect(reverb)
      panner.connect(delaySend)
      delaySend.connect(delay)
      panner.connect(modSend)
      modSend.connect(mod)

      chain = {
        synth, osc2, osc2Gain, osc3, osc3Gain, sub, subGain, noise, noiseGain, fm, fmGain, filter, panner, vol, reverbSend, delaySend,
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
  private wireInserts(chain: SynthChain, order: InsertKind[]) {
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

  private applyParams(chain: SynthChain, p: SynthParams) {
    const env = { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release }
    // Glide/portamento applies to every pitched voice so a slide sounds consistent across the
    // whole oscillator bank, not just the main osc.
    chain.synth.set({ oscillator: { type: p.osc }, envelope: env, portamento: p.glide })
    chain.osc2.set({ oscillator: { type: p.osc2Type }, envelope: env, portamento: p.glide })
    // Unison voice 3: same waveform/level as osc2, mirrored at the opposite detune — only active
    // (audible) when unisonVoices === 3; osc3Gain otherwise stays 0 regardless of osc2Level.
    chain.osc3.set({ oscillator: { type: p.osc2Type }, envelope: env, portamento: p.glide })
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
        chain.osc3.dispose()
        chain.osc3Gain.dispose()
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
            }
          }
        }

        // Phase F: LFO 2 — a second, independent modulation route to a disjoint destination set
        // (see Lfo2Dest in types.ts), additive on top of that destination's static/automated value.
        const lfo2On = p.lfo2Dest !== 'off' && p.lfo2Depth > 0
        if (lfo2On) {
          const lfo2Value = Math.sin(2 * Math.PI * p.lfo2Rate * time)
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
