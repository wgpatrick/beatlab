import type { WtTable } from '../types'

// Wave 3: built-in wavetables for the main oscillator. A "wavetable" here is a continuous
// function pos (0..1) -> harmonic spectrum (32 partial amplitudes fed to a PeriodicWave via
// Tone's custom-oscillator partials), rather than a bank of discrete stored frames — so WT POS
// morphs smoothly with no interpolation artifacts and nothing heavy lives in memory. Pure math,
// no Tone.js/DOM: unit-testable headlessly like audio/analysis.ts.

export const N_PARTIALS = 32
/** samples per hand-drawn custom frame (wtCustomA/B in SynthParams) */
export const WT_DRAW_POINTS = 64

export const WT_TABLE_INFO: { value: WtTable; label: string; blurb: string }[] = [
  { value: 'analog', label: 'ANALOG', blurb: 'morphs sine → triangle → saw → square' },
  { value: 'pwm', label: 'PWM', blurb: 'square pulse narrowing to a thin buzz' },
  { value: 'vocal', label: 'VOCAL', blurb: 'two formant peaks sweeping vowel-like' },
  { value: 'custom', label: 'DRAW', blurb: 'your own table: draw frame A and frame B, WT POS morphs between them' },
]

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

// The four classic spectra, as functions of harmonic number n (1-based).
const SINE = (n: number) => (n === 1 ? 1 : 0)
const TRIANGLE = (n: number) => (n % 2 === 1 ? ((n % 4 === 1 ? 1 : -1) * 1) / (n * n) : 0)
const SAW = (n: number) => 1 / n
const SQUARE = (n: number) => (n % 2 === 1 ? 1 / n : 0)

function analogPartial(n: number, pos: number): number {
  // piecewise-linear morph through the four anchor spectra at pos 0, 1/3, 2/3, 1
  const anchors = [SINE, TRIANGLE, SAW, SQUARE]
  const t = clamp01(pos) * (anchors.length - 1)
  const i = Math.min(Math.floor(t), anchors.length - 2)
  const f = t - i
  return anchors[i](n) * (1 - f) + anchors[i + 1](n) * f
}

function pwmPartial(n: number, pos: number): number {
  // analytic pulse-wave spectrum: amplitude_n ∝ sin(n·π·duty)/n. duty 0.5 = square,
  // narrowing toward 0.06 = thin nasal pulse — the classic PWM sweep.
  const duty = 0.5 - 0.44 * clamp01(pos)
  return Math.sin(n * Math.PI * duty) / n
}

function vocalPartial(n: number, pos: number): number {
  // two gaussian formant peaks over harmonic index, sweeping upward with pos — reads as a
  // vowel morph (roughly "oo" → "ah" → "ee") over a saw-ish base
  const p = clamp01(pos)
  const f1 = 1.5 + p * 5 // first formant: harmonics ~1.5..6.5
  const f2 = 6 + p * 16 // second formant: harmonics ~6..22
  const peak1 = Math.exp(-((n - f1) * (n - f1)) / (2 * 1.6 * 1.6))
  const peak2 = 0.6 * Math.exp(-((n - f2) * (n - f2)) / (2 * 2.8 * 2.8))
  return (peak1 + peak2) * (1 / Math.sqrt(n))
}

/** Sine-series coefficients (length N_PARTIALS) of one hand-drawn cycle — a plain DFT against
 * sin(2πnk/N). Sine terms only: dropping the cosine phase loses nothing audible for a static
 * timbre and keeps the result in the same signed-partials format as the built-in tables. */
export function drawnFramePartials(samples: number[]): number[] {
  const N = samples.length || 1
  const out = new Array<number>(N_PARTIALS)
  for (let n = 1; n <= N_PARTIALS; n++) {
    let b = 0
    for (let k = 0; k < N; k++) b += samples[k] * Math.sin((2 * Math.PI * n * k) / N)
    out[n - 1] = (2 / N) * b
  }
  return out
}

/** One rendered cycle (length `points`) of a partials spectrum — additive resynthesis, used by
 * the OSC section's morphing waveform view. Peak-normalized to ±1. */
export function waveformFromPartials(partials: number[], points: number): number[] {
  const out = new Array<number>(points)
  let peak = 0
  for (let k = 0; k < points; k++) {
    let v = 0
    for (let n = 1; n <= partials.length; n++) v += partials[n - 1] * Math.sin((2 * Math.PI * n * k) / points)
    out[k] = v
    peak = Math.max(peak, Math.abs(v))
  }
  if (peak > 0) for (let k = 0; k < points; k++) out[k] /= peak
  return out
}

/** Custom frames for the DRAW table — optional so built-in tables don't need them. */
export interface WtCustomFrames {
  a: number[]
  b: number[]
}

/** Partial amplitudes (length N_PARTIALS) for a table at position pos (0..1), peak-normalized so
 * scanning doesn't pump the level. The 'custom' table interpolates between the spectra of the
 * two hand-drawn frames (spectral morph, like Serum's frame interpolation — not a crossfade of
 * the raw drawings, which would comb-filter when the shapes are out of phase). */
export function wtPartials(table: WtTable, pos: number, custom?: WtCustomFrames): number[] {
  const out = new Array<number>(N_PARTIALS)
  let peak = 0
  if (table === 'custom') {
    const pa = drawnFramePartials(custom?.a ?? [])
    const pb = drawnFramePartials(custom?.b ?? [])
    const f = clamp01(pos)
    for (let i = 0; i < N_PARTIALS; i++) {
      out[i] = pa[i] * (1 - f) + pb[i] * f
      peak = Math.max(peak, Math.abs(out[i]))
    }
  } else {
    const fn = table === 'analog' ? analogPartial : table === 'pwm' ? pwmPartial : vocalPartial
    for (let n = 1; n <= N_PARTIALS; n++) {
      const a = fn(n, pos)
      out[n - 1] = a
      peak = Math.max(peak, Math.abs(a))
    }
  }
  if (peak > 0) for (let i = 0; i < N_PARTIALS; i++) out[i] /= peak
  return out
}
