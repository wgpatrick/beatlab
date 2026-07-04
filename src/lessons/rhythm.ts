import { DRUM_LABELS, DRUM_LANES } from '../types'
import {
  drumTrack,
  fail,
  laneSteps,
  pass,
  rand,
  sameSet,
  track,
  type DrumHit,
  type Lesson,
  type Module,
} from './framework'

const DRUMS = 'Drum Programming'
const STYLES = 'Rhythm Styles'

// ================= MODULE 6: DRUM PROGRAMMING =================

const drumLessons: Lesson[] = [
  {
    id: 'four-on-floor',
    module: DRUMS,
    title: 'Four on the Floor',
    summary:
      'The heartbeat of house and techno: a kick drum on every quarter note — beats 1, 2, 3, 4. The 16-step grid below is one bar; each group of 4 steps is one beat. This pattern has powered dancefloors for 50 years.',
    task: 'Program a four-on-the-floor kick: hits on steps 1, 5, 9 and 13. Just the kick lane for now.',
    hints: [
      'The first step of each group of four.',
      'Press play — at 124 BPM this should make your head nod involuntarily.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 124, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      const kick = laneSteps(t, 'kick')
      if (!sameSet(kick, [0, 4, 8, 12]))
        return fail(kick.length === 0 ? 'The kick lane is empty — light up steps 1, 5, 9 and 13.' : 'Kick should be on steps 1, 5, 9, 13 — the first step of each beat — and nothing else.')
      for (const lane of ['snare', 'clap', 'hat', 'openhat'] as const) {
        if (laneSteps(t, lane).length > 0) return fail(`Keep the other lanes empty for now — just the kick. (${DRUM_LABELS[lane]} has hits.)`)
      }
      return pass('Boom. Four on the floor — the foundation of house, techno, trance and disco.')
    },
  },
  {
    id: 'backbeat',
    module: DRUMS,
    title: 'The Backbeat',
    summary:
      'Beats 2 and 4 are the BACKBEAT — where the snare or clap lands in almost all popular music. Against a four-on-the-floor kick, the clap creates the push-pull that makes people move.',
    task: 'Keep the kick on 1, 5, 9, 13 and add CLAPS exactly on steps 5 and 13 (beats 2 and 4).',
    hints: ['Beat 2 = step 5, beat 4 = step 13.', 'The clap lands ON TOP of a kick — that\'s normal, they reinforce each other.'],
    setup: () => ({ tracks: [drumTrack({ kick: [0, 4, 8, 12] })], loopBars: 1, bpm: 124, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 4, 8, 12])) return fail('Keep the kick on steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(t, 'clap'), [4, 12])) return fail('Claps go exactly on steps 5 and 13 — beats 2 and 4, nowhere else.')
      return pass('Kick and clap — the rhythmic skeleton of nearly every dance record ever made.')
    },
  },
  {
    id: 'offbeat-hats',
    module: DRUMS,
    title: 'Offbeat Hats',
    summary:
      'The hi-hat on the OFFBEAT — exactly between the kicks — is what makes house music bounce. It\'s the "and" when you count "1-and-2-and-3-and-4-and". Kick says DOWN, hat says UP.',
    task: 'Keep kick and clap, and add CLOSED HATS exactly on steps 3, 7, 11 and 15 — the offbeats.',
    hints: ['The third step of each group of four — dead between the kicks.', 'Play it: the bounce appears instantly.'],
    setup: () => ({ tracks: [drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12] })], loopBars: 1, bpm: 124, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 4, 8, 12])) return fail('Keep the kick on steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(t, 'clap'), [4, 12])) return fail('Keep the claps on steps 5 and 13.')
      if (!sameSet(laneSteps(t, 'hat'), [2, 6, 10, 14])) return fail('Closed hats go exactly on steps 3, 7, 11, 15 — right between the kicks.')
      return pass('That bounce is the offbeat. Kick down, hat up — the engine of house music.')
    },
  },
  {
    id: 'sixteenth-hats',
    module: DRUMS,
    title: '16th-Note Drive',
    summary:
      'Fill (almost) every 16th with closed hats and the groove shifts from bouncing to DRIVING — the relentless top-end motion of techno, trance and big-room house. In a real DAW you\'d vary the velocities; here, feel what density alone does.',
    task: 'Keep the kick (1, 5, 9, 13) and claps (5, 13), and fill the CLOSED HAT lane on at least 14 of the 16 steps.',
    hints: [
      'Fill all 16, then try removing one or two — tiny gaps create accents.',
      'Compare against the offbeat pattern: same tempo, totally different energy.',
    ],
    setup: () => ({ tracks: [drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] })], loopBars: 1, bpm: 128, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 4, 8, 12])) return fail('Keep the kick on steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(t, 'clap'), [4, 12])) return fail('Keep the claps on steps 5 and 13.')
      const hats = laneSteps(t, 'hat')
      if (hats.length < 14) return fail(`Fill the closed-hat lane — at least 14 of 16 steps (you have ${hats.length}).`)
      return pass('Relentless. Density = drive. Now you have two hat vocabularies: bounce (offbeats) and drive (16ths).')
    },
  },
  {
    id: 'dotted-hats',
    module: DRUMS,
    title: 'The 3-Against-4 Trick',
    summary:
      'Place hits every 3 steps against a 4-step kick grid and the accents drift across the beat — a POLYRHYTHM. It resolves perfectly after one bar (16 isn\'t divisible by 3, but 0-3-6-9-12-15 lands back on 0). This "dotted 8th" pattern is all over techno and melodic house.',
    task: 'Keep the four-on-the-floor kick, and place CLOSED HATS exactly on steps 1, 4, 7, 10, 13, 16 — every 3 steps.',
    hints: [
      'Steps 1, 4, 7, 10, 13, 16 (indexes 0, 3, 6, 9, 12, 15).',
      'Listen to how the hats and kicks line up, drift apart, and re-align — that tension is the hook.',
    ],
    setup: () => ({ tracks: [drumTrack({ kick: [0, 4, 8, 12] })], loopBars: 1, bpm: 126, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 4, 8, 12])) return fail('Keep the kick on steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(t, 'hat'), [0, 3, 6, 9, 12, 15]))
        return fail('Hats go every 3 steps: 1, 4, 7, 10, 13, 16. Count 3 from each hat to place the next.')
      return pass('Hear it lock, drift, and lock again? 3-against-4 — instant sophistication from one simple rule.')
    },
  },
  {
    id: 'full-groove',
    module: DRUMS,
    title: 'Make It Groove',
    summary:
      'Now make it yours. The core (kick 4-to-the-floor, backbeat, offbeat hats) stays, but grooves come alive through detail: extra 16th-note hats, an open hat before the bar turns around, a sneaky ghost snare. Add character without losing the skeleton.',
    task: 'Build a full groove: keep the core pattern, use at least 6 closed hats (including the 4 offbeats), add at least one OPEN HAT, and at least 12 hits total across all lanes.',
    hints: [
      'Open hat on step 15 or 16 creates a lift into the next bar.',
      'Extra closed hats on 16th positions (e.g. steps 4, 8) add drive.',
      'A quiet snare on step 8 or 16 (odd spots) = ghost note funk.',
    ],
    setup: () => ({ tracks: [drumTrack({ kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14] })], loopBars: 1, bpm: 126, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      const kick = laneSteps(t, 'kick')
      if (![0, 4, 8, 12].every((s) => kick.includes(s))) return fail('Keep the four-on-the-floor kick as the foundation (steps 1, 5, 9, 13).')
      const clap = [...laneSteps(t, 'clap'), ...laneSteps(t, 'snare')]
      if (!(clap.includes(4) && clap.includes(12))) return fail('Keep the backbeat: clap or snare on steps 5 and 13.')
      const hats = laneSteps(t, 'hat')
      if (![2, 6, 10, 14].every((s) => hats.includes(s))) return fail('Keep the offbeat hats (steps 3, 7, 11, 15) as part of your pattern.')
      if (hats.length < 6) return fail(`Add more closed hats for drive — at least 6 total (you have ${hats.length}).`)
      if (laneSteps(t, 'openhat').length === 0) return fail('Add at least one open hat — try step 15 or 16 for a lift into the loop point.')
      const total = DRUM_LANES.reduce((acc, l) => acc + laneSteps(t, l).length, 0)
      if (total < 12) return fail(`More detail — at least 12 hits total (you have ${total}).`)
      return pass('That grooves. You just did what a drummer calls "playing the kit, not the pattern".')
    },
  },
  {
    id: 'sampling-load-and-chop',
    module: DRUMS,
    title: 'Sampling: Load & Chop',
    summary:
      'Sampling means using a real recorded sound instead of a synthesized one. Load any short audio file — a drum loop, a vocal snippet, anything a couple seconds long — and it auto-slices into 5 equal chunks, one per pad, replacing the synthesized kick/snare/hat/clap/openhat lane-for-lane. Program a pattern with those pads exactly like you would with the synthesized kit; the step sequencer doesn\'t know or care where the sound came from.',
    task: 'In the SAMPLE section of the device panel, load any short audio file you have, then program at least 6 hits across the pads using your loaded sample.',
    hints: [
      'Any short audio file works — this app doesn\'t ship one for you, on purpose (no license to hand out someone else\'s recording). A phone voice memo, a drum loop, even a music file all work.',
      'This is exactly Ableton Simpler\'s "Region" slice mode — divide into N equal parts — one of its four slicing modes (the others: Transient, Beat, Manual).',
      'Compare it against the synthesized kit by clicking Clear — same pattern, completely different sound source.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 120, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      if (!ctx.sampleLoaded) return fail('No sample loaded yet — use Load Sample in the device panel\'s SAMPLE section.')
      const t = track(ctx, 'drums')
      const total = DRUM_LANES.reduce((acc, l) => acc + laneSteps(t, l).length, 0)
      if (total < 6) return fail(`Program at least 6 hits using your loaded sample\'s pads (you have ${total}).`)
      return pass(`Loaded "${ctx.sampleLoaded.name}", sliced across 5 pads, sequenced exactly like the synthesized kit — that\'s the core sampling workflow every drum-sampler plugin builds on.`)
    },
  },
]

