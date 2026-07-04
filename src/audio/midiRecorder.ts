// Bridges midi.ts's raw note-on/off callbacks to (a) live monitoring through the engine, so
// playing feels responsive with or without recording armed, and (b) continuous-time note capture
// while armed, landing in the store as ordinary (if non-grid-snapped) Note entries — see Phase G
// in docs/ROADMAP.md. Kept out of store.ts because the in-progress "held notes" map is transient,
// per-gesture state, not app state that belongs in the undo/redo-tracked store.
import * as Tone from 'tone'
import { engine } from './engine'
import { useStore } from '../state/store'

interface HeldNote {
  trackId: string
  startStep: number
  velocity: number
}

const held = new Map<number, HeldNote>()

// Same "which 16th-note step are we at" math as Engine.tick(), just unrounded — a fractional
// step position (e.g. 4.37) is exactly what lets a recorded note fall between the grid lines
// instead of snapping to it.
function currentStepPosition(totalSteps: number): number {
  const t = Tone.getTransport()
  const ticksPerStep = t.PPQ / 4
  const pos = t.getTicksAtTime(Tone.now()) / ticksPerStep
  return ((pos % totalSteps) + totalSteps) % totalSteps
}

export function handleMidiNoteOn(pitch: number, velocity: number) {
  const s = useStore.getState()
  const track = s.tracks.find((t) => t.id === s.selectedTrackId)
  if (!track || track.kind !== 'synth') return
  void engine.liveNoteOn(track, pitch, velocity)
  if (s.isPlaying && s.isRecording) {
    const totalSteps = s.loopBars * 16
    held.set(pitch, { trackId: track.id, startStep: currentStepPosition(totalSteps), velocity })
  }
}

export function handleMidiNoteOff(pitch: number) {
  const s = useStore.getState()
  const track = s.tracks.find((t) => t.id === s.selectedTrackId)
  if (track && track.kind === 'synth') engine.liveNoteOff(track, pitch)

  const h = held.get(pitch)
  if (!h) return
  held.delete(pitch)
  const totalSteps = s.loopBars * 16
  let end = currentStepPosition(totalSteps)
  if (end <= h.startStep) end += totalSteps // held across the loop wrap
  const duration = Math.max(end - h.startStep, 0.1)
  useStore.getState().recordNote(h.trackId, { pitch, start: h.startStep, duration, velocity: h.velocity })
}

/** Release everything currently held — call when recording/playback stops so a note held past
 * the end of a take doesn't get silently dropped or left stuck sounding. */
export function releaseAllHeld() {
  for (const pitch of held.keys()) handleMidiNoteOff(pitch)
}

if (import.meta.env.DEV) {
  ;(window as unknown as { __midiRecorder: { handleMidiNoteOn: typeof handleMidiNoteOn; handleMidiNoteOff: typeof handleMidiNoteOff } }).__midiRecorder =
    { handleMidiNoteOn, handleMidiNoteOff }
}
