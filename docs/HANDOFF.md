# dotbeat — session handoff (2026-07-11)

Synopsis for a fresh session taking over. Read this, then `docs/product-spec-desktop.md`,
`ROADMAP.md`, and `docs/research/` (01–14).

## What dotbeat is

A **git-native, agent-native DAW**. The project is a diff-friendly text file (`.beat`) that a
human (in a GUI) and an AI agent (via CLI/MCP) both edit; it renders offline on the real
**beatlab** Web Audio engine, and gets metrics-based mix critique. The bet: the file is the
product; the agent reads/writes the same file the GUI renders, so no screenshots or pixel
automation — the agent edits *meaning*.

## Environment layout (IMPORTANT — three repos)

| Path | Repo / branch | Status | Role |
|---|---|---|---|
| `/home/user/beatlab-daw` | `wgpatrick/beatlab` @ `daw-planning-workspace` | **pushed & current** — source of truth right now | where ALL history + pushes live |
| `/home/user/dotbeat` | `wgpatrick/dotbeat` @ `main` | **3 local commits, NOT pushed (blocked)** | the intended new home; `node_modules` is symlinked to beatlab-daw's |
| `/workspace/beatlab` | `wgpatrick/beatlab` @ `main` | DEPLOYED at willpatrick.xyz/musiclearning | the engine dotbeat renders on |

The `beatlab-daw` and `dotbeat` trees are **identical** except dotbeat has 3 extra doc commits
(the import commit + macOS spike html + spike-result), and those doc files were just mirrored
back into beatlab-daw too — so **nothing is stranded**. Until dotbeat can be pushed, **keep
working in `/home/user/beatlab-daw` and push to `daw-planning-workspace`.**

**Standing rule:** `/workspace/beatlab` is the deployed lesson app — only dev-gated / inert
changes to it, never break the user-facing lessons. All dotbeat work happens in beatlab-daw.

## THE IMMEDIATE BLOCKER (owner action needed)

The owner wants development to move to `wgpatrick/dotbeat`. The code is migrated and committed
locally in `/home/user/dotbeat` (3 commits) but **`git push` 403s**: the git proxy says dotbeat
isn't in the session's authorized repo set, and the `add_repo` MCP tool returns "requires
approval" and never completes.

**Diagnosed root cause:** the Claude GitHub App almost certainly lacks access to the
newly-created `dotbeat` repo. **Fix:** owner grants the Claude GitHub App access to
`wgpatrick/dotbeat` (GitHub → Settings → Applications → Installed GitHub Apps → Claude →
Repository access → add dotbeat or "all repos"). Then: retry `add_repo(wgpatrick, dotbeat)`,
`git -C /home/user/dotbeat push -u origin main`. Do NOT re-migrate — the commits are ready.

## Current state — what's DONE (all in beatlab-daw, pushed; 187/187 tests)

- **Format `.beat` v0.1 → v0.8**, each version frozen & round-trip tested:
  v0.2 drums · v0.3 55-param sound surface (table-driven, canonical elision) · v0.4
  clips/scenes/song timeline · v0.5 sha256-pinned `media` + sample-backed drum lanes · v0.6 SF2
  instrument tracks (spessasynth_core, 29× realtime headless) · **v0.7 fractional note timing**
  (sample-accurate, verified) · **v0.8 fully general free-timed drum hits** (owner-directed; the
  16-step grid is now a *view*; legacy patterns migrate on read; research 12, 25/25 verified).
- **Editing/agent surface:** `beat` CLI + stdio MCP server, both covering init/add-track/set/
  add-note/add-hit/**quantize**/**humanize**/**vary**(+`feel`)/**score**/clip/scene/song/sample/
  lane/metrics/lint/render/daemon/**checkpoint**/**history**/**restore**/**selection**.
- **Rendering:** offline renderer on the real beatlab engine (Tone.js) + spessasynth_core for
  SF2; off-grid drum hits scheduled sample-accurately via `engine.triggerDrum(lane, time, vel)`
  (NOTE the arg order — a bug earlier had it as (lane, vel, time)).
- **Two-way daemon** (SSE + POST) syncing the file ⇄ a live GUI; hits projected to the 16-step
  grid as a quantized *view* for the GUI, off-grid hits preserved by the daemon on GUI pushes.
- **Metrics:** BS.1770 LUFS/peak/crest/spectral/stereo + deterministic `lint`.
- **Variation-and-taste loop:** rung 1 (synth param groups) + rung 2 (`vary feel` = batched
  humanize seeds → render → `score`). `humanize` = seeded timing/velocity jitter + behind-the-
  beat drag + swing, scoped by lane/id.
