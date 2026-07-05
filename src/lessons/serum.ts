import { DEFAULT_SYNTH, type SynthParams } from '../types'
import {
  drumTrack,
  fail,
  n,
  notesToPhraseSeconds,
  pass,
  riffOneBar,
  scorePatch,
  synthTrack,
  track,
  type Lesson,
  type Module,
  type ScoreMap,
} from './framework'

// ================= MODULE: SERUM LAB =================
// Everything from the Synthesis and Mixing modules, re-taught in Xfer Serum's vocabulary: each
// lesson practices a technique on BeatLab's engine and says exactly where the same control lives
// in Serum, so the skills carry over the moment a real copy of Serum is open. Concepts BeatLab's
// engine can't literally do (wavetable scanning, warp modes, 16-voice unison) are taught by
// building their nearest equivalent and naming the difference honestly in the summary.

const SERUM = 'Serum Lab'

const patch = (over: Partial<SynthParams>): SynthParams => ({ ...DEFAULT_SYNTH, ...over })

// same tri-state per-param feedback shape as sound.ts's messageFor, local so this module stays
// self-contained the way genres.ts and rhythm.ts keep their own helpers
function matchFeedback(scores: ScoreMap, hints: Partial<Record<keyof SynthParams, string>>, successMsg: string) {
  const entries = Object.entries(scores) as [keyof SynthParams, NonNullable<ScoreMap[keyof SynthParams]>][]
  const wrong = entries.filter(([, v]) => v === 'wrong')
  const close = entries.filter(([, v]) => v === 'close')
  if (wrong.length) {
    return fail('Getting closer — ' + wrong.map(([k]) => hints[k] ?? k).join('; ') + '.', scores)
  }
  if (close.length) {
    return pass(
      successMsg + ` (${close.map(([k]) => hints[k] ?? k).join(', ')} — close enough, that's within earshot.)`,
      scores,
    )
  }
  return pass(successMsg, scores)
}

const PLUCK_NOTES = () => [
  n(57, 0, 2), n(64, 2, 2), n(69, 4, 2), n(72, 6, 2),
  n(69, 8, 2), n(64, 10, 2), n(60, 12, 2), n(64, 14, 2),
]

const PRESET_TARGET = patch({
  osc: 'sawtooth',
  osc2Type: 'sawtooth',
  osc2Level: 0.6,
  osc2Detune: 25,
  cutoff: 1000,
  filterEnvAmount: 0.6,
  filterEnvAttack: 0.005,
  filterEnvDecay: 0.25,
  filterEnvSustain: 0,
  attack: 0.005,
  decay: 0.3,
  sustain: 0.15,
  release: 0.3,
  volume: -12,
})
const PRESET_BPM = 126

