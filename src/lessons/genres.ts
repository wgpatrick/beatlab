import type { SynthParams } from '../types'
import {
  drumTrack,
  fail,
  laneSteps,
  n,
  pass,
  sameSet,
  synthTrack,
  track,
  type Lesson,
  type Module,
} from './framework'

// ================= MODULE: GENRE LAB =================
//
// Each lesson in this module is a two-stage, chained exercise on ONE electronic genre:
//   Stage 1 — program the genre's signature BEAT (drum track).
//   Stage 2 — dial in the genre's signature SYNTH/SOUND (a pre-seeded synth track).
// Stage 2 is only graded once Stage 1 passes, mirroring the "get the drums locked before
// you touch the bassline" workflow the capstone in the Ear Training module also uses.
//
// The drum-stage checks reuse the exact same laneSteps/sameSet vocabulary as the Drum
// Programming and Rhythm Styles modules; the sound-stage checks reuse the range-based,
// "list every thing that's still off" style of the resonance-acid and lfo-wobble synthesis
// lessons (custom thresholds rather than ear-training tolerance bands, because here the
// signature technique — high resonance, a synced LFO, a detuned second oscillator — is a
// recipe to hit, not a mystery patch to match).

const GENRES = 'Genre Lab'

// Cumulative device-panel reveal doesn't apply here (students reach Genre Lab after the whole
// synthesis curriculum); instead each lesson lists exactly the controls its signature sound
// needs, so the device panel stays focused on the technique being taught.
const BASICS: (keyof SynthParams)[] = ['osc', 'cutoff', 'volume']

const soundStage = (issues: string[], successMsg: string) =>
  issues.length ? fail(`Stage 2/2 (the sound): almost — ${issues.join('; ')}.`) : pass(successMsg)

const beatFail = (msg: string) => fail(`Stage 1/2 (the beat): ${msg}`)