// ================= MODULE 7: RHYTHM STYLES =================

const styleLessons: Lesson[] = [
  {
    id: 'breakbeat',
    module: STYLES,
    title: 'Breakbeat / 2-Step',
    summary:
      'Kill the four-on-the-floor and syncopate the kick, and you\'re in breakbeat territory — the skeleton of UK garage, breaks and 2-step. The kick hits beat 1, skips beat 2, and lands mid-bar on the "and" of beat 3. The snare keeps the backbeat so the groove stays danceable.',
    task: 'Program the 2-step skeleton at 132 BPM: KICK exactly on steps 1 and 11, SNARE exactly on steps 5 and 13, and at least 4 closed hats anywhere.',
    hints: [
      'Step 11 is the "and" of beat 3 — that gap where beat 3\'s kick should be IS the groove.',
      'Try offbeat hats first, then experiment.',
      'Count it: BOOM - cat - ... - BOOM(and) - cat.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 132, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 10]))
        return fail('Kick goes exactly on steps 1 and 11 — the second kick lands just before beat 3\'s offbeat, not on a downbeat.')
      if (!sameSet(laneSteps(t, 'snare'), [4, 12])) return fail('Snare exactly on steps 5 and 13 — the backbeat holds it together.')
      if (laneSteps(t, 'hat').length < 4) return fail('Add at least 4 closed hats to carry the top end.')
      return pass('That skip in the kick is the 2-step signature. Same drums, moved two steps — a whole new genre.')
    },
  },
  {
    id: 'boom-bap',
    module: STYLES,
    title: 'Boom Bap (Hip-Hop)',
    summary:
      'Slow it to ~90 BPM, put the kick on 1 plus a syncopated hit, snare cracking on 2 and 4, hats marking straight 8ths — that\'s BOOM BAP, the classic hip-hop pattern. The groove comes from the kick\'s syncopation rubbing against the square hats.',
    task: 'At 92 BPM: KICK on step 1 plus at least one syncopated kick (somewhere in steps 7–12 or 15, but never on 5 or 13), SNARE exactly on 5 and 13, and CLOSED HATS on at least 6 of the 8th-note steps (1, 3, 5, 7, 9, 11, 13, 15).',
    hints: [
      'Classic second-kick spots: step 8 ("and" of 2), step 11 or 12 (into beat 4).',
      'Hats on every 8th (steps 1, 3, 5, 7...) — steady, like a metronome nodding.',
      'No kick on the snare steps — let the snare crack alone.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 92, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      const kick = laneSteps(t, 'kick')
      if (!kick.includes(0)) return fail('The kick must anchor step 1 — the BOOM.')
      if (kick.includes(4) || kick.includes(12)) return fail('Keep kicks off the snare steps (5 and 13) — kick and snare take turns in boom bap.')
      if (!kick.some((s) => [6, 7, 8, 9, 10, 11, 14].includes(s)))
        return fail('Add a syncopated second kick (try step 8, 11 or 12) — one kick alone is a metronome, not a groove.')
      if (!sameSet(laneSteps(t, 'snare'), [4, 12])) return fail('Snare exactly on steps 5 and 13 — the BAP.')
      const hats = laneSteps(t, 'hat')
      const evenHats = hats.filter((s) => s % 2 === 0)
      if (evenHats.length < 6) return fail(`Hats on the 8th-note grid (odd-numbered steps 1, 3, 5...) — at least 6 (you have ${evenHats.length}).`)
      return pass('Boom... BAP. The head-nod is mandatory. Notice how much groove 92 BPM finds that 126 never could.')
    },
  },
  {
    id: 'drum-and-bass',
    module: STYLES,
    title: 'Drum & Bass',
    summary:
      'Take the breakbeat skeleton and run it at 174 BPM and you get DRUM & BASS. Same kick-and-snare shape as the 2-step you already built — the tempo alone transforms it from a groove into a torrent. This is why producers say patterns are tempo-relative.',
    task: 'At 174 BPM: KICK exactly on steps 1 and 11, SNARE exactly on steps 5 and 13, at least 6 closed hats.',
    hints: [
      'It\'s literally your breakbeat pattern — check how different it feels at this tempo.',
      'DnB hats often run straight 8ths to keep the blur readable.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 174, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 10])) return fail('Kick exactly on steps 1 and 11.')
      if (!sameSet(laneSteps(t, 'snare'), [4, 12])) return fail('Snare exactly on steps 5 and 13.')
      if (laneSteps(t, 'hat').length < 6) return fail('At least 6 closed hats to carry the speed.')
      return pass('Same pattern as your 2-step, +42 BPM — and it\'s a completely different genre. Tempo IS a compositional choice.')
    },
  },
  {
    id: 'half-time',
    module: STYLES,
    title: 'Half-Time Feel',
    summary:
      'Put the snare only in the MIDDLE of the bar (beat 3) and the bar feels twice as long — the HALF-TIME feel of trap, dubstep and downtempo. Nothing about the tempo changed; you just moved where the weight lands. Space becomes the instrument.',
    task: 'At 80 BPM: SNARE exactly on step 9 (beat 3), KICK on step 1 plus up to 3 more kicks anywhere except step 9, and at most 8 hats. Keep it sparse.',
    hints: [
      'One snare per bar. That\'s the whole trick.',
      'A kick on step 8 or 11 (just off the snare) adds limp — in the good way.',
      'Every hit you DON\'T place makes the ones you did place heavier.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 80, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'snare'), [8])) return fail('Snare exactly on step 9 — one hit, dead center of the bar.')
      const kick = laneSteps(t, 'kick')
      if (!kick.includes(0)) return fail('Kick must anchor step 1.')
      if (kick.length > 4) return fail(`Too many kicks (${kick.length}) — half-time lives on space. 4 max.`)
      if (kick.includes(8)) return fail('Keep the kick off step 9 — the snare owns the center.')
      const hats = laneSteps(t, 'hat').length + laneSteps(t, 'openhat').length
      if (hats > 8) return fail(`Too many hats (${hats}) — 8 max. Sparse is the point.`)
      return pass('Feel it drag — in the best way. Half the events, double the weight. That\'s trap and dubstep\'s whole posture.')
    },
  },
  {
    id: 'minimal-techno',
    module: STYLES,
    title: 'Minimal Techno',
    summary:
      'Techno\'s discipline: a four-on-the-floor kick, OPEN hats on the offbeats (longer and washier than closed hats — they smear across the gap), and almost nothing else. Minimal isn\'t empty; it\'s restraint. Every element you leave out makes the remaining ones hypnotic.',
    task: 'At 130 BPM: KICK exactly on 1, 5, 9, 13; OPEN HATS exactly on the offbeats (3, 7, 11, 15); and at most 3 other hits total across snare, clap and closed hat.',
    hints: [
      'The open hat\'s wash filling the gap between kicks IS the techno pump.',
      'For your ≤3 extra hits: try a single clap on 5, or a lone closed hat somewhere odd.',
    ],
    setup: () => ({ tracks: [drumTrack()], loopBars: 1, bpm: 130, selectedTrackId: 'drums' }),
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      if (!sameSet(laneSteps(t, 'kick'), [0, 4, 8, 12])) return fail('Kick exactly on steps 1, 5, 9, 13.')
      if (!sameSet(laneSteps(t, 'openhat'), [2, 6, 10, 14]))
        return fail('OPEN hats exactly on the offbeats (steps 3, 7, 11, 15) — the wash between the kicks is the sound.')
      const extras = laneSteps(t, 'snare').length + laneSteps(t, 'clap').length + laneSteps(t, 'hat').length
      if (extras > 3) return fail(`${extras} extra hits — minimal means 3 or fewer. Delete until it hurts, then delete one more.`)
      return pass('Hypnotic. Kick, wash, kick, wash. Restraint as a genre — and a lesson for every genre.')
    },
  },
  {
    id: 'rhythm-dictation',
    module: STYLES,
    title: 'Drill: Rhythm Dictation',
    summary:
      'The rhythm version of ear training: hear a short beat, program it back from memory. Each round generates a random pattern (kick, snare, hats). This trains the skill of transcribing grooves from records — where most producers actually learn their drums.',
    task: 'Press PLAY TARGET BEAT to hear the pattern (it plays twice), then program exactly what you hear — kick, snare and closed hat lanes. Reroll for a new pattern.',
    hints: [
      'Listen for the kick first (lowest), then snare (crack), then hats (tick).',
      'The kick always hits step 1. The snare is on a backbeat step: 5 or 13.',
      'Hats are on offbeats (steps 3, 7, 11 or 15).',
    ],
    drill: true,
    drumTarget: (p) => p.hits as DrumHit[],
    setup: () => {
      const kick = [0, rand([6, 8, 10])]
      const snare = [rand([4, 12])]
      const hatCount = rand([2, 3])
      const offbeats = [2, 6, 10, 14].sort(() => Math.random() - 0.5)
      const hat = offbeats.slice(0, hatCount).sort((a, b) => a - b)
      const hits: DrumHit[] = [
        ...kick.map((step) => ({ lane: 'kick' as const, step })),
        ...snare.map((step) => ({ lane: 'snare' as const, step })),
        ...hat.map((step) => ({ lane: 'hat' as const, step })),
        // play it twice
        ...kick.map((step) => ({ lane: 'kick' as const, step: step + 16 })),
        ...snare.map((step) => ({ lane: 'snare' as const, step: step + 16 })),
        ...hat.map((step) => ({ lane: 'hat' as const, step: step + 16 })),
      ]
      return {
        tracks: [drumTrack()],
        loopBars: 1,
        bpm: 100,
        selectedTrackId: 'drums',
        params: { kick, snare, hat, hits },
      }
    },
    validate: (ctx) => {
      const t = track(ctx, 'drums')
      const { kick, snare, hat } = ctx.params as { kick: number[]; snare: number[]; hat: number[] }
      if (!sameSet(laneSteps(t, 'kick'), kick)) return fail('The kick lane doesn\'t match — listen again for the low BOOMs. (The first is always step 1.)')
      if (!sameSet(laneSteps(t, 'snare'), snare)) return fail('The snare doesn\'t match — is that crack on beat 2 (step 5) or beat 4 (step 13)?')
      if (!sameSet(laneSteps(t, 'hat'), hat)) return fail(`The hats don't match — count the ticks between kicks (there are ${hat.length}, all on offbeats).`)
      if (laneSteps(t, 'clap').length || laneSteps(t, 'openhat').length) return fail('This pattern only uses kick, snare and closed hat — clear the other lanes.')
      return pass('Transcribed by ear — that\'s how producers steal grooves respectfully. Reroll and go again.')
    },
  },
]

export const RHYTHM_MODULES: Module[] = [
  { name: DRUMS, lessons: drumLessons },
  { name: STYLES, lessons: styleLessons },
]
