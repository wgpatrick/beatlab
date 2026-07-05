// Track Deconstruction: the "study a full song like a producer" curriculum, built around Track
// Lab (import any song you own → BeatLab analyzes BPM, energy, frequency bands, and proposes
// section boundaries → you do the actual listening work). The methodology comes straight from
// how producers describe learning this skill (see docs/DECONSTRUCTION.md): count bars, map the
// structure with locators, table the elements per section, then steal what you learned —
// rebuild the skeleton and chop the break.

import type { SectionType } from '../types'
import { sectionAvg, type TrackAnalysis } from '../audio/analysis'
import type { TrackLabState } from '../state/trackLabState'
import { drumTrack, fail, pass, type Lesson, type Module, type ValidateResult } from './framework'

const DECON = 'Track Deconstruction'

/**
 * Grades the student's section labels against the *audio itself* — the trick that makes labeling
 * an unknown, user-imported song gradeable at all. There is no ground-truth structure for a song
 * BeatLab has never heard, but the energy/band data implies hard constraints any correct map
 * satisfies: Drops are the loud, bass-heavy peaks; Breakdowns lose the low end; Buildups exist to
 * set up Drops; Intros/Outros live at the edges. Grading those constraints is exactly the
 * listening skill being taught.
 */
export function gradeStructureMap(analysis: TrackAnalysis, labels: (SectionType | null)[]): ValidateResult {
  const unlabeled = labels.filter((l) => l === null).length
  if (labels.length === 0) return fail('No sections to label yet — import a song in Track Lab first.')
  if (unlabeled > 0) return fail(`Label every section — ${unlabeled} still unlabeled. Loop each one and ask: is the energy rising, peaking, or breathing?`)

  const secs = labels as SectionType[]
  const avgs = analysis.sections.map((s) => sectionAvg(analysis, s))
  const barsOf = (i: number) => `bars ${analysis.sections[i].startBar + 1}–${analysis.sections[i].endBar}`

  const dropIdxs = secs.flatMap((l, i) => (l === 'Drop' ? [i] : []))
  if (dropIdxs.length === 0) return fail('No section is labeled Drop. Every dance track has at least one payoff section — find the loudest, fullest stretch.')

  // Intro/Outro live at the edges by definition
  for (let i = 1; i < secs.length; i++) {
    if (secs[i] === 'Intro') return fail(`Section ${i + 1} (${barsOf(i)}) is labeled Intro, but it's mid-track. A quiet stretch in the middle is a Breakdown — the intro is only ever the opening.`)
  }
  for (let i = 0; i < secs.length - 1; i++) {
    if (secs[i] === 'Outro') return fail(`Section ${i + 1} (${barsOf(i)}) is labeled Outro but the track keeps going after it. The outro is the wind-down at the very end.`)
  }

  // if the track opens quiet, that opening is an Intro
  const maxRms = Math.max(...avgs.map((a) => a.rms))
  if (secs[0] !== 'Intro' && avgs[0].rms < 0.6 * maxRms) {
    return fail(`Section 1 (${barsOf(0)}) is one of the quieter parts of the track — that's a classic mixable Intro, not a ${secs[0]}.`)
  }

  // Drops must actually be loud, bass-carrying peaks
  for (const i of dropIdxs) {
    if (avgs[i].rms < 0.55 * maxRms) {
      return fail(`Section ${i + 1} (${barsOf(i)}) is labeled Drop, but its energy is only ${Math.round((avgs[i].rms / maxRms) * 100)}% of the track's peak. Drops are the loudest, fullest sections — watch the energy curve.`)
    }
  }

  // Breakdowns lose the low end relative to the drops — the single most audible structure cue
  const dropLowMax = Math.max(...dropIdxs.map((i) => avgs[i].low))
  for (let i = 0; i < secs.length; i++) {
    if (secs[i] === 'Breakdown' && avgs[i].low > 0.9 * dropLowMax) {
      return fail(`Section ${i + 1} (${barsOf(i)}) is labeled Breakdown, but its low band is still pumping as hard as your Drops. A breakdown is where the kick and bass step out — watch the LOW strip.`)
    }
  }

  // a Buildup's only job is to set up a Drop
  for (let i = 0; i < secs.length; i++) {
    if (secs[i] !== 'Buildup') continue
    if (i === secs.length - 1) return fail(`The last section is labeled Buildup — building into what? A Buildup's job is to set up a Drop.`)
    if (secs[i + 1] !== 'Drop' && secs[i + 1] !== 'Buildup') {
      return fail(`Section ${i + 1} (${barsOf(i)}) is a Buildup, but the next section is a ${secs[i + 1]}. Tension needs a payoff — a Buildup leads into a Drop.`)
    }
  }

  const arc = secs.join(' → ')
  return pass(
    `That map holds up against the audio: ${arc}. Now check the bar math — sections in dance music run in multiples of 8 (8/16/32 bars). Count yours on the timeline and you'll see why DJs can mix records they've never heard.`,
  )
}

