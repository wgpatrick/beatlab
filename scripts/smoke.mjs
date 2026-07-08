// Engine smoke test: boots the real app in headless Chrome and exercises the audio engine's
// riskiest paths end-to-end (sample load → slice → reverse → repitch → warp → playback → drum
// voice params), asserting zero page errors throughout. This is the committed, repeatable version
// of the ad-hoc verification each feature wave ran and threw away — run it after touching
// src/audio/engine.ts. Uses the dev-only window.__store/__engine exposures and the system Chrome
// via playwright-core (no bundled browsers).
//
//   npm run test:smoke
//
// Deliberately offline-safe: the sample is a WAV synthesized in-page, not a starter-sample fetch.

import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const checks = []
let failed = 0
function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  if (!ok) failed++
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

// Spawn our own vite and parse its announced URL from stdout, rather than assuming a fixed port —
// a hardcoded port can collide with another dev server in this folder (e.g. a second session's),
// and silently testing THAT server's possibly-stale code is exactly the failure mode this suite
// exists to prevent.
const vite = spawn('npx', ['vite', '--port', '5871'], {
  cwd: new globalThis.URL('..', import.meta.url).pathname,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
})

const URL = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('vite did not announce a URL within 30s')), 30000)
  let buf = ''
  const onData = (chunk) => {
    buf += chunk.toString()
    // vite styles the URL with ANSI codes mid-string (bold port) — strip before matching
    const clean = buf.replace(/\x1B\[[0-9;]*m/g, '')
    const m = clean.match(/Local:\s+(http:\/\/localhost:\d+\/musiclearning\/)/)
    if (m) {
      clearTimeout(timer)
      resolve(m[1])
    }
  }
  vite.stdout.on('data', onData)
  vite.stderr.on('data', onData)
  vite.on('exit', (code) => reject(new Error(`vite exited early (code ${code}): ${buf.slice(-300)}`)))
})

let browser
try {
  browser = await chromium.launch({
    // Default to the system Chrome; CHROME_PATH points at any Chromium binary instead, for
    // containers/CI where Chrome isn't installed at the standard location.
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }),
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  })
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text())
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__store && window.__engine, { timeout: 10000 })
  check('app boots, dev exposures present', true)

  // Everything below runs against the REAL store/engine — same code paths the UI drives.
  const result = await page.evaluate(async () => {
    const store = window.__store
    const engine = window.__engine
    const out = {}
    const state = () => store.getState()

    // a drums lesson gives us the canonical 'drums' track
    state().loadLesson('four-on-floor')

    // ---- sampling: synthesize a WAV in-page and run it through the real file-load path ----
    const sr = 44100
    const n = sr * 2
    const pcm = new Float32Array(n)
    for (let i = 0; i < n; i++) pcm[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr) * (1 - Math.abs((2 * i) / n - 1))
    const dataSize = n * 2
    const view = new DataView(new ArrayBuffer(44 + dataSize))
    const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)) }
    w(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); w(8, 'WAVE')
    w(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
    view.setUint32(24, sr, true); view.setUint32(28, sr * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
    w(36, 'data'); view.setUint32(40, dataSize, true)
    for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true)
    await engine.loadDrumSampleFromFile(new File([view.buffer], 'smoke.wav', { type: 'audio/wav' }))
    out.sampleLoaded = !!state().sampleLoaded
    out.sliceLanes = Object.keys(state().sampleSliceMeta ?? {}).length

    // manual slice boundary: move #1 and confirm the neighbouring slices reshaped
    const before = state().sampleSliceMeta.kick.dur
    engine.setSliceBoundary(1, 0.6)
    out.boundaryMoved = Math.abs(state().sampleSliceMeta.kick.dur - before) > 0.05

    // reverse + repitch
    engine.toggleSliceReverse('snare')
    out.reversed = state().sampleSliceMeta.snare.reversed === true
    engine.setSlicePitch('clap', 7)
    out.pitched = state().sampleSliceMeta.clap.pitch === 7

    // warp mode rebuilds every player as GrainPlayer; triggering must not throw
    engine.setSamplePitchMode('warp')
    out.warpMode = state().samplePitchMode === 'warp'
    engine.triggerDrum('clap')
    engine.triggerDrum('snare')
    out.warpTriggerOk = true
    engine.setSamplePitchMode('speed')
    out.speedModeBack = state().samplePitchMode === 'speed'

    // drum voice sound design applies without error (808-ish values)
    state().setSynth('drums', { kickTune: 38, kickPunch: 0.18, kickDecay: 0.9, snareTone: 0.35, snareDecay: 0.18, hatDecay: 0.03, openHatDecay: 0.5, hatTone: 6500 })
    out.voiceParamsOk = true

    // drum bus FX params (filter sweep route) apply without error
    state().setSynth('drums', { cutoff: 800, resonance: 3, lfoDest: 'cutoff', lfoDepth: 0.7, lfoSync: true, sendReverb: 0.3 })
    out.busParamsOk = true

    // real transport playback for ~1.2s with sample slices + LFO sweep active
    state().toggleDrum('drums', 'kick', 0)
    state().toggleDrum('drums', 'snare', 4)
    state().toggleDrum('drums', 'clap', 8)
    await state().play()
    await new Promise((r) => setTimeout(r, 1200))
    state().stop()
    out.playbackOk = true

    // clear returns to the synthesized kit
    engine.clearDrumSample()
    out.cleared = state().sampleLoaded === null && state().samplePitchMode === 'speed'

    // synthesized-kit playback after clear (kick uses kickTune path)
    await state().play()
    await new Promise((r) => setTimeout(r, 600))
    state().stop()
    out.synthKitPlaybackOk = true

    return out
  })

  check('sample loads via real file path', result.sampleLoaded)
  check('5 slice lanes produced', result.sliceLanes === 5, `got ${result.sliceLanes}`)
  check('manual boundary drag reshapes slices', result.boundaryMoved)
  check('per-pad reverse', result.reversed)
  check('per-pad repitch (+7)', result.pitched)
  check('warp mode (GrainPlayer) triggers', result.warpMode && result.warpTriggerOk)
  check('back to speed mode', result.speedModeBack)
  check('drum voice sound-design params apply', result.voiceParamsOk)
  check('drum bus FX params apply', result.busParamsOk)
  check('transport playback with slices + LFO sweep', result.playbackOk)
  check('clear sample restores synthesized kit', result.cleared)
  check('synthesized-kit playback after clear', result.synthKitPlaybackOk)
  check('zero page errors end-to-end', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '))
} catch (e) {
  check('smoke suite ran to completion', false, String(e))
} finally {
  await browser?.close()
  vite.kill()
}

console.log(`\n${checks.length - failed}/${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
