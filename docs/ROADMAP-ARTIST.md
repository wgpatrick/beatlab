# BeatLab Roadmap: From Trainer to Artist's Tool

Written 2026-07-08. The previous roadmap (`ROADMAP.md`, phases A-K plus the sampling/drums
deep-dive) built BeatLab's *teaching* capability: 127 lessons, a real synth engine, sampling,
mixing, a mobile layout. This roadmap is about a different question, prompted by a product
reflection pass: **what does an aspiring artist need that a lesson-completer doesn't?**

Grounded in: EDMProd's survey of 1000+ producers (the dominant struggles are *finishing tracks*
and motivation — not missing knowledge), reviews of Ableton Learning Music (its most-praised
traits: you make sound within seconds, and the export button bridges toy → tool), SoundGym-style
listen-first ear training, and a UX audit of BeatLab's own flows (first-load experience, failure
feedback, state visibility).

Three findings drive the phases below:

1. **Nothing made in BeatLab can leave BeatLab.** No audio export, no project save — the only
   thing that survives a reload is the list of completed lesson IDs (`beatlab-completed` in
   localStorage). An artist's core loop is *make → keep → share*; BeatLab supports only *make*.
2. **First contact is a theory quiz, not sound.** Lesson 1.1 is The Major Scale in a piano roll;
   beats — the instant-gratification entry point every comparable tool leads with — are module 8.
3. **Grading always has one right answer.** Effective pedagogy, but nothing ever says "now make
   *your* version" — the identity moment that turns a student into an artist.

## Phase L — Keep what you make (highest priority)

*The single biggest gap. Everything here is client-side; no backend appears in this roadmap.*

1. ✅ **Sandbox persistence.** *Done 2026-07-10.* `src/state/sandboxPersistence.ts` +
   `store.ts`'s debounced autosave subscription. Versioned `{v:1,...}` payload; restoring bumps
   the note/clip/scene ID counters past anything already in the payload to avoid collisions with
   a fresh session's counters.
2. ✅ **WAV export.** *Done 2026-07-10.* Confirmed the engine-builds-against-the-live-context
   prediction exactly — `Tone.Offline()` doesn't drop in. Shipped as predicted: a
   `MediaRecorder` tap on `masterLimiter` (`engine.ts`'s `recordWav()`), real-time capture, then
   decoded and re-encoded as true WAV (`src/audio/wavEncode.ts`) rather than left as webm/opus,
   so the file is universally loadable. "Export WAV" button in the new
   `src/components/ProjectToolbar.tsx`, sandbox mode.
3. **MIDI export.** *Not yet done.* Notes are already `{pitch, start, duration, velocity}` in
   16th-note steps — a Standard MIDI File writer is ~80 lines with no dependency (format 1, one
   track per BeatLab track, PPQ 480, tempo event from bpm). Lets a BeatLab riff move into any
   real DAW — the "export to Live" breakthrough, generalized. New `src/audio/midiExport.ts`.
4. ✅ **Project file save/load.** *Done 2026-07-10.* The same payload as item 1, downloadable/
   re-importable as a `.beatlab.json` via `ProjectToolbar.tsx`, with a friendly error for an
   invalid file.

*(Items 1/2/4 were picked up as the first commit of a separate, longer-horizon exploration —
see `wgpatrick/beatlab-daw`'s `docs/phase-0-plan.md` for why: the sandbox's serializable state
shape and a real render path were exactly what that effort needed to prove first, so it made
more sense to ship them here, for real, than to duplicate them in a parallel fork.)*

## Phase M — The first 60 seconds

5. **Beats before theory.** Reorder `MODULES` in `src/lessons/curriculum.ts` so Drum Programming
   is module 1 (Notes & Scales becomes ~4th, before Bass & Melody needs it). Lesson content
   doesn't change; numbering is derived, so this is a one-line array reorder plus a check that
   no lesson copy references "module 8" by number.
6. **A 30-second first win.** New opening lesson: four pads pre-highlighted, "tap these, press
   play — you made a beat." No reading required to succeed; the summary explains after the
   sound, not before. This is Learning Music's most-copied trick and BeatLab has all the pieces.
7. **Lesson copy budget.** A content pass trimming `summary` fields toward ~40 words (many are
   100+), pushing depth into `hints`. Mechanical but high-leverage: the mobile bottom sheet
   makes long summaries cost a full screen. Start with the ten longest (grep for length).

## Phase N — Feedback that points at the UI

8. **Drum-step highlighting on failed checks.** Synth lessons already color wrong knobs via
   `paramScores`; drum lessons return prose only. Add an optional `stepHints` to
   `ValidateResult` (`Partial<Record<DrumLane, { wrong: number[]; missing: number[] }>>`),
   render as red/pulsing outlines in `StepSequencer.tsx`, and adopt it in the ~8 highest-traffic
   drum lessons (`sameSet`-style validators can compute it nearly for free in
   `src/lessons/framework.ts`).
9. **Knob ergonomics.** Double-click resets to the param's default (needs the default plumbed
   into `Knob.tsx` — `DEFAULT_SYNTH[key]` at each call site or a `defaultValue` prop),
   scroll-wheel adjusts, shift+drag = fine adjustment. Every hardware-familiar user expects all
   three; students copying a target patch feel their absence constantly.
