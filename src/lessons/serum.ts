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
// in Serum, so the skills carry over the moment a real copy of Serum is open. Wave 3 gave the
// engine a real wavetable oscillator (WT POS scanning), a drawable LFO shape, and 5/7-voice
// stereo unison, so those lessons teach the real thing; concepts the engine still can't do
// (warp modes, audio-rate modulation) are taught by nearest-equivalent and named honestly.

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
      'Serum\'s headline feature: its oscillators don\'t hold ONE wave shape, they hold a WAVETABLE — a whole book of spectra — and the WT POS knob scans through it, morphing the timbre as it moves. BeatLab\'s main oscillator has a real one: click WT and three tables appear. ANALOG morphs sine → triangle → saw → square; PWM narrows a square into a thin nasal pulse; VOCAL sweeps two formant peaks like a mouth changing vowels.',
    task: 'Switch OSC A to WT, audition all three tables while the note holds (drag WT POS slowly through each), then park it on the VOCAL table with WT POS between 35% and 65% — mid-vowel.',
    hints: [
      'Hold a note first, THEN drag WT POS — the whole point is hearing the timbre morph under your finger.',
      'WT POS at 0% and 100% are just the table\'s endpoints; the sounds nobody else has live in between.',
      'In Serum you\'d rarely turn WT POS by hand — you\'d drop an LFO or envelope on it and let the timbre move by itself. That\'s the next lesson.',
    ],
    centerPitch: 48,
    setup: () => ({
      tracks: [synthTrack('synth', 'Morph', '#61afef', { osc: 'sine', cutoff: 9000, attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.4, volume: -10 }, [n(45, 0, 16), n(52, 0, 16)])],
      loopBars: 1,
      bpm: 100,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'wavetable') issues.push('OSC A is still a fixed shape — click WT to load the wavetable oscillator')
      if (p.osc === 'wavetable' && p.wtTable !== 'vocal') issues.push(`table is ${p.wtTable.toUpperCase()} (park on VOCAL for this one — but did you hear what the other two do?)`)
      if (p.osc === 'wavetable' && (p.wtPos < 0.35 || p.wtPos > 0.65)) issues.push(`WT POS at ${(p.wtPos * 100).toFixed(0)}% (park 35–65% — mid-morph, between the vowels)`)
      if (issues.length) return fail('Not morphing yet — ' + issues.join('; ') + '.')
      return pass('That knob is why Serum took over sound design: one continuous timbre axis per oscillator. Serum\'s tables hold up to 256 frames and you can draw or import your own — but the skill of PARKING a position by ear is exactly this.')
    },
  },
  {
    id: 'serum-wt-scan',
    module: SERUM,
    title: 'LFO → WT POS: Motion Sound Design',
    summary:
      'Parking WT POS gives you a sound; MODULATING it gives you sound design. In Serum the move is one drag — the LFO 1 tile onto the WT POS knob — and it\'s the engine behind most modern growls, talking basses and evolving pads: the spectrum itself moves, not just the filter in front of it. BeatLab\'s LFO now has a WT destination that does the same scan.',
    task: 'OSC A on WT (any table), then aim the LFO at WT, switch SYNC on with a slow division (1/1 or 1/2), and push DEPTH to 40%+ — the timbre should visibly breathe through the table once per bar or two.',
    hints: [
      'This is NOT the filter wobble from the mixing module — the filter darkens what\'s there; WT scanning changes what the oscillator IS.',
      'VOCAL table + slow LFO = the classic talking pad. PWM + faster LFO = vintage string-machine shimmer.',
      'Static WT POS sets the center of the scan; DEPTH sets how far around it the LFO swings.',
    ],
    centerPitch: 48,
    target: { params: patch({ osc: 'wavetable', wtTable: 'vocal', wtPos: 0.5, resonance: 2.75, cutoff: 10007, attack: 0.15, decay: 0.3, sustain: 0.85, release: 0.8, lfoDest: 'wtPos', lfoDepth: 0.6, lfoSync: true, lfoSyncRate: '1/1', sendReverb: 0.28, volume: -10 }), phrase: notesToPhraseSeconds([n(45, 0, 16), n(52, 0, 16)], 110) },
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Motion', '#61afef', { osc: 'wavetable', wtTable: 'vocal', wtPos: 0.5, cutoff: 9000, attack: 0.15, decay: 0.3, sustain: 0.85, release: 0.8, lfoDest: 'off', lfoDepth: 0, lfoSync: false, volume: -10 }, [n(45, 0, 16), n(52, 0, 16)]),
        drumTrack({ kick: [0, 4, 8, 12] }),
      ],
      loopBars: 1,
      bpm: 110,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'wavetable') issues.push('OSC A must be WT — there\'s no table to scan otherwise')
      if (p.lfoDest !== 'wtPos') issues.push(`LFO destination is ${p.lfoDest.toUpperCase()} (aim it at WT)`)
      if (!p.lfoSync) issues.push('SYNC is off — a scan that breathes with the track needs a note division')
      if (p.lfoSync && p.lfoSyncRate !== '1/1' && p.lfoSyncRate !== '1/2') issues.push(`division is ${p.lfoSyncRate} (use 1/1 or 1/2 — evolving timbre wants slow motion)`)
      if (p.lfoDepth < 0.4) issues.push(`depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 40% to sweep a real distance through the table)`)
      if (issues.length) return fail('Not moving yet — ' + issues.join('; ') + '.')
      return pass('The spectrum itself is breathing — that\'s the sound-design move that separates a preset user from a preset maker. In Serum: drag LFO 1 onto WT POS, done. Every growl bass tutorial on the internet starts here.')
    },
  },
  {
    id: 'serum-draw-wavetable',
    module: SERUM,
    title: 'Draw Your Own Wavetable',
    summary:
      'Serum\'s deepest rabbit hole: double-click an oscillator and you\'re in the wavetable EDITOR, drawing the actual wave. BeatLab\'s DRAW table is that idea at learning scale — sketch frame A, sketch frame B, and WT POS morphs between them. Watch the yellow waveform view while you scan: that\'s not an illustration, it\'s the exact cycle the oscillator is producing. Jagged drawings = buzzy spectra; smooth drawings = mellow. Your hand is now designing the harmonics.',
    task: 'OSC A on WT, table on DRAW, then make the two frames genuinely DIFFERENT instruments: draw frame A smooth and frame B jagged (or vice versa), each using most of the vertical range, and park WT POS between 25% and 75% so you\'re playing a wave that exists in neither drawing.',
    hints: [
      'Hold a note while you draw — every stroke changes the sound live. Sharp corners and zigzags create high harmonics; gentle curves stay pure.',
      'Draw something absurd on purpose (a staircase, your initials) and listen. This is how sound designers actually explore — the ear finds things the theory wouldn\'t suggest.',
      'The next-level move you already know: LFO → WT to sweep between your two drawings in rhythm. Your own drawings, talking.',
    ],
    centerPitch: 48,
    setup: () => ({
      tracks: [synthTrack('synth', 'Draw', '#56b6c2', { osc: 'wavetable', wtTable: 'analog', wtPos: 0.5, cutoff: 9000, attack: 0.01, decay: 0.2, sustain: 0.85, release: 0.4, volume: -10 }, [n(45, 0, 16), n(52, 0, 16)])],
      loopBars: 1,
      bpm: 100,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'wavetable') issues.push('OSC A must be WT')
      if (p.osc === 'wavetable' && p.wtTable !== 'custom') issues.push('table must be DRAW — the other tables are pre-drawn for you')
      if (p.osc === 'wavetable' && p.wtTable === 'custom') {
        const span = (arr: number[]) => Math.max(...arr) - Math.min(...arr)
        if (span(p.wtCustomA) < 0.8) issues.push('frame A barely moves — use most of the vertical range (quiet drawings make quiet waves)')
        if (span(p.wtCustomB) < 0.8) issues.push('frame B barely moves — use most of the vertical range')
        const diff = p.wtCustomA.reduce((s, v, i) => s + Math.abs(v - (p.wtCustomB[i] ?? 0)), 0) / p.wtCustomA.length
        if (diff < 0.25) issues.push('A and B are nearly the same drawing — the morph needs two different instruments to travel between')
        if (p.wtPos < 0.25 || p.wtPos > 0.75) issues.push(`WT POS at ${(p.wtPos * 100).toFixed(0)}% (park 25–75% — the interesting wave is the one you DIDN\'T draw)`)
      }
      if (issues.length) return fail('Keep sketching — ' + issues.join('; ') + '.')
      return pass('You just designed a timbre no preset pack contains — and heard the in-between wave neither of your hands drew. In Serum\'s editor you\'d add more frames and draw harmonics directly on the spectrum; the instinct you just built is the whole skill.')
    },
  },
  {
    id: 'serum-supersaw',
    module: SERUM,
    title: 'Unison: The Serum Supersaw',
    summary:
      'Under each Serum oscillator sit the numbers that define modern EDM: UNISON (how many copies of the wave play at once, up to 16), DETUNE (how far the copies spread in pitch) and WIDTH (how far the copies spread in STEREO). BeatLab\'s unison now stacks up to 7 voices — outer pairs come in quieter and wider-detuned, exactly Serum\'s taper — with a WIDTH knob panning the pairs out left and right. The recipe below is, step for step, how every trance and future-bass lead starts life in Serum.',
    task: 'Serum-ify this thin lead: UNISON to 5 or 7 voices, BOTH oscillators on SAW, DETUNE between 15 and 45 cents, OSC 2 LEVEL 50%+, WIDTH at 30%+, CUTOFF at 5 kHz or brighter, ATTACK ≤ 20ms.',
    hints: [
      'In Serum this exact move reads: UNISON 7, DETUNE 0.15–0.25, WIDTH ~75% — same knobs, same physics.',
      'Detune under ~15 cents just sounds like volume; past ~45 it splits into separate pitches. The supersaw shimmer lives in between.',
      'Toggle WIDTH between 0% and 70% while the loop plays (headphones!) — mono vs. wall-of-sound is the whole trance-lead trick.',
      'A supersaw wants to be bright — if the cutoff chokes it below 5 kHz the detune shimmer has no harmonics to shimmer with.',
    ],
    centerPitch: 64,
    target: { params: patch({ osc: 'sawtooth', osc2Type: 'sawtooth', osc2Level: 0.6, osc2Detune: 21.9, unisonVoices: 7, unisonWidth: 0.5, cutoff: 12458, resonance: 3.29, attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.175, volume: -12 }), phrase: notesToPhraseSeconds(riffOneBar(64), 138) },
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
      if (p.unisonVoices < 5) issues.push(`unison at ${p.unisonVoices} voice(s) (need 5 or 7 — the real stack)`)
      if (p.osc !== 'sawtooth' || p.osc2Type !== 'sawtooth') issues.push('both oscillators on SAW — it\'s called a superSAW for a reason')
      if (p.osc2Detune < 15 || p.osc2Detune > 45) issues.push(`detune ${p.osc2Detune.toFixed(0)}c (need 15–45 — the shimmer zone)`)
      if (p.osc2Level < 0.5) issues.push(`OSC 2 level ${(p.osc2Level * 100).toFixed(0)}% (need ≥ 50% so the outer voices carry real weight)`)
      if (p.unisonWidth < 0.3) issues.push(`width ${(p.unisonWidth * 100).toFixed(0)}% (need ≥ 30% — a mono supersaw is half a supersaw)`)
      if (p.cutoff < 5000) issues.push(`cutoff ${Math.round(p.cutoff)} Hz (need ≥ 5 kHz — supersaws are bright by definition)`)
      if (p.attack > 0.02) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 20ms)`)
      if (issues.length) return fail('Not super yet — ' + issues.join('; ') + '.')
      return pass('That is the supersaw — the single most-used Serum sound in existence, voices fanned across the stereo field just like Serum draws them. Same recipe there: UNISON 7, DETUNE to taste, WIDTH out.')
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
    target: { params: patch({ osc: 'sawtooth', cutoff: 666, resonance: 1.71, attack: 0.005, decay: 0.321, sustain: 0.2, release: 0.385, filterEnvAmount: 0.61, filterEnvAttack: 0.01, filterEnvDecay: 0.157, filterEnvSustain: 0.1, filterEnvRelease: 0.2, sendReverb: 0.11, volume: -10 }), phrase: notesToPhraseSeconds(PLUCK_NOTES(), 126) },
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
    id: 'serum-draw-lfo',
    module: SERUM,
    title: 'Draw Your Own LFO',
    summary:
      'Serum\'s LFOs aren\'t stuck on sine — the LFO panel is a little EDITOR where you draw the shape: ramps, steps, lopsided humps, silence-then-spike. That drawing IS the rhythm of the wobble, which is why dubstep and future-bass producers spend more time in the LFO editor than anywhere else. BeatLab\'s LFO has the same move: hit ✎ DRAW and sketch 16 steps.',
    task: 'Aim the LFO at CUTOFF, SYNC on at 1/1 (the drawing spreads over one bar), DEPTH 50%+, then hit ✎ DRAW and sketch a shape with real contrast — at least a 40% gap between its highest and lowest steps. Make the filter TALK.',
    hints: [
      'A slow descending staircase = the classic "yoy yoy" wobble. A spike on step 1 that dies flat = a pump. Try both.',
      'The drawing loops: step 16 flows straight back into step 1, so think of it as a circle, not a line.',
      'Flat drawings do nothing — the LFO only moves the cutoff as far as the shape itself moves.',
    ],
    centerPitch: 38,
    target: { params: patch({ osc: 'sawtooth', cutoff: 1091, resonance: 4, attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.3, lfoDest: 'cutoff', lfoShape: 'custom', lfoSteps: Array.from({ length: 16 }, (_, i) => 1 - i / 15), lfoSync: true, lfoSyncRate: '1/1', lfoDepth: 0.58, distortionAmount: 0.46, distortionMix: 0.15, sendDelay: 0.04, volume: -9 }), phrase: notesToPhraseSeconds([n(31, 0, 16)], 126) },
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] }),
        synthTrack('synth', 'Talker', '#e06c75', { osc: 'sawtooth', cutoff: 1500, resonance: 4, attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.3, lfoDest: 'cutoff', lfoDepth: 0.6, lfoSync: true, lfoSyncRate: '1/1', lfoShape: 'sine', volume: -9 }, [n(31, 0, 16)]),
      ],
      loopBars: 1,
      bpm: 126,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.lfoDest !== 'cutoff') issues.push(`LFO destination is ${p.lfoDest.toUpperCase()} (aim it at CUTOFF)`)
      if (p.lfoShape !== 'custom') issues.push('still on the sine — hit ✎ DRAW to open the shape editor')
      if (p.lfoShape === 'custom') {
        const span = Math.max(...p.lfoSteps) - Math.min(...p.lfoSteps)
        if (span < 0.4) issues.push(`the drawing only spans ${(span * 100).toFixed(0)}% (need ≥ 40% between its highest and lowest steps — give it real contrast)`)
      }
      if (!p.lfoSync) issues.push('SYNC is off — the drawing should spread over a musical length')
      if (p.lfoSync && p.lfoSyncRate !== '1/1' && p.lfoSyncRate !== '1/2') issues.push(`division is ${p.lfoSyncRate} (use 1/1 — one pass through the drawing per bar)`)
      if (p.lfoDepth < 0.5) issues.push(`depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 50%)`)
      if (issues.length) return fail('Not talking yet — ' + issues.join('; ') + '.')
      return pass('You just drew a rhythm into the timbre itself — that exact editor is where every famous dubstep bass got its mouth. In Serum, right-click an LFO point for curves and grip handles; the thinking is identical.')
    },
  },
  {
    id: 'serum-trance-gate',
    module: SERUM,
    title: 'The Trance Gate',
    summary:
      'The oldest drawn-LFO trick in the book: aim a hard on/off pattern at the VOLUME and a held pad turns into a rhythm. Every trance anthem\'s chopped chord stabs, every synthwave pulse — that\'s a gate. In Serum you draw square steps in the LFO editor and drop it on Master or an FX; the chord does nothing, the drawing does everything.',
    task: 'This pad holds a chord for the whole bar. Gate it: ✎ DRAW an on/off pattern with at least 5 steps near the TOP (75%+) and 5 near the BOTTOM (below 25%), aim the LFO at AMP, SYNC at 1/1, DEPTH ≥ 80%.',
    hints: [
      'Draw squares, not slopes — a gate is a light switch, not a dimmer. Slam steps to the very top and very bottom.',
      'Classic patterns to try: on-on-off repeated (a 16th gallop), or on-off alternating (straight 8ths). Off-beats against the kick groove hardest.',
      'Same chord, different drawing = different song. Redraw the pattern a few times with the loop running and hear the rhythm section move.',
    ],
    centerPitch: 62,
    target: { params: patch({ osc: 'sawtooth', osc2Type: 'sawtooth', osc2Level: 0.5, osc2Detune: 10.1, cutoff: 3305, attack: 0.05, decay: 0.3, sustain: 1, release: 0.15, lfoDest: 'amp', lfoShape: 'custom', lfoSteps: [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 0], lfoSync: true, lfoSyncRate: '1/1', lfoDepth: 0.87, volume: -11 }), phrase: notesToPhraseSeconds([n(57, 0, 16), n(62, 0, 16), n(66, 0, 16)], 138) },
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 4, 8, 12], openhat: [2, 6, 10, 14] }),
        synthTrack('synth', 'Gate', '#c678dd', { osc: 'sawtooth', osc2Type: 'sawtooth', osc2Level: 0.5, osc2Detune: 12, cutoff: 4000, attack: 0.05, decay: 0.3, sustain: 1, release: 0.15, lfoDest: 'off', lfoDepth: 0, lfoSync: false, lfoSyncRate: '1/1', volume: -11 }, [n(57, 0, 16), n(62, 0, 16), n(66, 0, 16)]),
      ],
      loopBars: 1,
      bpm: 138,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.lfoDest !== 'amp') issues.push(`LFO destination is ${p.lfoDest.toUpperCase()} (aim it at AMP — a gate chops volume)`)
      if (p.lfoShape !== 'custom') issues.push('still on the sine — hit ✎ DRAW; a sine fades, a gate CHOPS')
      if (p.lfoShape === 'custom') {
        const high = p.lfoSteps.filter((v) => v >= 0.75).length
        const low = p.lfoSteps.filter((v) => v < 0.25).length
        if (high < 5 || low < 5) issues.push(`drawing has ${high} high / ${low} low steps (need ≥ 5 of each — slam them to the extremes, it\'s a light switch)`)
      }
      if (!p.lfoSync || p.lfoSyncRate !== '1/1') issues.push('SYNC on at 1/1 — the pattern is a one-bar rhythm')
      if (p.lfoDepth < 0.8) issues.push(`depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 80% — a shy gate is just wobbly volume)`)
      if (issues.length) return fail('Not gating yet — ' + issues.join('; ') + '.')
      return pass('A held chord became a riff without a single new note — the drawing IS the rhythm. In Serum: same square-step drawing, dropped on Master volume. Redraw it per song section and one pad carries a whole arrangement.')
    },
  },
  {
    id: 'serum-riser',
    module: SERUM,
    title: 'The Riser: Tension You Can Draw',
    summary:
      'Before every drop in every EDM track: a whoosh that climbs for a bar and explodes. The recipe is deliberately trivial — WHITE NOISE through a resonant filter whose cutoff CLIMBS, drowned in reverb — which is why it\'s a rite-of-passage Serum tutorial: the sound is 90% modulation, 10% source. Draw the climb.',
    task: 'Build the riser: NOISE at 60%+, RESONANCE ≥ 2, then ✎ DRAW an ASCENDING ramp (later steps clearly higher than early ones), LFO → CUTOFF, SYNC 1/1, DEPTH ≥ 60%, REVERB send ≥ 20%.',
    hints: [
      'The drawing is a staircase UP: start the steps low-left, end high-right. One bar of climb, snapping back at the loop — exactly a 1-bar riser before a drop.',
      'Resonance is the "whistle" riding the top of the sweep — the riser\'s actual voice. Push it and the climb starts to scream.',
      'In Serum this is the NOISE oscillator + an LFO (or ENV in one-shot mode) ramping cutoff or pitch. Longer risers just use 2- or 4-bar rates — same drawing.',
    ],
    centerPitch: 48,
    target: { params: patch({ osc: 'sine', cutoff: 1082, resonance: 2.35, attack: 0.05, decay: 0.2, sustain: 1, release: 0.4, noiseLevel: 0.75, lfoDest: 'cutoff', lfoShape: 'custom', lfoSteps: Array.from({ length: 16 }, (_, i) => i / 15), lfoSync: true, lfoSyncRate: '1/1', lfoDepth: 0.8, sendReverb: 0.3, volume: -10 }), phrase: notesToPhraseSeconds([n(48, 0, 16)], 128) },
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 4, 8, 12], snare: [4, 12] }),
        synthTrack('synth', 'Riser', '#56b6c2', { osc: 'sine', cutoff: 800, resonance: 1, attack: 0.05, decay: 0.2, sustain: 1, release: 0.4, noiseLevel: 0, lfoDest: 'off', lfoDepth: 0, lfoSync: false, lfoSyncRate: '1/1', sendReverb: 0, volume: -10 }, [n(48, 0, 16)]),
      ],
      loopBars: 1,
      bpm: 128,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.noiseLevel < 0.6) issues.push(`noise ${(p.noiseLevel * 100).toFixed(0)}% (need ≥ 60% — the riser\'s body is noise, not tone)`)
      if (p.resonance < 2) issues.push(`resonance ${p.resonance.toFixed(1)} (need ≥ 2 — the whistle on top of the sweep)`)
      if (p.lfoDest !== 'cutoff') issues.push(`LFO destination is ${p.lfoDest.toUpperCase()} (aim it at CUTOFF — the climb is a filter sweep)`)
      if (p.lfoShape !== 'custom') issues.push('hit ✎ DRAW — a sine goes up AND down; a riser only climbs')
      if (p.lfoShape === 'custom') {
        const firstHalf = p.lfoSteps.slice(0, 8).reduce((a, b) => a + b, 0) / 8
        const secondHalf = p.lfoSteps.slice(8).reduce((a, b) => a + b, 0) / 8
        if (secondHalf - firstHalf < 0.3) issues.push('the drawing isn\'t climbing — its second half needs to sit clearly higher than its first (draw a staircase up)')
      }
      if (!p.lfoSync || p.lfoSyncRate !== '1/1') issues.push('SYNC on at 1/1 — one full climb per bar')
      if (p.lfoDepth < 0.6) issues.push(`depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 60% — a riser sweeps octaves, not inches)`)
      if (p.sendReverb < 0.2) issues.push(`reverb send ${(p.sendReverb * 100).toFixed(0)}% (need ≥ 20% — risers live in the back of the hall)`)
      if (issues.length) return fail('Not rising yet — ' + issues.join('; ') + '.')
      return pass('Noise + climbing filter + reverb = tension on demand. You\'ll never buy a "risers" sample pack again — in Serum it\'s the NOISE osc and one ramp, and now you know why every buildup in the last decade sounds like this.')
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
    target: { params: patch({ osc: 'sawtooth', cutoff: 1231, resonance: 4.3, attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.2, lfoDest: 'cutoff', lfoSync: true, lfoSyncRate: '1/4', lfoDepth: 0.54, fmLevel: 0.5, fmHarmonicity: 2.5, fmModIndex: 6.71, distortionAmount: 0.4, distortionMix: 0.4, volume: -9 }), phrase: notesToPhraseSeconds([n(28, 0, 16)], 140) },
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
    id: 'serum-hoover',
    module: SERUM,
    title: 'The Hoover: A Rave Classic, Rebuilt',
    summary:
      'Born as a Roland Alpha Juno preset in the late 80s, the HOOVER (a.k.a. Dominator) powered early rave, hardcore and jungle, and still turns up in modern bass music. The recipe is documented history: pulse-width-modulated square waves, a detuned stack with a sub underneath, thick chorus, and that signature pitch SLIDE into every note. BeatLab has every ingredient: the PWM wavetable, detune, sub, the chorus/phaser send, and GLIDE.',
    task: 'Resurrect it: OSC A on WT with the PWM table (WT POS 20–80%), OSC 2 at 40%+ with DETUNE 15–60c, SUB ≥ 20%, GLIDE ≥ 50ms so the pattern\'s octave jumps slur, and MOD FX send ≥ 20% for the chorus swirl.',
    hints: [
      'The pattern jumps octaves on purpose — with glide up, every jump becomes the hoover\'s signature "yoy" slide. No glide, no hoover.',
      'Nudge WT POS while it plays: pulse width is the hoover\'s vowel. The original modulated it constantly — an LFO → WT at 1/2 is the bonus move.',
      'This same recipe in Serum: a PWM wavetable on OSC A, unison + detune, sub osc on, portamento up in the GLOBAL tab, chorus in FX.',
    ],
    centerPitch: 40,
    target: { params: patch({ osc: 'wavetable', wtTable: 'pwm', wtPos: 0.54, cutoff: 7977, resonance: 1, attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.25, osc2Type: 'square', osc2Level: 0.6, osc2Detune: 23.2, subLevel: 0.38, glide: 0.083, sendMod: 0.26, volume: -10 }), phrase: notesToPhraseSeconds([n(33, 0, 4), n(45, 4, 2), n(33, 6, 2), n(40, 8, 4), n(45, 12, 2), n(33, 14, 2)], 150) },
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 2, 4, 6, 8, 10, 12, 14] }),
        synthTrack('synth', 'Hoover', '#e5c07b', { osc: 'sawtooth', cutoff: 6000, resonance: 1, attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.25, osc2Type: 'square', osc2Level: 0, osc2Detune: 20, subLevel: 0, glide: 0, sendMod: 0, volume: -10 }, [n(33, 0, 4), n(45, 4, 2), n(33, 6, 2), n(40, 8, 4), n(45, 12, 2), n(33, 14, 2)]),
      ],
      loopBars: 1,
      bpm: 150,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'wavetable' || (p.osc === 'wavetable' && p.wtTable !== 'pwm')) issues.push('OSC A on WT with the PWM table — pulse width IS the hoover timbre')
      if (p.osc === 'wavetable' && p.wtTable === 'pwm' && (p.wtPos < 0.2 || p.wtPos > 0.8)) issues.push(`WT POS ${(p.wtPos * 100).toFixed(0)}% (20–80% — at the edges the pulse loses its vowel)`)
      if (p.osc2Level < 0.4) issues.push(`OSC 2 level ${(p.osc2Level * 100).toFixed(0)}% (need ≥ 40% — the stack needs meat)`)
      if (p.osc2Detune < 15 || p.osc2Detune > 60) issues.push(`detune ${p.osc2Detune.toFixed(0)}c (need 15–60)`)
      if (p.subLevel < 0.2) issues.push(`sub ${(p.subLevel * 100).toFixed(0)}% (need ≥ 20% — hoovers hit below the waist)`)
      if (p.glide < 0.05) issues.push(`glide ${(p.glide * 1000).toFixed(0)}ms (need ≥ 50ms — the slide between notes is the signature)`)
      if (p.sendMod < 0.2) issues.push(`Mod FX send ${(p.sendMod * 100).toFixed(0)}% (need ≥ 20% — the chorus swirl is half the width)`)
      if (issues.length) return fail('Not hoovering yet — ' + issues.join('; ') + '.')
      return pass('That\'s thirty years of rave in one patch — PWM stack, sub, chorus, slide. Songs got faster and slower around it; the hoover never changed. In Serum, search the factory tables for "Juno" shapes and it\'s the same five moves.')
    },
  },
  {
    id: 'serum-evolving-pad',
    module: SERUM,
    title: 'The Evolving Pad',
    summary:
      'The pad is where Serum\'s whole design philosophy pays off at once: slow envelopes so notes bloom instead of hit, a wide unison stack so it fills the stereo field, and — the part beginners skip — SLOW WAVETABLE MOTION so ten seconds of held chord never sounds like a freeze-frame. A pad without modulation is furniture; a pad with it is weather.',
    task: 'Make weather: ATTACK ≥ 200ms and RELEASE ≥ 500ms, UNISON ≥ 3 with WIDTH ≥ 40%, OSC A on WT (any table) with the LFO scanning it (dest WT, SYNC at 1/1 or 1/2, DEPTH ≥ 30%), REVERB send ≥ 25%.',
    hints: [
      'Slow attack changes what the instrument IS: the same chord that stabbed now swells. Pads are envelopes first, timbre second.',
      'The VOCAL table at slow scan is a choir breathing; ANALOG is a string section leaning in. Audition both before choosing.',
      'In Serum pad presets, look at the mod matrix: there is ALWAYS a slow LFO or envelope on WT POS. Now you know what it\'s doing there.',
    ],
    centerPitch: 57,
    target: { params: patch({ osc: 'wavetable', wtTable: 'vocal', wtPos: 0.4, osc2Type: 'sawtooth', osc2Level: 0.5, osc2Detune: 18, cutoff: 3745, attack: 0.4, decay: 0.3, sustain: 0.9, release: 0.9, unisonVoices: 5, unisonWidth: 0.61, lfoDest: 'wtPos', lfoDepth: 0.39, lfoSync: true, lfoSyncRate: '1/1', sendReverb: 0.35, volume: -12 }), phrase: notesToPhraseSeconds([n(50, 0, 16), n(57, 0, 16), n(60, 0, 16), n(64, 0, 16)], 100) },
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Pad', '#98c379', { osc: 'sawtooth', osc2Type: 'sawtooth', osc2Level: 0.5, osc2Detune: 18, cutoff: 5000, attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.2, unisonVoices: 1, unisonWidth: 0, lfoDest: 'off', lfoDepth: 0, lfoSync: false, sendReverb: 0.1, volume: -12 }, [n(50, 0, 16), n(57, 0, 16), n(60, 0, 16), n(64, 0, 16)]),
      ],
      loopBars: 1,
      bpm: 100,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.attack < 0.2) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≥ 200ms — pads bloom, they don\'t hit)`)
      if (p.release < 0.5) issues.push(`release ${(p.release * 1000).toFixed(0)}ms (need ≥ 500ms — let go gently)`)
      if (p.unisonVoices < 3) issues.push(`unison ${p.unisonVoices} voice(s) (need ≥ 3)`)
      if (p.unisonWidth < 0.4) issues.push(`width ${(p.unisonWidth * 100).toFixed(0)}% (need ≥ 40% — a pad is scenery, and scenery is wide)`)
      if (p.osc !== 'wavetable') issues.push('OSC A on WT — the evolving part needs a table to evolve through')
      if (p.lfoDest !== 'wtPos') issues.push(`LFO destination is ${p.lfoDest.toUpperCase()} (aim it at WT — the slow timbre drift is what keeps a held chord alive)`)
      if (!p.lfoSync || (p.lfoSyncRate !== '1/1' && p.lfoSyncRate !== '1/2')) issues.push('LFO SYNC on at 1/1 or 1/2 — pad motion is glacial')
      if (p.lfoDepth < 0.3) issues.push(`LFO depth ${(p.lfoDepth * 100).toFixed(0)}% (need ≥ 30%)`)
      if (p.sendReverb < 0.25) issues.push(`reverb send ${(p.sendReverb * 100).toFixed(0)}% (need ≥ 25%)`)
      if (issues.length) return fail('Still furniture — ' + issues.join('; ') + '.')
      return pass('Bloom, width, and a timbre that never sits still — that\'s a pad that can hold a mix on its own. Every lush Serum pad preset is exactly this checklist plus taste.')
    },
  },
  {
    id: 'serum-fm-bell',
    module: SERUM,
    title: 'FM Bells: The Inharmonic Trick',
    summary:
      'Ask FM for a WHOLE-NUMBER frequency ratio and you get pitched, polite harmonics. Ask for a ratio BETWEEN the whole numbers and the partials land off the harmonic grid — which is, precisely, what a struck bell does. One weird ratio + a fast-attack/long-decay envelope = every DX7 electric piano, every trap bell, every icy plink in ambient music. In Serum this hides in the Warp menu (FM from B) or the noise osc; BeatLab\'s FM voice does it directly.',
    task: 'Cast a bell: FM LEVEL ≥ 50%, HARM parked BETWEEN whole numbers (at least 0.25 away from any integer, and ≥ 2), MOD IDX between 4 and 14, then the strike envelope — ATTACK ≤ 10ms, DECAY ≥ 400ms, SUSTAIN ≤ 0.25, RELEASE ≥ 500ms.',
    hints: [
      'Sweep HARM slowly from 2.0 to 4.0 while notes play: hear it click into "pitched" at 2.0, 3.0, 4.0 and turn bell-metal everywhere in between. Park in the in-between.',
      'The envelope is half the illusion: bells are all strike and ring — nothing held. Sustain near zero, long decay.',
      'Real bell ratios cluster near 3.5 and 5.4. The DX7\'s famous E.PIANO 1 used exactly this trick, quieter.',
    ],
    centerPitch: 72,
    target: { params: patch({ osc: 'sine', cutoff: 9000, attack: 0.005, decay: 0.519, sustain: 0.1, release: 0.8, fmLevel: 0.79, fmHarmonicity: 3.5, fmModIndex: 8, sendReverb: 0.03, volume: -11 }), phrase: notesToPhraseSeconds([n(72, 0, 3), n(76, 4, 3), n(79, 8, 3), n(74, 12, 3)], 90) },
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 8], hat: [4, 12] }),
        synthTrack('synth', 'Bell', '#61afef', { osc: 'sine', cutoff: 9000, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.3, fmLevel: 0, fmHarmonicity: 1, fmModIndex: 5, volume: -11 }, [n(72, 0, 3), n(76, 4, 3), n(79, 8, 3), n(74, 12, 3)]),
      ],
      loopBars: 1,
      bpm: 90,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.fmLevel < 0.5) issues.push(`FM level ${(p.fmLevel * 100).toFixed(0)}% (need ≥ 50% — the bell IS the FM voice)`)
      const fromInt = Math.abs(p.fmHarmonicity - Math.round(p.fmHarmonicity))
      if (p.fmHarmonicity < 2 || fromInt < 0.25) issues.push(`HARM ${p.fmHarmonicity.toFixed(2)} (park ≥ 2 and at least 0.25 from any whole number — whole ratios are pitched, bells live between)`)
      if (p.fmModIndex < 4 || p.fmModIndex > 14) issues.push(`MOD IDX ${p.fmModIndex.toFixed(0)} (need 4–14 — under 4 it\'s a whisper, over 14 it\'s a trash can)`)
      if (p.attack > 0.01) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 10ms — a bell is STRUCK)`)
      if (p.decay < 0.4) issues.push(`decay ${(p.decay * 1000).toFixed(0)}ms (need ≥ 400ms — the ring)`)
      if (p.sustain > 0.25) issues.push(`sustain ${p.sustain.toFixed(2)} (need ≤ 0.25 — nothing held, all ring)`)
      if (p.release < 0.5) issues.push(`release ${(p.release * 1000).toFixed(0)}ms (need ≥ 500ms — let it ring past the note)`)
      if (issues.length) return fail('Not ringing yet — ' + issues.join('; ') + '.')
      return pass('Inharmonic ratio + strike envelope = metal. That single idea is the DX7\'s whole legend and Serum\'s FM warp in one lesson — and now when a preset sounds "glassy," you know exactly which two knobs made it so.')
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