- **D2 selection protocol** (`src/core/selection.ts` + daemon `/selection` + `beat selection`):
  the machine-readable "what the user highlighted" value. `selectionToNoteIds` resolves it.
- **D3 versioning** (`src/history/`): `beat checkpoint`/`history`/`restore` — invisible local
  git, append-only, semantic auto-labels, no git vocabulary.
- **Content:** CC0 Audiophob drum kit, CC0 FreePats piano SF2, CC0 init kit, Freesound CC0
  pipeline w/ OAuth. License MIT. Name `dotbeat`.
- **Research 01–14** (all adversarially verified, in `docs/research/`). Latest: 12 (drum
  representation), 13 (Tauri shell — **spike PASSED on Safari 18.5**), 14 (agent chat panel).
- **Demos sent to owner** (WAVs): J Dilla beat with off-grid drums; stiff-vs-humanized A/B;
  two auto-generated `vary feel` variants.

## Desktop roadmap (D1–D5) — the current direction (owner: desktop-first)

See `docs/product-spec-desktop.md`. Decided: **desktop app on local files via a Tauri shell**;
selection-as-context is the interaction model; versioning is invisible-git checkpoints.
- **D1 Shell** — Tauri wrap, daemon as a bundled sidecar, open-a-folder. Research 13 done;
  **macOS WKWebView audio spike PASSED** (clean, low latency) → pure Tauri viable, no Electron.
- **D2 Pointing** — selection protocol core **built**; still needs the beatlab GUI to grow a
  selection UI + wiring selection into `vary/humanize --scope`.
- **D3 History** — checkpoint core **built**; needs the history-panel GUI.
- **D4 Song view** — full-arrangement editor (not started).
- **D5 Chat surface** — research 14 done; ship BYO-Claude-Code (our MCP server + any client)
  first; embedded Agent-SDK panel gated on auth/terms (commercial, not engineering).

## Suggested NEXT STEPS (owner said "start cooking" on the shell)

1. **Unblock the dotbeat push** (owner grants GitHub App access — above). Highest priority; the
   owner explicitly wants dev to move there.
2. **D1 Tauri shell scaffolding** — buildable/testable here on Linux (WebKitGTK); leaves only
   the custom-AudioWorklet-on-WKWebView follow-up for the owner's Mac. Owner greenlit starting
   this. Pattern: Tauri v2 + `tauri-plugin-fs`/`dialog` + daemon as `externalBin` sidecar (yao-
   pkg). See research 13 §"What this decides for D1".
3. **Wire selection → vary/humanize** so "highlight the hats → change this up" is hands-free
   (needs a beatlab dev-gated selection UI — safe, inert changes only).
4. **Verify custom AudioWorklet DSP on WKWebView** (research 13 follow-up flag) — beatlab uses a
   worklet for BitCrusher; the spike confirmed native-node audio clean but the worklet postMessage
   counter didn't tick. Needs the owner's Mac.
5. Deferred: Phase 8 browser leg (instrument tracks playing live in the GUI via spessasynth_lib
   worklet); `docs/phase-8-plan.md` "Remaining".

## Conventions & gotchas (do not rediscover these)

- **Commits:** `git -c user.name="wgpatrick" -c user.email="wgpatrick@gmail.com" commit` with
  trailers `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01A3jqhibjyxsvrWHo6sVczx`. The model id
  `claude-opus-4-8` must NOT appear in commits/PRs/pushed artifacts.
- **Tests/build:** `npm test` (in beatlab-daw) runs `tsc` + node:test (187 tests). Source
  compiles clean; keep it green.
- **Offline render:** needs the beatlab checkout + Chromium:
  `CHROME_PATH=/opt/pw-browsers/chromium BEATLAB_DIR=/workspace/beatlab node cli/render-offline.mjs <file.beat> -o out.wav`
  (loop mode schedules off-grid drum hits precisely; song mode uses the on-grid tick — a known,
  documented limitation).
- **`file:../upstream/node-web-audio-api`** dep in package.json is a patched local build (a real
  wart for a standalone repo — vendor/publish it before dotbeat is cloned elsewhere). Tests here
  work via the symlinked `node_modules`.
- **Deep research** is available via the `deep-research` skill/Workflow; all research passes were
  adversarially verified (3-skeptic voting). Fable-model rate limits killed two passes mid-run
  earlier — they were resumed on Opus.
- Owner-only decisions already made: MIT license, name `dotbeat`, desktop-first, drums fully
  general. Don't reopen these.

## Owner's working style

Fast, high-trust, "go for it" / "keep building" — wants momentum and audible/visible proof
(send WAVs, artifacts). Kicks off deep research before big irreversible decisions. Values the
"AI produces many options fast, human picks by taste" loop.
