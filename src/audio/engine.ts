import * as Tone from 'tone'
import { DRUM_LANES, type DrumLane, type SynthParams, type TargetPatch, type Track } from '../types'
import { useStore } from '../state/store'

interface SynthChain {
  synth: Tone.PolySynth<Tone.Synth>
  filter: Tone.Filter
  vol: Tone.Volume
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

  async ensureStarted() {
    if (this.ready) return
    await Tone.start()
    this.buildDrums()
    Tone.getDestination().volume.value = -2
    this.ready = true
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

  triggerDrum(lane: DrumLane, time?: number) {
    if (!this.drums) return
    switch (lane) {
      case 'kick':
        this.drums.kick.triggerAttackRelease('C1', '8n', time)
        break
      case 'snare':
        this.drums.snare.triggerAttackRelease('8n', time)
        break
      case 'clap':
        this.drums.clap.triggerAttackRelease('8n', time)
        break
      case 'hat':
        this.drums.hat.triggerAttackRelease(300, '32n', time)
        break
      case 'openhat':
        this.drums.openhat.triggerAttackRelease(300, '16n', time)
        break
    }
  }

  async previewDrum(lane: DrumLane) {
    await this.ensureStarted()
    this.triggerDrum(lane)
  }

  private ensureChain(track: Track): SynthChain {
    let chain = this.chains.get(track.id)
    if (!chain) {
      const filter = new Tone.Filter(track.synth.cutoff, 'lowpass')
      const vol = new Tone.Volume(track.synth.volume)
      const synth = new Tone.PolySynth(Tone.Synth)
      synth.chain(filter, vol, Tone.getDestination())
      chain = { synth, filter, vol }
      this.chains.set(track.id, chain)
    }
    this.applyParams(chain, track.synth)
    return chain
  }

  private applyParams(chain: SynthChain, p: SynthParams) {
    chain.synth.set({
      oscillator: { type: p.osc },
      envelope: { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release },
    })
    chain.filter.frequency.rampTo(p.cutoff, 0.02)
    chain.filter.Q.value = p.resonance
    chain.vol.volume.value = p.volume
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
        chain.filter.dispose()
        chain.vol.dispose()
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

    for (const tr of s.tracks) {
      if (tr.muted) continue
      if (s.arrangement.enabled && s.arrangement.mode === 'energy') {
        const section = Math.floor(bar / s.arrangement.barsPerSection)
        if (!s.arrangement.active[tr.id]?.[section]) continue
      }
      if (tr.kind === 'drums') {
        for (const lane of DRUM_LANES) {
          if (tr.pattern[lane][step % 16]) this.triggerDrum(lane, time)
        }
      } else {
        const chain = this.chains.get(tr.id)
        if (!chain) continue
        const stepSeconds = Tone.Time('16n').toSeconds()
        for (const n of tr.notes) {
          if (n.start === step) {
            const dur = Math.max(n.duration * stepSeconds * 0.9, 0.05)
            chain.synth.triggerAttackRelease(Tone.Frequency(n.pitch, 'midi').toFrequency(), dur, time)
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
    const filter = new Tone.Filter(p.cutoff, 'lowpass')
    filter.Q.value = p.resonance
    const vol = new Tone.Volume(p.volume)
    const synth = new Tone.PolySynth(Tone.Synth)
    synth.set({
      oscillator: { type: p.osc },
      envelope: { attack: p.attack, decay: p.decay, sustain: p.sustain, release: p.release },
    })
    synth.chain(filter, vol, Tone.getDestination())
    const now = Tone.now() + 0.05
    let end = 0
    for (const n of target.phrase) {
      synth.triggerAttackRelease(Tone.Frequency(n.pitch, 'midi').toFrequency(), n.dur, now + n.time)
      end = Math.max(end, n.time + n.dur)
    }
    setTimeout(() => {
      synth.dispose()
      filter.dispose()
      vol.dispose()
    }, (end + p.release + 0.6) * 1000)
  }
}

export const engine = new Engine()
