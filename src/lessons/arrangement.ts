import type { AutomationPoint, SectionType } from '../types'
import {
  GROOVE_STEPS,
  bassGrooveNotes,
  chordProgressionNotes,
  drumTrack,
  fail,
  melodyNotes,
  n,
  pass,
  synthTrack,
  track,
  type Lesson,
  type Module,
} from './framework'

const ARRANGE = 'Arrangement'

const TRACK_IDS = ['drums', 'bass', 'chords', 'lead']

function fullBand(bars: number) {
  return [
    drumTrack(GROOVE_STEPS),
    synthTrack('bass', 'Bass', '#56b6c2', { osc: 'sawtooth', cutoff: 700, attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.15, volume: -8 }, bassGrooveNotes(bars)),
    synthTrack('chords', 'Chords', '#f7c948', { osc: 'triangle', cutoff: 3500, attack: 0.4, decay: 0.4, sustain: 0.6, release: 1.2, volume: -14 }, chordProgressionNotes(bars)),
    synthTrack('lead', 'Lead', '#c678dd', { osc: 'square', cutoff: 4500, attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.4, volume: -14 }, melodyNotes(bars)),
  ]
}

function energySetup(sections: SectionType[], bpm: number) {
  const bars = sections.length * 2
  return {
    tracks: fullBand(bars),
    loopBars: bars,
    bpm,
    selectedTrackId: 'drums',
    arrangement: {
      enabled: true,
      mode: 'energy' as const,
      sections,
      barsPerSection: 2,
      active: Object.fromEntries(TRACK_IDS.map((id) => [id, Array(sections.length).fill(false)])),
    },
  }
}

const countPerSection = (active: Record<string, boolean[]>, sections: number) =>
  Array.from({ length: sections }, (_, i) => TRACK_IDS.filter((id) => active[id]?.[i]).length)

