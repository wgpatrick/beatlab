import type { SectionType } from '../types'
import type { TrackAnalysis } from '../audio/analysis'

export type TrackLabStatus = 'empty' | 'analyzing' | 'ready' | 'error'

/** Everything Track Lab knows about the imported song *except* the audio itself, which lives on
 * the engine (non-serializable, same pattern as the Phase I sample buffer). Survives switching
 * between Lessons / Sandbox / Track Lab so the Deconstruction lessons can grade it — but is
 * deliberately not persisted to localStorage, since the audio file can't come back after a
 * reload anyway. */
export interface TrackLabState {
  status: TrackLabStatus
  fileName: string | null
  error: string | null
  analysis: TrackAnalysis | null
  /** the student's label for each detected section — the DAW-locator exercise, graded */
  labels: (SectionType | null)[]
  /** per-section free-text "elements you hear" — the Attack-Magazine-style element table */
  notes: string[]
  feedback: { pass: boolean; message: string } | null
  /** which section is currently loop-playing, if any */
  playingSection: number | null
  /** a section's audio has been sent to the drum sampler ("steal the break") */
  chopped: boolean
  /** the structure map has been exported as an arrangement template ("steal the skeleton") */
  templated: boolean
}

export const emptyTrackLab = (): TrackLabState => ({
  status: 'empty',
  fileName: null,
  error: null,
  analysis: null,
  labels: [],
  notes: [],
  feedback: null,
  playingSection: null,
  chopped: false,
  templated: false,
})
