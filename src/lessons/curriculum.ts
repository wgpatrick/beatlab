import type { Module } from './framework'
import { THEORY_MODULES } from './theory'
import { SOUND_MODULES } from './sound'
import { RHYTHM_MODULES } from './rhythm'
import { ARRANGE_MODULES } from './arrangement'

export { sandboxTracks, resolveDyn } from './framework'
export type { Lesson, LessonSetup, ValidateCtx, LessonParams } from './framework'

export const MODULES: Module[] = [
  ...THEORY_MODULES,
  ...SOUND_MODULES,
  ...RHYTHM_MODULES,
  ...ARRANGE_MODULES,
]

export const LESSONS = MODULES.flatMap((m) => m.lessons)

export const findLesson = (id: string) => LESSONS.find((l) => l.id === id)

export function nextLessonId(id: string): string | null {
  const i = LESSONS.findIndex((l) => l.id === id)
  return i >= 0 && i < LESSONS.length - 1 ? LESSONS[i + 1].id : null
}
