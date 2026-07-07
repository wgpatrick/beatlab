// Track Lab's analysis engine: everything here is pure math over a mono Float32Array — no Tone.js,
// no DOM, no store — so the whole pipeline is exercisable headlessly with a synthesized buffer.
// The methodology it encodes comes from how producers actually deconstruct reference tracks
// (see docs/DECONSTRUCTION.md): count bars, map sections at 8/16/32-bar boundaries, and watch
// which frequency bands enter and leave — the low band dropping out IS the breakdown.

export interface BarFeature {
  /** overall loudness of this bar, normalized 0..1 across the whole track */
  rms: number
  /** low band (< ~150 Hz — kick + bass), normalized 0..1 across the track */
  low: number
  /** mid band (~400–2500 Hz — chords, leads, vocals), normalized 0..1 */
  mid: number
  /** high band (> ~5 kHz — hats, air, cymbals), normalized 0..1 */
  high: number
}

export interface TrackSection {
  /** first bar of the section (0-based, inclusive) */
  startBar: number
  /** one past the last bar (exclusive) */
  endBar: number
}

export interface TrackAnalysis {
  durationSec: number
  bpm: number
  /** seconds per beat at the detected tempo */
  beatSec: number
  /** offset of the first downbeat (bar 1, beat 1) from the start of the file */
  firstBeatSec: number
  barSec: number
  barCount: number
  bars: BarFeature[]
  sections: TrackSection[]
  /** max-|sample| per bucket for drawing the waveform overview, 0..1 */
  peaks: number[]
}

const HOP = 512
const FRAME = 1024

// ---------- biquad filters (RBJ cookbook) ----------
// Hand-rolled rather than OfflineAudioContext renders: deterministic, synchronous, and cheap
// (one O(n) pass per band) — a 5-minute track is ~13M samples, well under a second of work.

interface Biquad {
  b0: number; b1: number; b2: number; a1: number; a2: number
}

