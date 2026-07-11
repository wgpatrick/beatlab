import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { DRUM_LANES, type Clip, type DrumLane, type Scene, type Track } from '../types'

// The song view — D4 in docs/product-spec-desktop.md §5, the desktop app's centerpiece screen:
// tracks as rows, bars as columns, notes visible across the whole song, section boundaries
// labeled. This is also where the D2 pointing protocol lives (docs/product-spec-desktop.md §2):
// drag across bars, click a track header — POSTs `BeatSelection` straight to the daemon's
// `/selection`, the same channel `beat vary --scope selection` already reads.
//
// RENDERING APPROACH (docs/phase-11-song-view.md has the full research writeup): canvas, not SVG
// or a virtualized note-per-DOM-node approach. A song-length arrangement can have hundreds of
// notes per track across dozens of bars; a DOM node per note is the exact case the existing
// PianoRoll gets away with (one track, one loop, tens of notes) and this view can't — real
// piano-roll/timeline implementations researched (Magenta.js ships a CanvasVisualizer specifically
// because it "does not redraw the entire sequence" the way its SVG one does; dpren/react-piano-roll
// only offers Canvas/WebGL renderers, no SVG at all) converge on canvas for exactly this reason.
// One <canvas> per track row: draw calls are O(events on screen), decoupled from DOM node count.
//
// DENSITY LOD: the spec explicitly asks for "density-rendered when zoomed out" — the standard
// technique (the note-level analog of audio waveform min/max peak thumbnails) is a per-bar
// aggregate (event count -> opacity) instead of individual note glyphs once a bar is too narrow
// to draw them legibly. There's no interactive zoom control in this first slice, so "zoomed out"
// is driven by how many song-bars must fit the viewport: below DETAIL_PX_PER_BAR, bars render as
// density blocks; at or above it, individual notes/hits render as real ticks positioned by
// pitch/lane. Both paths are exercised in verification (docs/phase-11-song-view.md).

const ROW_H = 56
const RULER_H = 28
const HEADER_W = 140
const MIN_PX_PER_BAR = 6
const DETAIL_PX_PER_BAR = 32 // >= this: draw real note/hit ticks. below: density blocks.

const SCENE_PALETTE = ['#61afef', '#e5c07b', '#e06c75', '#56b6c2', '#98c379', '#c678dd', '#d19a66', '#98c3ee']

interface Section {
  sceneId: string
  startBar: number
  bars: number
  colorIdx: number
}

/** BeatSelection mirrors src/core/selection.ts in the dotbeat repo (not importable across repos —
 * this is the wire shape the daemon's /selection endpoint accepts, kept in lockstep by hand). */
interface BeatSelection {
  tracks?: string[]
  bars?: { start: number; end: number }
}

function getDaemonBase(): string | null {
  const port = new URLSearchParams(window.location.search).get('daw')
  if (!port || !/^\d+$/.test(port)) return null
  return `http://localhost:${port}`
}

function buildSections(timeline: { sceneId: string; bars: number }[]): Section[] {
  const sceneOrder: string[] = []
  let cursor = 0
  return timeline.map((entry) => {
    let colorIdx = sceneOrder.indexOf(entry.sceneId)
    if (colorIdx === -1) {
      colorIdx = sceneOrder.length
      sceneOrder.push(entry.sceneId)
    }
    const sec: Section = { sceneId: entry.sceneId, startBar: cursor, bars: entry.bars, colorIdx }
    cursor += entry.bars
    return sec
  })
}

/** Which section (if any) an absolute song bar falls in. */
function sectionAt(sections: Section[], bar: number): Section | null {
  for (const s of sections) if (bar >= s.startBar && bar < s.startBar + s.bars) return s
  return null
}

/** Resolve one track's content for one absolute song bar: the scene-mapped clip's events for the
 * bar-within-clip this song bar lands on (clips cycle every `loopBars` bars for synth tracks,
 * every 1 bar for drum tracks — pattern lanes are always a single 16-step bar, matching how the
 * step sequencer/engine already treat them; see src/audio/engine.ts's per-tick content resolution
 * for the same rule this mirrors read-only). Returns null when the section's scene leaves this
 * track unmapped (silent bar — a real, meaningful state, not missing data). */
