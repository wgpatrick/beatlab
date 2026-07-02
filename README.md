# BeatLab — Electronic Music Production Trainer

A browser-based, Ableton-styled DAW for learning music theory, synthesis and arrangement
through hands-on challenges. Built with React + TypeScript + [Tone.js](https://tonejs.github.io/)
(Web Audio synthesis — no samples, every sound is synthesized live).

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Use headphones or decent speakers — there's a real sub bass in here.

## What's inside

**54 lessons across 8 modules**, each with a task, hints, and a checker that gives
specific feedback (e.g. "Note 3 should be E3, but it's D#3"). Lessons marked ↻ are
**drills**: randomized exercises you can reroll forever.

1. **Notes & Scales** — major/minor/pentatonic scales, intervals, plus interval & scale drills
2. **Chords & Harmony** — triads, a triad drill, inversions, 7th chords, sus chords,
   progressions, voice leading
3. **Bass & Melody** — root / root-fifth / octave / offbeat basslines, arpeggios, melody,
   call & response, motif & variation, pentatonic melody
4. **Synthesis** — oscillators, filter, resonance, pluck/pad envelopes, sub bass, organ, strings
5. **Ear Training** — four match-the-patch challenges, waveform-ID drill, find-the-cutoff drill
6. **Drum Programming** — four-on-the-floor through full grooves, 16th drive, 3-against-4
7. **Rhythm Styles** — breakbeat, boom bap, drum & bass, half-time, minimal techno,
   and a rhythm dictation drill (hear a random beat, program it back)
8. **Arrangement** — song structure, DJ intro, energy curve, breakdown & second drop,
   and a full 16-bar track journey with playback

**Sandbox mode** — the same piano roll, step sequencer and synth devices with no rules,
preloaded with a 4-track groove to mangle.

## The instrument

- **Piano roll** — click to draw notes (length selector: 1/16 → 1 bar), click a note to delete,
  scale rows highlighted in relevant lessons, Space = play/stop
- **Step sequencer** — 16-step, 5-lane synthesized 909-style kit (membrane kick,
  noise snare/clap, FM hats)
- **Synth device** — per-track subtractive synth: 4 waveforms → low-pass filter
  (cutoff + resonance) → ADSR amp envelope → volume, controlled with draggable knobs
- Progress is saved in localStorage.

## Skills that transfer to Ableton

Everything maps 1:1: the piano roll ↔ MIDI clips, the step grid ↔ Drum Rack,
the device panel ↔ Analog/Operator/Wavetable macros (osc → filter → envelope is the
same signal chain), and the energy-curve grid ↔ Session/Arrangement view clip launching.
