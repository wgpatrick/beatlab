# BeatLab — Electronic Music Production Trainer

A browser-based, Ableton-styled DAW for learning music theory, synthesis, mixing and
arrangement through hands-on challenges. Built with React + TypeScript +
[Tone.js](https://tonejs.github.io/). BeatLab ships zero audio files — every built-in sound
is synthesized live in Web Audio; the only samples are the ones you import yourself.

**Live at [willpatrick.xyz/musiclearning](https://willpatrick.xyz/musiclearning)** — no
install needed. Use headphones or decent speakers; there's a real sub bass in here.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173/musiclearning/.

## What's inside

Three modes, one instrument: **Lessons** (the guided curriculum), **Sandbox** (same gear,
no rules), and **Track Lab** (deconstruct real songs from your own library).

**115 lessons across 12 modules**, each with a task, hints, and a checker that gives
specific feedback (e.g. "Note 3 should be E3, but it's D#3"). Lessons marked ↻ are
**drills**: randomized exercises you can reroll forever.

1. **Notes & Scales** — major/minor/pentatonic scales, intervals, plus interval & scale drills
2. **Chords & Harmony** — triads, a triad drill, inversions, 7th chords, sus chords,
   progressions, voice leading
3. **Bass & Melody** — root / root-fifth / octave / offbeat basslines, arpeggios, melody,
   call & response, motif & variation, pentatonic melody
4. **Synthesis** — oscillators, filter, resonance, pluck/pad envelopes, sub bass, organ, strings
5. **Ear Training** — four match-the-patch challenges, waveform-ID drill, find-the-cutoff drill
6. **Serum Lab** — the synthesis curriculum translated into Xfer Serum's vocabulary:
   the four-source layout, a real wavetable oscillator (three tables, WT POS scanning,
   LFO-modulatable), the 5/7-voice stereo-width supersaw, the ENV 2 → cutoff pluck,
   BPM-synced LFOs, a draw-your-own LFO shape editor, plus the classic tutorial
   archetypes — trance gate, riser, growl bass, hoover, evolving pad, FM bells —
   FX-chain ordering, a reverse-engineer-the-preset ear challenge, and an
   init-patch-to-finished-lead capstone
7. **Drum Programming** — four-on-the-floor through full grooves, 16th drive, 3-against-4
8. **Rhythm Styles** — breakbeat, boom bap, drum & bass, half-time, minimal techno,
   and a rhythm dictation drill (hear a random beat, program it back)
9. **Arrangement** — song structure, DJ intro, energy curve, breakdown & second drop,
   and a full 16-bar track journey with playback
10. **Mixing & effects, synthesis depth, sampling, mastering** — EQ / compression / distortion /
    sidechain, automation & modulation, FM / unison / glide / arpeggiator, chop-your-own-sample,
    a recreate-the-track capstone, and a master-bus loudness lesson
11. **Genre Lab** — signature sounds of ten genres: the house offbeat bass, 303 squelch,
    dubstep wobble, Reese, supersaw, sidechain pump, lo-fi dust, UKG sub, synthwave arp,
    future-bass chords
12. **Track Deconstruction** — the producer's classic exercise, guided: X-ray a real song in
    Track Lab, map its structure, table its elements, then steal the skeleton and chop the break

**Track Lab** — import any song you own (mp3/wav/m4a…) and BeatLab X-rays it *locally in your
browser*: detected BPM, waveform, per-bar ENERGY/LOW/MID/HIGH heat strips, and proposed section
boundaries. Loop sections, label the structure (graded against the audio itself — a "Drop" that
isn't loud gets called out), then one click turns your map into a Sandbox arrangement template,
or slices any section's groove onto the drum pads to flip. Nothing is uploaded anywhere.

**Sandbox mode** — the same piano roll, step sequencer and synth devices with no rules,
preloaded with a 4-track groove to mangle.

## The instrument

- **Piano roll** — draw notes (1/16 → 1 bar), box-select and move with arrow keys,
  scale rows highlighted in relevant lessons, Space = play/stop, full undo/redo
- **Step sequencer** — 16-step, 5-lane synthesized 909-style kit (membrane kick,
  noise snare/clap, FM hats), swing control
- **Synth device** — per-track subtractive/FM synth: main oscillator (4 shapes **or a
  wavetable** — three tables scanned by a WT POS knob) + second + sub oscillator with noise,
  unison up to 7 voices with stereo width, FM (harmonicity + mod index), glide, and an
  arpeggiator → filter (cutoff, resonance, keytracking, velocity→cutoff, filter envelope) →
  ADSR → two tempo-syncable LFOs (LFO 1 takes a **hand-drawn 16-step shape** and can scan
  the wavetable) and a one-knob macro
- **Mixing chain per track** — 3-band EQ, compressor, distortion/bitcrusher (reorderable
  chain), sidechain ducking, reverb/delay sends, pan/volume — plus automation lanes in
  Sandbox and a master bus with limiter + level meter
- **Sampler** — load any audio file onto the 5 drum pads, auto-sliced; Track Lab's ✂ chops
  sections of a real song straight onto the same pads
- **Play it live** — connect a MIDI keyboard (Web MIDI) or use "Type to Play" on your
  computer keyboard; record takes with adjustable quantize strength
- Progress is saved in localStorage.

## Skills that transfer to Ableton

Everything maps 1:1: the piano roll ↔ MIDI clips, the step grid ↔ Drum Rack, the device
panel ↔ Analog/Operator macros (osc → filter → envelope is the same signal chain), the
EQ/compressor/sends chain ↔ a channel strip with return tracks, automation lanes ↔
Ableton's automation view, and the energy-curve grid ↔ Session/Arrangement view clip
launching. Track Lab is the classic "deconstruct a reference track" exercise, built in.