function resolveBarEvents(
  track: Track,
  scenesById: Map<string, Scene>,
  section: Section,
  absBar: number,
  loopBars: number,
): { kind: 'drums'; hits: { lane: DrumLane; step: number; vel: number }[] } | { kind: 'synth'; notes: { pitch: number; offsetStep: number; durSteps: number; vel: number }[] } | null {
  const scene = scenesById.get(section.sceneId)
  const clipId = scene?.clipIds[track.id]
  if (!clipId) return null
  const clip = track.clips.find((c: Clip) => c.id === clipId)
  if (!clip) return null

  if (track.kind === 'drums') {
    const hits: { lane: DrumLane; step: number; vel: number }[] = []
    for (const lane of DRUM_LANES) {
      const arr = clip.pattern[lane] ?? []
      for (let step = 0; step < arr.length; step++) {
        if (arr[step] > 0) hits.push({ lane, step, vel: arr[step] })
      }
    }
    return { kind: 'drums', hits }
  }

  const period = Math.max(1, loopBars)
  const barInClip = (absBar - section.startBar) % period
  const lo = barInClip * 16
  const hi = lo + 16
  const notes = clip.notes
    .filter((n) => n.start >= lo && n.start < hi)
    .map((n) => ({ pitch: n.pitch, offsetStep: n.start - lo, durSteps: n.duration, vel: n.velocity }))
  return { kind: 'synth', notes }
}

interface DragState {
  mode: 'bars' | 'track-bars'
  trackId: string | null
  startBar: number
}