const arrangeLessons: Lesson[] = [
  {
    id: 'song-structure',
    module: ARRANGE,
    title: 'Song Structure',
    summary:
      'Tracks are journeys through energy: an INTRO establishes the groove, a BUILDUP creates tension, the DROP releases it, a BREAKDOWN strips back to breathe, then you build and drop again, and the OUTRO lands the plane. Almost every electronic track walks some version of this arc.',
    task: 'Arrange the 8 sections into a working club-track structure: start with an Intro, end with an Outro, include at least 2 Drops, put a Buildup right before each Drop, and give the track a Breakdown after the first Drop.',
    hints: [
      'The classic shape: Intro → Buildup → Drop → Breakdown → Buildup → Drop → Drop → Outro.',
      'A Drop can follow another Drop (a "second drop" extends the peak).',
      'Tension needs release: never drop without building first.',
    ],
    setup: () => ({
      tracks: [drumTrack(GROOVE_STEPS)],
      loopBars: 1,
      bpm: 126,
      selectedTrackId: 'drums',
      arrangement: { enabled: true, mode: 'structure', sections: Array(8).fill(null), barsPerSection: 2, active: {} },
    }),
    validate: (ctx) => {
      const s = ctx.arrangement.sections
      if (s.some((x) => x === null)) return fail('Fill in all 8 sections first.')
      const secs = s as SectionType[]
      if (secs[0] !== 'Intro') return fail('Start with an Intro — DJs need mixable, stripped-back openings.')
      if (secs[7] !== 'Outro') return fail('End with an Outro — land the plane, don\'t crash it.')
      const drops = secs.filter((x) => x === 'Drop').length
      if (drops < 2) return fail(`Club tracks earn their length with at least 2 Drops (you have ${drops}).`)
      for (let i = 1; i < 8; i++) {
        if (secs[i] === 'Drop' && !(secs[i - 1] === 'Buildup' || secs[i - 1] === 'Drop'))
          return fail(`Section ${i + 1} is a Drop with no tension before it — a Drop needs a Buildup (or another Drop) right before.`)
      }
      const firstDrop = secs.indexOf('Drop')
      const lastDrop = secs.lastIndexOf('Drop')
      if (!secs.slice(firstDrop, lastDrop).includes('Breakdown'))
        return fail('Give the crowd a breather: put a Breakdown somewhere between your first and last Drop.')
      return pass('A real arrangement arc: tension, release, breathe, repeat. Next: hear it in action.')
    },
  },
  {
    id: 'dj-intro',
    module: ARRANGE,
    title: 'The DJ Intro',
    summary:
      'Club tracks open with 30–60 seconds of stripped groove so a DJ can blend them into the previous record — usually drums first, then one element at a time. The skill: adding energy in strictly rising steps, never giving everything away early. The grid below controls which tracks play in each 2-bar section.',
    task: 'Design a DJ-friendly opening across the 4 sections (Intro → Intro → Buildup → Drop): start with 1–2 elements, never remove energy, add something in each later section, and hit the Drop with all 4 tracks playing.',
    hints: [
      'Classic: drums alone → drums + bass → add chords → everything.',
      'Each section\'s element count must be ≥ the previous one — this is a staircase, not a rollercoaster.',
      'Press play and imagine mixing out of another record during the first sections.',
    ],
    setup: () => energySetup(['Intro', 'Intro', 'Buildup', 'Drop'], 126),
    validate: (ctx) => {
      const c = countPerSection(ctx.arrangement.active, 4)
      if (c[0] < 1 || c[0] > 2) return fail(`Section 1 should have 1–2 elements (has ${c[0]}) — leave the DJ room to blend.`)
      for (let i = 1; i < 4; i++) {
        if (c[i] < c[i - 1]) return fail(`Section ${i + 1} drops from ${c[i - 1]} to ${c[i]} elements — an intro staircase only goes up.`)
      }
      if (c[2] <= c[0]) return fail('The Buildup must have added something over the opening — grow the energy.')
      if (c[3] !== 4) return fail(`The Drop is the payoff — all 4 elements in (has ${c[3]}).`)
      if (!ctx.arrangement.active['drums']?.[0] && c[0] > 0)
        return fail('Convention: lead with the drums — DJs beat-match on them.')
      return pass('A clean staircase into the drop. DJs will thank you; dancefloors won\'t even notice why it works.')
    },
  },
  {
    id: 'energy-curve',
    module: ARRANGE,
    title: 'The Energy Curve',
    summary:
      'Arrangement in practice = deciding WHICH ELEMENTS PLAY WHEN. A full 4-track loop is loaded (drums, bass, chords, lead). The grid maps tracks to sections — toggle cells to decide what plays in each section, then PLAY to hear your whole arrangement top to bottom.',
    task: 'Design the energy curve: Intro with only 1–2 elements, Buildup with more than the Intro, both Drops with ALL 4, a stripped-back Breakdown (fewer than the drop), and an Outro with at most 2.',
    hints: [
      'Classic intro: drums alone, or drums + bass.',
      'Breakdown trick: kill the drums, keep chords — melody floats, tension builds.',
      'Play it start to finish and listen for the lift into each drop.',
    ],
    setup: () => energySetup(['Intro', 'Buildup', 'Drop', 'Breakdown', 'Drop', 'Outro'], 124),
    validate: (ctx) => {
      const c = countPerSection(ctx.arrangement.active, 6)
      if (c[0] < 1 || c[0] > 2) return fail(`Intro should have 1–2 elements (has ${c[0]}). Start sparse — give the track room to grow.`)
      if (c[1] <= c[0]) return fail(`The Buildup (${c[1]} elements) must add energy over the Intro (${c[0]}) — bring something in.`)
      if (c[2] !== 4) return fail(`The first Drop is the payoff — all 4 elements in (has ${c[2]}).`)
      if (c[3] >= c[2]) return fail(`The Breakdown must strip back — fewer elements than the Drop (has ${c[3]}).`)
      if (c[3] < 1) return fail('Don\'t go fully silent in the Breakdown — keep at least one element floating.')
      if (c[4] !== 4) return fail(`The second Drop needs the full squad again — all 4 elements (has ${c[4]}).`)
      if (c[5] > 2) return fail(`Outro: wind it down to 1–2 elements (has ${c[5]}).`)
      return pass('Play it top to bottom — that rise and fall IS arrangement. You just structured a track.')
    },
  },
  {
    id: 'breakdown-drop',
    module: ARRANGE,
    title: 'Breakdown & Second Drop',
    summary:
      'The emotional peak of most club tracks isn\'t the first drop — it\'s the SECOND one, because the breakdown before it resets the crowd\'s energy budget. The formula: strip to almost nothing (usually keeping something melodic floating), rebuild tension, then slam everything back at once.',
    task: 'You\'re mid-track: Drop → Breakdown → Buildup → Drop. First Drop: all 4. Breakdown: strip to 1–2 elements WITHOUT drums. Buildup: more than the breakdown, bring drums back. Second Drop: all 4.',
    hints: [
      'The breakdown killing the drums is what makes the room float.',
      'Chords or lead alone in the breakdown = maximum emotional reset.',
      'Drums returning in the buildup is the "here we go again" signal.',
    ],
    setup: () => energySetup(['Drop', 'Breakdown', 'Buildup', 'Drop'], 126),
    validate: (ctx) => {
      const a = ctx.arrangement.active
      const c = countPerSection(a, 4)
      if (c[0] !== 4) return fail(`The opening Drop needs all 4 elements (has ${c[0]}).`)
      if (c[1] < 1 || c[1] > 2) return fail(`The Breakdown should strip to 1–2 elements (has ${c[1]}).`)
      if (a['drums']?.[1]) return fail('Kill the drums in the Breakdown — the floating feeling needs the beat gone.')
      if (c[2] <= c[1]) return fail(`The Buildup (${c[2]}) must grow past the Breakdown (${c[1]}) — tension has to rise.`)
      if (!a['drums']?.[2]) return fail('Bring the drums back in the Buildup — the crowd needs the "here we go" signal.')
      if (c[3] !== 4) return fail(`The second Drop is the peak of the whole track — all 4 in (has ${c[3]}).`)
      return pass('Float, rebuild, slam. That breakdown-to-second-drop move is the emotional core of dance music.')
    },
  },
  {
    id: 'full-journey',
    module: ARRANGE,
    title: 'The Full Journey',
    summary:
      'Capstone: a complete 8-section track arc — 16 bars covering intro to outro, with a double drop in the middle. This is a full club track in miniature. Design the whole energy curve, then play it top to bottom and listen like a stranger hearing it in a set.',
    task: 'Across Intro → Buildup → Drop → Drop → Breakdown → Buildup → Drop → Outro: start with 1–2 elements, rise into the first Drop (all 4), keep the second Drop full (all 4), strip the Breakdown to 1–2, rebuild, hit the final Drop with all 4, and land the Outro with 1–2.',
    hints: [
      'This is every previous arrangement lesson chained together.',
      'Vary the two back-to-back drops in a real DAW you\'d change the lead — here, just keep both full.',
      'The final Outro mirrors the Intro — DJs mix out the way they mixed in.',
    ],
    setup: () => energySetup(['Intro', 'Buildup', 'Drop', 'Drop', 'Breakdown', 'Buildup', 'Drop', 'Outro'], 126),
    validate: (ctx) => {
      const c = countPerSection(ctx.arrangement.active, 8)
      if (c[0] < 1 || c[0] > 2) return fail(`Intro: 1–2 elements (has ${c[0]}).`)
      if (c[1] <= c[0]) return fail(`Buildup (section 2) must grow past the Intro (${c[0]} → ${c[1]}).`)
      if (c[2] !== 4) return fail(`First Drop: all 4 elements (has ${c[2]}).`)
      if (c[3] !== 4) return fail(`Second Drop (section 4): keep it full — all 4 (has ${c[3]}).`)
      if (c[4] < 1 || c[4] > 2) return fail(`Breakdown: strip to 1–2 elements (has ${c[4]}).`)
      if (c[5] <= c[4]) return fail(`The second Buildup (section 6) must rise out of the Breakdown (${c[4]} → ${c[5]}).`)
      if (c[6] !== 4) return fail(`Final Drop: everything in (has ${c[6]}).`)
      if (c[7] > 2) return fail(`Outro: wind down to 1–2 elements (has ${c[7]}).`)
      return pass('A complete track arc, designed and audible. You\'ve done the full loop: theory → sound → rhythm → arrangement. The Sandbox is your studio now.')
    },
  },
  {
    id: 'micro-buildup',
    module: ARRANGE,
    title: 'The Micro Buildup: Automation',
    summary:
      'The energy-curve lessons so far are macro arrangement — deciding which whole elements play in which section. A buildup also happens on a much smaller scale: WITHIN one loop, a filter opening up, volume climbing, reverb growing — automation is what makes a section feel like it\'s climbing, not just repeating.',
    task: 'On this pad, automate CUTOFF to sweep from closed to fully open, VOLUME to rise, and REVERB SEND to grow — each starting near the beginning of the loop and ending near the end.',
    hints: [
      'Open the automation lane below the piano roll, pick a parameter from the dropdown, then click to place breakpoints — one low near bar 1, one high near the last bar.',
      'This is exactly the mechanic Phase C added for cutoff alone — now it works for any of these parameters.',
      'A real 8/16-bar club buildup is this same idea, just stretched over a whole section instead of one loop.',
    ],
    centerPitch: 60,
    setup: () => ({
      tracks: [synthTrack('synth', 'Buildup Pad', '#61afef', { osc: 'sawtooth', cutoff: 300, sendReverb: 0, volume: -24 }, [
        n(57, 0, 32), n(60, 0, 32), n(64, 0, 32),
        n(57, 32, 32), n(60, 32, 32), n(64, 32, 32),
      ])],
      loopBars: 8,
      bpm: 126,
      selectedTrackId: 'synth',
    }),
    validate: (ctx) => {
      const t = track(ctx, 'synth')
      const auto = t.automation ?? {}
      const endsHigh = (points: AutomationPoint[] | undefined) => {
        if (!points || points.length < 2) return null
        const sorted = [...points].sort((a, b) => a.time - b.time)
        return { first: sorted[0], last: sorted[sorted.length - 1] }
      }
      const cutoffEnds = endsHigh(auto.cutoff)
      const volEnds = endsHigh(auto.volume)
      const reverbEnds = endsHigh(auto.sendReverb)
      if (!cutoffEnds) return fail('No cutoff automation yet — open the automation lane, pick Cutoff, and place at least two breakpoints.')
      if (cutoffEnds.first.time > 0.25 || cutoffEnds.last.time < 0.75)
        return fail('Spread the cutoff sweep across the whole loop — first point near the start, last point near the end.')
      if (cutoffEnds.last.value / Math.max(cutoffEnds.first.value, 1) < 4)
        return fail('The cutoff needs to open up a lot more — at least a ~2-octave rise from start to end.')
      if (!volEnds) return fail('No volume automation yet — add a rising volume lane too.')
      if (volEnds.last.value - volEnds.first.value < 10) return fail('Volume should climb at least 10dB across the buildup.')
      if (!reverbEnds) return fail('No reverb send automation yet — add a growing reverb lane too.')
      if (reverbEnds.last.value - reverbEnds.first.value < 0.3) return fail('Reverb send should grow by at least 30% across the buildup.')
      return pass('Three lanes rising together — filter opening, volume climbing, reverb swelling. That combination, stretched across a real section, is what a club buildup actually is.')
    },
  },
]

export const ARRANGE_MODULES: Module[] = [{ name: ARRANGE, lessons: arrangeLessons }]
