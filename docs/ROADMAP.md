# BeatLab Roadmap: Effects, Modulation & Sampling

Written 2026-07-03, superseding the 2026-07-02 roadmap (Phases A-D below are now shipped on `main`).
Grounded in a new research pass: Ableton's own Learning Synths/Learning Music curricula (as a sanity
check on Phase D), the Berklee Online Ableton Live Professional Certificate structure (production,
composition, synthesis, **sampling**, **effects processing**), SoundGym/Golden Ears-style audio-effects
ear-training games, sampling/chopping guides (Splice, Melodics, Audeobox), reference-track deconstruction
methodology, dedicated research into modulation matrices/macros (Xfer Serum), FM and wavetable synthesis,
effect-chain signal order/parallel/sidechain compression, and automation curve shapes/clip-vs-arrangement
automation — plus a follow-up pass on Web MIDI API feasibility (browser support, latency, Ableton's
record-then-quantize-strength workflow) after the user asked about recording live from a physical MIDI
keyboard. As before: not a full spec, each item names the actual files/types it touches.

## Status: Phases A-K all shipped (2026-07-04)

All eleven phases (A through K, items 1-50) are implemented, verified (headless-browser-driven), and
committed on `main`:
- A-D: `8e7762b`, `aae0e9c`, `fe69717`, `72b5e92` (prior roadmap)
- G (MIDI input, built first since it was independently requested): `9143808`
- E (mixing effects): `9cc8112`
- F (automation/modulation depth): `1e25d3c`
- H (synth engine depth II): `c7eb3c8`
- I (sampling): `e35bce0`
- J (capstone): `44c282f`
- K (mastering): `58be41d`

See [[beatlab-roadmap-progress]] for the full verification writeup, including the real bugs caught and
fixed along the way (a NaN-producing log-scale knob at min=0, and a pre-existing Tone.js scheduling race
in rapid multi-lane drum preview triggering). This document's "Current architecture snapshot" below
reflects the pre-Phase-E state and is now stale/superseded by everything shipped since — treat it as
history, not current fact.

**What's *not* verified**: an actual physical MIDI keyboard through the real browser permission prompt
(Phase G) — that needs the user to try it directly. Everything else was exercised through real code paths
in headless Chrome (real Web Audio decoding, real Tone.js scheduling, real store/engine wiring), not mocks.

## Why this roadmap exists

Phase D brought BeatLab's synth engine roughly to parity with Ableton's own Learning Synths curriculum
(oscillators, envelopes, one fixed-destination LFO, filter types). Two large curriculum pillars are still
untouched, and a third exists but is shallow:

- **Effects processing** — zero EQ, compression, distortion/saturation, or modulation FX (chorus/flanger/
  phaser) anywhere in the codebase. Every Berklee/Ableton curriculum treats this as co-equal with synthesis,
  not an afterthought — and it's also where a whole genre of ear-training (SoundGym's "Peak Master"/
  "Reverb Wizard"/"Compressionist", Golden Ears' course) lives that BeatLab's ear-training module doesn't
  touch at all yet.
- **Automation is one parameter deep.** Only filter cutoff can be automated (`Track.cutoffAutomation`),
  with linear-in-log-space interpolation only, no clip-vs-arrangement distinction, and no way to record a
  knob move live. Real DAW automation (and the "modulation matrix" concept in synths like Serum) is a much
  richer idea: any source (LFO, envelope, macro) to any destination, multiple curve shapes, recorded or
  drawn.
- **Sampling doesn't exist at all.** Drums are 100% synthesized (`Tone.MembraneSynth`/`NoiseSynth`/
  `MetalSynth`); there's no audio file loading, no `Tone.Player`/`Tone.Sampler`, no slicing. This is the
  one gap that blocks the "listen to a clip and recreate it" exercise from ever feeling like a real song
  instead of an all-synth toy.
- **Every note currently gets programmed by hand, never played in.** All input is mouse-driven
  (piano roll clicks, step-sequencer toggles) snapped to a fixed grid. There's no way to record a live
  performance from a physical MIDI keyboard, which is both a distinct real-world DAW skill (recording
  loose and dialing in feel afterward) and, per the user's own suggestion, a plausible route to more
  natural-sounding recorded parts than anything click-programmed.

