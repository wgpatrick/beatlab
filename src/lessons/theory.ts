import { noteName } from '../types'
import {
  AM_PENTA,
  AM_SCALE,
  BASS_ROOTS,
  CHORD_NAMES,
  CHORD_PCS,
  CHORD_ROOTS_PC,
  CHORD_VOICINGS,
  bassGrooveNotes,
  bassTrack,
  barNotes,
  chordProgressionNotes,
  checkAscendingSequence,
  checkChordBars,
  checkExactBars,
  checkStack,
  drumTrack,
  fail,
  keysTrack,
  leadTrack,
  n,
  pass,
  rand,
  randInt,
  track,
  type Lesson,
  type Module,
} from './framework'

const SCALES = 'Notes & Scales'
const CHORDS = 'Chords & Harmony'
const BASSMEL = 'Bass & Melody'

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12]
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10, 12]

// ================= MODULE 1: NOTES & SCALES =================

const scalesLessons: Lesson[] = [
  {
    id: 'c-major-scale',
    module: SCALES,
    title: 'The Major Scale',
    summary:
      'Almost all Western music is built from scales — sets of 7 notes chosen from the 12 available. The major scale uses the interval pattern W-W-H-W-W-W-H (W = whole step = 2 rows, H = half step = 1 row). C major is the easiest: it uses only the white keys.',
    task: 'Place the C major scale ascending in the piano roll: 8 notes, one after another, starting on C3 and ending on C4.',
    hints: [
      'Start at C3 (labeled on the keyboard at the left).',
      'From C3 go up: 2 rows, 2 rows, 1 row, 2, 2, 2, 1.',
      'The notes are C3 D3 E3 F3 G3 A3 B3 C4 — all white keys.',
    ],
    centerPitch: 54,
    setup: () => ({ tracks: [keysTrack()], loopBars: 1, bpm: 100, selectedTrackId: 'keys', noteLength: 2 }),
    validate: (ctx) =>
      checkAscendingSequence(track(ctx, 'keys'), [48, 50, 52, 53, 55, 57, 59, 60], 'C major scale', 'W-W-H-W-W-W-H',
        "That's the C major scale! Press play and listen to how it resolves back to the root."),
  },
  {
    id: 'a-minor-scale',
    module: SCALES,
    title: 'The Minor Scale',
    summary:
      'Electronic music lives in minor keys — they sound darker and moodier. A natural minor uses the pattern W-H-W-W-H-W-W. A minor is the "relative minor" of C major: the exact same white keys, just starting from A instead of C. Same notes, completely different feeling.',
    task: 'Place the A natural minor scale ascending: 8 notes from A2 up to A3.',
    hints: [
      'Start at A2 and use only white keys again.',
      'A2 B2 C3 D3 E3 F3 G3 A3.',
      'Compare how it feels vs. the major scale — the flat 3rd is what makes it "sad".',
    ],
    centerPitch: 51,
    setup: () => ({ tracks: [keysTrack()], loopBars: 1, bpm: 100, selectedTrackId: 'keys', noteLength: 2 }),
    validate: (ctx) =>
      checkAscendingSequence(track(ctx, 'keys'), [45, 47, 48, 50, 52, 53, 55, 57], 'A natural minor scale', 'W-H-W-W-H-W-W',
        'The relative minor — same keys as C major, opposite mood. This is home base for the rest of the course.'),
  },
  {
    id: 'perfect-fifth',
    module: SCALES,
    title: 'Intervals: The Perfect Fifth',
    summary:
      'An interval is the distance between two notes, counted in semitones. The perfect fifth (7 semitones) is the strongest, most stable interval after the octave — it\'s the "power chord" of rock and the backbone of every bassline. Learn to see and hear these distances and chords stop being memorization.',
    task: 'Place a perfect fifth: A2 and E3 stacked at the same time position (E3 is exactly 7 rows above A2).',
    hints: [
      'Count 7 rows up from A2.',
      'Play it — a fifth sounds open and strong, neither happy nor sad.',
      'Key intervals to know: 3 = minor 3rd, 4 = major 3rd, 5 = perfect 4th, 7 = perfect 5th, 12 = octave.',
    ],
    centerPitch: 49,
    setup: () => ({ tracks: [keysTrack()], loopBars: 1, bpm: 100, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) => {
      const t = track(ctx, 'keys')
      if (t.notes.length !== 2) return fail(`An interval is exactly 2 notes (you have ${t.notes.length}).`)
      const [a, b] = [...t.notes].sort((x, y) => x.pitch - y.pitch)
      if (a.start !== b.start) return fail('Stack the two notes at the same time position.')
      const gap = b.pitch - a.pitch
      if (a.pitch !== 45) return fail(`Start the interval on A2 — your bottom note is ${noteName(a.pitch)}.`)
      if (gap !== 7)
        return fail(`Your interval is ${gap} semitones — a perfect fifth is exactly 7. ${gap < 7 ? 'Go higher.' : 'Come down.'}`)
      return pass('That open, hollow strength is the perfect fifth. Root + fifth will carry every bassline you write.')
    },
  },
  {
    id: 'pentatonic-scale',
    module: SCALES,
    title: 'The Pentatonic Scale',
    summary:
      'Remove the two "tension" notes from the minor scale and you get the minor pentatonic — 5 notes that sound good in almost any order. It\'s the melodic safety net used in everything from blues to trance leads. When in doubt, go pentatonic.',
    task: 'Place the A minor pentatonic scale ascending: A2, C3, D3, E3, G3, A3 — 6 notes, one after another.',
    hints: [
      'It\'s the A minor scale minus B and F.',
      'The gaps are: 3, 2, 2, 3, 2 semitones.',
    ],
    centerPitch: 51,
    setup: () => ({ tracks: [keysTrack()], loopBars: 1, bpm: 100, selectedTrackId: 'keys', noteLength: 2 }),
    validate: (ctx) =>
      checkAscendingSequence(track(ctx, 'keys'), [45, 48, 50, 52, 55, 57], 'A minor pentatonic', '3-2-2-3-2 semitones',
        'Five notes, zero wrong answers. Improvise with these over any A minor track and it works.'),
  },
  {
    id: 'interval-drill',
    module: SCALES,
    title: 'Drill: Interval Builder',
    summary:
      'Time to make intervals automatic. Each round gives you a random root note and a random interval to build. Do this until you don\'t have to count rows anymore — producers think in intervals the way typists think in keys. Use "New Exercise" to reroll.',
    task: (p) => `Build a ${p.intervalName} above ${noteName(p.root)}: place ${noteName(p.root)} and the note exactly ${p.interval} semitones above it, stacked at the same time.`,
    hints: [
      'Count rows: 1 row = 1 semitone.',
      'minor 3rd = 3, major 3rd = 4, perfect 4th = 5, perfect 5th = 7, octave = 12.',
      'Play each one and memorize the sound, not just the count.',
    ],
    drill: true,
    centerPitch: 55,
    setup: () => {
      const intervals = [
        { interval: 3, intervalName: 'minor 3rd' },
        { interval: 4, intervalName: 'major 3rd' },
        { interval: 5, intervalName: 'perfect 4th' },
        { interval: 7, intervalName: 'perfect 5th' },
        { interval: 12, intervalName: 'octave' },
      ] as const
      const pick = rand(intervals)
      return {
        tracks: [keysTrack()],
        loopBars: 1,
        bpm: 100,
        selectedTrackId: 'keys',
        noteLength: 16,
        params: { root: randInt(45, 57), ...pick },
      }
    },
    validate: (ctx) => {
      const t = track(ctx, 'keys')
      const { root, interval, intervalName } = ctx.params
      if (t.notes.length !== 2) return fail(`An interval is exactly 2 notes (you have ${t.notes.length}).`)
      const [a, b] = [...t.notes].sort((x, y) => x.pitch - y.pitch)
      if (a.start !== b.start) return fail('Stack the two notes at the same time position.')
      if (a.pitch !== root) return fail(`The bottom note should be ${noteName(root)} — you have ${noteName(a.pitch)}.`)
      const gap = b.pitch - a.pitch
      if (gap !== interval)
        return fail(`That's ${gap} semitones — a ${intervalName} is ${interval}. ${gap < interval ? 'Reach higher.' : 'Bring it down.'}`)
      return pass(`${noteName(root)} + ${intervalName} — correct. Hit "New Exercise" and run it again until it's reflex.`)
    },
  },
  {
    id: 'scale-drill',
    module: SCALES,
    title: 'Drill: Scale Builder',
    summary:
      'Now build scales from any starting note — this is transposition, and it\'s how you\'ll move ideas between keys in Ableton. Each round: random root, major or minor. The interval pattern never changes; only the starting note does.',
    task: (p) => `Build the ${noteName(p.root)} ${p.quality} scale ascending: 8 notes starting on ${noteName(p.root)}, one after another.`,
    hints: [
      'Major: W-W-H-W-W-W-H (2-2-1-2-2-2-1).',
      'Minor: W-H-W-W-H-W-W (2-1-2-2-1-2-2).',
      'Black keys are just notes — the pattern doesn\'t care about key color.',
    ],
    drill: true,
    centerPitch: 53,
    setup: () => {
      const root = randInt(43, 50)
      const quality = rand(['major', 'minor'] as const)
      return {
        tracks: [keysTrack()],
        loopBars: 1,
        bpm: 100,
        selectedTrackId: 'keys',
        noteLength: 2,
        params: { root, quality },
      }
    },
    validate: (ctx) => {
      const { root, quality } = ctx.params
      const steps = quality === 'major' ? MAJOR_STEPS : MINOR_STEPS
      const expected = steps.map((s) => root + s)
      return checkAscendingSequence(
        track(ctx, 'keys'),
        expected,
        `${noteName(root)} ${quality} scale`,
        quality === 'major' ? 'W-W-H-W-W-W-H' : 'W-H-W-W-H-W-W',
        `${noteName(root)} ${quality} — nailed. Reroll and build another; every key should feel the same eventually.`,
      )
    },
  },
]

// ================= MODULE 2: CHORDS & HARMONY =================

const chordsLessons: Lesson[] = [
  {
    id: 'minor-triad',
    module: CHORDS,
    title: 'Your First Chord: A Minor',
    summary:
      'A chord is 3+ notes played together. The basic triad is built by stacking: root, then a 3rd, then a 5th. For a MINOR triad: root + 3 semitones + 4 more semitones. The gap of 3 (the "minor third") is what makes it sound melancholy.',
    task: 'Build an A minor triad: stack A3, C4 and E4 at the same time position.',
    hints: [
      'All three notes must start at the same step — stack them vertically.',
      'From A3: up 3 rows to C4, then up 4 more rows to E4.',
      'Set note length to 1 bar so the chord rings out.',
    ],
    centerPitch: 60,
    setup: () => ({ tracks: [keysTrack()], loopBars: 1, bpm: 100, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) =>
      checkStack(track(ctx, 'keys'), [57, 60, 64], 'A minor triad', 'Minor = root, +3 semitones, +4 semitones.',
        'A minor — nailed it. Play it and let it ring.'),
  },
  {
    id: 'major-triad',
    module: CHORDS,
    title: 'Major vs. Minor',
    summary:
      'A MAJOR triad flips the recipe: root + 4 semitones + 3 more. That one-semitone difference in the middle note is the entire difference between "happy" and "sad" in music. Producers flip between them constantly to control mood.',
    task: 'Build a C major triad: C3, E3 and G3 stacked at the same time.',
    hints: [
      'From C3: up 4 rows to E3, then up 3 more rows to G3.',
      'Major = root, +4, +3. Minor = root, +3, +4. Same note count, opposite mood.',
    ],
    centerPitch: 52,
    setup: () => ({ tracks: [keysTrack()], loopBars: 1, bpm: 100, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) =>
      checkStack(track(ctx, 'keys'), [48, 52, 55], 'C major triad', 'Major = root, +4 semitones, +3 semitones.',
        'C major. You now know both triad recipes — that\'s most of pop harmony.'),
  },
  {
    id: 'triad-drill',
    module: CHORDS,
    title: 'Drill: Triad Builder',
    summary:
      'Random root, random quality, build the triad in root position. Repeat until major/minor construction is muscle memory — in Ableton you\'ll be doing this on a MIDI clip in seconds without thinking.',
    task: (p) => `Build a ${noteName(p.root)} ${p.quality} triad in root position: ${noteName(p.root)} on the bottom, stacked at the same time.`,
    hints: [
      'Minor = root, +3, +4. Major = root, +4, +3.',
      'Both end 7 semitones above the root — only the middle note moves.',
    ],
    drill: true,
    centerPitch: 58,
    setup: () => ({
      tracks: [keysTrack()],
      loopBars: 1,
      bpm: 100,
      selectedTrackId: 'keys',
      noteLength: 16,
      params: { root: randInt(50, 62), quality: rand(['major', 'minor'] as const) },
    }),
    validate: (ctx) => {
      const { root, quality } = ctx.params
      const third = quality === 'major' ? 4 : 3
      return checkStack(
        track(ctx, 'keys'),
        [root, root + third, root + 7],
        `${noteName(root)} ${quality} triad`,
        quality === 'major' ? 'Major = root, +4, +3.' : 'Minor = root, +3, +4.',
        `${noteName(root)} ${quality} — correct. Reroll with "New Exercise" and keep going.`,
      )
    },
  },
  {
    id: 'inversions',
    module: CHORDS,
    title: 'Inversions',
    summary:
      'A chord doesn\'t have to sit with its root on the bottom. Move the bottom note up an octave and you get an INVERSION — same chord, same name, different color and height. Inversions let you change chords without the hand-jump sound, and they\'re everywhere in house piano stabs.',
    task: 'Play A minor four ways, one per bar: bar 1 root position (A3-C4-E4), bar 2 first inversion (C4-E4-A4), bar 3 second inversion (E4-A4-C5), bar 4 root position an octave up (A4-C5-E5).',
    hints: [
      'Each bar: take the lowest note of the previous bar and move it up 12 rows.',
      'Set note length to 1 bar.',
      'Play it — same chord climbing the keyboard, like a rising house riff.',
    ],
    centerPitch: 66,
    setup: () => ({ tracks: [keysTrack()], loopBars: 4, bpm: 110, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) =>
      checkExactBars(
        track(ctx, 'keys'),
        [
          { pitches: [57, 60, 64], label: 'A minor root position' },
          { pitches: [60, 64, 69], label: 'A minor 1st inversion' },
          { pitches: [64, 69, 72], label: 'A minor 2nd inversion' },
          { pitches: [69, 72, 76], label: 'A minor root position, octave up' },
        ],
        'Same three pitch classes, four different colors. Inversions are how pros voice chords.',
      ),
  },
  {
    id: 'seventh-chords',
    module: CHORDS,
    title: 'Seventh Chords',
    summary:
      'Add one more stacked third on top of a triad and you get a SEVENTH chord — instantly jazzier, smoother, more expensive-sounding. Deep house, lo-fi and neo-soul basically run on 7ths. Am7 = A C E G. Fmaj7 = F A C E. Cmaj7 = C E G B. G7 = G B D F.',
    task: 'Upgrade the progression to 7th chords: bar 1 Am7, bar 2 Fmaj7, bar 3 Cmaj7, bar 4 G7 — at least 4 notes per bar, any voicing.',
    hints: [
      'Take each triad from before and add the note a 3rd above the 5th.',
      'Am7 adds G · Fmaj7 adds E · Cmaj7 adds B · G7 adds F.',
      'Play the plain triads in your head, then this — hear the added warmth?',
    ],
    centerPitch: 60,
    scalePcs: AM_SCALE,
    setup: () => ({ tracks: [keysTrack()], loopBars: 4, bpm: 105, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) =>
      checkChordBars(
        track(ctx, 'keys'),
        [
          { pcs: [9, 0, 4, 7], name: 'Am7 (A C E G)' },
          { pcs: [5, 9, 0, 4], name: 'Fmaj7 (F A C E)' },
          { pcs: [0, 4, 7, 11], name: 'Cmaj7 (C E G B)' },
          { pcs: [7, 11, 2, 5], name: 'G7 (G B D F)' },
        ],
        4,
        'That\'s the deep house sound — one extra note per chord, a whole extra layer of sophistication.',
      ),
  },
  {
    id: 'sus-chords',
    module: CHORDS,
    title: 'Sus Chords: Tension & Release',
    summary:
      'Replace a chord\'s 3rd with the 4th and you get a SUSPENDED chord (sus4) — neither major nor minor, just floating, unresolved tension. Resolve it back to the normal 3rd and the listener feels release. This tension-release cycle is the engine of all musical emotion.',
    task: 'Bar 1: Asus4 (A3, D4, E4 — the 4th instead of the 3rd). Bar 2: resolve to A minor (A3, C4, E4). Loop it and feel the pull.',
    hints: [
      'Only the middle note moves: D4 falls to C4.',
      'Sus4 = root, +5, +7. Minor = root, +3, +7.',
      'Loop it — the D "wants" to fall to C. That want is tension.',
    ],
    centerPitch: 60,
    setup: () => ({ tracks: [keysTrack()], loopBars: 2, bpm: 100, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) =>
      checkExactBars(
        track(ctx, 'keys'),
        [
          { pitches: [57, 62, 64], label: 'Asus4' },
          { pitches: [57, 60, 64], label: 'A minor' },
        ],
        'Tension, then release. Trance and progressive house builds are this idea stretched over 32 bars.',
      ),
  },
  {
    id: 'chord-progression',
    module: CHORDS,
    title: 'The Progression: Am–F–C–G',
    summary:
      'A chord progression is a repeating loop of chords — the harmonic backbone of a track. Am–F–C–G is one of the most-used progressions in electronic music (and pop). All four chords use only notes from A minor, which is why they sound like they belong together.',
    task: 'Write a 4-bar progression: bar 1 = A minor, bar 2 = F major, bar 3 = C major, bar 4 = G major. One chord per bar, any voicing (any octaves) — at least 3 notes per bar.',
    hints: [
      'Set note length to "1 bar" and stack 3 notes at the start of each bar.',
      'Am = A C E · F = F A C · C = C E G · G = G B D.',
      'Notice F, C and G share notes with Am — smooth voice leading. Highlighted rows are the A minor scale.',
    ],
    centerPitch: 58,
    scalePcs: AM_SCALE,
    setup: () => ({ tracks: [keysTrack()], loopBars: 4, bpm: 110, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) =>
      checkChordBars(
        track(ctx, 'keys'),
        CHORD_PCS.map((pcs, i) => ({ pcs, name: CHORD_NAMES[i] })),
        3,
        'Am–F–C–G locked in. Play it — you have written the backbone of a thousand hit records.',
      ),
  },
  {
    id: 'voice-leading',
    module: CHORDS,
    title: 'Voice Leading',
    summary:
      'Amateur MIDI jumps every chord to root position; pros move each chord to the CLOSEST voicing of the next — that\'s voice leading. Individual notes barely move, shared notes stay put, and the progression sounds like one smooth gesture instead of four hand-jumps.',
    task: 'Write Am–F–C–G again (one chord per bar, right pitch classes), but voice it smoothly: the average pitch of each bar must move 3 semitones or less from the previous bar.',
    hints: [
      'Start from Am = A3 C4 E4. For F, keep A3 and C4, move E4 down to F3? No — try F3 A3 C4, or keep C4 E4 and add F3.',
      'Use inversions! F = C4 F4 A4 · C = C4 E4 G4 · G = B3 D4 G4 all sit near Am = A3 C4 E4.',
      'Shared notes between chords should not move at all.',
    ],
    centerPitch: 60,
    scalePcs: AM_SCALE,
    setup: () => ({ tracks: [keysTrack()], loopBars: 4, bpm: 105, selectedTrackId: 'keys', noteLength: 16 }),
    validate: (ctx) => {
      const t = track(ctx, 'keys')
      const chordCheck = checkChordBars(t, CHORD_PCS.map((pcs, i) => ({ pcs, name: CHORD_NAMES[i] })), 3, '')
      if (!chordCheck.pass) return chordCheck
      const avgs: number[] = []
      for (let bar = 0; bar < 4; bar++) {
        const bn = barNotes(t, bar)
        avgs.push(bn.reduce((a, x) => a + x.pitch, 0) / bn.length)
      }
      for (let i = 1; i < 4; i++) {
        const jump = Math.abs(avgs[i] - avgs[i - 1])
        if (jump > 3)
          return fail(
            `Bars ${i} → ${i + 1} jump ${jump.toFixed(1)} semitones on average — too far. Use an inversion of ${CHORD_NAMES[i]} that sits closer to your ${CHORD_NAMES[i - 1]} voicing.`,
          )
      }
      return pass('Smooth. Compare this to root-position jumping — same chords, but now it sounds arranged, not programmed.')
    },
  },
]

// ================= MODULE 3: BASS & MELODY =================

const bassMelLessons: Lesson[] = [
  {
    id: 'bassline',
    module: BASSMEL,
    title: 'Root-Note Bassline',
    summary:
      'The bass glues chords to the groove. The simplest reliable bassline plays the ROOT of each chord, low down (below C3). Lock the rhythm to the kick and the track instantly sounds intentional. Your chord progression is loaded and playing.',
    task: 'On the Bass track, write a 4-bar bassline under the Am–F–C–G progression. Each bar must start on the chord root (A, F, C, G — any low octave), stay below C3, and only use A minor scale notes.',
    hints: [
      'Bar roots: A1, F1, C2, G1 (or an octave up).',
      'Start simple: one long root note per bar. Then try 8th notes for drive.',
      'An octave jump (root +12) at the end of a bar adds bounce without changing harmony.',
    ],
    centerPitch: 38,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), bassTrack()],
      loopBars: 4,
      bpm: 110,
      selectedTrackId: 'bass',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'bass')
      if (t.notes.length === 0) return fail('The Bass track is empty — write low notes under the chords.')
      const rootNames = ['A', 'F', 'C', 'G']
      for (let bar = 0; bar < 4; bar++) {
        const bn = barNotes(t, bar).sort((a, b) => a.start - b.start)
        if (bn.length === 0) return fail(`Bar ${bar + 1} has no bass. Every bar needs at least the root note.`)
        const first = bn[0]
        if (first.start !== bar * 16) return fail(`Bar ${bar + 1}: land the first bass note right on the downbeat (the very first step of the bar).`)
        if (first.pitch % 12 !== CHORD_ROOTS_PC[bar])
          return fail(`Bar ${bar + 1} should start on ${rootNames[bar]} (the root of ${CHORD_NAMES[bar]}), but starts on ${noteName(first.pitch)}.`)
        for (const x of bn) {
          if (x.pitch >= 48) return fail(`${noteName(x.pitch)} in bar ${bar + 1} is too high — keep the bass below C3.`)
          if (!AM_SCALE.includes(x.pitch % 12))
            return fail(`${noteName(x.pitch)} in bar ${bar + 1} is outside A minor. Stick to the highlighted rows.`)
        }
      }
      return pass('Solid low end. Hear how the roots anchor the chords? That relationship is the core of harmony.')
    },
  },
  {
    id: 'root-fifth-bass',
    module: BASSMEL,
    title: 'Root & Fifth Bassline',
    summary:
      'The next tool after the root: the FIFTH (7 semitones up). Root-fifth basslines add motion without ever clashing — the fifth is in every major AND minor chord, so it\'s always safe. This is the classic disco and melodic-house bass move.',
    task: 'Write a bassline where every bar starts on the chord root, uses ONLY the root and its fifth (any octaves), includes the fifth at least once per bar, and stays below C3.',
    hints: [
      'Bar 1 (Am): use A and E. Bar 2 (F): F and C. Bar 3 (C): C and G. Bar 4 (G): G and D.',
      'Classic pattern: root on beats 1-2, fifth on beats 3-4.',
      'The fifth can sit above or below the root (7 up or 5 down).',
    ],
    centerPitch: 38,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), bassTrack()],
      loopBars: 4,
      bpm: 116,
      selectedTrackId: 'bass',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'bass')
      if (t.notes.length === 0) return fail('The Bass track is empty.')
      for (let bar = 0; bar < 4; bar++) {
        const rootPc = CHORD_ROOTS_PC[bar]
        const fifthPc = (rootPc + 7) % 12
        const bn = barNotes(t, bar).sort((a, b) => a.start - b.start)
        if (bn.length === 0) return fail(`Bar ${bar + 1} is empty.`)
        if (bn[0].start !== bar * 16 || bn[0].pitch % 12 !== rootPc)
          return fail(`Bar ${bar + 1} must start with the root (${PC(rootPc)}) on the downbeat.`)
        for (const x of bn) {
          if (x.pitch >= 48) return fail(`${noteName(x.pitch)} in bar ${bar + 1} is too high — stay below C3.`)
          const pc = x.pitch % 12
          if (pc !== rootPc && pc !== fifthPc)
            return fail(`${noteName(x.pitch)} in bar ${bar + 1} is neither the root (${PC(rootPc)}) nor the fifth (${PC(fifthPc)}). Only those two.`)
        }
        if (!bn.some((x) => x.pitch % 12 === fifthPc))
          return fail(`Bar ${bar + 1} never plays the fifth (${PC(fifthPc)}) — that's the whole exercise!`)
      }
      return pass('Root and fifth — twice the motion, zero risk of clashing. The disco bassist\'s secret.')
    },
  },
  {
    id: 'octave-bass',
    module: BASSMEL,
    title: 'The Octave Bounce',
    summary:
      'Alternate a root with the same root an octave up and you get the OCTAVE BASS — the bouncing engine of French house, italo disco and electro. Harmonically it\'s one note; rhythmically it\'s pure momentum.',
    task: 'Write an octave-bounce bassline: in every bar, use only the chord root and the root +12, at least 6 notes per bar, with BOTH octaves used in every bar.',
    hints: [
      'Classic: low-high-low-high 8th notes all bar.',
      'Bar roots: A, F, C, G (e.g. A1↔A2).',
      'Make the notes short (1/16 or 1/8) — bounce needs gaps.',
    ],
    centerPitch: 38,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), drumTrack({ kick: [0, 4, 8, 12] }), bassTrack()],
      loopBars: 4,
      bpm: 122,
      selectedTrackId: 'bass',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'bass')
      for (let bar = 0; bar < 4; bar++) {
        const rootPc = CHORD_ROOTS_PC[bar]
        const bn = barNotes(t, bar)
        if (bn.length < 6) return fail(`Bar ${bar + 1} has ${bn.length} notes — an octave bounce needs at least 6 (try straight 8ths).`)
        for (const x of bn) {
          if (x.pitch % 12 !== rootPc) return fail(`${noteName(x.pitch)} in bar ${bar + 1} isn't the root (${PC(rootPc)}). Octave bass = one pitch class only.`)
          if (x.pitch >= 58) return fail(`${noteName(x.pitch)} in bar ${bar + 1} is too high for bass.`)
        }
        const octaves = new Set(bn.map((x) => Math.floor(x.pitch / 12)))
        if (octaves.size < 2) return fail(`Bar ${bar + 1} stays in one octave — alternate low and high (root and root+12).`)
      }
      return pass('That bounce! One pitch class, two octaves, infinite momentum. Daft Punk built a career on this.')
    },
  },
  {
    id: 'offbeat-bass',
    module: BASSMEL,
    title: 'Offbeat Bass',
    summary:
      'The signature house/electro bass trick: play the bass ONLY on the offbeats, in the gaps between the kicks. Kick and bass never collide, the low end stays clean, and the groove gets that pumping push-pull — like sidechain compression, but written into the notes.',
    task: 'With the four-on-the-floor kick playing, write a bassline where every note lands on an offbeat 8th (steps 3, 7, 11, 15 of each bar) — at least 3 notes per bar, each bar built on its chord root, below C3.',
    hints: [
      'Every note start must be on step 3, 7, 11 or 15 of the bar — never on a kick.',
      'Keep notes short so they clear out before the next kick.',
      'Count "1-AND-2-AND": your bass is all ANDs.',
    ],
    centerPitch: 38,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), drumTrack({ kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }), bassTrack()],
      loopBars: 4,
      bpm: 126,
      selectedTrackId: 'bass',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'bass')
      for (let bar = 0; bar < 4; bar++) {
        const bn = barNotes(t, bar)
        if (bn.length < 3) return fail(`Bar ${bar + 1} has ${bn.length} notes — you need at least 3 offbeat hits per bar.`)
        for (const x of bn) {
          if ((x.start - bar * 16) % 4 !== 2)
            return fail(`The note at step ${(x.start % 16) + 1} of bar ${bar + 1} isn't on an offbeat 8th. Offbeats are steps 3, 7, 11, 15.`)
          if (x.pitch % 12 !== CHORD_ROOTS_PC[bar])
            return fail(`${noteName(x.pitch)} in bar ${bar + 1} isn't the chord root (${PC(CHORD_ROOTS_PC[bar])}). Keep it on roots for now.`)
          if (x.pitch >= 48) return fail(`${noteName(x.pitch)} is too high — below C3.`)
        }
      }
      return pass('Kick, bass, kick, bass — never together, always pumping. That\'s the house engine room.')
    },
  },
  {
    id: 'arpeggios',
    module: BASSMEL,
    title: 'Arpeggios',
    summary:
      'Play a chord\'s notes one at a time instead of together and you have an ARPEGGIO — melody and harmony in one part. Trance, techno and synthwave lean on arps for hypnotic motion. The chords are loaded quietly underneath; arpeggiate them.',
    task: 'On the Lead track, arpeggiate each bar\'s chord: at least 4 notes per bar, never two at once, using ONLY that bar\'s chord tones (Am, F, C, G), each note a 16th or 8th long.',
    hints: [
      'Bar 1: cycle A-C-E patterns (up, down, up-down — any order).',
      'Keep a steady rhythm — 8th notes all the way is classic.',
      'Try the same shape starting on each chord: instant sequence feel.',
    ],
    centerPitch: 64,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), leadTrack()],
      loopBars: 4,
      bpm: 120,
      selectedTrackId: 'lead',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'lead')
      for (let bar = 0; bar < 4; bar++) {
        const bn = barNotes(t, bar).sort((a, b) => a.start - b.start)
        if (bn.length < 4) return fail(`Bar ${bar + 1} has ${bn.length} notes — an arp needs at least 4 to feel like motion.`)
        const starts = bn.map((x) => x.start)
        if (new Set(starts).size !== starts.length)
          return fail(`Bar ${bar + 1} has stacked notes — an arpeggio plays chord tones one at a time.`)
        for (const x of bn) {
          if (!CHORD_PCS[bar].includes(x.pitch % 12))
            return fail(`${noteName(x.pitch)} in bar ${bar + 1} isn't a ${CHORD_NAMES[bar]} chord tone (${CHORD_PCS[bar].map(PC).join(', ')}).`)
          if (x.duration > 4) return fail(`Keep arp notes short (1/16 or 1/8) — the note at bar ${bar + 1} is too long.`)
        }
      }
      return pass('Hypnotic. In Ableton, this is what the Arpeggiator MIDI effect automates — now you know what it\'s doing.')
    },
  },
  {
    id: 'melody',
    module: BASSMEL,
    title: 'Write a Melody',
    summary:
      'Melody is where rules end and taste begins — but constraints help: stay in key, use mostly stepwise motion with occasional leaps, and leave space (rests are notes too). The chords and bass are loaded; write on top of them.',
    task: 'Write a melody on the Lead track over the 4 bars: at least 8 notes, all inside A minor (highlighted rows), using at least 4 different pitches, spanning at least a fifth (7+ semitones), with notes in both halves of the loop.',
    hints: [
      'Chord tones (A/C/E over Am, etc.) on strong beats always sound right.',
      'Sing something over the loop, then hunt for the notes you sang.',
      'Steal rhythm from speech: short-short-long phrases are instantly musical.',
    ],
    centerPitch: 70,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), bassTrack(bassGrooveNotes(4)), leadTrack()],
      loopBars: 4,
      bpm: 110,
      selectedTrackId: 'lead',
      noteLength: 4,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'lead')
      if (t.notes.length < 8) return fail(`A melody needs room to develop — write at least 8 notes (you have ${t.notes.length}).`)
      for (const x of t.notes) {
        if (!AM_SCALE.includes(x.pitch % 12))
          return fail(`${noteName(x.pitch)} is outside A minor — stick to the highlighted rows for now.`)
      }
      const pitches = [...new Set(t.notes.map((x) => x.pitch))]
      if (pitches.length < 4) return fail('Use at least 4 different pitches — a melody needs contour, not a drone.')
      const range = Math.max(...pitches) - Math.min(...pitches)
      if (range < 7) return fail('Your melody spans less than a fifth. Add a leap or reach higher — give it shape.')
      const half = 32
      if (!t.notes.some((x) => x.start < half) || !t.notes.some((x) => x.start >= half))
        return fail('Spread the melody across the whole loop — both halves need notes.')
      return pass('You wrote a real melody over a real progression. This is songwriting — the rest is refinement.')
    },
  },
  {
    id: 'call-response',
    module: BASSMEL,
    title: 'Call & Response',
    summary:
      'The oldest trick in melody: a phrase (the CALL), a gap, then an answering phrase (the RESPONSE). The silence is doing half the work — it gives the listener time to want the answer. Vocal chops, lead lines, even basslines use this constantly.',
    task: 'Write a call-and-response melody: a phrase of 3+ notes in bar 1 (the call), near-silence in bar 2 (1 note max), an answering phrase of 3+ notes in bar 3 that reuses at least 2 of the call\'s rhythm positions, and at most 2 notes in bar 4. All in A minor.',
    hints: [
      'Write bar 1 first. Then copy its rhythm to bar 3 but change some pitches.',
      'The response often ends lower than the call — like answering a question.',
      'Resist filling bar 2. The gap IS the hook.',
    ],
    centerPitch: 70,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), bassTrack(bassGrooveNotes(4)), leadTrack()],
      loopBars: 4,
      bpm: 112,
      selectedTrackId: 'lead',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'lead')
      for (const x of t.notes) {
        if (!AM_SCALE.includes(x.pitch % 12)) return fail(`${noteName(x.pitch)} is outside A minor.`)
      }
      const call = barNotes(t, 0)
      const rest1 = barNotes(t, 1)
      const resp = barNotes(t, 2)
      const rest2 = barNotes(t, 3)
      if (call.length < 3) return fail(`The call (bar 1) needs at least 3 notes (you have ${call.length}).`)
      if (rest1.length > 1) return fail(`Bar 2 is the breathing space — 1 note maximum (you have ${rest1.length}). Trust the silence.`)
      if (resp.length < 3) return fail(`The response (bar 3) needs at least 3 notes (you have ${resp.length}).`)
      if (rest2.length > 2) return fail(`Bar 4 should stay sparse — 2 notes max (you have ${rest2.length}).`)
      const callOffsets = new Set(call.map((x) => x.start % 16))
      const shared = resp.filter((x) => callOffsets.has(x.start % 16)).length
      if (shared < 2)
        return fail('The response should echo the call\'s rhythm — reuse at least 2 of the same step positions within the bar.')
      return pass('Question, silence, answer. Loop it — hear how bar 2\'s emptiness makes bar 3 land harder?')
    },
  },
  {
    id: 'motif-variation',
    module: BASSMEL,
    title: 'Motif & Variation',
    summary:
      'Great tracks aren\'t built from endless new ideas — they\'re built from ONE idea (a motif) repeated with small changes. Repetition makes it memorable; variation keeps it alive. The rule of thumb: keep the rhythm, change the pitches (or vice versa).',
    task: 'Write a 2-bar motif (4+ notes in bars 1–2), then in bars 3–4 repeat its EXACT rhythm (same step positions and lengths) with at least 2 pitches changed. All in A minor.',
    hints: [
      'Write bars 1–2, then place notes at identical positions in bars 3–4.',
      'Classic variation: same shape, moved up or down within the scale.',
      'Changing the last note is the easiest strong variation — it redirects the phrase.',
    ],
    centerPitch: 70,
    scalePcs: AM_SCALE,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), leadTrack()],
      loopBars: 4,
      bpm: 115,
      selectedTrackId: 'lead',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'lead')
      for (const x of t.notes) {
        if (!AM_SCALE.includes(x.pitch % 12)) return fail(`${noteName(x.pitch)} is outside A minor.`)
      }
      const motif = t.notes.filter((x) => x.start < 32).sort((a, b) => a.start - b.start)
      const vari = t.notes.filter((x) => x.start >= 32).sort((a, b) => a.start - b.start)
      if (motif.length < 4) return fail(`The motif (bars 1–2) needs at least 4 notes (you have ${motif.length}).`)
      if (vari.length !== motif.length)
        return fail(`The variation (bars 3–4) must have the same number of notes as the motif (${motif.length} — you have ${vari.length}). Same rhythm, remember.`)
      for (let i = 0; i < motif.length; i++) {
        if (vari[i].start - 32 !== motif[i].start || vari[i].duration !== motif[i].duration)
          return fail(`Note ${i + 1} of the variation doesn't match the motif's rhythm — same step positions and lengths, only pitches change.`)
      }
      const changed = motif.filter((m, i) => m.pitch !== vari[i].pitch).length
      if (changed < 2) return fail(`Only ${changed} pitch differs — change at least 2 to make it a real variation, not a copy.`)
      return pass('One idea, two colors. This motif discipline is why great hooks feel inevitable.')
    },
  },
  {
    id: 'pentatonic-melody',
    module: BASSMEL,
    title: 'Pentatonic Melody',
    summary:
      'Now put the pentatonic scale to work: with only 5 "can\'t-miss" notes, you can focus entirely on rhythm and shape instead of worrying about wrong notes. This is how many producers sketch every lead — pentatonic first, color notes later.',
    task: 'Write a melody using ONLY A minor pentatonic (A, C, D, E, G): at least 10 notes, at least 4 different pitches, notes in all 4 bars.',
    hints: [
      'The highlighted rows are the pentatonic — B and F are gone.',
      'Since every note works, be brave with leaps and rhythm.',
      'Try starting phrases on different beats in each bar.',
    ],
    centerPitch: 70,
    scalePcs: AM_PENTA,
    setup: () => ({
      tracks: [keysTrack(chordProgressionNotes(4)), bassTrack(bassGrooveNotes(4)), drumTrack({ kick: [0, 4, 8, 12], hat: [2, 6, 10, 14] }), leadTrack()],
      loopBars: 4,
      bpm: 118,
      selectedTrackId: 'lead',
      noteLength: 2,
    }),
    validate: (ctx) => {
      const t = track(ctx, 'lead')
      if (t.notes.length < 10) return fail(`At least 10 notes (you have ${t.notes.length}) — pentatonic means you can afford to be busy.`)
      for (const x of t.notes) {
        if (!AM_PENTA.includes(x.pitch % 12))
          return fail(`${noteName(x.pitch)} isn't in A minor pentatonic (A, C, D, E, G only).`)
      }
      if (new Set(t.notes.map((x) => x.pitch)).size < 4) return fail('Use at least 4 different pitches.')
      for (let bar = 0; bar < 4; bar++) {
        if (barNotes(t, bar).length === 0) return fail(`Bar ${bar + 1} is empty — spread the melody across all 4 bars.`)
      }
      return pass('Every note landed, didn\'t it? That\'s the pentatonic guarantee. Sketch fast in pentatonic, refine later.')
    },
  },
]

function PC(pc: number): string {
  return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][pc]
}

export const THEORY_MODULES: Module[] = [
  { name: SCALES, lessons: scalesLessons },
  { name: CHORDS, lessons: chordsLessons },
  { name: BASSMEL, lessons: bassMelLessons },
]