function lowpassCoeffs(sampleRate: number, freq: number, q = 0.707): Biquad {
  const w = (2 * Math.PI * freq) / sampleRate
  const alpha = Math.sin(w) / (2 * q)
  const cosw = Math.cos(w)
  const a0 = 1 + alpha
  return {
    b0: ((1 - cosw) / 2) / a0,
    b1: (1 - cosw) / a0,
    b2: ((1 - cosw) / 2) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

function highpassCoeffs(sampleRate: number, freq: number, q = 0.707): Biquad {
  const w = (2 * Math.PI * freq) / sampleRate
  const alpha = Math.sin(w) / (2 * q)
  const cosw = Math.cos(w)
  const a0 = 1 + alpha
  return {
    b0: ((1 + cosw) / 2) / a0,
    b1: -(1 + cosw) / a0,
    b2: ((1 + cosw) / 2) / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

function bandpassCoeffs(sampleRate: number, freq: number, q: number): Biquad {
  const w = (2 * Math.PI * freq) / sampleRate
  const alpha = Math.sin(w) / (2 * q)
  const cosw = Math.cos(w)
  const a0 = 1 + alpha
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * cosw) / a0,
    a2: (1 - alpha) / a0,
  }
}

function runBiquad(input: Float32Array, c: Biquad): Float32Array {
  const out = new Float32Array(input.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < input.length; i++) {
    const x = input[i]
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    out[i] = y
    x2 = x1; x1 = x
    y2 = y1; y1 = y
  }
  return out
}

// ---------- framing ----------

function frameRms(data: Float32Array): Float32Array {
  const n = Math.max(1, Math.floor((data.length - FRAME) / HOP) + 1)
  const out = new Float32Array(n)
  for (let f = 0; f < n; f++) {
    let sum = 0
    const off = f * HOP
    for (let i = 0; i < FRAME; i++) {
      const v = data[off + i] ?? 0
      sum += v * v
    }
    out[f] = Math.sqrt(sum / FRAME)
  }
  return out
}

/** half-wave-rectified energy rise between frames — spikes on every percussive hit */
function onsetEnvelope(rms: Float32Array): Float32Array {
  const out = new Float32Array(rms.length)
  for (let i = 1; i < rms.length; i++) out[i] = Math.max(0, rms[i] - rms[i - 1])
  return out
}

// ---------- tempo ----------

/**
 * Tempo by autocorrelating the onset envelope over the 70–180 BPM lag range, with harmonic
 * support (a true beat period also correlates at 2x its lag) and a mild preference for the
 * 100–150 window where almost all house/techno/DnB-halved tempos live. Parabolic interpolation
 * refines the winning lag to sub-frame resolution (a raw integer lag at this hop size would be
 * off by up to ~1%, which drifts a whole beat over a 5-minute track).
 */
function detectBpm(onset: Float32Array, frameRate: number): number {
  const minLag = Math.floor((60 / 180) * frameRate)
  const maxLag = Math.ceil((60 / 70) * frameRate)
  const n = onset.length
  const corr = new Float32Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0
    for (let i = 0; i + lag < n; i++) sum += onset[i] * onset[i + lag]
    corr[lag] = sum / Math.max(1, n - lag)
  }
  let bestLag = minLag
  let bestScore = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    const double = lag * 2
    const harmonic = double < corr.length ? corr[double] : (double < n ? autocorrAt(onset, double) : 0)
    const bpm = (60 * frameRate) / lag
    const pref = bpm >= 100 && bpm <= 150 ? 1.1 : 1
    const score = (corr[lag] + 0.5 * harmonic) * pref
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  // parabolic peak interpolation around the winning integer lag
  const y0 = corr[bestLag - 1] ?? corr[bestLag]
  const y1 = corr[bestLag]
  const y2 = corr[bestLag + 1] ?? corr[bestLag]
  const denom = y0 - 2 * y1 + y2
  const shift = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0
  const lag = bestLag + shift
  return (60 * frameRate) / lag
}

function autocorrAt(onset: Float32Array, lag: number): number {
  let sum = 0
  for (let i = 0; i + lag < onset.length; i++) sum += onset[i] * onset[i + lag]
  return sum / Math.max(1, onset.length - lag)
}

/** phase (in frames) that lines the beat grid up with the onset spikes */
function detectBeatPhase(onset: Float32Array, beatFrames: number): number {
  const period = Math.max(1, Math.round(beatFrames))
  let bestPhase = 0
  let bestSum = -Infinity
  for (let phase = 0; phase < period; phase++) {
    let sum = 0
    for (let t = phase; t < onset.length; t += beatFrames) sum += onset[Math.round(t)] ?? 0
    if (sum > bestSum) {
      bestSum = sum
      bestPhase = phase
    }
  }
  return bestPhase
}

/**
 * Downbeat: of the 4 possible beats that could be "beat 1", pick the one where the *low band*
 * hits hardest on average — in 4/4 electronic music the kick/bass weight leans on the barline.
 * An approximation (flagged as such in the UI copy) — good enough to draw a usable bar grid,
 * and the whole grid is only ever off by a beat or two, never stretched.
 */
function detectDownbeat(lowOnset: Float32Array, beatFrames: number, beatPhase: number): number {
  let bestBeat = 0
  let bestSum = -Infinity
  for (let b = 0; b < 4; b++) {
    let sum = 0
    for (let t = beatPhase + b * beatFrames; t < lowOnset.length; t += beatFrames * 4) {
      sum += lowOnset[Math.round(t)] ?? 0
    }
    if (sum > bestSum) {
      bestSum = sum
      bestBeat = b
    }
  }
  return beatPhase + bestBeat * beatFrames
}

// ---------- sections ----------

/**
 * Section boundaries via a novelty curve over bar-level features: at each bar line, how different
 * do the next `win` bars sound from the previous `win`? Peaks = arrangement changes. Boundaries
 * snap to multiples of 4 bars from the start when within 1 bar (electronic sections live on the
 * 4/8/16 grid — the same "bar math" the curriculum teaches), and sections shorter than 4 bars
 * merge into their neighbor.
 */
function detectSections(bars: BarFeature[]): TrackSection[] {
  const n = bars.length
  if (n < 8) return [{ startBar: 0, endBar: Math.max(1, n) }]
  const win = 4
  const novelty = new Float32Array(n)
  for (let k = 2; k < n - 1; k++) {
    const a = { rms: 0, low: 0, mid: 0, high: 0 }
    const b = { rms: 0, low: 0, mid: 0, high: 0 }
    let ca = 0
    let cb = 0
    for (let i = Math.max(0, k - win); i < k; i++, ca++) {
      a.rms += bars[i].rms; a.low += bars[i].low; a.mid += bars[i].mid; a.high += bars[i].high
    }
    for (let i = k; i < Math.min(n, k + win); i++, cb++) {
      b.rms += bars[i].rms; b.low += bars[i].low; b.mid += bars[i].mid; b.high += bars[i].high
    }
    novelty[k] = Math.hypot(
      a.rms / ca - b.rms / cb,
      a.low / ca - b.low / cb,
      a.mid / ca - b.mid / cb,
      a.high / ca - b.high / cb,
    )
  }
  const mean = novelty.reduce((s, v) => s + v, 0) / n
  const std = Math.sqrt(novelty.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  const threshold = mean + 0.5 * std

  const bounds: number[] = []
  for (let k = 2; k < n - 2; k++) {
    if (novelty[k] > threshold && novelty[k] >= novelty[k - 1] && novelty[k] > novelty[k + 1]) {
      let snapped = k
      const nearest4 = Math.round(k / 4) * 4
      if (Math.abs(nearest4 - k) <= 1 && nearest4 > 0 && nearest4 < n) snapped = nearest4
      if (bounds.length === 0 || snapped - bounds[bounds.length - 1] >= 4) bounds.push(snapped)
    }
  }

  const sections: TrackSection[] = []
  let start = 0
  for (const b of bounds) {
    if (b - start >= 4) {
      sections.push({ startBar: start, endBar: b })
      start = b
    }
  }
  if (n - start >= 4 || sections.length === 0) {
    sections.push({ startBar: start, endBar: n })
  } else {
    sections[sections.length - 1].endBar = n
  }
  return sections
}

// ---------- per-section helpers (shared by the Track Lab UI, its grading, and the lessons) ----------

export function sectionAvg(analysis: TrackAnalysis, s: TrackSection): BarFeature {
  const out = { rms: 0, low: 0, mid: 0, high: 0 }
  const count = Math.max(1, s.endBar - s.startBar)
  for (let i = s.startBar; i < s.endBar && i < analysis.bars.length; i++) {
    out.rms += analysis.bars[i].rms
    out.low += analysis.bars[i].low
    out.mid += analysis.bars[i].mid
    out.high += analysis.bars[i].high
  }
  out.rms /= count; out.low /= count; out.mid /= count; out.high /= count
  return out
}

/** Bucket-max waveform overview, normalized 0..1 — shared by Track Lab's song-length view and the
 * Phase I sample-slice editor's much shorter one-sample view. */
export function waveformPeaks(data: Float32Array, buckets: number): number[] {
  const peaks: number[] = new Array(buckets).fill(0)
  const per = Math.max(1, Math.floor(data.length / buckets))
  for (let i = 0; i < buckets; i++) {
    let max = 0
    const off = i * per
    for (let j = 0; j < per; j += 4) {
      const v = Math.abs(data[off + j] ?? 0)
      if (v > max) max = v
    }
    peaks[i] = max
  }
  const peakMax = Math.max(1e-6, ...peaks)
  for (let i = 0; i < buckets; i++) peaks[i] /= peakMax
  return peaks
}

// ---------- main entry ----------

export interface AnalyzeOptions {
  /** skip tempo detection and use this BPM (the UI's x2 / ÷2 correction buttons) */
  forceBpm?: number
}

export function analyzeMono(data: Float32Array, sampleRate: number, opts: AnalyzeOptions = {}): TrackAnalysis {
  const durationSec = data.length / sampleRate
  const frameRate = sampleRate / HOP

  const low = runBiquad(data, lowpassCoeffs(sampleRate, 150))
  const mid = runBiquad(data, bandpassCoeffs(sampleRate, 1000, 0.6))
  const high = runBiquad(data, highpassCoeffs(sampleRate, 5000))

  const rmsEnv = frameRms(data)
  const lowEnv = frameRms(low)
  const onset = onsetEnvelope(rmsEnv)
  const lowOnset = onsetEnvelope(lowEnv)

  const bpm = opts.forceBpm ?? detectBpm(onset, frameRate)
  const beatSec = 60 / bpm
  const beatFrames = beatSec * frameRate
  const beatPhase = detectBeatPhase(onset, beatFrames)
  const downbeatFrame = detectDownbeat(lowOnset, beatFrames, beatPhase)
  // pull the grid back to the earliest bar line after the start of the audio (downbeat modulo
  // one bar), so bar 0 covers the very beginning of the file instead of orphaning the opening
  const barSec = beatSec * 4
  const firstBeatSec = ((downbeatFrame * HOP) / sampleRate) % barSec

  const barCount = Math.max(1, Math.floor((durationSec - firstBeatSec) / barSec))

  // per-bar band energies (RMS over the bar's samples), then normalized 0..1 per feature
  const raw: { rms: number; low: number; mid: number; high: number }[] = []
  for (let b = 0; b < barCount; b++) {
    const s0 = Math.floor((firstBeatSec + b * barSec) * sampleRate)
    const s1 = Math.min(data.length, Math.floor((firstBeatSec + (b + 1) * barSec) * sampleRate))
    raw.push({
      rms: rangeRms(data, s0, s1),
      low: rangeRms(low, s0, s1),
      mid: rangeRms(mid, s0, s1),
      high: rangeRms(high, s0, s1),
    })
  }
  const maxOf = (k: 'rms' | 'low' | 'mid' | 'high') => Math.max(1e-6, ...raw.map((r) => r[k]))
  const maxRms = maxOf('rms')
  const maxLow = maxOf('low')
  const maxMid = maxOf('mid')
  const maxHigh = maxOf('high')
  const bars: BarFeature[] = raw.map((r) => ({
    rms: r.rms / maxRms,
    low: r.low / maxLow,
    mid: r.mid / maxMid,
    high: r.high / maxHigh,
  }))

  const sections = detectSections(bars)

  // waveform overview peaks
  const peaks = waveformPeaks(data, 1200)

  return {
    durationSec,
    bpm: Math.round(bpm * 10) / 10,
    beatSec,
    firstBeatSec,
    barSec,
    barCount,
    bars,
    sections,
    peaks,
  }
}

function rangeRms(data: Float32Array, s0: number, s1: number): number {
  let sum = 0
  let count = 0
  // stride 4: RMS over every 4th sample is statistically identical for this purpose at 1/4 the cost
  for (let i = s0; i < s1; i += 4) {
    sum += data[i] * data[i]
    count++
  }
  return count ? Math.sqrt(sum / count) : 0
}

export function analyzeAudioBuffer(buffer: AudioBuffer, opts: AnalyzeOptions = {}): TrackAnalysis {
  // mono downmix
  const mono = new Float32Array(buffer.length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch)
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / buffer.numberOfChannels
  }
  return analyzeMono(mono, buffer.sampleRate, opts)
}