## Current architecture snapshot (accurate as of Phase D)

- **Synth signal chain** (`src/audio/engine.ts` `SynthChain`, built in `ensureChain`): oscillator bank
  (main osc + detuned `osc2` + `sub` + `noise`, each with independent gain, summed pre-filter) → one
  `Tone.Filter` (switchable low/band/high-pass) → shared amp ADSR + separate hand-scheduled filter-envelope
  ADSR → one fixed-destination LFO (pitch/cutoff/amp, sampled once per 16th-note step, not audio-rate).
  Per track: `Tone.Panner` + `reverbSend`/`delaySend` `Tone.Gain` nodes into two **shared global return
  buses** (`Tone.Reverb`, `Tone.FeedbackDelay`, lazily created in `getBuses()`). **No EQ, compression,
  distortion, or modulation effects anywhere** — confirmed by grep, zero hits for `Compressor`/
  `Distortion`/`EQ`/`Sidechain`/`Saturat` in `src/`.
- **Automation**: single-parameter only — `Track.cutoffAutomation: AutomationPoint[]`
  (`{time: 0..1, value: Hz}`), interpolated in log-space (`interpolateAutomation`) and applied per-step in
  `Engine.tick()`. No automation on volume, pan, sends, resonance, or (soon) any new effect param. No
  curve-shape choice per segment, no clip-level vs. arrangement-level distinction, no live "record a knob
  move" workflow — automation is drawn as breakpoints only.
- **No sample/audio-file playback anywhere.** No `Tone.Sampler`/`Tone.Player`, no file loading UI, no
  audio decoding path. `package.json` deps are just `tone`/`react`/`react-dom`/`zustand`.