export function SongView() {
  const tracks = useStore((s) => s.tracks)
  const scenes = useStore((s) => s.scenes)
  const arrangement = useStore((s) => s.arrangement)
  const loopBars = useStore((s) => s.loopBars)
  const currentStep = useStore((s) => s.currentStep)
  const selectTrack = useStore((s) => s.selectTrack)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(900)
  const [selection, setSelection] = useState<BeatSelection>({})
  const dragRef = useRef<DragState | null>(null)
  const [dragBars, setDragBars] = useState<{ trackId: string | null; start: number; end: number } | null>(null)

  const timeline = arrangement.mode === 'timeline' && arrangement.timeline ? arrangement.timeline : []
  const sections = useMemo(() => buildSections(timeline), [timeline])
  const totalBars = sections.reduce((sum, s) => sum + s.bars, 0)
  const scenesById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes])

  // Track the scroll container's width so px/bar (and therefore the density-vs-detail LOD switch)
  // responds to the actual viewport instead of a hardcoded guess.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setContainerW(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pxPerBar = Math.max(MIN_PX_PER_BAR, totalBars > 0 ? containerW / totalBars : MIN_PX_PER_BAR)
  const gridWidth = Math.max(containerW, pxPerBar * totalBars)
  const detailMode = pxPerBar >= DETAIL_PX_PER_BAR

  // ---------- selection: initial pull + reverse-pointing (agent -> GUI) via SSE ----------
  useEffect(() => {
    const base = getDaemonBase()
    if (!base) return
    let cancelled = false
    fetch(`${base}/selection`)
      .then((r) => r.json())
      .then((sel) => {
        if (!cancelled) setSelection(sel)
      })
      .catch(() => {})
    const es = new EventSource(`${base}/events`)
    es.addEventListener('selection', (e) => {
      setSelection(JSON.parse((e as MessageEvent).data))
    })
    return () => {
      cancelled = true
      es.close()
    }
  }, [])

  function postSelection(sel: BeatSelection) {
    setSelection(sel)
    const base = getDaemonBase()
    if (!base) return
    fetch(`${base}/selection`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sel),
    }).catch((err) => console.warn('[song-view] could not post selection:', err))
  }

  function barAtClientX(clientX: number, gridLeft: number): number {
    const x = clientX - gridLeft
    return Math.max(0, Math.min(totalBars, Math.floor(x / pxPerBar)))
  }

  function beginBarDrag(e: React.PointerEvent, trackId: string | null) {
    if (e.button !== 0) return
    const grid = (e.currentTarget as HTMLElement).closest('.songview-grid') as HTMLElement | null
    const gridLeft = grid ? grid.getBoundingClientRect().left : 0
    const startBar = barAtClientX(e.clientX, gridLeft)
    dragRef.current = { mode: trackId ? 'track-bars' : 'bars', trackId, startBar }
    setDragBars({ trackId, start: startBar, end: startBar + 1 })

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const bar = barAtClientX(ev.clientX, gridLeft)
      const start = Math.min(drag.startBar, bar)
      const end = Math.max(drag.startBar, bar) + 1
      setDragBars({ trackId: drag.trackId, start, end })
    }
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      const bar = barAtClientX(ev.clientX, gridLeft)
      const start = Math.min(drag.startBar, bar)
      const end = Math.max(drag.startBar, bar) + 1
      setDragBars(null)
      const sel: BeatSelection = { bars: { start, end } }
      if (drag.trackId) sel.tracks = [drag.trackId]
      postSelection(sel)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onHeaderClick(trackId: string) {
    selectTrack(trackId)
    postSelection({ tracks: [trackId] })
  }

  const selectedTrackSet = new Set(selection.tracks ?? [])
  const playBar = currentStep >= 0 && totalBars > 0 ? Math.floor(currentStep / 16) : -1

  if (totalBars === 0) {
    return (
      <div className="songview">
        <div className="editor-toolbar">
          <span className="editor-title">Song</span>
        </div>
        <div className="songview-empty">No song timeline on this project yet — author one with `beat song`.</div>
      </div>
    )
  }

  return (
    <div className="songview">
      <div className="editor-toolbar">
        <span className="editor-title">Song</span>
        <span className="toolbar-tip">
          {totalBars} bars · {sections.length} sections · {detailMode ? 'note detail' : 'density'} view ({pxPerBar.toFixed(1)}px/bar) ·
          drag bars to select a range, click a track name to select the whole track
        </span>
      </div>
      <div className="songview-scroll" ref={scrollRef}>
        <div className="songview-body" style={{ width: HEADER_W + gridWidth }}>
          {/* ---------- ruler: section boundaries, labeled ---------- */}
          <div className="songview-ruler-row">
            <div className="songview-header-spacer" style={{ width: HEADER_W }} />
            <div
              className="songview-grid songview-ruler"
              style={{ width: gridWidth, height: RULER_H }}
              onPointerDown={(e) => beginBarDrag(e, null)}
            >
              {sections.map((sec) => (
                <div
                  key={`${sec.sceneId}-${sec.startBar}`}
                  className="songview-section-label"
                  style={{
                    left: sec.startBar * pxPerBar,
                    width: sec.bars * pxPerBar,
                    borderLeftColor: SCENE_PALETTE[sec.colorIdx % SCENE_PALETTE.length],
                  }}
                  title={`${sec.sceneId} — bars ${sec.startBar}-${sec.startBar + sec.bars}`}
                >
                  {sec.sceneId}
                </div>
              ))}
              {playBar >= 0 && <div className="songview-playhead" style={{ left: playBar * pxPerBar }} />}
              {dragBars && dragBars.trackId === null && (
                <div
                  className="songview-drag-rect"
                  style={{ left: dragBars.start * pxPerBar, width: (dragBars.end - dragBars.start) * pxPerBar }}
                />
              )}
              {selection.bars && (!selection.tracks || selection.tracks.length === 0) && (
                <div
                  className="songview-selection-rect"
                  style={{ left: selection.bars.start * pxPerBar, width: (selection.bars.end - selection.bars.start) * pxPerBar }}
                />
              )}
            </div>
          </div>

          {/* ---------- track rows ---------- */}
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              sections={sections}
              scenesById={scenesById}
              loopBars={loopBars}
              pxPerBar={pxPerBar}
              gridWidth={gridWidth}
              totalBars={totalBars}
              detailMode={detailMode}
              selected={selectedTrackSet.has(track.id)}
              playBar={playBar}
              rangeSelected={
                selection.bars && (selection.tracks?.includes(track.id) ?? (selection.tracks === undefined || selection.tracks.length === 0))
                  ? selection.bars
                  : null
              }
              dragRect={dragBars && dragBars.trackId === track.id ? dragBars : null}
              onHeaderClick={() => onHeaderClick(track.id)}
              onGridPointerDown={(e) => beginBarDrag(e, track.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function TrackRow({
  track,
  sections,
  scenesById,
  loopBars,
  pxPerBar,
  gridWidth,
  totalBars,
  detailMode,
  selected,
  playBar,
  rangeSelected,
  dragRect,
  onHeaderClick,
  onGridPointerDown,
}: {
  track: Track
  sections: Section[]
  scenesById: Map<string, Scene>
  loopBars: number
  pxPerBar: number
  gridWidth: number
  totalBars: number
  detailMode: boolean
  selected: boolean
  playBar: number
  rangeSelected: { start: number; end: number } | null
  dragRect: { start: number; end: number } | null
  onHeaderClick: () => void
  onGridPointerDown: (e: React.PointerEvent) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, gridWidth) * dpr
    canvas.height = ROW_H * dpr
    canvas.style.width = `${gridWidth}px`
    canvas.style.height = `${ROW_H}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, gridWidth, ROW_H)

    // section background tint (silent bars in a mapped-out section still get the section's tint,
    // just no events drawn — "silent" reads as an empty row, not a missing one)
    for (const sec of sections) {
      ctx.fillStyle = sec.colorIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.045)'
      ctx.fillRect(sec.startBar * pxPerBar, 0, sec.bars * pxPerBar, ROW_H)
    }

    // bar gridlines (skip when too dense to be legible)
    if (pxPerBar >= 3) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'
      ctx.lineWidth = 1
      for (let b = 0; b <= totalBars; b++) {
        const x = Math.round(b * pxPerBar) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, ROW_H)
        ctx.stroke()
      }
    }
    // section boundary lines, brighter
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    for (const sec of sections) {
      const x = Math.round(sec.startBar * pxPerBar) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, ROW_H)
      ctx.stroke()
    }

    for (let absBar = 0; absBar < totalBars; absBar++) {
      const sec = sections.find((s) => absBar >= s.startBar && absBar < s.startBar + s.bars)
      if (!sec) continue
      const content = resolveBarEvents(track, scenesById, sec, absBar, loopBars)
      if (!content) continue // scene leaves this track unmapped this section: silent, draw nothing
      const barX = absBar * pxPerBar

      if (!detailMode) {
        // density LOD: one block per bar, opacity encodes event count (the note-count analog of
        // an audio waveform's min/max-peak-per-pixel thumbnail)
        const count = content.kind === 'drums' ? content.hits.length : content.notes.length
        const maxRef = content.kind === 'drums' ? 12 : 6 // soft normalization, not a hard cap
        const density = Math.min(1, count / maxRef)
        if (density > 0) {
          ctx.fillStyle = track.color
          ctx.globalAlpha = 0.15 + 0.7 * density
          ctx.fillRect(barX + 0.5, 4, Math.max(1, pxPerBar - 1), ROW_H - 8)
          ctx.globalAlpha = 1
        }
        continue
      }

      // detail LOD: real ticks
      if (content.kind === 'drums') {
        const laneH = ROW_H / DRUM_LANES.length
        DRUM_LANES.forEach((lane, li) => {
          for (const hit of content.hits) {
            if (hit.lane !== lane) continue
            const x = barX + (hit.step / 16) * pxPerBar
            const y = li * laneH
            ctx.fillStyle = track.color
            ctx.globalAlpha = 0.4 + 0.6 * hit.vel
            ctx.fillRect(x, y + 1, Math.max(1.5, pxPerBar / 16 - 1), laneH - 2)
            ctx.globalAlpha = 1
          }
        })
      } else {
        const pitches = content.notes.map((n) => n.pitch)
        const lo = pitches.length ? Math.min(...pitches, 48) : 48
        const hi = pitches.length ? Math.max(...pitches, 72) : 72
        const span = Math.max(1, hi - lo)
        for (const n of content.notes) {
          const x = barX + (n.offsetStep / 16) * pxPerBar
          const w = Math.max(1.5, (n.durSteps / 16) * pxPerBar - 1)
          const yFrac = 1 - (n.pitch - lo) / span
          const y = 4 + yFrac * (ROW_H - 10)
          ctx.fillStyle = track.color
          ctx.globalAlpha = 0.5 + 0.5 * n.vel
          ctx.fillRect(x, y, w, 3)
          ctx.globalAlpha = 1
        }
      }
    }

    if (playBar >= 0 && playBar < totalBars) {
      ctx.strokeStyle = 'rgba(255,176,46,0.7)'
      ctx.lineWidth = 2
      const x = Math.round(playBar * pxPerBar) + 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, ROW_H)
      ctx.stroke()
    }
  }, [track, sections, scenesById, loopBars, pxPerBar, gridWidth, totalBars, detailMode, playBar])

  return (
    <div className="songview-row">
      <button className={`songview-header ${selected ? 'selected' : ''}`} style={{ width: HEADER_W, color: track.color }} onClick={onHeaderClick}>
        <span className="songview-header-swatch" style={{ background: track.color }} />
        {track.name}
      </button>
      <div className="songview-grid songview-track-grid" style={{ width: gridWidth, height: ROW_H }} onPointerDown={onGridPointerDown}>
        <canvas ref={canvasRef} />
        {dragRect && (
          <div className="songview-drag-rect" style={{ left: dragRect.start * pxPerBar, width: (dragRect.end - dragRect.start) * pxPerBar }} />
        )}
        {rangeSelected && (
          <div
            className="songview-selection-rect"
            style={{ left: rangeSelected.start * pxPerBar, width: (rangeSelected.end - rangeSelected.start) * pxPerBar }}
          />
        )}
      </div>
    </div>
  )
}
