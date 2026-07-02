import type { OscType, SynthParams } from '../types'
import {
  chordProgressionNotes,
  drumTrack,
  fail,
  n,
  pass,
  rand,
  riffOneBar,
  synthTrack,
  track,
  type Lesson,
  type Module,
} from './framework'

const SYNTH = 'Synthesis'
const EAR = 'Ear Training'

const ARP_PHRASE_NOTES = [n(57, 0, 2), n(60, 2, 2), n(64, 4, 2), n(69, 6, 2), n(64, 8, 2), n(60, 10, 2), n(64, 12, 2), n(72, 14, 2)]
const ARP_PHRASE_SECONDS = [
  { pitch: 57, time: 0, dur: 0.22 }, { pitch: 60, time: 0.25, dur: 0.22 },
  { pitch: 64, time: 0.5, dur: 0.22 }, { pitch: 69, time: 0.75, dur: 0.22 },
  { pitch: 64, time: 1.0, dur: 0.22 }, { pitch: 60, time: 1.25, dur: 0.22 },
  { pitch: 64, time: 1.5, dur: 0.22 }, { pitch: 72, time: 1.75, dur: 0.4 },
]
const BASS_PHRASE_SECONDS = [
  { pitch: 33, time: 0, dur: 0.4 }, { pitch: 33, time: 0.5, dur: 0.4 },
  { pitch: 45, time: 1.0, dur: 0.4 }, { pitch: 33, time: 1.5, dur: 0.4 },
]
const CHORD_PHRASE_SECONDS = [
  { pitch: 57, time: 0, dur: 1.6 }, { pitch: 60, time: 0, dur: 1.6 }, { pitch: 64, time: 0, dur: 1.6 },
  { pitch: 53, time: 1.8, dur: 1.6 }, { pitch: 57, time: 1.8, dur: 1.6 }, { pitch: 60, time: 1.8, dur: 1.6 },
]

const basePatch = (over: Partial<SynthParams>): SynthParams => ({
  osc: 'sawtooth', cutoff: 9000, resonance: 0.8, attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, volume: -10,
  ...over,
})

// ================= MODULE 4: SYNTHESIS =================

