# Track Lab & the Track Deconstruction module

Written 2026-07-05, following the Phase A-K roadmap (docs/ROADMAP.md, all shipped). This wave was
prompted directly by the user: *"one little tidbit I've heard over and over again is analyzing full
electronic songs for the structure, the samples they use, the detailed design of the sounds…
can be helpful."*

## The research behind it

A fresh research pass on how producers actually describe learning from full songs converged on a
remarkably consistent methodology:

- **Count bars and map sections with locators.** Multiple guides (AudioServices' "Deconstructing a
  Reference Track", learnhowtoproducemusic.com, Cymatics' EDM song-structure guide) describe the
  identical exercise: drop a favorite song into a DAW's arrangement view, mark every section with
  locators, color-code and name them, and count the bars. Sections in dance music begin and end
  every 8-32 bars; "you won't hear a new section begin on bar 5."
- **The element table.** Attack Magazine's long-running *Deconstructed* series (and its drums-only
  sibling *Beat Dissected*) breaks each analyzed track into a per-section inventory of exactly which
  elements are playing. Producers recommend rebuilding that table yourself as the deepest active-
  listening drill: pass 1 drums, pass 2 bass/harmony, pass 3 everything else.
- **Frequency-band listening.** Active-listening guides (DBS Institute's "Listen like a producer",
  LANDR, eMastered) teach sweeping attention band-by-band — lows/mids/highs — because a mix only
  becomes layers instead of a wall once you can isolate registers by ear.
- **Steal the structure, not the sounds.** iConCollective / Unison / Hyperbits all describe laying
  a reference's section map under your own arrangement ("referencing for composition") as standard
  professional practice — the energy curve is proven scaffolding, the content is yours.
- **Chop the break.** Sampling culture's founding move (Splice/Tracklib guides, every hip-hop
  history): find the groove inside a full song, slice it, flip it into something new.

Track Lab turns each of those five practices into an interactive exercise on a song the student
actually loves — which no fixed curriculum content can compete with for motivation.

## What was built

1. **`src/audio/analysis.ts`** — a pure-math analysis pipeline (no Tone.js, no DOM; fully testable
   headlessly): mono downmix → RMS/onset envelopes → **tempo** by autocorrelation over 70-180 BPM
   with harmonic support and parabolic peak refinement → beat phase → **downbeat** via low-band
   onset weighting → **per-bar features** (overall RMS + low/mid/high band RMS via hand-rolled RBJ
   biquads at 150 Hz / 1 kHz / 5 kHz) → **section boundaries** via a novelty curve over bar-level
   features, peak-picked and snapped to the 4-bar grid → waveform overview peaks.
2. **Track Lab view** (`src/components/TrackLab.tsx`, third app mode alongside Lessons/Sandbox):
   drag-and-drop import (all analysis local, nothing uploaded), waveform + section boundaries,
   ENERGY/LOW/MID/HIGH per-bar heat strips, per-section loop playback, label dropdowns, per-section
   "elements you hear" fields, ×2/÷2 tempo correction.
3. **Audio-grounded grading** (`gradeStructureMap` in `src/lessons/deconstruction.ts`): there is no
   ground truth for a song BeatLab has never heard, so the grader checks the student's labels
   against constraints the audio itself implies — Drops must be the loud, bass-carrying peaks;
   Breakdowns must lose the low band relative to the Drops; Buildups must lead into Drops;
   Intro/Outro live at the edges. Grading those constraints *is* the listening skill.
4. **Steal the skeleton** (`useTrackLabTemplate` in `src/state/store.ts`): exports the labeled map
   as a Sandbox arrangement — each analyzed section becomes a 2-bar slot in the existing energy
   grid (capped at 8 slots), BPM set from the analysis, and the instrument-per-section matrix
   pre-filled from the band data (low band → drums/bass, mids → chords, highs → lead) as a
   starting guess.
5. **Steal the break** (`chopTrackLabSection`): slices the first 1-2 bars of any section straight
   onto the Phase I drum sampler's five pads via the existing `loadDrumSampleFromBuffer` path.
6. **Track Deconstruction module** — five lessons walking the method end to end: The Producer's
   X-Ray (import), Map the Structure (label + audio-grounded grading), The Element Table
   (Attack-style layer inventory), Steal the Skeleton (template export), Steal the Break (chop +
   re-sequence). Lessons grade through the same `ValidateCtx` pass-through pattern Phase I's
   `sampleLoaded` used (`ctx.trackLab`).

## Honest approximations (stated in the UI copy too)

- **Downbeat detection is approximate** — of the 4 candidate beats, the one whose bar positions
  carry the most low-band onset wins. The grid can be off by a beat or two but is never stretched;
  the toolbar says "your ears outrank them."
- **Section boundaries are proposals**, from bar-level novelty, not a trained MIR model. Detected
  boundaries snap to the 4-bar grid; short sections merge. Students label what they *hear*; the
  grader reads section averages, not exact edges.
- **Tempo can land on half/double time** for sparse or breakbeat material — hence the ×2/÷2
  correction buttons (which re-run the full analysis at the forced tempo).
- **The template is a scaled miniature** (each section → one 2-bar slot, max 8), not a bar-for-bar
  reconstruction — same scaled-teaching approach as the existing Arrangement module.
- **Nothing is uploaded anywhere**: decoding and analysis run entirely in the browser. BeatLab
  ships no copyrighted audio; the student supplies their own files.

## Verification (2026-07-05)

Headless Chrome (playwright-core) drove the real code paths end to end, no mocks: a 48-bar
126 BPM "song" with a known structure (8-bar kick-only intro / 16-bar full drop / 8-bar bassless
breakdown / 15-bar drop) was synthesized sample-by-sample in the page, encoded as a real WAV
`File`, and pushed through the real `loadTrackLabFile → decodeAudioData → analyzeAudioBuffer`
pipeline. Results: BPM detected 126.2; boundaries found at exactly bars 8/24/32; LOW band
drop-vs-breakdown contrast 0.95 vs 0.02. The structure-map lesson passed with the true labels and
correctly *rejected* a breakdown mislabeled as a Drop; template export landed in the Sandbox
energy grid with the right sections/BPM and a band-informed active matrix (bass on in Drops, off
in the Breakdown) and audibly played; the chop path loaded real slices onto the pads and the
steal-the-break lesson passed end-to-end. 24/24 checks.

## Sources

- AudioServices Studio — "Deconstructing a Reference Track"; "Understanding Arrangements in
  Electronic Music Production"
- Attack Magazine — *Deconstructed* series (e.g. Mr G "Daily Prayer", DJ Boring "Winona");
  *Beat Dissected* series
- Cymatics — "EDM Song Structure"; learnhowtoproducemusic.com — "Track arrangement and song
  structure"; mastrng.com — "Techno Song Structure"
- iConCollective — "How to Use Reference Tracks"; Unison — "Reference Tracks: 20+ Tips";
  Hyperbits — "9 Best Ways to Learn Electronic Music Production"
- DBS Institute — "Listen like a producer: the art of active listening"; LANDR — "Why Active
  Listening Is the Most Important Skill"; eMastered / MasterClass active-listening guides