const serumLessons: Lesson[] = [
  {
    id: 'serum-four-sources',
    module: SERUM,
    title: 'Serum\'s Layout: Four Sources, One Path',
    summary:
      'Open Serum and the top half of the screen is four sound sources side by side: OSC A, OSC B, SUB and NOISE, all summing into the filter below them. You already own this layout — BeatLab\'s OSC section is Serum\'s OSC A, the OSC 2 panel is OSC B, and SUB and NOISE are literally the same knobs. Same signal path too: sources → filter → envelope → FX. Serum isn\'t a different instrument, it\'s this panel with more waveforms per slot.',
    task: 'Light up all four sources like a full Serum patch: keep OSC A (the OSC section) on SAWTOOTH, set OSC 2 to a DIFFERENT waveform at 30%+ level, SUB at 20%+, and NOISE between 5% and 40%.',
    hints: [
      'In Serum each source has its own on/off light in its panel header — here, a source is "on" whenever its level knob is above zero.',
      'OSC B usually carries a different wavetable than A — that\'s why this task wants a different waveform on OSC 2, not a copy.',
      'Serum\'s NOISE oscillator ships with hundreds of noise files; BeatLab\'s white noise is the plain-vanilla default one.',
    ],
    centerPitch: 46,
    setup: () => ({
      tracks: [synthTrack('synth', 'Init Patch', '#98c379', { osc: 'sawtooth', cutoff: 7000, attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.3, osc2Level: 0, subLevel: 0, noiseLevel: 0 }, riffOneBar(45))],
      loopBars: 1,
      bpm: 120,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push('keep OSC A on SAWTOOTH — it\'s the anchor the other three sources sit around')
      if (p.osc2Level < 0.3) issues.push(`OSC 2 level ${(p.osc2Level * 100).toFixed(0)}% (need ≥ 30% — OSC B has to be audible)`)
      if (p.osc2Level >= 0.3 && p.osc2Type === p.osc) issues.push('give OSC 2 a DIFFERENT waveform than OSC A — in Serum, B usually carries its own wavetable')
      if (p.subLevel < 0.2) issues.push(`sub ${(p.subLevel * 100).toFixed(0)}% (need ≥ 20%)`)
      if (p.noiseLevel < 0.05 || p.noiseLevel > 0.4) issues.push(`noise ${(p.noiseLevel * 100).toFixed(0)}% (need 5–40% — texture, not hiss)`)
      if (issues.length) return fail('Not a full Serum top panel yet — ' + issues.join('; ') + '.')
      return pass('OSC A, OSC B, SUB, NOISE — all four lit, all summing into one filter. You just walked Serum\'s entire top half; everything else in Serum is modulation and FX for these four sources.')
    },
  },
  {
    id: 'serum-wavetable-pos',
    module: SERUM,
    title: 'Wavetables & the WT POS Knob',
    summary:
      'Serum\'s headline feature: its oscillators don\'t hold ONE wave shape, they hold a WAVETABLE — a flipbook of up to 256 single-cycle waves — and the WT POS knob scans through the frames, morphing the timbre as it moves. BeatLab\'s oscillator has four fixed shapes, but you can hand-build one frame-crossfade: two oscillators, two different shapes, ZERO detune, blended. That blend knob IS a two-frame WT POS.',
    task: 'Build the halfway frame: OSC A on SINE, OSC 2 on SAWTOOTH with DETUNE at 0 (within ±5 cents) so the two fuse into one new shape, and OSC 2 LEVEL between 35% and 65% — parked mid-morph between the two frames.',
    hints: [
      'Zero detune is the whole point: with no beating, your ear reads the sum as ONE fused waveform instead of two instruments playing together.',
      'Sweep OSC 2\'s level from 0% to 100% while the note holds — that slow sine-into-saw morph is exactly what dragging WT POS does in Serum.',
      'In Serum you\'d rarely turn WT POS by hand — you\'d drop an LFO or envelope on it and let the timbre move by itself. That\'s the next few lessons.',
    ],
    centerPitch: 48,
    setup: () => ({
      tracks: [synthTrack('synth', 'Morph', '#61afef', { osc: 'sine', cutoff: 9000, attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.4, osc2Type: 'sawtooth', osc2Level: 0, osc2Detune: 12, volume: -10 }, [n(45, 0, 16), n(52, 0, 16)])],
      loopBars: 1,
      bpm: 100,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'sine') issues.push('OSC A should be SINE — frame 1 of your hand-built wavetable')
      if (p.osc2Type !== 'sawtooth') issues.push('OSC 2 should be SAWTOOTH — frame 2')
      if (Math.abs(p.osc2Detune) > 5) issues.push(`detune ${p.osc2Detune.toFixed(0)}c (needs to be 0, within ±5 — any beating and the two shapes stop fusing into one)`)
      if (p.osc2Level < 0.35 || p.osc2Level > 0.65) issues.push(`OSC 2 level ${(p.osc2Level * 100).toFixed(0)}% (need 35–65% — parked halfway through the morph)`)
      if (issues.length) return fail('Not morphing yet — ' + issues.join('; ') + '.')
      return pass('One fused shape, halfway between sine and saw — you just hand-cranked a wavetable position. Serum stores 256 of those in-between frames per table and gives you one knob (WT POS) to surf them.')
    },
  },
  {
    id: 'serum-supersaw',
    module: SERUM,
    title: 'Unison: The Serum Supersaw',
    summary:
      'Under each Serum oscillator sit three numbers that define modern EDM: UNISON (how many copies of the wave play at once, up to 16), DETUNE (how far the copies spread in pitch) and BLEND (center voice vs. outer voices). BeatLab\'s 3-voice unison is the same physics at demo scale: main voice, plus OSC 2 mirrored up and down. The recipe below is, step for step, how every trance and future-bass lead starts life in Serum.',
    task: 'Serum-ify this thin lead: UNISON to 3 voices, BOTH oscillators on SAW, DETUNE between 15 and 45 cents, OSC 2 LEVEL 50%+, CUTOFF at 5 kHz or brighter, ATTACK ≤ 20ms.',
    hints: [
      'In Serum this exact move reads: UNISON 7, DETUNE 0.15–0.25, BLEND around 75% — bigger numbers, identical idea.',
      'Detune under ~15 cents just sounds like volume; past ~45 it splits into separate pitches. The supersaw shimmer lives in between.',
      'A supersaw wants to be bright — if the cutoff chokes it below 5 kHz the detune shimmer has no harmonics to shimmer with.',
    ],
    centerPitch: 64,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Lead', '#c678dd', { osc: 'sawtooth', cutoff: 3000, attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.3, osc2Type: 'sawtooth', osc2Level: 0.2, osc2Detune: 8, unisonVoices: 1, volume: -12 }, riffOneBar(64)),
        drumTrack({ kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }),
      ],
      loopBars: 1,
      bpm: 138,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.unisonVoices < 3) issues.push(`unison at ${p.unisonVoices} voice(s) (need 3 — the full stack)`)
      if (p.osc !== 'sawtooth' || p.osc2Type !== 'sawtooth') issues.push('both oscillators on SAW — it\'s called a superSAW for a reason')
      if (p.osc2Detune < 15 || p.osc2Detune > 45) issues.push(`detune ${p.osc2Detune.toFixed(0)}c (need 15–45 — the shimmer zone)`)
      if (p.osc2Level < 0.5) issues.push(`OSC 2 level ${(p.osc2Level * 100).toFixed(0)}% (need ≥ 50% so the outer voices carry real weight)`)
      if (p.cutoff < 5000) issues.push(`cutoff ${Math.round(p.cutoff)} Hz (need ≥ 5 kHz — supersaws are bright by definition)`)
      if (p.attack > 0.02) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 20ms)`)
      if (issues.length) return fail('Not super yet — ' + issues.join('; ') + '.')
      return pass('That is the supersaw — the single most-used Serum sound in existence. In Serum, crank UNISON past 3 (try 7) and pull BLEND back and it only gets wider; the recipe you just built never changes.')
    },
  },
  {
    id: 'serum-env2-pluck',
    module: SERUM,
    title: 'ENV 2 → Cutoff: Serum\'s Drag-and-Drop Pluck',
    summary:
      'Serum\'s modulation workflow is its second superpower: ENV 1 is hardwired to volume (your amp ADSR), but ENV 2 and 3 are free agents — you literally DRAG the "ENV 2" label onto any knob and a colored ring appears showing how far it pushes. BeatLab\'s FILTER ENV section is that exact route pre-wired: a second ADSR aimed at the cutoff. The most famous thing anyone does with it is the Serum pluck — the melodic stab in half of all future bass, chillstep and pop-EDM drops.',
    task: 'Build the Serum pluck: base CUTOFF ≤ 1200 Hz, FILTER ENV AMOUNT ≥ 50%, its ATTACK ≤ 20ms, DECAY between 100 and 500ms, SUSTAIN ≤ 0.2 — over an amp envelope with ATTACK ≤ 10ms and SUSTAIN ≤ 0.3.',
    hints: [
      'Two envelopes, two jobs: the amp envelope makes the note short; the filter envelope makes it go "bright then dark". The pluck needs both.',
      'In Serum you\'d drag ENV 2 onto the CUTOFF knob and set the ring size — the ring IS this Amount knob.',
      'The dark base cutoff matters: the envelope sweeps UP from wherever the cutoff sits, so a bright base leaves it nowhere to go.',
    ],
    centerPitch: 64,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Pluck', '#f7c948', { osc: 'sawtooth', cutoff: 900, resonance: 1.5, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.3, filterEnvAmount: 0, filterEnvAttack: 0.01, filterEnvDecay: 0.2, filterEnvSustain: 0.3, filterEnvRelease: 0.2, volume: -10 }, PLUCK_NOTES()),
        drumTrack({ kick: [0, 4, 8, 12] }),
      ],
      loopBars: 1,
      bpm: 126,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.cutoff > 1200) issues.push(`base cutoff ${Math.round(p.cutoff)} Hz (need ≤ 1200 — start dark so the envelope has somewhere to sweep)`)
      if (p.filterEnvAmount < 0.5) issues.push(`filter env amount ${(p.filterEnvAmount * 100).toFixed(0)}% (need ≥ 50%)`)
      if (p.filterEnvAttack > 0.02) issues.push(`filter env attack ${(p.filterEnvAttack * 1000).toFixed(0)}ms (need ≤ 20ms — the brightness must hit instantly)`)
      if (p.filterEnvDecay < 0.1 || p.filterEnvDecay > 0.5) issues.push(`filter env decay ${(p.filterEnvDecay * 1000).toFixed(0)}ms (need 100–500ms — the fade back to dark)`)
      if (p.filterEnvSustain > 0.2) issues.push(`filter env sustain ${p.filterEnvSustain.toFixed(2)} (need ≤ 0.2 — the sweep must fully close)`)
      if (p.attack > 0.01) issues.push(`amp attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 10ms)`)
      if (p.sustain > 0.3) issues.push(`amp sustain ${p.sustain.toFixed(2)} (need ≤ 0.3 — plucks don't hold)`)
      if (issues.length) return fail('Not plucking yet — ' + issues.join('; ') + '.')
      return pass('Bright-then-dark on every hit, gone before the next one — the Serum pluck. In Serum that whole sound is one drag: ENV 2 onto CUTOFF, ring to taste, decay to taste.')
    },
  },
  {
    id: 'serum-lfo-sync',
    module: SERUM,
    title: 'LFOs in Divisions, Not Hz',
    summary:
      'Serum\'s four LFOs drag onto knobs exactly like the envelopes — but their defining habit is the BPM button: when it\'s lit (and it\'s lit by default), the rate knob stops reading in Hz and reads in NOTE DIVISIONS — 1/4, 1/8, 1/16, triplets, dotted. Synced modulation breathes with the track at any tempo, which is why Serum producers almost never turn it off. BeatLab\'s LFO has the same SYNC switch.',
    task: 'Aim the LFO at CUTOFF, switch SYNC on, set the division to 1/8, and push DEPTH to 40%+ — then audition 1/4 and 1/16 and hear the wobble stay locked to the drums at every speed.',
    hints: [
      'Unsynced Hz drifts against the beat; a synced 1/8 lands exactly two wubs per beat, forever, at any BPM.',
      'The division dropdown replaces the Rate knob\'s meaning while sync is on — same as Serum\'s rate knob switching units when BPM is lit.',
      'Triplet (t) and dotted (d) divisions are how wobbles get that lopsided, rolling feel — try 1/8t against these drums.',
    ],
    centerPitch: 38,
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] }),
        synthTrack('synth', 'Wub', '#98c379', { osc: 'sawtooth', cutoff: 2000, resonance: 3, attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.3, lfoDest: 'off', lfoDepth: 0, lfoSync: false, lfoSyncRate: '1/4', volume: -9 }, [n(31, 0, 16)]),
      ],
      loopBars: 1,
      bpm: 126,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.lfoDest !== 'cutoff') issues.push(`LFO destination is ${p.lfoDest.toUpperCase()} (aim it at CUTOFF)`)
      if (!p.lfoSync) issues.push('SYNC is off — flip it on so the rate reads in note divisions instead of Hz')
      if (p.lfoSync && p.lfoSyncRate !== '1/8') issues.push(`division is ${p.lfoSyncRate} (set 1/8 — two wubs per beat — then explore from there)`)
      if (p.lfoDepth < 0.4) issues.push(`depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 40% to hear the swing)`)
      if (issues.length) return fail('Not locked yet — ' + issues.join('; ') + '.')
      return pass('Two wubs per beat, welded to the kick at any tempo — that\'s why Serum\'s LFOs ship with BPM sync already on. Hz is for when you WANT modulation to drift free of the grid.')
    },
  },
  {
    id: 'serum-growl',
    module: SERUM,
    title: 'The Serum Growl Bass',
    summary:
      'The sound Serum is famous for in bass music: the growl. Every real growl is three layers of trouble stacked — MOVEMENT (a synced LFO sweeping the timbre), NEW HARMONICS (in Serum, a warp mode like FM (from B) mangling OSC A), and DRIVE (the FX-tab distortion smashing the result). BeatLab translation: synced LFO → cutoff for the movement, the FM voice for the snarl, distortion for the aggression.',
    task: 'Growl: LFO → CUTOFF with SYNC on and DEPTH ≥ 50%; RESONANCE ≥ 3 so the sweep vowels; FM LEVEL ≥ 40% with MOD INDEX ≥ 6 for the snarl; DISTORTION drive ≥ 30% with mix ≥ 30%.',
    hints: [
      'Build it in that order and listen at each step: wobble first, then FM on top of it, then distortion over everything — each layer multiplies the previous one.',
      'Non-whole FM harmonicity (try 2.5 or 3.5) makes the snarl nastier — clangorous beats polite in bass music.',
      'In Serum the same stack reads: LFO 1 → WT POS (or cutoff), Warp = FM (from B), then Distortion in the FX tab. Three panels, one monster.',
    ],
    centerPitch: 34,
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0], snare: [8] }),
        synthTrack('synth', 'Growl', '#e06c75', { osc: 'sawtooth', cutoff: 1500, resonance: 2, attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.2, lfoDest: 'off', lfoDepth: 0, lfoSync: false, lfoSyncRate: '1/8', fmLevel: 0, fmHarmonicity: 2, fmModIndex: 5, volume: -9 }, [n(28, 0, 16)]),
      ],
      loopBars: 1,
      bpm: 140,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.lfoDest !== 'cutoff') issues.push('LFO → CUTOFF for the wobble movement')
      if (!p.lfoSync) issues.push('LFO SYNC on — a growl that drifts off the grid is just noise')
      if (p.lfoDepth < 0.5) issues.push(`LFO depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 50%)`)
      if (p.resonance < 3) issues.push(`resonance ${p.resonance.toFixed(1)} (need ≥ 3 — the peak is what makes the sweep talk)`)
      if (p.fmLevel < 0.4) issues.push(`FM level ${(p.fmLevel * 100).toFixed(0)}% (need ≥ 40% for the snarl)`)
      if (p.fmModIndex < 6) issues.push(`FM mod index ${p.fmModIndex.toFixed(1)} (need ≥ 6 — real harmonic violence)`)
      if (p.distortionAmount < 0.3) issues.push(`distortion drive ${(p.distortionAmount * 100).toFixed(0)}% (need ≥ 30%)`)
      if (p.distortionMix < 0.3) issues.push(`distortion mix ${(p.distortionMix * 100).toFixed(0)}% (need ≥ 30%)`)
      if (issues.length) return fail('Not growling yet — ' + issues.join('; ') + '.')
      return pass('Movement, harmonics, drive — stacked, that\'s a growl. Every "how is that bass made" Serum tutorial is some version of the three layers you just wired by hand.')
    },
  },
  {
    id: 'serum-fx-chain',
    module: SERUM,
    title: 'The FX Tab: Order Is the Sound',
    summary:
      'Serum\'s second page is an FX rack — Distortion, EQ, Compressor, Reverb and friends — and you drag them into any ORDER, because order changes everything: EQ before distortion shapes what gets distorted; EQ after distortion cleans up what the distortion created. BeatLab\'s insert rack (the EQ / COMP / DIST block with the ⇄ arrows) reorders exactly the same way.',
    task: 'Make this distorted lead mix-ready the Serum way: move DIST to the FIRST slot in the chain, drive ≥ 40% with dist mix ≥ 50%, then use the EQ sitting AFTER it to tame the fizz — HIGH band at -4 dB or below.',
    hints: [
      'A/B the same settings with dist first vs. dist last — the EQ cut only touches the distortion\'s fizz when it comes AFTER the distortion.',
      'This (distortion early, EQ late) is the standard Serum FX-tab order in almost every factory preset — saturate, then civilize.',
      'The ⇄ arrows between the EQ/COMP/DIST section headers swap their chain positions.',
    ],
    centerPitch: 64,
    setup: () => ({
      tracks: [synthTrack('synth', 'Lead', '#c678dd', { osc: 'sawtooth', cutoff: 6000, attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2, distortionAmount: 0, distortionMix: 0, insertOrder: ['eq', 'comp', 'dist'], volume: -10 }, riffOneBar(64))],
      loopBars: 1,
      bpm: 120,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.insertOrder[0] !== 'dist') issues.push(`DIST is in slot ${p.insertOrder.indexOf('dist') + 1} (drag it to slot 1 so the EQ works on the distorted signal)`)
      if (p.distortionAmount < 0.4) issues.push(`drive ${(p.distortionAmount * 100).toFixed(0)}% (need ≥ 40%)`)
      if (p.distortionMix < 0.5) issues.push(`dist mix ${(p.distortionMix * 100).toFixed(0)}% (need ≥ 50%)`)
      if (p.eqHigh > -4) issues.push(`EQ high ${p.eqHigh.toFixed(1)}dB (cut to ≤ -4dB — shave the fizz the distortion created)`)
      if (issues.length) return fail('Chain\'s not right yet — ' + issues.join('; ') + '.')
      return pass('Saturate, then civilize — distortion first, EQ after, cleaning up the harmonics the drive created. In Serum you\'d drag the effect tiles into this order on the FX page; the reasoning never changes.')
    },
  },
  {
    id: 'match-serum-preset',
    module: SERUM,
    title: 'Match: Reverse-Engineer the Preset',
    summary:
      'The skill that makes Serum\'s preset packs a school instead of a crutch: open a preset you love, and instead of just playing it, figure out WHY it sounds like that. This mystery patch is built entirely from this module\'s moves — some unison width, a filter-envelope shape, a pluck envelope. Hear each layer, then rebuild it.',
    task: 'Press PLAY TARGET, then recreate the preset: the OSC 2 width (level and detune), the base cutoff, the filter-envelope movement (amount and decay), and whether the amp sustains.',
    hints: [
      'Checklist like a preset detective: wide or narrow? (unison/detune) — bright or dark? (cutoff) — does the brightness MOVE per note? (filter env) — does the note hold? (amp sustain).',
      'The per-note "bright then dark" sweep is the filter envelope talking — match its size first (amount), then how fast it closes (decay).',
      'A/B relentlessly: your loop, then the target. The gap you hear is always one specific knob.',
    ],
    centerPitch: 64,
    target: { params: PRESET_TARGET, phrase: notesToPhraseSeconds(PLUCK_NOTES(), PRESET_BPM) },
    setup: () => ({
      tracks: [synthTrack('synth', 'Mystery Preset', '#61afef', { osc: 'sawtooth', osc2Type: 'sawtooth', osc2Level: 0, osc2Detune: 10, cutoff: 4000, filterEnvAmount: 0, filterEnvAttack: 0.01, filterEnvDecay: 0.2, filterEnvSustain: 0, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.3, volume: -12 }, PLUCK_NOTES())],
      loopBars: 1,
      bpm: PRESET_BPM,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const got = track(ctx, 'synth').synth
      const scores = scorePatch(got, PRESET_TARGET, ['osc2Level', 'osc2Detune', 'cutoff', 'filterEnvAmount', 'filterEnvDecay', 'sustain'])
      return matchFeedback(
        scores,
        {
          osc2Level: 'width: the target has a second detuned layer yours is missing — raise OSC 2\'s level',
          osc2Detune: 'shimmer: the detune spread doesn\'t match — enough to beat, not enough to split',
          cutoff: 'base brightness: where the filter RESTS between envelope hits doesn\'t match',
          filterEnvAmount: 'movement: the per-note sweep is a different size than yours',
          filterEnvDecay: 'movement speed: how fast the brightness falls back doesn\'t match',
          sustain: 'length: listen to whether the target holds or dies out while a note is held',
        },
        'Preset cracked — width, brightness, movement and envelope, all identified by ear. Do this to three factory presets in the real Serum and you\'ll learn more than a month of tutorials.',
      )
    },
  },
  {
    id: 'serum-init-capstone',
    module: SERUM,
    title: 'Capstone: Init Patch to Finished Lead',
    summary:
      'Every Serum sound-design video starts the same way: "okay, init patch" — one plain saw, filter off, nothing moving. The pros then work in the same order every time: SOURCES → FILTER → ENVELOPES → MODULATION → FX. This capstone is that entire workflow on one patch. The synth below is a genuine init: one saw, wide open, static. Turn it into a finished lead, stage by stage.',
    task: 'Build in Serum order — (1) SOURCES: unison 3, both saws, detune 15–45c, OSC 2 ≥ 40%, sub ≥ 15%. (2) FILTER: cutoff between 800 Hz and 6 kHz. (3) ENVELOPES: attack ≤ 20ms, sustain 0.4–0.9. (4) MODULATION: filter env amount ≥ 30%. (5) FX: reverb send ≥ 15%, delay send ≥ 5%.',
    hints: [
      'Check My Work grades the stages in order and tells you which one you\'re on — finish each before touching the next, like the pros do.',
      'Stage 4 is what separates a preset from a sound: static patches die on a loop; even 30% of filter-envelope movement makes every note breathe.',
      'This exact order — source, filter, envelope, modulation, FX — is the top-to-bottom, left-to-right layout of Serum\'s own screen. The UI is the workflow.',
    ],
    centerPitch: 64,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Init', '#98c379', { osc: 'sawtooth', cutoff: 12000, resonance: 0.8, attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, osc2Type: 'sawtooth', osc2Level: 0, osc2Detune: 10, subLevel: 0, filterEnvAmount: 0, sendReverb: 0, sendDelay: 0, volume: -11 }, PLUCK_NOTES()),
        drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] }),
      ],
      loopBars: 1,
      bpm: 126,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth

      const src: string[] = []
      if (p.unisonVoices < 3) src.push('unison to 3 voices')
      if (p.osc !== 'sawtooth' || p.osc2Type !== 'sawtooth') src.push('both oscillators on SAW')
      if (p.osc2Detune < 15 || p.osc2Detune > 45) src.push(`detune 15–45c (at ${p.osc2Detune.toFixed(0)}c)`)
      if (p.osc2Level < 0.4) src.push(`OSC 2 ≥ 40% (at ${(p.osc2Level * 100).toFixed(0)}%)`)
      if (p.subLevel < 0.15) src.push(`sub ≥ 15% (at ${(p.subLevel * 100).toFixed(0)}%)`)
      if (src.length) return fail('Stage 1/5 (sources): ' + src.join('; ') + '.')

      if (p.cutoff < 800 || p.cutoff > 6000)
        return fail(`Stage 2/5 (filter): cutoff ${Math.round(p.cutoff)} Hz — park it between 800 Hz and 6 kHz so the lead sits in the mix instead of sawing heads off.`)

      const env: string[] = []
      if (p.attack > 0.02) env.push(`attack ≤ 20ms (at ${(p.attack * 1000).toFixed(0)}ms)`)
      if (p.sustain < 0.4 || p.sustain > 0.9) env.push(`sustain 0.4–0.9 (at ${p.sustain.toFixed(2)}) — a lead holds its notes`)
      if (env.length) return fail('Stage 3/5 (envelopes): ' + env.join('; ') + '.')

      if (p.filterEnvAmount < 0.3)
        return fail(`Stage 4/5 (modulation): filter env amount ${(p.filterEnvAmount * 100).toFixed(0)}% — give it ≥ 30% so every note moves instead of sitting still.`)

      const fx: string[] = []
      if (p.sendReverb < 0.15) fx.push(`reverb send ≥ 15% (at ${(p.sendReverb * 100).toFixed(0)}%)`)
      if (p.sendDelay < 0.05) fx.push(`delay send ≥ 5% (at ${(p.sendDelay * 100).toFixed(0)}%)`)
      if (fx.length) return fail('Stage 5/5 (FX): ' + fx.join('; ') + '.')

      return pass(
        'Init to finished lead, five stages, zero presets. That order — sources, filter, envelopes, modulation, FX — is the whole craft of Serum sound design; the plugin just gives you bigger numbers to do it with.',
      )
    },
  },
]

export const SERUM_MODULES: Module[] = [{ name: SERUM, lessons: serumLessons }]