const synthLessons: Lesson[] = [
  {
    id: 'oscillators',
    module: SYNTH,
    title: 'Meet the Oscillator',
    summary:
      'Every synth starts with an oscillator — a circuit generating a repeating wave. The shape determines the harmonics: SINE is pure (no harmonics), TRIANGLE is soft, SAWTOOTH is bright and buzzy (every harmonic — the workhorse of dance music), SQUARE is hollow like a woodwind (odd harmonics only). A bass riff is loaded below.',
    task: 'Press play, then click through all four waveforms in the OSC section of the device panel and listen. Leave it on SAWTOOTH and check.',
    hints: [
      'The device panel is at the bottom — like Ableton\'s device view.',
      'Listen for brightness: sine < triangle < square < saw.',
    ],
    centerPitch: 46,
    setup: () => ({
      tracks: [synthTrack('synth', 'Synth', '#98c379', { osc: 'sine', cutoff: 12000, sustain: 0.5, decay: 0.3 }, riffOneBar(45))],
      loopBars: 1,
      bpm: 120,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const t = track(ctx, 'synth')
      if (t.synth.osc !== 'sawtooth')
        return fail(`Currently on ${t.synth.osc.toUpperCase()}. Explore all four, then park it on SAWTOOTH — the raw material for the next lessons.`)
      return pass('Sawtooth: all the harmonics, all the time. Now we sculpt it with the filter.')
    },
  },
  {
    id: 'filter-bass',
    module: SYNTH,
    title: 'Sculpt with the Filter',
    summary:
      'Subtractive synthesis = start with a harmonically rich wave, then CUT what you don\'t want. The low-pass filter removes everything above its cutoff frequency. This is the single most important knob in electronic music. Turn the cutoff down and a harsh saw becomes a warm, round bass.',
    task: 'Make a deep sub-style bass: keep SAW or SQUARE, and pull the filter CUTOFF down to 500 Hz or below. Play the loop while you tweak and listen to the top-end disappear.',
    hints: [
      'The CUTOFF knob is in the FILTER section. Drag down.',
      'Sweep it slowly from max to min while the loop plays — that sweep is the sound of house music builds.',
    ],
    centerPitch: 36,
    setup: () => ({
      tracks: [synthTrack('synth', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 14000, sustain: 0.6, decay: 0.3 }, riffOneBar(33))],
      loopBars: 1,
      bpm: 122,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      if (p.osc !== 'sawtooth' && p.osc !== 'square') return fail('Keep a rich waveform (SAW or SQUARE) — a sine has nothing left to filter.')
      if (p.cutoff > 500) return fail(`Cutoff is at ${Math.round(p.cutoff)} Hz — still too bright for a sub bass. Pull it to 500 Hz or lower.`)
      return pass('That is a bass. Same oscillator as before — the filter did all the work. That is subtractive synthesis.')
    },
  },
  {
    id: 'resonance-acid',
    module: SYNTH,
    title: 'Resonance & the Acid Sound',
    summary:
      'RESONANCE boosts the frequencies right at the cutoff point, adding a nasal, squelchy peak. Crank it on a filtered saw and you get the acid sound of the Roland TB-303 — the noise that built acid house and techno in the late 80s.',
    task: 'Make it squelch: set RESONANCE to 6 or higher, with the CUTOFF between 150 Hz and 1200 Hz. Sweep the cutoff while it plays — that vowel-like "yow" is resonance talking.',
    hints: [
      'Resonance does nothing audible until the cutoff is low enough to bite into the harmonics.',
      'Sweep cutoff up and down with high resonance — instant acid line.',
    ],
    centerPitch: 38,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Acid', '#98c379', { osc: 'sawtooth', cutoff: 800, resonance: 1, sustain: 0.2, decay: 0.15, release: 0.1 }, [
          n(33, 0, 2), n(33, 2, 2), n(45, 4, 2), n(33, 6, 2), n(36, 8, 2), n(33, 10, 2), n(45, 12, 2), n(43, 14, 2),
        ]),
        drumTrack({ kick: [0, 4, 8, 12] }),
      ],
      loopBars: 1,
      bpm: 128,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      if (p.resonance < 6) return fail(`Resonance is ${p.resonance.toFixed(1)} — crank it to 6+ to hear the squelch.`)
      if (p.cutoff < 150 || p.cutoff > 1200)
        return fail(`Cutoff is ${Math.round(p.cutoff)} Hz — park it between 150 and 1200 Hz so the resonant peak bites into the harmonics.`)
      return pass('Acid! In Ableton, automate that cutoff over 8 bars and you have a genuine 303-style line.')
    },
  },
  {
    id: 'adsr-pluck',
    module: SYNTH,
    title: 'Envelopes I: The Pluck',
    summary:
      'The ADSR envelope shapes volume over a note\'s life: ATTACK (fade-in time), DECAY (fall time after the peak), SUSTAIN (the held level), RELEASE (fade-out after key-up). A pluck is the classic dance stab: instant attack, quick decay, NO sustain — all punch, no tail.',
    task: 'Shape a pluck: ATTACK ≤ 20ms, DECAY ≤ 400ms, SUSTAIN ≤ 0.1, RELEASE ≤ 600ms. The arp keeps playing so you hear every tweak.',
    hints: [
      'Sustain is the one that matters most — at 0, the note always dies out even if held.',
      'Shorter decay = tighter, more percussive. Try ~150ms.',
    ],
    centerPitch: 62,
    setup: () => ({
      tracks: [synthTrack('synth', 'Pluck', '#c678dd', { osc: 'sawtooth', cutoff: 6000, attack: 0.4, decay: 0.5, sustain: 0.8, release: 1.5 }, ARP_PHRASE_NOTES.map((x) => ({ ...x })))],
      loopBars: 1,
      bpm: 120,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.attack > 0.02) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 20ms — instant hit)`)
      if (p.decay > 0.4) issues.push(`decay ${(p.decay * 1000).toFixed(0)}ms (need ≤ 400ms)`)
      if (p.sustain > 0.1) issues.push(`sustain ${p.sustain.toFixed(2)} (need ≤ 0.1 — plucks don't hold)`)
      if (p.release > 0.6) issues.push(`release ${p.release.toFixed(1)}s (need ≤ 600ms)`)
      if (issues.length) return fail('Almost a pluck — fix: ' + issues.join('; ') + '.')
      return pass('Tight. That envelope shape is 90% of every pluck, stab and key patch in dance music.')
    },
  },
  {
    id: 'adsr-pad',
    module: SYNTH,
    title: 'Envelopes II: The Pad',
    summary:
      'The pad is the pluck\'s opposite: slow attack so chords bloom in, high sustain so they hold, long release so they melt away. Pads fill the background of ambient, house and melodic techno alike. Two chords are loaded — shape how they swell.',
    task: 'Shape a pad: ATTACK ≥ 300ms, SUSTAIN ≥ 0.4, RELEASE ≥ 800ms. Soften the top end with the cutoff if it feels harsh.',
    hints: [
      'Long attack + long release makes consecutive chords overlap and smear — that\'s the lush.',
      'Try triangle or saw with the cutoff around 1–3 kHz for a warmer pad.',
    ],
    centerPitch: 58,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Pad', '#f7c948', { osc: 'sawtooth', cutoff: 8000, attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.2 }, [
          n(57, 0, 16), n(60, 0, 16), n(64, 0, 16),
          n(53, 16, 16), n(57, 16, 16), n(60, 16, 16),
        ]),
      ],
      loopBars: 2,
      bpm: 100,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.attack < 0.3) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≥ 300ms — let it bloom)`)
      if (p.sustain < 0.4) issues.push(`sustain ${p.sustain.toFixed(2)} (need ≥ 0.4 — pads hold their level)`)
      if (p.release < 0.8) issues.push(`release ${(p.release * 1000).toFixed(0)}ms (need ≥ 800ms — let it melt away)`)
      if (issues.length) return fail('Not lush yet — fix: ' + issues.join('; ') + '.')
      return pass('Lush. Pluck vs. pad is the same synth with two envelope settings — envelopes ARE sound design.')
    },
  },
  {
    id: 'sub-bass',
    module: SYNTH,
    title: 'The Sub Bass',
    summary:
      'Below ~100 Hz, harmonics stop mattering — you mostly feel the fundamental. That\'s why the SUB BASS is a pure sine: nothing but the fundamental, maximum clean low-end energy. It\'s the invisible weight under every modern club track (you\'ll feel this one more than hear it on laptop speakers).',
    task: 'Build a sub: oscillator to SINE, ATTACK ≤ 20ms (it must lock to the kick), SUSTAIN ≥ 0.5 (it carries the note), RELEASE ≤ 400ms (it must get out of the next note\'s way).',
    hints: [
      'A sine has no harmonics, so the filter barely matters here.',
      'Short release is the secret — long sub tails turn the low end to mud.',
      'On headphones you\'ll hear it; on a club system you\'d feel it in your chest.',
    ],
    centerPitch: 36,
    setup: () => ({
      tracks: [
        drumTrack({ kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }),
        synthTrack('synth', 'Sub', '#56b6c2', { osc: 'sawtooth', cutoff: 9000, attack: 0.15, sustain: 0.7, release: 1.2 }, [
          n(33, 2, 2), n(33, 6, 2), n(33, 10, 2), n(31, 14, 2),
        ]),
      ],
      loopBars: 1,
      bpm: 124,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'sine') issues.push('oscillator must be SINE — pure fundamental, no harmonics')
      if (p.attack > 0.02) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 20ms)`)
      if (p.sustain < 0.5) issues.push(`sustain ${p.sustain.toFixed(2)} (need ≥ 0.5)`)
      if (p.release > 0.4) issues.push(`release ${(p.release * 1000).toFixed(0)}ms (need ≤ 400ms — keep the low end tight)`)
      if (issues.length) return fail('Not a sub yet — ' + issues.join('; ') + '.')
      return pass('Clean, tight low end. In a real mix this sits UNDER a mid-range bass — two layers, one job each.')
    },
  },
  {
    id: 'organ-patch',
    module: SYNTH,
    title: 'The Organ: Gate Envelopes',
    summary:
      'An organ speaks instantly, holds at full volume forever, and stops dead when you let go. In ADSR terms that\'s a GATE envelope: zero attack, full sustain, zero release. It\'s the envelope of organ house, rave stabs, and every "M1 piano" garage track.',
    task: 'Make it an organ: ATTACK ≤ 10ms, SUSTAIN ≥ 0.85, RELEASE ≤ 200ms, waveform SQUARE or TRIANGLE (hollow, flute-like tones).',
    hints: [
      'The note should feel like a switch: on... off. No fade in either direction.',
      'Compare with the pad — same chords, opposite envelope, completely different instrument.',
    ],
    centerPitch: 60,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Organ', '#98c379', { osc: 'sawtooth', cutoff: 5000, attack: 0.3, decay: 0.3, sustain: 0.5, release: 1.0 }, [
          n(57, 0, 4), n(60, 0, 4), n(64, 0, 4),
          n(57, 6, 2), n(60, 6, 2), n(64, 6, 2),
          n(55, 8, 4), n(59, 8, 4), n(62, 8, 4),
          n(57, 14, 2), n(60, 14, 2), n(64, 14, 2),
        ]),
        drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12] }),
      ],
      loopBars: 1,
      bpm: 122,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'square' && p.osc !== 'triangle') issues.push('use SQUARE or TRIANGLE for the hollow organ tone')
      if (p.attack > 0.01) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need ≤ 10ms — organs speak instantly)`)
      if (p.sustain < 0.85) issues.push(`sustain ${p.sustain.toFixed(2)} (need ≥ 0.85 — organs never fade while held)`)
      if (p.release > 0.2) issues.push(`release ${(p.release * 1000).toFixed(0)}ms (need ≤ 200ms — stop dead on note-off)`)
      if (issues.length) return fail('Not an organ yet — ' + issues.join('; ') + '.')
      return pass('On/off, like a switch — the gate envelope. Those stabby chords are a whole genre in themselves.')
    },
  },
  {
    id: 'strings-patch',
    module: SYNTH,
    title: 'Synth Strings',
    summary:
      'The classic analog string machine: a bright sawtooth (bowed strings are harmonically rich), a moderate low-pass to tame the fizz, and a medium-slow swell in and out. Softer than a lead, faster than a pad — the string patch carries chords in italo, synthwave and melodic techno.',
    task: 'Build strings: SAWTOOTH, ATTACK between 200ms and 1.2s, SUSTAIN ≥ 0.6, RELEASE ≥ 600ms, CUTOFF ≤ 6 kHz.',
    hints: [
      'Attack slower than a pluck, faster than a pad — the bow "catches" the string.',
      'The cutoff around 2–4 kHz is where saw stops fizzing and starts singing.',
    ],
    centerPitch: 60,
    setup: () => ({
      tracks: [
        synthTrack('synth', 'Strings', '#f7c948', { osc: 'square', cutoff: 12000, attack: 0.005, decay: 0.2, sustain: 0.3, release: 0.2 }, chordProgressionNotes(4)),
      ],
      loopBars: 4,
      bpm: 110,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const p = track(ctx, 'synth').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push('strings need SAWTOOTH (rich, bowed-string harmonics)')
      if (p.attack < 0.2 || p.attack > 1.2) issues.push(`attack ${(p.attack * 1000).toFixed(0)}ms (need 200ms–1.2s — a swell, not a hit or a fade)`)
      if (p.sustain < 0.6) issues.push(`sustain ${p.sustain.toFixed(2)} (need ≥ 0.6)`)
      if (p.release < 0.6) issues.push(`release ${(p.release * 1000).toFixed(0)}ms (need ≥ 600ms)`)
      if (p.cutoff > 6000) issues.push(`cutoff ${Math.round(p.cutoff)} Hz (need ≤ 6 kHz — tame the fizz)`)
      if (issues.length) return fail('Not strings yet — ' + issues.join('; ') + '.')
      return pass('An analog string machine. You now have four patch recipes: pluck, pad, sub, organ, strings — that\'s a full arrangement\'s worth.')
    },
  },
]

// ================= MODULE 5: EAR TRAINING =================

function matchLesson(opts: {
  id: string
  title: string
  summary: string
  taskNote: string
  hints: string[]
  target: SynthParams
  phrase: { pitch: number; time: number; dur: number }[]
  userNotes: () => { id: string; pitch: number; start: number; duration: number }[]
  userStart: Partial<SynthParams>
  check: (p: SynthParams) => string[]
  successMsg: string
  loopBars?: number
  bpm?: number
  centerPitch?: number
}): Lesson {
  return {
    id: opts.id,
    module: EAR,
    title: opts.title,
    summary: opts.summary,
    task: `Press PLAY TARGET to hear the mystery patch, then recreate it on your synth. ${opts.taskNote}`,
    hints: opts.hints,
    centerPitch: opts.centerPitch ?? 58,
    target: { params: opts.target, phrase: opts.phrase },
    setup: () => ({
      tracks: [synthTrack('synth', 'Mystery', '#61afef', opts.userStart, opts.userNotes())],
      loopBars: opts.loopBars ?? 1,
      bpm: opts.bpm ?? 110,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const issues = opts.check(track(ctx, 'synth').synth)
      if (issues.length) return fail('Getting closer — ' + issues.join('; ') + '.')
      return pass(opts.successMsg)
    },
  }
}

const earLessons: Lesson[] = [
  matchLesson({
    id: 'match-the-patch',
    title: 'Match the Patch',
    summary:
      'The real skill: hearing a sound and knowing how to build it. Press PLAY TARGET to hear a mystery patch, then recreate it by ear. Compare by playing your own loop (same notes) against the target.',
    taskNote: 'Waveform, filter and envelope all matter.',
    hints: [
      'First decide: bright or dark? That\'s the cutoff. Hollow or buzzy? That\'s the waveform.',
      'Does the note die out even though it\'s held? Sustain is near zero.',
      'It\'s a short, hollow, slightly muted sound…',
    ],
    target: basePatch({ osc: 'square', cutoff: 900, resonance: 1, attack: 0.005, decay: 0.18, sustain: 0, release: 0.2 }),
    phrase: [
      { pitch: 57, time: 0, dur: 0.3 }, { pitch: 60, time: 0.35, dur: 0.3 },
      { pitch: 64, time: 0.7, dur: 0.3 }, { pitch: 69, time: 1.05, dur: 0.5 },
    ],
    userNotes: () => [n(57, 0, 3), n(60, 4, 3), n(64, 8, 3), n(69, 12, 4)],
    userStart: { osc: 'sawtooth', cutoff: 12000, attack: 0.2, decay: 0.5, sustain: 0.7, release: 0.5 },
    check: (p) => {
      const issues: string[] = []
      if (p.osc !== 'square') issues.push('waveform: is it buzzy (saw) or hollow, like a woodwind?')
      if (p.cutoff > 1800) issues.push('filter: your sound is brighter than the target — darken it')
      else if (p.cutoff < 450) issues.push('filter: your sound is darker than the target — open it up')
      if (p.attack > 0.03) issues.push('attack: the target hits instantly')
      if (p.sustain > 0.15) issues.push('sustain: the target dies out even when held — pull sustain way down')
      if (p.decay < 0.08 || p.decay > 0.35) issues.push('decay: the target rings for roughly a fifth of a second')
      return issues
    },
    successMsg: 'You reverse-engineered a patch by ear. This is exactly how you\'ll learn sounds from records.',
    centerPitch: 62,
  }),
  matchLesson({
    id: 'match-dark-bass',
    title: 'Match: The Dark Bass',
    summary:
      'Bass patches live or die by their filter setting. This target is all about WHERE the cutoff sits and how the note holds. Listen for: how bright? how long? does it sustain?',
    taskNote: 'Focus on the waveform, the cutoff region, and whether the note holds.',
    hints: [
      'It holds while played — sustain isn\'t zero.',
      'There\'s some growl in there — that\'s a rich waveform through a low filter.',
      'Darker than 650 Hz.',
    ],
    target: basePatch({ osc: 'sawtooth', cutoff: 300, resonance: 1, attack: 0.005, decay: 0.2, sustain: 0.6, release: 0.2, volume: -8 }),
    phrase: BASS_PHRASE_SECONDS,
    userNotes: () => [n(33, 0, 3), n(33, 4, 3), n(45, 8, 3), n(33, 12, 3)],
    userStart: { osc: 'square', cutoff: 8000, attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.4, volume: -8 },
    check: (p) => {
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push('waveform: the growl says sawtooth')
      if (p.cutoff > 650) issues.push('filter: too bright — this bass is dark')
      if (p.sustain < 0.3) issues.push('sustain: the target holds while played — raise sustain')
      if (p.attack > 0.05) issues.push('attack: it speaks instantly')
      return issues
    },
    successMsg: 'Dark, growly, held — a classic filtered saw bass. Your ear found the cutoff region on its own.',
    centerPitch: 38,
    bpm: 120,
  }),
  matchLesson({
    id: 'match-acid',
    title: 'Match: The Squelch',
    summary:
      'Some sounds are defined by a single parameter. This one has an unmistakable calling card — if you did the Resonance lesson, you\'ll recognize it immediately. The question is dialing in the right amounts.',
    taskNote: 'One parameter is doing most of the talking here.',
    hints: [
      'That vowel-like "yow" — you\'ve heard it before. Which knob makes it?',
      'The filter is low enough to bite, the peak is cranked.',
      'The notes are short and punchy — check the envelope too.',
    ],
    target: basePatch({ osc: 'sawtooth', cutoff: 600, resonance: 12, attack: 0.003, decay: 0.12, sustain: 0.1, release: 0.1, volume: -10 }),
    phrase: [
      { pitch: 33, time: 0, dur: 0.18 }, { pitch: 33, time: 0.25, dur: 0.18 },
      { pitch: 45, time: 0.5, dur: 0.18 }, { pitch: 33, time: 0.75, dur: 0.18 },
      { pitch: 36, time: 1.0, dur: 0.18 }, { pitch: 43, time: 1.25, dur: 0.18 },
    ],
    userNotes: () => [n(33, 0, 2), n(33, 2, 2), n(45, 4, 2), n(33, 6, 2), n(36, 8, 2), n(43, 10, 2), n(33, 12, 2), n(45, 14, 2)],
    userStart: { osc: 'sawtooth', cutoff: 8000, resonance: 1, attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.3 },
    check: (p) => {
      const issues: string[] = []
      if (p.resonance < 8) issues.push('that squelch is RESONANCE — crank it')
      if (p.cutoff < 250 || p.cutoff > 1200) issues.push('cutoff: the peak needs to sit in the low-mids to bite')
      if (p.osc !== 'sawtooth') issues.push('waveform: 303s run on saws')
      if (p.sustain > 0.3) issues.push('sustain: the target notes are short stabs')
      return issues
    },
    successMsg: 'You identified resonance by ear — the acid signature. That knob-recognition is real producer hearing.',
    centerPitch: 38,
    bpm: 128,
  }),
  matchLesson({
    id: 'match-warm-pad',
    title: 'Match: The Warm Pad',
    summary:
      'Envelope recognition: how a sound ENTERS and EXITS tells you the attack and release before you think about anything else. Listen to how these chords arrive and disappear.',
    taskNote: 'Listen to the edges of the sound: how it starts, how it ends.',
    hints: [
      'The chords fade in — that\'s not a zero attack.',
      'After each chord stops, it lingers — long release.',
      'The tone is soft and round — the gentlest of the four waveforms that still has harmonics.',
    ],
    target: basePatch({ osc: 'triangle', cutoff: 2500, attack: 0.6, decay: 0.3, sustain: 0.7, release: 1.5, volume: -12 }),
    phrase: CHORD_PHRASE_SECONDS,
    userNotes: () => [n(57, 0, 16), n(60, 0, 16), n(64, 0, 16), n(53, 16, 16), n(57, 16, 16), n(60, 16, 16)],
    userStart: { osc: 'sawtooth', cutoff: 9000, attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.1, volume: -12 },
    check: (p) => {
      const issues: string[] = []
      if (p.osc !== 'triangle') issues.push('waveform: softer than a saw, rounder than a square…')
      if (p.attack < 0.4) issues.push('attack: the target blooms in — slow it down')
      if (p.release < 1.0) issues.push('release: the target lingers after the chord ends')
      if (p.sustain < 0.5) issues.push('sustain: it holds strong while played')
      return issues
    },
    successMsg: 'Attack and release by ear — the envelope edges. You can now hear a synth\'s settings, not just its sound.',
    loopBars: 2,
    bpm: 95,
  }),
  {
    id: 'waveform-drill',
    module: EAR,
    title: 'Drill: Name That Waveform',
    summary:
      'Raw waveform recognition, randomized. Each round plays a mystery phrase on one of the four waveforms (filter wide open, plain envelope). Learn the fingerprints: sine = pure whistle, triangle = soft flute, square = hollow reed, saw = full buzz.',
    task: 'Press PLAY TARGET, identify the waveform by ear, set your OSC to match, and check. Reroll with "New Exercise" until you\'re 5-for-5.',
    hints: [
      'Sine and triangle are close — triangle has a faint edge to it.',
      'Square vs saw: square sounds hollow (odd harmonics), saw sounds full (all harmonics).',
      'Your synth has the same notes loaded — play your loop to A/B against the target.',
    ],
    drill: true,
    centerPitch: 62,
    target: (p) => ({
      params: basePatch({ osc: p.osc as OscType, cutoff: 14000, attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 }),
      phrase: ARP_PHRASE_SECONDS,
    }),
    setup: () => {
      const osc = rand(['sine', 'triangle', 'sawtooth', 'square'] as const)
      const others = (['sine', 'triangle', 'sawtooth', 'square'] as const).filter((o) => o !== osc)
      return {
        tracks: [
          synthTrack('synth', 'Mystery', '#61afef', { osc: rand(others), cutoff: 14000, attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 }, ARP_PHRASE_NOTES.map((x) => ({ ...x }))),
        ],
        loopBars: 1,
        bpm: 120,
        selectedTrackId: 'synth',
        params: { osc },
      }
    },
    validate: (ctx) => {
      const got = track(ctx, 'synth').synth.osc
      if (got !== ctx.params.osc)
        return fail(`Not ${got.toUpperCase()} — listen again. A/B it: play your loop, then the target. Compare the brightness and hollowness.`)
      return pass(`${(ctx.params.osc as string).toUpperCase()} — correct. Reroll and keep going until it's instant.`)
    },
  },
  {
    id: 'cutoff-drill',
    module: EAR,
    title: 'Drill: Find the Cutoff',
    summary:
      'Frequency estimation, randomized. Each round filters the same saw riff at a random cutoff. Your job: match it within one octave (2× in either direction). This calibrates the skill you\'ll use every day: "this needs to be darker… about THAT much darker."',
    task: 'Press PLAY TARGET, listen to how bright the saw is, then set your CUTOFF to match — within a factor of 2 counts as correct. Reroll to recalibrate.',
    hints: [
      'Reference points: 300 Hz = dark and woolly, 1 kHz = mid and vowely, 3 kHz = present, 8+ kHz = wide open.',
      'A/B constantly: your loop, then the target, then adjust.',
      'Ignore the knob number on the first guess — commit by ear, then peek.',
    ],
    drill: true,
    centerPitch: 46,
    target: (p) => ({
      params: basePatch({ osc: 'sawtooth', cutoff: p.cutoff as number, attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2, volume: -8 }),
      phrase: [
        { pitch: 45, time: 0, dur: 0.22 }, { pitch: 45, time: 0.25, dur: 0.22 },
        { pitch: 45, time: 0.5, dur: 0.22 }, { pitch: 57, time: 0.75, dur: 0.22 },
        { pitch: 45, time: 1.0, dur: 0.22 }, { pitch: 45, time: 1.25, dur: 0.22 },
        { pitch: 48, time: 1.5, dur: 0.22 }, { pitch: 43, time: 1.75, dur: 0.22 },
      ],
    }),
    setup: () => {
      const cutoff = rand([250, 500, 1000, 2000, 4000, 8000])
      const start = cutoff >= 1500 ? 200 : 12000
      return {
        tracks: [
          synthTrack('synth', 'Mystery', '#61afef', { osc: 'sawtooth', cutoff: start, attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2, volume: -8 }, riffOneBar(45)),
        ],
        loopBars: 1,
        bpm: 120,
        selectedTrackId: 'synth',
        params: { cutoff },
      }
    },
    validate: (ctx) => {
      const got = track(ctx, 'synth').synth.cutoff
      const want = ctx.params.cutoff as number
      const ratio = got / want
      if (ratio > 2) return fail('Your filter is more than an octave TOO BRIGHT compared to the target. Darken it and A/B again.')
      if (ratio < 0.5) return fail('Your filter is more than an octave TOO DARK compared to the target. Open it up and A/B again.')
      return pass(`Close enough — the target was ${want >= 1000 ? `${want / 1000} kHz` : `${want} Hz`}, you landed at ${Math.round(got)} Hz. Reroll and recalibrate.`)
    },
  },
]

export const SOUND_MODULES: Module[] = [
  { name: SYNTH, lessons: synthLessons },
  { name: EAR, lessons: earLessons },
]
