# BeatLab Roadmap: Ear Training Mechanics + DAW Fundamentals

Written 2026-07-02. Grounded in two research passes (a deep-dive into a well-known commercial synth
ear-training course, and a modern-DAW-fundamentals gap analysis) plus a read of the current codebase. Goal: decide what to build next, in what order, and why —
not a full spec. Each phase item below names the actual files/types it touches so it's directly actionable.

## Why this roadmap exists

BeatLab's README claims two things: (1) it teaches synthesis/production skills through hands-on lessons,
and (2) "skills transfer 1:1" to Ableton. Two gaps showed up when we checked that against reality:

- The **Ear Training** module (`src/lessons/sound.ts`) already does a simplified version of the "hear a
  target patch, rebuild it by ear" loop used by the leading commercial course in this space — but its
  actual secret sauce isn't the concept, it's two specific mechanics BeatLab doesn't have yet: per-parameter
  tri-state scoring, and progressive parameter reveal.
- The "transfers 1:1 to Ableton" claim is aspirational in a few places — e.g. there's no multiple-clips/
  scenes model, no automation, no undo, no swing. These aren't obscure DAW features; they're what most
  Ableton tutorials treat as day-one fundamentals.

## Current architecture snapshot

- **Synth signal chain** (`src/types.ts` `SynthParams`, `src/audio/engine.ts`): one oscillator (4 waveforms)
  → one lowpass filter (cutoff + resonance) → one ADSR amp envelope → volume. `Engine.ensureChain` builds
  a `Tone.PolySynth<Tone.Synth>` per track; `applyParams` pushes the full `SynthParams` object into it on
  every knob change. No filter envelope, no LFO, no second oscillator/sub/noise, no effects.
- **Lesson framework** (`src/lessons/framework.ts`): a `Lesson` has `setup()` (returns tracks/bpm/loopBars),
  `validate(ctx)` (returns `{pass, message}`), and optionally a `target: TargetPatch` for ear-training
  lessons. `sound.ts`'s `matchLesson()` helper wraps this into "play target → rebuild → `check()` returns
  a string[] of issues." This `check()` function is exactly where Phase A's scoring upgrade lands.
- **Device panel** (`src/components/DevicePanel.tsx`): four fixed sections (OSC/FILTER/ENVELOPE/OUT),
  always fully visible — this is where Phase A's progressive-reveal mechanic lands.
- **Track/clip model** (`src/types.ts` `Track`, `src/state/store.ts`): one `notes[]`/`pattern` per track,
  full stop — there is no concept of multiple clips or scenes per track. This is the biggest structural
  gap for Phase C.
- **Piano roll** (`src/components/PianoRoll.tsx`): notes snap to a fixed 1/16 grid; `LENGTHS` quantizes
  durations to {1,2,4,8,16} steps; add/delete only, no drag-to-move/resize, no velocity.
- **Step sequencer** (`src/components/StepSequencer.tsx`): 16 fixed steps, boolean on/off per lane only —
  no velocity, no swing, no per-lane step count.
- **Arrangement view** (`src/components/ArrangementView.tsx`): two modes — `structure` (pick a section
  type per slot) and `energy` (track × section on/off matrix). This is a macro "which sections are busy"
  tool; it has no concept of within-clip movement (e.g. a filter opening over 8 bars).
- **Store** (`src/state/store.ts`): single flat Zustand store; `loadLesson`/`goToSandbox` fully replace
  state; no undo/redo, no copy/paste, no clip duplication.

## Phase A — Ear-training mechanic upgrade (cheap, this is the actual secret sauce)