const genreLessons: Lesson[] = [
  // ---------------- HOUSE ----------------
  {
    id: 'genre-house',
    module: GENRES,
    title: 'House — The Offbeat Bass',
    summary:
      'Welcome to Genre Lab. In the Rhythm Styles module you learned that genres live in their drum patterns; here you build the WHOLE signature sound — the beat AND the synth that defines each genre. First up: HOUSE. Its engine is four-on-the-floor, but its soul is the OFFBEAT BASS — a short, plucky note landing on every "and", bouncing in the gaps between the kicks. Kick pushes down, bass pulls up. That call-and-response is why house makes people move.',
    task: 'Stage 1 — program a house beat on the DRUMS: kick on 1, 5, 9, 13; clap on 5, 13; closed hats on the offbeats 3, 7, 11, 15. Stage 2 — select the BASS track (its offbeat notes are already placed for you) and make it PLUCKY: sawtooth osc, DECAY 0.25 s or shorter, SUSTAIN 0.35 or lower, CUTOFF between 300 and 2000 Hz so it stays round and low.',
    hints: [
      'The bass notes sit on steps 3, 7, 11, 15 — dead between the kicks. Play both tracks together and hear the bounce.',
      'Plucky = fast decay + low sustain. A long sustain turns the bass into a drone and kills the bounce.',
      'Keep the cutoff down: house bass is felt, not heard — no need for brightness up top.',
    ],
    centerPitch: 33,
    visibleParams: [...BASICS, 'decay', 'sustain', 'attack', 'release'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('bass', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 6000, attack: 0.01, decay: 0.6, sustain: 0.8, release: 0.4, volume: -8 }, [
          n(33, 2, 2), n(33, 6, 2), n(33, 10, 2), n(45, 14, 2),
        ]),
      ],
      loopBars: 1,
      bpm: 124,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'kick'), [0, 4, 8, 12])) return beatFail('kick is the four-on-the-floor foundation — steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(d, 'clap'), [4, 12])) return beatFail('clap on the backbeat — steps 5 and 13.')
      if (![2, 6, 10, 14].every((s) => laneSteps(d, 'hat').includes(s))) return beatFail('closed hats on the offbeats — steps 3, 7, 11, 15.')
      const p = track(ctx, 'bass').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push(`the osc is ${p.osc.toUpperCase()} (house bass is a SAWTOOTH)`)
      if (p.decay > 0.25) issues.push(`decay is ${p.decay.toFixed(2)}s (shorten it to ≤ 0.25s for a pluck)`)
      if (p.sustain > 0.35) issues.push(`sustain is ${(p.sustain * 100).toFixed(0)}% (drop it to ≤ 35% so each note stops before the next)`)
      if (p.cutoff < 300 || p.cutoff > 2000) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (park it 300–2000Hz to stay round and low)`)
      return soundStage(issues, 'That plucky offbeat bounce against a four-on-the-floor kick IS house. The kick and bass never collide — they take turns. Everything else in a house track is decoration on this.')
    },
  },

  // ---------------- ACID ----------------
  {
    id: 'genre-acid',
    module: GENRES,
    title: 'Acid House — The 303 Squelch',
    summary:
      'ACID HOUSE was an accident: producers in 1987 Chicago misused a Roland TB-303 bass machine and discovered the squelchy, liquid, talking bassline that named a whole genre. Its recipe is exact and reproducible — a sawtooth run through a low, resonant filter with an ENVELOPE opening the cutoff on each note, plus GLIDE sliding the pitch between notes. Get those four controls right and you have the sound that built acid house, acid techno and everything after.',
    task: 'Stage 1 — a straight four-on-the-floor kick (1, 5, 9, 13) plus at least 2 closed hats. Stage 2 — turn the ACID track (a rolling 16th line is loaded) into a 303: sawtooth osc, RESONANCE 8 or higher, CUTOFF low (150–900 Hz), FILTER ENV AMOUNT 40% or more (that\'s the "wow" opening each note), and GLIDE 0.03 s or more (the slide between notes).',
    hints: [
      'Resonance does nothing until the cutoff is low enough to bite — set the cutoff low FIRST, then crank resonance.',
      'Filter Env Amount is the squelch: it sweeps the cutoff up at each note-on and closes it again. Without it the line is static.',
      'Glide is portamento — the pitch slides instead of jumping. It\'s what makes a 303 line feel liquid.',
    ],
    centerPitch: 36,
    visibleParams: [...BASICS, 'resonance', 'filterEnvAmount', 'filterEnvDecay', 'filterEnvSustain', 'glide', 'decay', 'sustain'],
    setup: () => ({
      tracks: [
        synthTrack('acid', 'Acid', '#98c379', { osc: 'sawtooth', cutoff: 3000, resonance: 1, attack: 0.005, decay: 0.15, sustain: 0.4, release: 0.1, filterEnvAmount: 0, glide: 0 }, [
          n(33, 0, 1), n(33, 2, 1), n(45, 3, 1), n(33, 4, 1), n(36, 6, 1), n(33, 8, 1),
          n(45, 9, 1), n(33, 10, 1), n(40, 12, 1), n(33, 14, 1), n(45, 15, 1),
        ]),
        drumTrack(),
      ],
      loopBars: 1,
      bpm: 127,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'kick'), [0, 4, 8, 12])) return beatFail('four-on-the-floor kick — steps 1, 5, 9, 13.')
      if (laneSteps(d, 'hat').length < 2) return beatFail('add at least 2 closed hats to drive it.')
      const p = track(ctx, 'acid').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push(`osc is ${p.osc.toUpperCase()} (the 303 is a SAWTOOTH — try SQUARE later for its other mode)`)
      if (p.resonance < 8) issues.push(`resonance is ${p.resonance.toFixed(1)} (crank it to 8+ for the squelch)`)
      if (p.cutoff < 150 || p.cutoff > 900) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (drop it to 150–900Hz so the resonant peak bites)`)
      if (p.filterEnvAmount < 0.4) issues.push(`filter env amount is ${(p.filterEnvAmount * 100).toFixed(0)}% (raise it to ≥ 40% — that sweep is the "wow")`)
      if (p.glide < 0.03) issues.push(`glide is ${p.glide.toFixed(2)}s (add ≥ 0.03s so notes slide instead of jump)`)
      return soundStage(issues, 'Squelch. That liquid, talking bassline is the TB-303 — resonance for the vowel, the filter envelope for the "wow" on each note, glide for the slide. One machine, one genre.')
    },
  },

  // ---------------- DUBSTEP ----------------
  {
    id: 'genre-dubstep',
    module: GENRES,
    title: 'Dubstep — The Wobble Bass',
    summary:
      'DUBSTEP runs at 140 BPM but FEELS like 70, because the snare hits only once per bar — dead center, on beat 3 (the "half-time" feel). All that empty space is a stage, and onto it walks the WOBBLE BASS: an LFO cycling the filter cutoff open and shut in time with the tempo, so the bass talks in rhythmic "wubs". Sync that LFO to the beat and the wobble locks to the grid — the single most recognisable sound in bass music.',
    task: 'Stage 1 — a half-time beat: SNARE on step 9 only (dead center), KICK on step 1 plus up to 3 more (never on step 9), and 8 hats or fewer. Keep it sparse. Stage 2 — on the BASS track (a held sub note is loaded), build the wobble: LFO DEST = CUTOFF, turn LFO SYNC ON (so it locks to the tempo), and LFO DEPTH 50% or more.',
    hints: [
      'One snare, centre of the bar. Every hit you leave out makes the wobble hit harder.',
      'The wobble is just the LFO from the synthesis module aimed at the cutoff — SYNC is what makes it rhythmic instead of drifting.',
      'Try different SYNC RATE divisions (1/4, 1/8, 1/8 triplet) once it\'s wobbling — each is a different wub speed.',
    ],
    centerPitch: 28,
    visibleParams: [...BASICS, 'resonance', 'lfoDest', 'lfoDepth', 'lfoSync', 'lfoSyncRate', 'lfoRate'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('bass', 'Bass', '#c678dd', { osc: 'sawtooth', cutoff: 2500, resonance: 4, attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.2, lfoDest: 'off', lfoDepth: 0, lfoSync: false, lfoSyncRate: '1/8' }, [
          n(28, 0, 16),
        ]),
      ],
      loopBars: 1,
      bpm: 140,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'snare'), [8])) return beatFail('snare on step 9 only — one hit, dead center, is the half-time feel.')
      const kick = laneSteps(d, 'kick')
      if (!kick.includes(0)) return beatFail('kick must anchor step 1.')
      if (kick.includes(8)) return beatFail('keep the kick off step 9 — the snare owns the center.')
      if (kick.length > 4) return beatFail(`too many kicks (${kick.length}) — half-time lives on space, 4 max.`)
      if (laneSteps(d, 'hat').length + laneSteps(d, 'openhat').length > 8) return beatFail('8 hats or fewer — keep it sparse.')
      const p = track(ctx, 'bass').synth
      const issues: string[] = []
      if (p.lfoDest !== 'cutoff') issues.push(`LFO dest is ${p.lfoDest.toUpperCase()} (aim it at CUTOFF to move the filter)`)
      if (!p.lfoSync) issues.push('LFO SYNC is off (turn it on so the wobble locks to the tempo)')
      if (p.lfoDepth < 0.5) issues.push(`LFO depth is ${(p.lfoDepth * 100).toFixed(0)}% (raise it to ≥ 50% for a deep wub)`)
      return soundStage(issues, 'That talking, rhythmic wub is the wobble bass — a tempo-synced LFO swinging the filter open and shut. Change the sync rate and you change the whole feel of the drop.')
    },
  },

  // ---------------- DRUM & BASS ----------------
  {
    id: 'genre-dnb',
    module: GENRES,
    title: 'Drum & Bass — The Reese',
    summary:
      'DRUM & BASS is breakbeat at 174 BPM — the two-step kick-and-snare skeleton you already know, run at a sprint. Under it sits the REESE BASS, named after Kevin Saunderson\'s 1988 track: two sawtooth oscillators detuned against each other so they beat and grind, filtered dark and menacing. That growling, moving low end is the backbone of every liquid, neurofunk and jungle roller.',
    task: 'Stage 1 — the two-step at 174: KICK on steps 1 and 11, SNARE on steps 5 and 13, at least 6 closed hats. Stage 2 — on the BASS track (long low notes are loaded), build a Reese: keep the sawtooth osc, bring OSC 2 in as a second SAWTOOTH at LEVEL 40%+ and DETUNE 12 cents or more (that\'s the grind), and keep CUTOFF dark at 1500 Hz or below.',
    hints: [
      'The two beating sawtooths ARE the Reese — one detuned against the other creates the slow, moving growl.',
      'More detune = faster, more aggressive beating. Start around 15–25 cents.',
      'Dark filter: a Reese lives in the sub and low-mids, not up top. Roll the cutoff down.',
    ],
    centerPitch: 29,
    visibleParams: [...BASICS, 'osc2Type', 'osc2Level', 'osc2Detune', 'resonance'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('bass', 'Reese', '#e5c07b', { osc: 'sawtooth', cutoff: 1200, resonance: 2, attack: 0.01, decay: 0.3, sustain: 0.9, release: 0.2, osc2Type: 'sawtooth', osc2Level: 0, osc2Detune: 0 }, [
          n(29, 0, 8), n(29, 8, 4), n(31, 12, 4),
        ]),
      ],
      loopBars: 1,
      bpm: 174,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'kick'), [0, 10])) return beatFail('kick on steps 1 and 11 — the two-step skeleton.')
      if (!sameSet(laneSteps(d, 'snare'), [4, 12])) return beatFail('snare on steps 5 and 13 — the backbeat.')
      if (laneSteps(d, 'hat').length < 6) return beatFail('at least 6 closed hats to carry the speed.')
      const p = track(ctx, 'bass').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push(`osc 1 is ${p.osc.toUpperCase()} (a Reese is TWO sawtooths)`)
      if (p.osc2Type !== 'sawtooth') issues.push(`osc 2 is ${p.osc2Type.toUpperCase()} (make it a SAWTOOTH to match osc 1)`)
      if (p.osc2Level < 0.4) issues.push(`osc 2 level is ${(p.osc2Level * 100).toFixed(0)}% (bring it up to ≥ 40% so both saws are audible)`)
      if (p.osc2Detune < 12) issues.push(`osc 2 detune is ${p.osc2Detune.toFixed(0)} cents (push it to ≥ 12 for the grind)`)
      if (p.cutoff > 1500) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (roll it down to ≤ 1500Hz — a Reese is dark)`)
      return soundStage(issues, 'That grinding, beating low end is the Reese — two detuned sawtooths fighting each other under a dark filter. Same two-step you built at 132; at 174 with a Reese it\'s a completely different world.')
    },
  },

  // ---------------- TRANCE ----------------
  {
    id: 'genre-trance',
    module: GENRES,
    title: 'Trance — The Supersaw',
    summary:
      'TRANCE sits on the same four-on-the-floor as house, but its signature is up top: the SUPERSAW LEAD — a wall of detuned sawtooth voices stacked into one huge, shimmering, euphoric sound. Popularised by the Roland JP-8000\'s "Super Saw" waveform, it\'s the sound of every hands-in-the-air festival anthem. More voices, spread apart in tuning, = wider and bigger.',
    task: 'Stage 1 — four-on-the-floor kick (1, 5, 9, 13), clap on 5 and 13, offbeat closed hats (3, 7, 11, 15). Stage 2 — on the LEAD track (a bright melody is loaded), build a supersaw: sawtooth osc, UNISON VOICES = 3 (the full stack), OSC 2 LEVEL 30%+ and DETUNE 12–40 cents (the spread), CUTOFF bright at 3000 Hz or above.',
    hints: [
      'Unison stacks copies of the voice; detune spreads them apart in pitch so they shimmer instead of sitting on one note.',
      'Voices = 3 gives you up + centre + down. Keep the osc a sawtooth — supersaw is in the name.',
      'Bright cutoff: a trance lead sings on top of the mix, so let the highs through.',
    ],
    centerPitch: 69,
    visibleParams: [...BASICS, 'osc2Type', 'osc2Level', 'osc2Detune', 'unisonVoices', 'attack', 'release'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('lead', 'Lead', '#61afef', { osc: 'sawtooth', cutoff: 5000, attack: 0.02, decay: 0.3, sustain: 0.8, release: 0.3, osc2Type: 'sawtooth', osc2Level: 0, osc2Detune: 0, unisonVoices: 1 }, [
          n(69, 0, 4), n(72, 4, 4), n(76, 8, 4), n(72, 12, 4),
        ]),
      ],
      loopBars: 1,
      bpm: 138,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'kick'), [0, 4, 8, 12])) return beatFail('four-on-the-floor kick — steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(d, 'clap'), [4, 12])) return beatFail('clap on the backbeat — steps 5 and 13.')
      if (![2, 6, 10, 14].every((s) => laneSteps(d, 'hat').includes(s))) return beatFail('offbeat closed hats — steps 3, 7, 11, 15.')
      const p = track(ctx, 'lead').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push(`osc is ${p.osc.toUpperCase()} (a supersaw is stacked SAWTOOTHS)`)
      if (p.unisonVoices !== 3) issues.push(`unison voices is ${p.unisonVoices} (set it to 3 for the full stack)`)
      if (p.osc2Level < 0.3) issues.push(`osc 2 level is ${(p.osc2Level * 100).toFixed(0)}% (raise it to ≥ 30% so the stacked voices are audible)`)
      if (p.osc2Detune < 12 || p.osc2Detune > 40) issues.push(`detune is ${p.osc2Detune.toFixed(0)} cents (spread the voices 12–40 cents apart)`)
      if (p.cutoff < 3000) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (open it to ≥ 3000Hz so the lead sings on top)`)
      return soundStage(issues, 'That huge, shimmering wall of sound is the supersaw — detuned sawtooth voices stacked wide. It\'s the entire top end of trance and big-room in one patch.')
    },
  },

  // ---------------- TECHNO ----------------
  {
    id: 'genre-techno',
    module: GENRES,
    title: 'Techno — The Sidechain Pump',
    summary:
      'TECHNO is relentless and hypnotic: a four-on-the-floor kick, open hats washing over the offbeats, and almost nothing else — restraint as an aesthetic. Its production signature is SIDECHAIN COMPRESSION: every other element ducks in volume the instant the kick hits, so the whole track "breathes" and pumps around the kick. It started as a fix (stop the bass clashing with the kick) and became the defining groove of techno and house.',
    task: 'Stage 1 — a techno beat: KICK on 1, 5, 9, 13; OPEN HATS on the offbeats (3, 7, 11, 15); at most 3 other hits total. Stage 2 — on the STAB track (a chord stab is loaded), create the pump: set SIDECHAIN SOURCE to the Drums track, and DUCK AMOUNT to 40% or more so the stab ducks under every kick.',
    hints: [
      'The open-hat wash filling the gaps between kicks IS the techno engine — minimal, hypnotic, driving.',
      'Sidechain "source" = which track\'s kick triggers the duck. Point it at the Drums.',
      'Turn the duck amount up and play it: hear the stab drop out on each kick and swell back between them. That rhythmic pumping is the whole point.',
    ],
    centerPitch: 48,
    visibleParams: [...BASICS, 'duckSource', 'duckAmount', 'attack', 'decay', 'sustain', 'release'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('stab', 'Stab', '#e06c75', { osc: 'sawtooth', cutoff: 2200, attack: 0.01, decay: 0.25, sustain: 0.2, release: 0.15, volume: -12, duckSource: null, duckAmount: 0 }, [
          n(48, 4, 2), n(51, 4, 2), n(55, 4, 2), n(48, 12, 2), n(51, 12, 2), n(55, 12, 2),
        ]),
      ],
      loopBars: 1,
      bpm: 132,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'kick'), [0, 4, 8, 12])) return beatFail('four-on-the-floor kick — steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(d, 'openhat'), [2, 6, 10, 14])) return beatFail('OPEN hats on the offbeats (3, 7, 11, 15) — that wash between kicks is the sound.')
      const extras = laneSteps(d, 'snare').length + laneSteps(d, 'clap').length + laneSteps(d, 'hat').length
      if (extras > 3) return beatFail(`${extras} extra hits — techno is restraint, 3 or fewer.`)
      const p = track(ctx, 'stab').synth
      const issues: string[] = []
      if (p.duckSource !== 'drums') issues.push('sidechain source isn\'t set to the Drums track (that\'s the kick that triggers the duck)')
      if (p.duckAmount < 0.4) issues.push(`duck amount is ${(p.duckAmount * 100).toFixed(0)}% (raise it to ≥ 40% so the pump is obvious)`)
      return soundStage(issues, 'Hear it breathe — the stab ducking under every kick and swelling back between them. That pump is sidechain compression, the groove glue of techno and house.')
    },
  },

  // ---------------- LO-FI HIP-HOP ----------------
  {
    id: 'genre-lofi',
    module: GENRES,
    title: 'Lo-Fi Hip-Hop — Dusty & Warm',
    summary:
      'LO-FI HIP-HOP is boom-bap slowed to a study-beat crawl, built on SAMPLING — a dusty jazz or soul chord looped, chopped and deliberately degraded. The magic is in the imperfection: highs rolled off like an old record, a touch of bitcrush for vinyl grit and tape hiss, warmth over clarity. (Load your own sample any time in the SAMPLE section — the same load-and-chop workflow from the Drum Programming module — then treat it exactly like this.)',
    task: 'Stage 1 — a boom-bap beat at 82 BPM: KICK on step 1 plus one syncopated kick (steps 7–12, but never on 5 or 13), SNARE on 5 and 13, closed hats on at least 6 of the 8th-note steps. Stage 2 — on the CHORDS track (a jazzy 7th chord is loaded), make it dusty: roll the CUTOFF down to 3500 Hz or below (warm, no harsh highs), and add BITCRUSH MIX 15% or more for vinyl grit.',
    hints: [
      'Boom-bap: the kick syncopates against a steady snare backbeat, hats keeping straight 8ths. Classic second-kick spot is step 8 or 11.',
      'Lo-fi is about SUBTRACTING clarity: pull the cutoff down to muffle the highs like a worn cassette.',
      'A little bitcrush goes a long way — it reduces bit depth for that crunchy, degraded, sampled-off-vinyl texture.',
    ],
    centerPitch: 52,
    visibleParams: [...BASICS, 'bitcrushBits', 'bitcrushMix', 'eqHigh', 'attack', 'release'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('chords', 'Chords', '#c678dd', { osc: 'triangle', cutoff: 9000, attack: 0.05, decay: 0.4, sustain: 0.6, release: 0.8, volume: -14, bitcrushBits: 8, bitcrushMix: 0 }, [
          n(45, 0, 16), n(48, 0, 16), n(52, 0, 16), n(55, 0, 16),
        ]),
      ],
      loopBars: 1,
      bpm: 82,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      const kick = laneSteps(d, 'kick')
      if (!kick.includes(0)) return beatFail('kick must anchor step 1 — the BOOM.')
      if (kick.includes(4) || kick.includes(12)) return beatFail('keep kicks off the snare steps (5 and 13) — they take turns.')
      if (!kick.some((s) => [6, 7, 8, 9, 10, 11].includes(s))) return beatFail('add a syncopated second kick (try step 8 or 11) for the boom-bap swing.')
      if (!sameSet(laneSteps(d, 'snare'), [4, 12])) return beatFail('snare on steps 5 and 13 — the BAP.')
      const evenHats = laneSteps(d, 'hat').filter((s) => s % 2 === 0)
      if (evenHats.length < 6) return beatFail(`closed hats on the 8th-note grid (steps 1, 3, 5, 7…) — at least 6 (you have ${evenHats.length}).`)
      const p = track(ctx, 'chords').synth
      const issues: string[] = []
      if (p.cutoff > 3500) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (roll it down to ≤ 3500Hz to muffle the highs like an old record)`)
      if (p.bitcrushMix < 0.15) issues.push(`bitcrush mix is ${(p.bitcrushMix * 100).toFixed(0)}% (add ≥ 15% for vinyl grit)`)
      return soundStage(issues, 'Warm, dusty and degraded — highs rolled off, bitcrush grit on top. That deliberate lo-fi imperfection over a lazy boom-bap beat is the whole genre. Load a real sample in the SAMPLE section and the exact same treatment turns any loop into a lo-fi beat.')
    },
  },

  // ---------------- UK GARAGE ----------------
  {
    id: 'genre-uk-garage',
    module: GENRES,
    title: 'UK Garage — Sub-Bass Weight',
    summary:
      'UK GARAGE (UKG) is the skippy, swung cousin of house — a syncopated "2-step" shuffle where the kick and snare dance around each other instead of marching. Under that bounce sits the genre\'s low-end secret: a SUB-OSCILLATOR. It\'s a pure sine wave running an octave below your main oscillator, adding pure weight and body you feel in your chest more than hear. Garage, dubstep and grime all live or die on this sub.',
    task: 'Stage 1 — a skippy 2-step at 130 BPM: KICK on step 1 plus one syncopated kick (steps 7–11, off the snare), SNARE on 5 and 13, at least 4 closed hats. Stage 2 — on the BASS track (a bouncy line is loaded), add weight: bring the SUB up to 50% or more, and keep the CUTOFF dark at 1500 Hz or below so it stays a proper sub, not a lead.',
    hints: [
      'The sub is a fixed sine one octave down — it adds no new harmonics, just pure low-end body.',
      'Sub-bass is felt, not heard: on laptop speakers you may barely hear it, but it\'s the foundation on a real system.',
      'Keep the cutoff low — a bright bass fights the sub. Garage bass sits deep and dark.',
    ],
    centerPitch: 33,
    visibleParams: [...BASICS, 'subLevel', 'resonance', 'decay', 'sustain'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('bass', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 3500, resonance: 1, attack: 0.005, decay: 0.3, sustain: 0.5, release: 0.2, subLevel: 0 }, [
          n(33, 0, 3), n(45, 3, 1), n(33, 6, 2), n(36, 10, 2), n(33, 12, 3), n(31, 15, 1),
        ]),
      ],
      loopBars: 1,
      bpm: 130,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      const kick = laneSteps(d, 'kick')
      if (!kick.includes(0)) return beatFail('kick must anchor step 1.')
      if (kick.includes(4) || kick.includes(12)) return beatFail('keep kicks off the snare steps (5 and 13) — 2-step is kick and snare taking turns.')
      if (!kick.some((s) => [6, 7, 8, 9, 10, 11].includes(s))) return beatFail('add a syncopated second kick (try step 8, 10 or 11) — the skip is the whole point of 2-step.')
      if (!sameSet(laneSteps(d, 'snare'), [4, 12])) return beatFail('snare on steps 5 and 13 — the backbeat holds the shuffle together.')
      if (laneSteps(d, 'hat').length < 4) return beatFail('add at least 4 closed hats to carry the skip.')
      const p = track(ctx, 'bass').synth
      const issues: string[] = []
      if (p.subLevel < 0.5) issues.push(`sub level is ${(p.subLevel * 100).toFixed(0)}% (raise it to ≥ 50% for the weight)`)
      if (p.cutoff > 1500) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (roll it down to ≤ 1500Hz so the bass stays deep and dark)`)
      return soundStage(issues, 'That deep, chest-hitting weight under a skippy 2-step is UK garage. The sub-oscillator does the heavy lifting — one sine wave an octave down turns a thin bass into a foundation.')
    },
  },

  // ---------------- SYNTHWAVE ----------------
  {
    id: 'genre-synthwave',
    module: GENRES,
    title: 'Synthwave — The Arpeggiator',
    summary:
      'SYNTHWAVE (a.k.a. retrowave / outrun) is a loving throwback to 1980s film and game soundtracks: gated snares, analog pads, and above all the ARPEGGIATOR — a device that takes a held chord and machine-guns its notes out one at a time, in order, locked to the tempo. That relentless, hypnotic run of notes is the sound of every neon-soaked night drive. You hold three notes; the arp plays a thousand.',
    task: 'Stage 1 — a driving 80s beat at 115 BPM: KICK on steps 1 and 9 (beats 1 and 3), SNARE on 5 and 13 (the backbeat), at least 6 closed hats. Stage 2 — on the ARP track (a held chord is loaded), turn the ARPEGGIATOR ON, set its RATE to 2 or higher so it runs, and keep a bright sawtooth so it cuts through.',
    hints: [
      'The arp only has something to play because a CHORD is held — it fans those stacked notes out into a sequence.',
      'Rate = how many arp notes per 16th step. Higher = a faster, more frantic run. Try the UP / DOWN / UP-DOWN patterns too.',
      'A bright sawtooth is the classic synthwave arp tone — let the highs through.',
    ],
    centerPitch: 48,
    visibleParams: [...BASICS, 'arpOn', 'arpRate', 'arpPattern', 'attack', 'release'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('arp', 'Arp', '#c678dd', { osc: 'sawtooth', cutoff: 4000, attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3, arpOn: false, arpRate: 1, arpPattern: 'up' }, [
          n(45, 0, 16), n(48, 0, 16), n(52, 0, 16),
        ]),
      ],
      loopBars: 1,
      bpm: 115,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!sameSet(laneSteps(d, 'kick'), [0, 8])) return beatFail('kick on steps 1 and 9 — beats 1 and 3, the driving 80s pulse.')
      if (!sameSet(laneSteps(d, 'snare'), [4, 12])) return beatFail('snare on steps 5 and 13 — the backbeat.')
      if (laneSteps(d, 'hat').length < 6) return beatFail('at least 6 closed hats to keep it driving.')
      const p = track(ctx, 'arp').synth
      const issues: string[] = []
      if (!p.arpOn) issues.push('the arpeggiator is OFF (turn it ON to fan the held chord into a run)')
      if (p.arpRate < 2) issues.push(`arp rate is ${p.arpRate} (raise it to ≥ 2 so it actually runs)`)
      if (p.osc !== 'sawtooth') issues.push(`osc is ${p.osc.toUpperCase()} (a bright SAWTOOTH is the synthwave arp tone)`)
      if (p.cutoff < 2500) issues.push(`cutoff is ${Math.round(p.cutoff)}Hz (open it to ≥ 2500Hz so the arp cuts through)`)
      return soundStage(issues, 'That relentless, hypnotic run of notes is the arpeggiator — you held three notes and it plays a river of them, locked to the tempo. Pure neon-highway synthwave.')
    },
  },

  // ---------------- FUTURE BASS ----------------
  {
    id: 'genre-future-bass',
    module: GENRES,
    title: 'Future Bass — Supersaw Chords That Breathe',
    summary:
      'FUTURE BASS is where two techniques you already know collide: Trance\'s SUPERSAW and Techno\'s SIDECHAIN PUMP — but applied to lush, detuned CHORDS instead of a lead or a stab. The chord swells in the gaps and ducks on every kick/clap, so the whole thing "breathes" in that emotional, rhythmic way the genre is built on. This is the payoff lesson: signature elements from earlier genres, recombined into something new.',
    task: 'Stage 1 — a big half-time drop beat at 150 BPM: KICK on step 1 (plus optionally more), a CLAP on step 9 (the huge backbeat), some hats. Stage 2 — on the CHORDS track (a held chord is loaded), build the future-bass sound: sawtooth osc, UNISON VOICES = 3 with OSC 2 LEVEL 30%+ and DETUNE 12–40 cents (the supersaw width), then SIDECHAIN it — set SOURCE to Drums and DUCK AMOUNT to 40%+ so the chord pumps.',
    hints: [
      'This is Trance\'s supersaw (unison + detune) plus Techno\'s pump (sidechain duck), together on a chord.',
      'The sidechain is what makes it "breathe" — the chord ducks under every kick and swells back between hits.',
      'Detune spreads the stacked voices; the pump gives it rhythm. Both at once = the future-bass drop.',
    ],
    centerPitch: 60,
    visibleParams: [...BASICS, 'osc2Type', 'osc2Level', 'osc2Detune', 'unisonVoices', 'duckSource', 'duckAmount', 'sustain'],
    setup: () => ({
      tracks: [
        drumTrack(),
        synthTrack('chords', 'Chords', '#98c379', { osc: 'sawtooth', cutoff: 6000, attack: 0.02, decay: 0.3, sustain: 0.9, release: 0.3, osc2Type: 'sawtooth', osc2Level: 0, osc2Detune: 0, unisonVoices: 1, duckSource: null, duckAmount: 0 }, [
          n(60, 0, 16), n(64, 0, 16), n(67, 0, 16),
        ]),
      ],
      loopBars: 1,
      bpm: 150,
      selectedTrackId: 'drums',
    }),
    validate: (ctx) => {
      const d = track(ctx, 'drums')
      if (!laneSteps(d, 'kick').includes(0)) return beatFail('kick must anchor step 1.')
      if (!laneSteps(d, 'clap').includes(8)) return beatFail('put a CLAP on step 9 — the huge half-time backbeat on beat 3.')
      if (laneSteps(d, 'hat').length + laneSteps(d, 'openhat').length < 2) return beatFail('add at least a couple of hats for movement.')
      const p = track(ctx, 'chords').synth
      const issues: string[] = []
      if (p.osc !== 'sawtooth') issues.push(`osc is ${p.osc.toUpperCase()} (a supersaw is stacked SAWTOOTHS)`)
      if (p.unisonVoices !== 3) issues.push(`unison voices is ${p.unisonVoices} (set it to 3 for the full supersaw stack)`)
      if (p.osc2Level < 0.3) issues.push(`osc 2 level is ${(p.osc2Level * 100).toFixed(0)}% (raise it to ≥ 30% so the stacked voices sound)`)
      if (p.osc2Detune < 12 || p.osc2Detune > 40) issues.push(`detune is ${p.osc2Detune.toFixed(0)} cents (spread the voices 12–40 cents for width)`)
      if (p.duckSource !== 'drums') issues.push('sidechain source isn\'t set to Drums (that\'s the kick/clap that triggers the pump)')
      if (p.duckAmount < 0.4) issues.push(`duck amount is ${(p.duckAmount * 100).toFixed(0)}% (raise it to ≥ 40% so the chord breathes)`)
      return soundStage(issues, 'A lush, detuned supersaw chord that breathes on every hit — Trance\'s width plus Techno\'s pump, recombined. That\'s future bass, and that\'s how every genre is built: signature elements, borrowed and combined.')
    },
  },
]

export const GENRE_MODULES: Module[] = [{ name: GENRES, lessons: genreLessons }]