10. **Make hidden state visible.** A small chip in the transport when a sample is loaded
    (name + Clear), since slices/pitch mode silently persist across lessons and into the
    Sandbox. `src/components/TransportBar.tsx` reading `sampleLoaded`.

## Phase O — Listen-first ear training

11. **A/B quiz lesson type.** The Ear Training module grades knob-matching; SoundGym-style games
    are *listen and answer*. New lesson shape: engine renders the same phrase through two
    patches (the `playTarget` path already does headless patch rendering), student clicks A or
    B to answer "which is brighter / more compressed / wetter." Needs a small `Lesson.quiz`
    variant in `framework.ts` + a two-button UI in `LessonPanel.tsx` — no new audio capability.
12. **Warp/Speed and preset A/Bs as quizzes.** The Wave 4 features are natural quiz material
    ("which clip is the 909?", "which repitch kept the length?") — 4-5 quiz lessons reusing
    item 11's machinery against already-shipped engine features.

## Phase P — Cross-module integration (content, no engine work)

13. **Genre Lab uses the kit presets.** The trap lesson should set (and grade) the 808 kit, the
    house lessons the 909 — `DRUM_KIT_PRESETS` is exported from `types.ts` and the Museum
    lesson's `matches()` helper shows the grading pattern. `src/lessons/genres.ts`.
14. **Track Lab → curriculum bridges.** Track Lab is the app's most magical feature and a
    dead end: add "steal the skeleton" lessons — import a song, chop its break (existing
    `chopTrackLabSection`), then rebuild its drum pattern in the sequencer and A/B against the
    original section loop. 2-3 lessons in `src/lessons/deconstruction.ts`.
15. **Theory anchored to songs.** Every theory lesson's pass message names 2-3 famous tracks
    built on that scale/progression (Hooktheory's core trick, zero engine work).
    `src/lessons/theory.ts` copy pass.
16. **"Make it yours" capstones.** Each major module ends with an open-ended prompt ("make a
    beat that uses a reversed chop and a filter sweep — no wrong answers") with a self-certified
    done button. Needs a `Lesson.freeform` flag that swaps Check My Work for Mark Complete in
    `LessonPanel.tsx` — deliberately ungraded; the identity moment is the point.

## Explicitly deferred

- **Accounts/cloud/sharing links** — everything above stays local-first; a backend is a
  different product decision.
- **Real-time collaboration, social features** — same.
- **Formant-preserving pitch beyond GrainPlayer** — Warp mode is taught honestly; a better
  algorithm (phase vocoder worklet) is polish, not a gap.
- **The listening pass** (starter-sample windows, kit preset character, Warp texture) — still
  open, still human-ears-only; cheap to do, blocks nothing here.

## Sequencing rationale

L before M: persistence changes what the first 60 seconds can promise ("come back tomorrow —
it'll still be here"). M before N/O: funnel before polish. P is parallelizable content work
any session can pick up piecemeal. Within L, item 1 (persistence) is a prerequisite for item 4
and pairs naturally with item 2 in one session.