1. **3-tier per-parameter scoring.** Replace `sound.ts`'s `check(p): string[]` (binary issues-or-none)
   with a scorer that returns a status per parameter (`correct` / `close` / `wrong`), with tolerance bands
   tuned to perceptibility rather than raw numeric distance (e.g. cutoff comparison should be in log/octave
   space, not linear Hz — a 50 Hz miss matters near 100 Hz and doesn't near 8 kHz). This plugs into the
   existing `matchLesson()`/`validate()` shape; the UI change is rendering per-knob color state in
   `DevicePanel.tsx` instead of (or alongside) the current text-issue list.
2. **Progressive parameter reveal.** Add a `visibleParams?: (keyof SynthParams)[]` (or similar) to `Lesson`
   in `framework.ts`, defaulting to "all" outside lesson mode. `DevicePanel.tsx` hides/disables
   sections not yet unlocked. This is the single mechanic reviewers of the reference course credit most for
   making a large parameter space feel approachable instead of overwhelming.
3. **Single-parameter drills → combined "group challenge" drills.** BeatLab already has this shape
   (`waveform-drill`, `cutoff-drill` in `sound.ts` isolate one parameter each) — extend the pattern to a
   drill that randomizes 2-3 parameters at once, mirroring the periodic multi-parameter challenges seen in
   the reference course, which come after enough single-parameter reps.
4. **Randomizer mode** (once #1 exists): a "New Exercise" style reroll that procedurally generates a
   target `SynthParams` within a lesson's unlocked parameter set, for infinite replay without new authored
   content — cheap once the scoring engine is real.

## Phase B — Workflow habits (small builds, big pedagogical payoff)

5. **Undo/redo.** Currently no history exists in `store.ts` at all. Lowest-risk approach: snapshot
   `tracks`/`arrangement` on each mutating action into an undo stack; this is a habit-forming feature more
   than a "concept" lesson, but its absence actively teaches the wrong instinct (fear of experimenting).
6. **Swing/groove control.** One new parameter (e.g. `swing: number` alongside `bpm` in the store), applied
   in `Engine.tick()` (`src/audio/engine.ts`) by delaying even or odd 16th-note steps. Cheap to build,
   and genre-specific swing % (house ~57-66%, hip-hop ~52-60%) is a concrete, gradeable ear-training drill
   in its own right — pairs naturally with Phase A's scoring approach.
7. **Note velocity**, visually encoded (color saturation on notes, per Ableton's convention) in both
   `PianoRoll.tsx` (`Note` in `types.ts` needs a `velocity` field) and `StepSequencer.tsx` (per-step
   velocity instead of boolean on/off — `DrumPattern` would need to become `number[]` per lane, not
   `boolean[]`).
8. **Copy/paste + duplicate clip/pattern.** Directly enables the "duplicate a loop, then vary it"
   arrangement technique real producers use — depends on Phase C's multi-clip model to be fully meaningful,
   but duplicate-track-contents is doable standalone first.

## Phase C — Bigger architecture pieces

9. **Multiple clips per track + scenes (Session View analog).** The biggest lift: `Track` currently holds
   one `notes[]`/`pattern` directly; this needs to become `Track.clips: Clip[]` with a `currentClipId`,
   plus a scenes concept for triggering a row of clips across tracks together. This is the item that makes
   the README's "transfers 1:1 to Ableton" claim literally true instead of aspirational — everything else
   in this roadmap is smaller than this one.
10. **Basic single-parameter automation.** A breakpoint envelope (e.g. `{time: number, value: number}[]`)
    on filter cutoff over the length of a clip, applied via `Tone.Filter.frequency` scheduling in
    `engine.ts`'s `tick()`. The filter-build/sweep is genre-defining and the existing `ArrangementView`
    energy-curve system (macro, per-section) cannot substitute for it (micro, within-clip movement).
11. **Drag to move/resize existing notes** in `PianoRoll.tsx` (currently add/delete only), plus **Scale
    Mode/highlighting** — the latter partially exists already via `Lesson.scalePcs` driving `row-scale`
    styling; generalizing it to a user-toggleable, non-lesson-specific control is the remaining work.
12. **Minimal mixer**: pan (new `SynthParams.pan`) + one shared reverb/delay send (a `Tone.Reverb`/
    `Tone.FeedbackDelay` return bus in `engine.ts` that all chains can send to) — the documented "floor"
    of what any tutorial calls a first mixer, not an advanced feature.

## Phase D — Synth engine depth (feeds new Phase A lessons)

13. Second oscillator + sub-oscillator + noise generator (`SynthParams` grows from one `osc` field to an
    oscillator-bank shape).
14. Separate filter envelope (second ADSR, applied to `Tone.Filter.frequency` rather than only amp) —
    this is what makes filter "movement" per-note (not just per-automation-lane) possible.
15. One LFO with a small fixed set of destinations (pitch, cutoff, amp) — mirrors the reference course's
    training synth's "fixed destination list, not a free matrix" scope, which the research shows is enough
    to teach the underlying concept without needing a full mod-matrix UI.
16. Filter type switch (low-pass/band-pass/high-pass) alongside existing cutoff/resonance.
17. Fixed-order effects send (reverb → delay, minimal) reusing the Phase C mixer bus.

Each Phase D addition should ship paired with the Phase A scoring/reveal mechanics applied to it (new
ear-training lessons), not as a standalone synth feature — that pairing is the actual lesson from the
research: the synth depth and the training mechanic are inseparable in what makes it work.

## Suggested sequencing

Phase A first — it's scoped to `sound.ts` + `DevicePanel.tsx` + `framework.ts`, reuses the existing lesson
system, and delivers the most-validated mechanic from the research before touching any architecture.
Phase B items are independent and can slot in anytime. Phase C (especially #9, multi-clip/scenes) is the
one item worth a dedicated design pass before starting, since it touches `types.ts`, `store.ts`, and
`engine.ts` simultaneously. Phase D should follow Phase A, not precede it — new synth modules are only as
valuable as the training mechanic that teaches them.

## Sources

- Ear-training course research: vendor site and marketing pages, Wikipedia, KVR Audio reviews/forum,
  App Store listings, third-party review sites (SynthwavePro, ProMusicianHub, ProducerHive).
- DAW-fundamentals research: Ableton Live 12 Reference Manual (Grooves, Editing MIDI, Session View,
  Automation and Editing Envelopes, Clip Envelopes, Mixing, Keyboard Shortcuts), Ableton Keys/Scales FAQ,
  Ableton "Making Music" (Asynchronous or Polyrhythmic Loops), Ableton Blog (MPC-style swing), Sound on
  Sound (Session & Arrangement Views), MusicRadar (automation tricks), Attack Magazine (Roger Linn on
  swing/groove).