// every Track Lab lesson keeps the instrument minimal — the work happens in the Track Lab tab
const minimalSetup = () => ({
  tracks: [drumTrack()],
  loopBars: 1,
  bpm: 124,
  selectedTrackId: 'drums',
})

/** ≥2 distinct elements listed, e.g. "kick, sub bass" or lines — the element-table discipline */
const elementCount = (note: string) => note.split(/[,\n;+·/]+/).map((s) => s.trim()).filter(Boolean).length

const deconLessons: Lesson[] = [
  {
    id: 'deconstruct-import',
    module: DECON,
    title: "The Producer's X-Ray",
    summary:
      'The fastest way to level up: take a track you love apart and see what makes it work. Producers call this deconstructing a reference track — count the bars, map the sections, listen for which elements enter and leave. Track Lab is BeatLab\'s X-ray machine for this: import any song file you have and it detects the tempo, draws the energy curve, splits the sound into LOW / MID / HIGH bands, and proposes section boundaries. Everything runs locally in your browser — nothing is uploaded.',
    task: 'Open TRACK LAB (top-right, next to Sandbox), drop in a song file you love (mp3 / wav / m4a...), and let it analyze. Explore: press ▶ on a few sections and watch the band strips. Then come back to this lesson and Check.',
    hints: [
      'Pick a dance track you know well — house, techno, DnB — the structure conventions are strongest there.',
      'The LOW strip is the kick + bass. Watch it vanish mid-track: you just found the breakdown.',
      'Detected the wrong tempo? The ×2 / ÷2 buttons fix the classic half/double-time mistake.',
    ],
    setup: minimalSetup,
    validate: (ctx) => {
      const tl = ctx.trackLab
      if (!tl || !tl.analysis) return fail('No song analyzed yet — open Track Lab (top-right) and drop in an audio file.')
      return pass(
        `Analyzed "${tl.fileName}": ${tl.analysis.bpm} BPM, ${tl.analysis.barCount} bars, ${tl.analysis.sections.length} sections proposed. That grid is your map — next lesson: label it.`,
      )
    },
  },
  {
    id: 'deconstruct-structure-map',
    module: DECON,
    title: 'Map the Structure',
    summary:
      'The core deconstruction exercise, exactly as producers do it with locators in a DAW: listen through the track and name every section — Intro, Buildup, Drop, Breakdown, Outro. BeatLab grades your map against the audio itself: Drops must actually be the loud, bass-heavy peaks; a Breakdown must actually lose its low end; a Buildup must actually lead somewhere. If the checker pushes back, that\'s the ear-training working.',
    task: 'In TRACK LAB, label every detected section using the dropdowns under the timeline, then hit CHECK MAP there (or Check here — same grader). Loop each section with its ▶ button before you commit to a label.',
    hints: [
      'Start by finding the loudest, fullest section — that\'s a Drop. Anchor everything else around it.',
      'The LOW band strip is your breakdown detector: where the bass disappears, the floor floats.',
      'Merged or odd-looking sections? The boundary detector is honest but approximate — label what you HEAR; the grader listens to averages, not edges.',
    ],
    setup: minimalSetup,
    validate: (ctx) => {
      const tl = ctx.trackLab
      if (!tl || !tl.analysis) return fail('Import a song in Track Lab first (see the previous lesson).')
      return gradeStructureMap(tl.analysis, tl.labels)
    },
  },
  {
    id: 'deconstruct-layers',
    module: DECON,
    title: 'The Element Table',
    summary:
      'Attack Magazine\'s famous "Deconstructed" series breaks every track into a table: for each section, exactly which elements are playing — kick, sub, hats, chords, vocal chops, FX risers. Building that table yourself is the deepest listening exercise there is: it forces you to hear a mix as layers instead of a wall. Loop a section, close your eyes, count what you hear, write it down.',
    task: 'In TRACK LAB, fill in the "elements you hear" field for at least 4 sections (or all of them, if the track has fewer), listing at least 2 elements in each — e.g. "kick, sub bass, closed hats, vocal chop".',
    hints: [
      'Sweep your attention band by band: what\'s in the lows? mids? highs? The strips tell you where to listen.',
      'Listen to one section at least 3 times: pass 1 drums, pass 2 bass/harmony, pass 3 everything else.',
      'Can\'t name a sound? Describe it — "metallic pluck", "airy noise riser". Naming is the skill.',
    ],
    setup: minimalSetup,
    validate: (ctx) => {
      const tl = ctx.trackLab
      if (!tl || !tl.analysis) return fail('Import a song in Track Lab first.')
      const needed = Math.min(4, tl.analysis.sections.length)
      const good = tl.notes.filter((note) => elementCount(note ?? '') >= 2).length
      if (good < needed) {
        return fail(
          `${good}/${needed} sections have an element list with 2+ elements so far. Loop a section, count the layers, and write them into its "elements you hear" field (comma-separated).`,
        )
      }
      return pass('That\'s a real element table — the same artifact Attack Magazine builds for every track it deconstructs. Notice how few elements each section actually has: pro tracks are sparser than they sound.'
      )
    },
  },
  {
    id: 'deconstruct-skeleton',
    module: DECON,
    title: 'Steal the Skeleton',
    summary:
      'Structure is the one thing you can legally steal outright. Producers routinely lay a reference track\'s section map under their own arrangement and build into it — the energy curve is proven, the sounds are yours. Track Lab turns your labeled map into a BeatLab arrangement: each analyzed section becomes a slot in the energy grid, with a starting guess at which instruments play based on the bands (low band → drums/bass, mids → chords, highs → lead).',
    task: 'In TRACK LAB, press USE AS TEMPLATE (it appears once your map passes the check). You\'ll land in the Sandbox with your song\'s skeleton loaded into the arrangement grid — press Play, listen to the miniature arc, and tweak at least a few cells to make it yours.',
    hints: [
      'The template is a scaled miniature: each of your song\'s sections becomes one 2-bar slot.',
      'The pre-filled cells are a guess from the band analysis — trust your map over the guess.',
      'This is how producers actually use reference tracks: the structure is the scaffolding, never the sounds.',
    ],
    setup: minimalSetup,
    validate: (ctx) => {
      const tl = ctx.trackLab
      if (!tl || !tl.analysis) return fail('Import a song in Track Lab first.')
      if (!tl.templated) return fail('Not exported yet — in Track Lab, pass CHECK MAP, then press USE AS TEMPLATE.')
      return pass('Skeleton stolen, legally. In the Sandbox that arc is now yours to fill — swap the patches, rewrite the bassline, keep the bones.')
    },
  },
  {
    id: 'deconstruct-chop',
    module: DECON,
    title: 'Steal the Break',
    summary:
      'The other half of sampling culture: find a moment in a full song — a drum break, a one-bar groove — chop it, and flip it into something new. Hip-hop was built on this move (the Amen and Funky Drummer breaks are single bars of full songs). Track Lab can slice the first bars of any section straight onto BeatLab\'s five drum pads, ready to re-sequence.',
    task: 'In TRACK LAB, pick the section with the best drum groove and press CHOP → PADS. Then come back to THIS lesson: the step sequencer\'s five lanes now trigger your chopped slices — program a NEW 16-step pattern using at least 6 hits, and Check.',
    hints: [
      'Drum-heavy sections chop best — an intro or a drop where the groove is exposed.',
      'The 5 pads hold 5 equal slices of the chopped bars, in order. KICK = slice 1, OPEN HAT = slice 5.',
      'Don\'t rebuild the original pattern — the whole point of flipping a break is making it yours.',
    ],
    setup: minimalSetup,
    validate: (ctx) => {
      const tl = ctx.trackLab
      if (!tl || !tl.analysis) return fail('Import a song in Track Lab first.')
      if (!tl.chopped || !ctx.sampleLoaded) return fail('No section chopped yet — in Track Lab, press CHOP → PADS on the section with the best groove.')
      const drums = ctx.tracks.find((t) => t.kind === 'drums')
      const hits = drums ? Object.values(drums.pattern).reduce((sum, lane) => sum + lane.filter((v) => v > 0).length, 0) : 0
      if (hits < 6) return fail(`The pads are loaded with your slices — now program a pattern here (${hits}/6 steps so far). This IS the beat-flipping workflow.`)
      return pass('You just did the full sampling loop on a real song: found the groove, chopped it, flipped it. That\'s the lineage of half of electronic music, in one exercise.')
    },
  },
]

export const DECON_MODULES: Module[] = [{ name: DECON, lessons: deconLessons }]
