import type { WtTable } from '../types'

// Wave 3: built-in wavetables for the main oscillator. A "wavetable" here is a continuous
// function pos (0..1) -> harmonic spectrum (32 partial amplitudes fed to a PeriodicWave via
// Tone's custom-oscillator partials), rather than a bank of discrete stored frames — so WT POS
// morphs smoothly with no interpolation artifacts and nothing heavy lives in memory. Pure math,
// no Tone.js/DOM: unit-testable headlessly like audio/analysis.ts.

export const N_PARTIALS = 32

export const WT_TABLE_INFO: { value: WtTable; label: string; blurb: string }[] = [
  { value: 'analog', label: 'ANALOG', blurb: 'morphs sine → triangle → saw → square' },
  { value: 'pwm', label: 'PWM', blurb: 'square pulse narrowing to a thin buzz' },
  { value: 'vocal', label: 'VOCAL', blurb: 'two formant peaks sweeping vowel-like' },
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

/** Partial amplitudes (length N_PARTIALS) for a table at position pos (0..1), peak-normalized so
 * scanning doesn't pump the level. */
export function wtPartials(table: WtTable, pos: number): number[] {
  const fn = table === 'analog' ? analogPartial : table === 'pwm' ? pwmPartial : vocalPartial
  const out = new Array<number>(N_PARTIALS)
  let peak = 0
  for (let n = 1; n <= N_PARTIALS; n++) {
    const a = fn(n, pos)
    out[n - 1] = a
    peak = Math.max(peak, Math.abs(a))
  }
  if (peak > 0) for (let i = 0; i < N_PARTIALS; i++) out[i] /= peak
  return out
}