- **No MIDI input anywhere.** No `navigator.requestMIDIAccess()` usage, no device-connection UI — every
  note in every track is placed by mouse, snapped to the grid (`PianoRoll.tsx`'s fixed 1/16 snap,
  `StepSequencer.tsx`'s 16 fixed steps). Note timing today is inherently quantized at the data-model
  level; there's no representation for a continuous-time (unquantized) note.
- **Clips/scenes** (`Track.clips`, `Scene`, `types.ts`): additive named snapshots (save copies live
  notes/pattern in, load copies back out), sandbox-only — lesson tracks don't use this.
- **Tri-state scoring** (`framework.ts` `scoreOne`/`scorePatch`/`PARAM_TOLERANCE`): per-parameter
  correct/close/wrong with per-key tolerance bands (log-space for `cutoff`); `matchLesson()` factory grades
  a `paramKeys` subset of a hand-authored `target: TargetPatch` against user input. This machinery is
  reusable as-is for any new gradeable parameter (EQ band, compression ratio, etc.) — it just needs new
  entries in `PARAM_TOLERANCE` and a new `SynthParams` field.
- **Progressive reveal** (`Lesson.visibleParams`): cumulative stages (`P_OSC → ... → P_EFFECTS`) drive
  which `DevicePanel.tsx` sections render — the same mechanism any new device section (EQ, compressor,
  sampler) plugs into.

## Phase E — Mixing effects & effects ear-training

*Cheapest phase: every item here is a new per-track insert or send node in the existing chain, graded by
the existing tri-state scorer. No new device paradigm, no new lesson type.*

18. **3-band EQ** (`Tone.EQ3`) as a per-track insert, before the filter or after it (student's choice —
    see #22). Low/mid/high gain become new `SynthParams` fields with their own `PARAM_TOLERANCE` entries.
19. **Compressor** (`Tone.Compressor`) with threshold/ratio/attack/release *and* a dry/wet mix knob —
    the mix knob is what makes parallel ("New York") compression teachable, not just full-signal
    compression.
20. **Distortion/saturation + bitcrusher** (`Tone.Distortion`, `Tone.BitCrusher`) as insert effects,
    teaching the difference between "warm" harmonic saturation and lo-fi bit-depth/sample-rate reduction.
21. **Modulation-FX send bus**: chorus + phaser (`Tone.Chorus`, `Tone.Phaser`) as a second shared return
    bus alongside the existing reverb/delay buses, reusing the exact `getBuses()`/per-track-send pattern
    from Phase C item 12.
22. **Insert signal-chain ordering.** Let the student reorder EQ → compressor → distortion in the device
    chain and hear the difference live — signal order is one of the most-cited "aha" moments in mixing
    tutorials and costs nothing once #18-20 exist as swappable chain links rather than a fixed order.
23. **Scheduled sidechain "pump."** True audio-analysis sidechaining needs a live envelope-follower on
    the key track; BeatLab's engine already schedules everything from the pattern data (see filter-envelope
    scheduling, `engine.ts` `tick()`), so the pragmatic approach is to duck a target track's gain on another
    track's active steps (e.g. kick pattern), scheduled the same way — classic 4:1-ish ratio, 1-5 ms
    attack, 50-100 ms release taught as *parameters of the duck*, not a real keyed compressor. Flag this
    scoping choice in the lesson copy, same way Phase D flagged its step-sampled LFO.
24. **New "Mixing Ear Training" lesson category** (parallel to the existing Synthesis ear-training module):
    identify the boosted/cut EQ band, guess a compression ratio/attack/release by ear, guess reverb decay
    time or delay time, guess sidechain duck depth — reusing `matchLesson()`/`scorePatch()` unchanged,
    just with a `paramKeys` subset drawn from the new EQ/compressor/sidechain fields.

*Explicitly out of scope for this phase (stretch/later): multiband compression and a dedicated transient
shaper — both are real techniques but add a second axis (frequency-split routing) that's a bigger lift for
diminishing pedagogical return versus #18-23.*

## Phase F — Automation & modulation depth

*Generalizes the one automatable parameter (cutoff) into the real DAW concept of automation, and
generalizes the one fixed-destination LFO (Phase D) into an actual modulation matrix. Both are the same
underlying idea — a source's value over time driving a destination — so they're grouped together.*

25. **Generalize automation to any numeric parameter.** Replace the single `cutoffAutomation` field with
    a `Record<keyof SynthParams, AutomationPoint[]>`-shaped map so volume, pan, sends, and the new Phase E
    effect params are automatable through the same UI/engine path, not just cutoff.
26. **Automation curve shapes.** Each breakpoint segment gets a shape (linear / logarithmic / hold-then-
    jump), extending `interpolateAutomation` — mirrors Ableton's own curve picker and is a real teachable
    distinction (a hold-then-jump filter "stab" reads completely differently from a linear sweep).
27. **Clip-level vs. arrangement-level automation.** Phase C's `Track.clips` already snapshot notes/pattern
    per clip; extend that snapshot to optionally carry its own automation, so a clip's filter-sweep
    "travels with it" when duplicated/rearranged versus automation baked into one fixed arrangement
    timeline. This is a named distinction in every DAW (Session vs. Arrangement view in Ableton) that
    BeatLab currently has no way to demonstrate since only one automation lane exists at all.
28. **Live "touch" automation recording.** Arm a parameter, tweak its knob during playback, and capture
    the breakpoints automatically — as a second workflow alongside the existing (implicit, once #25 ships)
    manual-drawing workflow. Real producers use both; teaching only "draw points by hand" undersells how
    automation is actually created in practice.
29. **Real modulation matrix.** Replace Phase D's fixed 3-way `lfoDest` switch with N sources (the existing
    LFO, the existing filter envelope, plus a new general-purpose "Mod Envelope") routable to M destinations
    (any synth *or* new Phase E effect parameter) with a per-slot depth amount — the single biggest
    architecture change in this phase, but it's a generalization of code that already exists (`tick()`'s
    per-step LFO sampling, the filter-envelope's manual ramp scheduling) rather than new mechanism, and it's
    what every serious wavetable/virtual-analog synth (Serum, etc.) actually looks like once you go past
    "one LFO with a dropdown."
30. **Macro control.** One user-labeled knob mapped to N target parameters at once (e.g. one "Intensity"
    knob driving cutoff + reverb send + distortion together) — a performance-oriented control lifted
    directly from Ableton's Racks/Serum's Macros, and a natural fit next to Phase C's `SceneLauncher`.
31. **Buildup/drop arrangement lessons.** Combine multi-parameter automation (#25-26) and the new mod
    matrix (#29) into lessons tied to the existing Arrangement module (`arrangement.ts`) — teaching the
    classic "16 bars of filter+volume+reverb automation into a drop" as a single graded exercise.

## Phase G — MIDI input & humanized recording

*Independent of Phases E/F/H-K's synth/effects/sampling work — this is a new input method, not a new
sound source. Sequenced right after Phase F because it shares real-time-capture infrastructure with
Phase F item 28 (live "touch" automation recording): both are "capture a live input stream against the
transport clock," just for two different data types (notes vs. automation breakpoints). Prompted directly
by the user asking whether recording from their own physical MIDI keyboard is feasible.*

32. **Web MIDI device connection.** `navigator.requestMIDIAccess()`, a small settings UI listing available
    inputs, a live "note indicator" so the student can confirm their keyboard is talking to the browser
    before recording anything. **Feature-detect and fail loudly, not silently**: Safari (macOS and iOS)
    doesn't implement the Web MIDI API at all (Apple has declined over fingerprinting concerns), so this
    needs a clear "not supported in this browser" message rather than a dead Connect button. Chrome, Edge,
    and Firefox 108+ all support it; USB MIDI keyboards need no special driver on any of them.
33. **Live monitoring while armed.** MIDI note-on/off immediately triggers the current track's synth voice
    through the existing engine note-trigger path (the same one the piano roll and step sequencer already
    use) — necessary so playing feels responsive before any recording exists. USB MIDI transport itself is
    near-instant (~1ms); the perceptible latency, if any, comes from Web Audio output buffering
    (commonly 10-30ms round-trip in-browser), which is fine for practice/recording even if not
    professional-grade — not the bottleneck the user was worried about.
34. **Continuous-time note capture.** Record MIDI note-on/off timestamped against `Tone.Transport`'s clock
    into a new unquantized note representation — the actual data-model change: `Note.time`/`dur` need to
    hold continuous values instead of assuming grid-snapped step indices. This is the one genuinely new
    piece of state Phases A-F never needed.
35. **Post-hoc quantize-strength dial (0-100%), applied non-destructively at render/playback time.** This
    is the actual DAW skill being taught — Ableton's record-loose-then-dial-in-the-snap workflow, not a
    binary quantized-or-not toggle — and it's also what finally makes Phase B's existing per-note velocity
    work fully meaningful, since a MIDI keyboard supplies real velocity instead of a manually-clicked-in
    value.
36. **Recorded-performance lesson content.** Once notes can hold continuous time, add lessons that grade
    timing feel directly (e.g. "play this bassline with a human/swung feel" scored against a target groove
    tolerance), and let MIDI recording stand in as an alternate input path for existing hands-on lessons
    (play a target phrase live instead of only clicking it into the piano roll).

## Phase H — Synth engine depth II

*Phase D covered subtractive synthesis (oscillators/filter/envelope/LFO) to rough parity with Ableton's
Learning Synths. This phase covers what Learning Synths deliberately leaves out because it's a different
synthesis paradigm: FM, wavetable-style morphing, and the "expressive" controls (unison, glide, arp,
velocity) that Phase D's fixed patch model doesn't touch.*

37. **FM oscillator mode.** Tone.js ships `Tone.FMSynth` natively, so this is a genuinely cheap addition
    relative to hand-rolling: a 2-operator carrier/modulator mode as an alternative to the subtractive
    oscillator bank, teaching frequency ratio and modulation index — the two knobs that take FM from
    "sounds like a bell" to "sounds like a bass" and are the standard on-ramp before any real FM synth's
    multi-operator algorithm picker.
38. **Approximate "wavetable" morphing oscillator.** True wavetable synthesis (scanning through dozens of
    single-cycle waveforms) is a large lift with no native Tone.js primitive; the pragmatic teaching version
    is a "position" knob that crossfades across a small fixed table of waveshapes (e.g. sine → triangle →
    saw → a couple of harmonically richer custom shapes via `Tone.Oscillator`'s `partials`), explicitly
    scoped in lesson copy as an approximation — same honesty as Phase D's step-sampled LFO, not audio-rate
    wavetable scanning.
39. **N-voice unison with stereo spread.** Generalize the existing single detuned `osc2` voice into a real
    unison stack (multiple detuned voices, spread across the stereo field) — this is specifically the
    "supersaw" technique the existing `match-supersaw-lead` ear-training lesson already targets
    conceptually with just two oscillators; a real unison stack makes that lesson (and new ones) more
    honest to how the technique is actually done.
40. **Glide/portamento.** `Tone.Synth`/`Tone.MonoSynth` already expose a `portamento` option — wiring it up
    is cheap, and it's a genuinely distinct, easily-graded ear-training target (smooth pitch slide between
    consecutive notes vs. discrete steps). Pairs naturally with Phase G's live MIDI input, where glide is
    much more intuitive to play than to click into a piano roll.
41. **Arpeggiator.** Fan a held chord out into a stepped, tempo-synced note pattern, implemented as a note
    expander inside the existing per-step scheduling in `Engine.tick()` rather than a new timing system —
    reuses the sequencer's existing clock.
42. **Velocity/keytracking modulation.** Phase B already added per-note/per-step velocity to notes and drum
    patterns but nothing reads it as a *modulation source* yet; wire velocity into filter-cutoff/amp
    depth, and add pitch-dependent filter keytracking (higher notes brighten automatically) — both are
    textbook subtractive-synth techniques that are currently representable in data but not audible. Also
    the payoff for Phase G's real velocity data: a live-played note's velocity now actually changes the
    timbre, not just a visual color.

## Phase I — Sampling

*The biggest architecture lift in this roadmap: a genuinely new asset type (audio files) and device type
(a sampler), not an extension of the existing synth-chain model.*

43. **Audio file loading.** Drag-and-drop or file-picker upload, decoded via `Tone.ToneAudioBuffer`, stored
    in a small per-project sample-asset library (new state slice in `store.ts`).
44. **Sampler device.** A `Tone.Player`-based track type alongside synth tracks — one-shot or loop
    playback, start/end trim, pitch via playback rate — as a new `TrackKind` sitting next to the existing
    synth/drum track shapes, not replacing them.
45. **Slicing.** Transient/beat/region/manual slice modes (mirroring Ableton Simpler's four modes),
    auto-mapping slices onto the existing step-sequencer-style pad grid so a chopped break can be
    re-triggered and re-sequenced with the UI students already know.
46. **Sampling lesson content.** Chop a drum break and rebuild a beat from the slices; load a one-shot
    kit and compare synthesized vs. sampled drums directly; pitch a vocal/instrument chop to match a chord
    progression from the existing Theory module — tying new content back into what's already taught rather
    than existing in isolation. (Needs a small licensed/royalty-free sample pack sourced or self-recorded —
    flag before building lesson content.)

## Phase J — "Recreate the track" capstone

*The exercise explicitly asked for: hear a short reference clip, rebuild it. This needs Phases E-I's
pieces in place first or it's just another single-patch match lesson wearing a bigger hat.*

47. **New multi-stage lesson type.** A short (8-16 bar) hand-authored reference arrangement — drums, bass,
    chords/lead, at least one sampled element, some effects and automation — is played in full; the student
    starts from an empty multi-track project and rebuilds it piece by piece, a genuinely new `Lesson` shape
    distinct from the existing single-device `matchLesson()`. Can also be attempted live via Phase G's MIDI
    input, not just click-programmed.
48. **Staged, chained grading.** Sequential checkpoints inside one lesson, reusing existing validators in
    order: drum-pattern similarity, then `checkTranscription()` for the bassline, then `scorePatch()` for
    the lead patch, then the new effects/automation params from Phases E-F — each checkpoint unlocks the
    next, mirroring the real "get the drums right before you worry about the lead" workflow described in
    reference-track deconstruction guides.
49. **3-5 reference tracks across genres** (e.g. house, wobble-bass, lo-fi/sample-based hip-hop), each
    deliberately exercising a cross-section of Phases A-I rather than every feature at once.

## Phase K — Mastering & loudness (optional, lowest priority)

50. **Master-bus meter + limiter** (`Tone.Meter`/a limiter node) with a simple loudness readout, and a
    single lesson on getting a mix to a target loudness without audible pumping/distortion — a nice-to-have
    rounding-out, not a curriculum gap on the scale of Phases E-J.

## Suggested sequencing

E and F first: both extend the existing per-track chain and automation model with no new device paradigm,
and directly deepen the ear-training that's already BeatLab's core loop. G (MIDI input) slots in right
after F since it reuses F item 28's real-time-capture-against-the-transport mechanism, and is worth
validating early anyway — it's the one phase gated on the user's actual hardware/browser rather than pure
software risk, so proving out latency-feel on a real keyboard sooner rather than later avoids discovering
a problem late. H (synth depth II) follows — still no new device *type*, but a significant change to the
oscillator/voice model, best done once E/F/G's effects, modulation, and live-input machinery exist so new
synth lessons can immediately use sends, the mod matrix, and MIDI-played glide/velocity rather than landing
in a world that still only has one fixed LFO destination and mouse-only input. I (sampling) comes after H:
it's the most expensive phase (new asset pipeline, new device type, new UI) and lands better once there's
a rich effects/automation/synth/input base for sampled content to interact with. J is the capstone and
genuinely depends on E-I being done — attempting it earlier just reproduces the existing single-patch
match lessons at a bigger scale. K can slot in anywhere after E if it's wanted at all.

## Sources

- Ableton Learning Synths/Learning Music (chapter structure, sanity-checking Phase D's scope), Ableton
  Automation and Editing Envelopes reference manual (curve shapes, clip vs. arrangement automation),
  Ableton Certification Program page, Berklee Online Ableton Live Professional Certificate (course
  structure: Fundamentals / Performing / Sampling Techniques).
- Effects ear-training: SoundGym (Peak Master, Reverb Wizard, Compressionist game descriptions), Golden
  Ears Audio ear-training course.
- Effects/mixing technique research: LANDR/iZotope (audio effects overview, chorus/flanger/phaser),
  iConCollective (parallel processing), RouteNote and Aulart (sidechain/parallel/multiband compression),
  MusicRadar (sidechain compression how-to).
- Sampling research: Splice, Melodics, Tracklib, Avid, Audeobox (Simpler/Sampler slicing and warp modes),
  RouteNote (chopping in Ableton).
- Reference-track deconstruction: OptoProductions, AudioServices Studio, Hooktheory, Mastering the Mix
  (ear training for engineers).
- Modulation matrix / synth-depth research: Xfer Serum manual and Attack Magazine ("What Is A Modulation
  Matrix?"), MusicRadar (Serum modulation), MusicTech/LANDR/Cymatics/Yamaha Synth (FM synthesis basics,
  operators/algorithms/ratios), Native Instruments/EDMProd/MusicRadar/Perfect Circuit (wavetable synthesis
  vs. subtractive), Ask.Video/OurFriendGus/synth-hacker blog (glide/portamento, unison spread, arpeggiators).
- Song structure/arrangement: MasterClass, Point Blank Music School, Cymatics (EDM song structure) —
  background for Phase I's reference-track selection.
- Mastering/loudness: Mastering the Mix, Remasterify, iZotope (LUFS/limiting basics) — background for the
  optional Phase K.
- MIDI input feasibility (Phase G): caniuse.com and TestMu AI (Web MIDI API browser support matrix —
  Chrome/Edge/Firefox 108+ yes, Safari/iOS no), MDN Web MIDI API docs, W3C/SMPTE joint workshop talk on
  browser-based-DAW audio latency, WebAudio/web-midi-api GitHub issue on input timestamp precision,
  Ableton Forum threads on Record Quantize "Strength" and post-recording quantize percentage (the
  record-loose-then-dial-in-the-snap workflow Phase G's item 35 is modeled on).
